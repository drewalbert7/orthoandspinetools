import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { escapeHtmlAttribute, escapeHtmlText, wrapTransactionalHtml } from '../lib/emailHtml';
import { getSesRuntimeConfig, isSesEmailConfigured } from '../lib/sesConfig';

export { isSesEmailConfigured };

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; skipped: true }
  | { ok: false; error: string };

let sesClient: SESClient | null = null;

function getSesClient(region: string, accessKeyId: string, secretAccessKey: string): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return sesClient;
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  /** Digest/marketing-style messages include preference footer in htmlBody already. */
  kind?: 'transactional' | 'digest';
}): Promise<SendEmailResult> {
  if (!isSesEmailConfigured()) {
    return { ok: false, skipped: true };
  }

  const recipient = params.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { ok: false, error: 'Invalid recipient email' };
  }

  const suppressed = await isEmailSuppressed(recipient);
  if (suppressed) {
    logger.warn('Transactional email skipped (suppressed recipient)', {
      toDomain: recipient.split('@')[1],
      reason: suppressed.reason,
      kind: params.kind || 'transactional',
    });
    return { ok: false, skipped: true };
  }

  const cfg = getSesRuntimeConfig();
  const region = cfg.region!;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID!.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!.trim();
  const fromAddress = cfg.fromAddress!;
  const source = `${cfg.fromName} <${fromAddress}>`;

  const subject = params.subject.trim().slice(0, 200);
  if (!subject) {
    return { ok: false, error: 'Empty subject' };
  }

  try {
    const client = getSesClient(region, accessKeyId, secretAccessKey);
    const commandInput: ConstructorParameters<typeof SendEmailCommand>[0] = {
      Source: source,
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: params.textBody, Charset: 'UTF-8' },
          Html: { Data: params.htmlBody, Charset: 'UTF-8' },
        },
      },
      Tags: [
        { Name: 'project', Value: 'orthoandspinetools' },
        { Name: 'kind', Value: params.kind || 'transactional' },
      ],
    };

    if (cfg.replyTo) {
      commandInput.ReplyToAddresses = [cfg.replyTo];
    }
    if (cfg.configurationSet) {
      commandInput.ConfigurationSetName = cfg.configurationSet;
    }

    const out = await client.send(new SendEmailCommand(commandInput));
    return { ok: true, messageId: out.MessageId || 'unknown' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('Transactional email send failed', {
      error: msg,
      toDomain: recipient.split('@')[1],
      kind: params.kind || 'transactional',
    });
    return { ok: false, error: msg };
  }
}

async function isEmailSuppressed(email: string): Promise<{ reason: string } | null> {
  try {
    const suppression = await prisma.emailSuppression.findUnique({
      where: { email },
      select: { reason: true },
    });
    return suppression;
  } catch (error) {
    logger.warn('Email suppression lookup unavailable; continuing send attempt', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}): Promise<SendEmailResult> {
  const href = escapeHtmlAttribute(params.resetUrl);
  const subject = 'Reset your OrthoAndSpineTools password';
  const textBody = [
    'You requested a password reset for your OrthoAndSpineTools account.',
    '',
    'Open this link to choose a new password (valid for 1 hour):',
    params.resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const inner = `<p>You requested a password reset for your OrthoAndSpineTools account.</p>
<p><a href="${href}" style="color:#2563eb;">Choose a new password</a> (link valid for 1 hour)</p>
<p>If you did not request this, you can ignore this email.</p>`;

  return sendTransactionalEmail({
    to: params.to,
    subject,
    textBody,
    htmlBody: wrapTransactionalHtml(inner),
    kind: 'transactional',
  });
}

export async function sendWelcomeEmail(params: {
  to: string;
  firstName?: string | null;
}): Promise<SendEmailResult> {
  const displayName = escapeHtmlText((params.firstName || '').trim() || 'there');
  const subject = 'Welcome to OrthoAndSpineTools';
  const plainName = (params.firstName || '').trim() || 'there';
  const textBody = [
    `Hi ${plainName},`,
    '',
    'Welcome to OrthoAndSpineTools.',
    'You can now participate in communities, share posts, and join discussions.',
    '',
    'Thanks for joining us.',
  ].join('\n');

  const inner = `<p>Hi ${displayName},</p>
<p>Welcome to OrthoAndSpineTools.</p>
<p>You can now participate in communities, share posts, and join discussions.</p>
<p>Thanks for joining us.</p>`;

  return sendTransactionalEmail({
    to: params.to,
    subject,
    textBody,
    htmlBody: wrapTransactionalHtml(inner),
    kind: 'transactional',
  });
}

export async function sendVerifyEmail(params: {
  to: string;
  firstName?: string | null;
  verifyUrl: string;
}): Promise<SendEmailResult> {
  const displayName = escapeHtmlText((params.firstName || '').trim() || 'there');
  const href = escapeHtmlAttribute(params.verifyUrl);
  const plainName = (params.firstName || '').trim() || 'there';
  const subject = 'Verify your OrthoAndSpineTools email';
  const textBody = [
    `Hi ${plainName},`,
    '',
    'Please verify your email address to complete account setup.',
    params.verifyUrl,
    '',
    'If you did not create this account, you can ignore this email.',
  ].join('\n');

  const inner = `<p>Hi ${displayName},</p>
<p>Please verify your email address to complete account setup.</p>
<p><a href="${href}" style="color:#2563eb;">Verify email address</a></p>
<p>If you did not create this account, you can ignore this email.</p>`;

  return sendTransactionalEmail({
    to: params.to,
    subject,
    textBody,
    htmlBody: wrapTransactionalHtml(inner),
    kind: 'transactional',
  });
}

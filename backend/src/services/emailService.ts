import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export function isSesEmailConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_SES_REGION &&
      process.env.EMAIL_FROM
  );
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; skipped: true }
  | { ok: false; error: string };

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}): Promise<SendEmailResult> {
  if (!isSesEmailConfigured()) {
    return { ok: false, skipped: true };
  }

  const recipient = params.to.trim().toLowerCase();
  const suppressed = await isEmailSuppressed(recipient);
  if (suppressed) {
    logger.warn('Transactional email skipped (suppressed recipient)', {
      toDomain: recipient.split('@')[1],
      reason: suppressed.reason,
    });
    return { ok: false, skipped: true };
  }

  const region = process.env.AWS_SES_REGION!;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;
  const fromAddress = process.env.EMAIL_FROM!;
  const fromName = process.env.EMAIL_FROM_NAME || 'OrthoAndSpineTools';
  const source = `${fromName} <${fromAddress}>`;

  try {
    const client = new SESClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    const out = await client.send(
      new SendEmailCommand({
        Source: source,
        Destination: { ToAddresses: [recipient] },
        Message: {
          Subject: { Data: params.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: params.textBody, Charset: 'UTF-8' },
            Html: { Data: params.htmlBody, Charset: 'UTF-8' },
          },
        },
      })
    );
    return { ok: true, messageId: out.MessageId || 'unknown' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('Transactional email send failed', { error: msg, toDomain: params.to.split('@')[1] });
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
    // Keep mail flow available during rollouts where migration isn't applied yet.
    logger.warn('Email suppression lookup unavailable; continuing send attempt', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function escapeHtmlAttribute(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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
    `Open this link to choose a new password (valid for 1 hour):`,
    params.resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const htmlBody = `<!DOCTYPE html><html><body>
<p>You requested a password reset for your OrthoAndSpineTools account.</p>
<p><a href="${href}">Choose a new password</a> (link valid for 1 hour)</p>
<p>If you did not request this, you can ignore this email.</p>
</body></html>`;

  return sendTransactionalEmail({
    to: params.to,
    subject,
    textBody,
    htmlBody,
  });
}

export async function sendWelcomeEmail(params: {
  to: string;
  firstName?: string | null;
}): Promise<SendEmailResult> {
  const displayName = (params.firstName || '').trim() || 'there';
  const subject = 'Welcome to OrthoAndSpineTools';
  const textBody = [
    `Hi ${displayName},`,
    '',
    'Welcome to OrthoAndSpineTools.',
    'You can now participate in communities, share posts, and join discussions.',
    '',
    'Thanks for joining us.',
  ].join('\n');

  const htmlBody = `<!DOCTYPE html><html><body>
<p>Hi ${displayName},</p>
<p>Welcome to OrthoAndSpineTools.</p>
<p>You can now participate in communities, share posts, and join discussions.</p>
<p>Thanks for joining us.</p>
</body></html>`;

  return sendTransactionalEmail({
    to: params.to,
    subject,
    textBody,
    htmlBody,
  });
}

export async function sendVerifyEmail(params: {
  to: string;
  firstName?: string | null;
  verifyUrl: string;
}): Promise<SendEmailResult> {
  const displayName = (params.firstName || '').trim() || 'there';
  const href = escapeHtmlAttribute(params.verifyUrl);
  const subject = 'Verify your OrthoAndSpineTools email';
  const textBody = [
    `Hi ${displayName},`,
    '',
    'Please verify your email address to complete account setup.',
    params.verifyUrl,
    '',
    'If you did not create this account, you can ignore this email.',
  ].join('\n');

  const htmlBody = `<!DOCTYPE html><html><body>
<p>Hi ${displayName},</p>
<p>Please verify your email address to complete account setup.</p>
<p><a href="${href}">Verify email address</a></p>
<p>If you did not create this account, you can ignore this email.</p>
</body></html>`;

  return sendTransactionalEmail({
    to: params.to,
    subject,
    textBody,
    htmlBody,
  });
}

import { Router, Request, Response } from 'express';
import MessageValidator from 'sns-validator';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { getSesRuntimeConfig } from '../lib/sesConfig';

const router = Router();
const snsValidator = new MessageValidator();

type SnsEnvelope = {
  Type?: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation' | string;
  Message?: string;
  SubscribeURL?: string;
  TopicArn?: string;
  MessageId?: string;
  Signature?: string;
  SigningCertURL?: string;
};

type SesNotification = {
  notificationType?: 'Bounce' | 'Complaint' | 'Delivery' | string;
  mail?: {
    messageId?: string;
    destination?: string[];
    timestamp?: string;
  };
  bounce?: {
    bounceType?: string;
    bouncedRecipients?: Array<{ emailAddress?: string }>;
  };
  complaint?: {
    complainedRecipients?: Array<{ emailAddress?: string }>;
  };
};

function normalizeEmail(email: string | undefined): string | null {
  if (!email) return null;
  const v = email.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

function getRawBody(req: Request): string {
  if (typeof req.body === 'string') {
    return req.body;
  }
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return '';
}

function parseEnvelope(raw: string): SnsEnvelope {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as SnsEnvelope;
  } catch {
    return {};
  }
}

function isAllowedTopic(topicArn?: string): boolean {
  const cfg = getSesRuntimeConfig();
  const allowed = cfg.snsTopicArn;
  if (cfg.enforceSnsTopicAllowList) {
    if (!allowed) return false;
    return topicArn === allowed;
  }
  if (!allowed) return true;
  return topicArn === allowed;
}

async function verifySnsMessage(rawBody: string): Promise<boolean> {
  const cfg = getSesRuntimeConfig();
  if (!cfg.verifySnsSignatures) {
    return true;
  }
  return new Promise((resolve) => {
    snsValidator.validate(rawBody, (err) => {
      if (err) {
        logger.warn('SES SNS signature verification failed', {
          error: err.message,
        });
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

async function confirmSubscriptionIfPresent(envelope: SnsEnvelope): Promise<void> {
  const url = envelope.SubscribeURL;
  if (!url) return;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.amazonaws.com')) {
      logger.warn('SES SNS subscription URL rejected (not AWS HTTPS)', {
        host: parsed.hostname,
      });
      return;
    }
  } catch {
    logger.warn('SES SNS subscription URL invalid');
    return;
  }

  try {
    const out = await fetch(url, { method: 'GET' });
    logger.info('SES SNS subscription confirmed', {
      status: out.status,
      topicArn: envelope.TopicArn,
      messageId: envelope.MessageId,
    });
  } catch (error) {
    logger.error('SES SNS subscription confirmation failed', {
      topicArn: envelope.TopicArn,
      messageId: envelope.MessageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function suppressRecipients(emails: string[], reason: 'bounce' | 'complaint', eventAt?: string): Promise<void> {
  const timestamp = eventAt ? new Date(eventAt) : new Date();
  for (const email of emails) {
    const normalized = normalizeEmail(email);
    if (!normalized) continue;
    try {
      await prisma.emailSuppression.upsert({
        where: { email: normalized },
        update: {
          reason,
          source: 'ses_sns',
          lastEventAt: timestamp,
        },
        create: {
          email: normalized,
          reason,
          source: 'ses_sns',
          lastEventAt: timestamp,
        },
      });
    } catch (error) {
      logger.error('Failed to upsert email suppression record', {
        emailDomain: normalized.split('@')[1],
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

router.post('/', async (req: Request, res: Response) => {
  const rawBody = getRawBody(req);
  const signatureOk = await verifySnsMessage(rawBody);
  if (!signatureOk) {
    res.status(403).json({ success: false, error: 'Invalid SNS signature' });
    return;
  }

  const envelope = parseEnvelope(rawBody);
  const messageType = req.get('x-amz-sns-message-type') || envelope.Type || 'Unknown';

  if (!isAllowedTopic(envelope.TopicArn)) {
    logger.warn('SES SNS event rejected due to topic mismatch or missing allow-list', {
      receivedTopicArn: envelope.TopicArn,
      enforceAllowList: getSesRuntimeConfig().enforceSnsTopicAllowList,
    });
    res.status(403).json({ success: false, error: 'Topic not allowed' });
    return;
  }

  if (messageType === 'SubscriptionConfirmation') {
    await confirmSubscriptionIfPresent(envelope);
    res.json({ success: true });
    return;
  }

  if (messageType !== 'Notification') {
    logger.info('SES SNS event received (non-notification)', {
      messageType,
      topicArn: envelope.TopicArn,
      messageId: envelope.MessageId,
    });
    res.json({ success: true });
    return;
  }

  let event: SesNotification = {};
  if (typeof envelope.Message === 'string' && envelope.Message.length > 0) {
    try {
      event = JSON.parse(envelope.Message) as SesNotification;
    } catch {
      logger.warn('SES SNS notification had invalid JSON message', {
        topicArn: envelope.TopicArn,
        messageId: envelope.MessageId,
      });
      res.json({ success: true });
      return;
    }
  }

  const baseLog = {
    topicArn: envelope.TopicArn,
    snsMessageId: envelope.MessageId,
    sesMessageId: event.mail?.messageId,
    notificationType: event.notificationType || 'Unknown',
    recipientCount: event.mail?.destination?.length || 0,
  };

  if (event.notificationType === 'Bounce') {
    const bounced =
      event.bounce?.bouncedRecipients?.map((r) => r.emailAddress).filter(Boolean) as string[] || [];
    await suppressRecipients(bounced, 'bounce', event.mail?.timestamp);
    logger.warn('SES bounce event received', {
      ...baseLog,
      bounceType: event.bounce?.bounceType,
      bouncedCount: bounced.length,
    });
  } else if (event.notificationType === 'Complaint') {
    const complained =
      event.complaint?.complainedRecipients?.map((r) => r.emailAddress).filter(Boolean) as string[] || [];
    await suppressRecipients(complained, 'complaint', event.mail?.timestamp);
    logger.warn('SES complaint event received', {
      ...baseLog,
      complainedCount: complained.length,
    });
  } else {
    logger.info('SES notification event received', baseLog);
  }

  res.json({ success: true });
});

export default router;

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router = Router();

type SnsEnvelope = {
  Type?: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation' | string;
  Message?: string;
  SubscribeURL?: string;
  TopicArn?: string;
  MessageId?: string;
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

function parseEnvelope(req: Request): SnsEnvelope {
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      return JSON.parse(req.body) as SnsEnvelope;
    } catch {
      return {};
    }
  }
  if (req.body && typeof req.body === 'object') {
    return req.body as SnsEnvelope;
  }
  return {};
}

function isAllowedTopic(topicArn?: string): boolean {
  const allowed = process.env.AWS_SES_SNS_TOPIC_ARN?.trim();
  if (!allowed) return true;
  return topicArn === allowed;
}

async function confirmSubscriptionIfPresent(envelope: SnsEnvelope): Promise<void> {
  const url = envelope.SubscribeURL;
  if (!url) return;
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
  const envelope = parseEnvelope(req);
  const messageType = req.get('x-amz-sns-message-type') || envelope.Type || 'Unknown';

  if (!isAllowedTopic(envelope.TopicArn)) {
    logger.warn('SES SNS event rejected due to topic mismatch', {
      receivedTopicArn: envelope.TopicArn,
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
    recipients: event.mail?.destination?.length || 0,
  };

  if (event.notificationType === 'Bounce') {
    const bounced = event.bounce?.bouncedRecipients?.map((r) => r.emailAddress).filter(Boolean) as string[] || [];
    await suppressRecipients(bounced, 'bounce', event.mail?.timestamp);
    logger.warn('SES bounce event received', {
      ...baseLog,
      bounceType: event.bounce?.bounceType,
      bouncedRecipients: bounced,
    });
  } else if (event.notificationType === 'Complaint') {
    const complained = event.complaint?.complainedRecipients?.map((r) => r.emailAddress).filter(Boolean) as string[] || [];
    await suppressRecipients(complained, 'complaint', event.mail?.timestamp);
    logger.warn('SES complaint event received', {
      ...baseLog,
      complainedRecipients: complained,
    });
  } else {
    logger.info('SES notification event received', baseLog);
  }

  res.json({ success: true });
});

export default router;

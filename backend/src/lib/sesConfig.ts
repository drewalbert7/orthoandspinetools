import { logger } from '../utils/logger';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SesRuntimeConfig = {
  configured: boolean;
  region: string | null;
  fromAddress: string | null;
  fromName: string;
  replyTo: string | null;
  configurationSet: string | null;
  snsTopicArn: string | null;
  publicSiteUrl: string;
  /** When true, SNS webhook rejects events if topic ARN is not configured (production + SES on). */
  enforceSnsTopicAllowList: boolean;
  /** When true, SNS webhook verifies AWS signature on every message. */
  verifySnsSignatures: boolean;
};

function trimEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

export function isSesEmailConfigured(): boolean {
  return Boolean(
    trimEnv('AWS_ACCESS_KEY_ID') &&
      trimEnv('AWS_SECRET_ACCESS_KEY') &&
      trimEnv('AWS_SES_REGION') &&
      trimEnv('EMAIL_FROM')
  );
}

export function getPublicSiteUrl(): string {
  const raw = trimEnv('PUBLIC_SITE_URL') || 'https://orthoandspinetools.com';
  return raw.replace(/\/$/, '');
}

export function getSesRuntimeConfig(): SesRuntimeConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const configured = isSesEmailConfigured();
  const snsTopicArn = trimEnv('AWS_SES_SNS_TOPIC_ARN') ?? null;

  return {
    configured,
    region: trimEnv('AWS_SES_REGION') ?? null,
    fromAddress: trimEnv('EMAIL_FROM') ?? null,
    fromName: trimEnv('EMAIL_FROM_NAME') || 'OrthoAndSpineTools',
    replyTo: trimEnv('EMAIL_REPLY_TO') ?? null,
    configurationSet: trimEnv('AWS_SES_CONFIGURATION_SET') ?? null,
    snsTopicArn,
    publicSiteUrl: getPublicSiteUrl(),
    enforceSnsTopicAllowList: isProduction && configured,
    verifySnsSignatures: (trimEnv('AWS_SNS_VERIFY_SIGNATURES') ?? 'true').toLowerCase() !== 'false',
  };
}

export function validateSesConfigurationAtStartup(): void {
  const cfg = getSesRuntimeConfig();
  if (!cfg.configured) {
    logger.info('SES email: not configured (transactional sends will be skipped until env vars are set)');
    return;
  }

  if (cfg.fromAddress && !EMAIL_RE.test(cfg.fromAddress)) {
    logger.error('SES email: EMAIL_FROM is not a valid email address', { fromDomain: cfg.fromAddress.split('@')[1] });
  }

  if (cfg.replyTo && !EMAIL_RE.test(cfg.replyTo)) {
    logger.warn('SES email: EMAIL_REPLY_TO is invalid; Reply-To header will be omitted');
  }

  if (cfg.publicSiteUrl && !/^https:\/\//i.test(cfg.publicSiteUrl) && process.env.NODE_ENV === 'production') {
    logger.warn('SES email: PUBLIC_SITE_URL should use https in production', { publicSiteUrl: cfg.publicSiteUrl });
  }

  if (cfg.configurationSet) {
    logger.info('SES email: configuration set enabled', { configurationSet: cfg.configurationSet });
  }

  if (cfg.enforceSnsTopicAllowList && !cfg.snsTopicArn) {
    logger.warn(
      'SES email: AWS_SES_SNS_TOPIC_ARN is not set — bounce/complaint SNS events will be rejected until configured (sends still work)'
    );
  } else if (cfg.snsTopicArn) {
    logger.info('SES email: SNS topic allow-list configured for /api/ses/events');
  }

  logger.info('SES email: ready to send when AWS credentials are valid', {
    region: cfg.region,
    fromDomain: cfg.fromAddress?.split('@')[1],
  });
}

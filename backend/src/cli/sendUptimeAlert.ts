import dotenv from 'dotenv';

dotenv.config();

import { sendUptimeAlertEmail } from '../services/emailService';
import { logger } from '../utils/logger';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main(): Promise<void> {
  const to = process.argv[2] || process.env.UPTIME_ALERT_TO;
  const subject = process.argv[3] || process.env.UPTIME_ALERT_SUBJECT;
  let body = process.argv[4] || process.env.UPTIME_ALERT_BODY || '';

  if (!process.stdin.isTTY && !body) {
    body = await readStdin();
  }

  if (!to || !subject || !body) {
    console.error(
      'Usage: node dist/cli/sendUptimeAlert.js <to> <subject> [body]\n' +
        '  Or set UPTIME_ALERT_TO, UPTIME_ALERT_SUBJECT, UPTIME_ALERT_BODY (body may be piped on stdin).'
    );
    process.exit(1);
  }

  const result = await sendUptimeAlertEmail({ to, subject, body });

  if (!result.ok) {
    const reason = 'error' in result ? result.error : 'skipped';
    logger.error('Uptime alert email not sent', { to, subject, reason });
    console.error(`Failed to send uptime alert: ${reason}`);
    process.exit(1);
  }

  console.log(`Uptime alert sent to ${to}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

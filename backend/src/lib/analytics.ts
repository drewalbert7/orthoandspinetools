import crypto from 'crypto';
import type { Request } from 'express';

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|linkedinbot|twitterbot|discordbot|telegrambot|whatsapp|gptbot|claudebot|perplexitybot|semrush|ahrefs|applebot|bingpreview|google-inspectiontool/i;

const SKIP_PATH =
  /^\/(admin|login|register|forgot-password|reset-password|verify-email|create-post|post\/[^/]+\/edit)(\/|$)/;

export function normalizeAnalyticsPath(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let path = raw.trim();
  if (!path.startsWith('/')) path = `/${path}`;
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  if (path.length > 512) path = path.slice(0, 512);
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
  if (SKIP_PATH.test(path)) return null;
  return path;
}

export function isAnalyticsBot(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return BOT_UA.test(userAgent);
}

export function analyticsVisitorHash(req: Request): string {
  const salt = process.env.ANALYTICS_SALT || 'orthoandspinetools-analytics';
  const ip = req.ip || req.socket.remoteAddress || '';
  const ua = req.get('user-agent') || '';
  return crypto.createHash('sha256').update(`${salt}:${ip}:${ua}`).digest('hex').slice(0, 32);
}

export function sanitizeReferrer(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 512);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().slice(0, 512);
  } catch {
    return null;
  }
}

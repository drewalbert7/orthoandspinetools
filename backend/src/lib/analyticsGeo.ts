import type { Request } from 'express';
import geoip from 'geoip-lite';

/** Best-effort client IP behind nginx / Cloudflare. */
export function clientIp(req: Request): string {
  const cf = req.get('cf-connecting-ip');
  if (cf && cf.trim()) return cf.trim();
  const xff = req.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  return (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

/** ISO 3166-1 alpha-2, or null when unknown / private. */
export function lookupCountryCode(req: Request): string | null {
  const header =
    req.get('cf-ipcountry') ||
    req.get('x-country-code') ||
    req.get('x-geo-country');
  if (header) {
    const cc = header.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1') return cc;
  }

  const ip = clientIp(req);
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('172.18.')) {
    return null;
  }
  try {
    const hit = geoip.lookup(ip);
    const cc = hit?.country?.toUpperCase();
    if (cc && /^[A-Z]{2}$/.test(cc)) return cc;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * OrthoAndSpineTools bot/LLM nginx access-log tailer.
 * Modeled on Physician Forge pf_analytics.py behavior.
 *
 * Env:
 *   SITE_ACCESS_LOG — path to nginx access.log (required)
 *   BOT_IGNORE_IPS — comma-separated IPs to skip (server self-hits)
 *   BOT_BACKFILL_DAYS — default 14
 *   DATABASE_URL — Prisma connection
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { prisma } from '../lib/prisma';
import { classifyBot, type BotCategory } from '../lib/botClassify';
import { recordBotHitsBatch } from '../lib/botAnalytics';

const STATE_KEY = 'log_cursor';
const ACCESS_LOG = (process.env.SITE_ACCESS_LOG || '').trim();
const BACKFILL_DAYS = Math.max(1, parseInt(process.env.BOT_BACKFILL_DAYS || '14', 10) || 14);
const POLL_MS = Math.max(1000, parseInt(process.env.BOT_TAIL_POLL_MS || '2000', 10) || 2000);

const IGNORE_IPS = new Set(
  [
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    ...(process.env.BOT_IGNORE_IPS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ].map((ip) => ip.toLowerCase())
);

const STATIC_EXT =
  /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|mp4|webm|mp3|wav|pdf)(?:\?|#|$)/i;

const COMBINED_RE =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+)\s+([^"]*?)\s*(?:HTTP\/[\d.]+)?" (\d{3}) (\S+) "([^"]*)" "([^"]*)"/;

type ParsedHit = {
  ip: string;
  at: Date;
  method: string;
  path: string;
  status: number;
  ua: string;
};

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

function shouldSkipPath(rawPath: string): boolean {
  let p = rawPath.split('?')[0] || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.startsWith('/api/analytics')) return true;
  if (STATIC_EXT.test(p)) return true;
  // Keep robots.txt, sitemap, llms.txt, .md twins
  return false;
}

function normalizePath(rawPath: string): string {
  let p = rawPath.split('?')[0] || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 512) p = p.slice(0, 512);
  if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function parseNginxTime(local: string): Date | null {
  // 29/Sep/2025:12:39:10 +0000
  const m = local.match(
    /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/
  );
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  const mon = months[m[2]];
  if (mon == null) return null;
  const iso = `${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${m[7].slice(0, 3)}:${m[7].slice(3)}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseLine(line: string): ParsedHit | null {
  const m = line.match(COMBINED_RE);
  if (!m) return null;
  const at = parseNginxTime(m[2]);
  if (!at) return null;
  return {
    ip: m[1],
    at,
    method: m[3],
    path: m[4],
    status: parseInt(m[5], 10),
    ua: m[8] || '',
  };
}

function listLogFiles(primary: string): string[] {
  const dir = path.dirname(primary);
  const base = path.basename(primary);
  const files: Array<{ name: string; full: string; rank: number }> = [];
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return fs.existsSync(primary) ? [primary] : [];
  }
  for (const name of entries) {
    if (name === base) {
      files.push({ name, full: path.join(dir, name), rank: 0 });
      continue;
    }
    // access.log.1, access.log.2.gz …
    const rot = name.match(new RegExp(`^${base.replace('.', '\\.')}\\.(\\d+)(\\.gz)?$`));
    if (rot) {
      files.push({ name, full: path.join(dir, name), rank: parseInt(rot[1], 10) });
    }
  }
  files.sort((a, b) => b.rank - a.rank); // oldest rotated first, then current
  return files.map((f) => f.full);
}

function readFileLines(filePath: string): string[] {
  const buf = fs.readFileSync(filePath);
  const text = filePath.endsWith('.gz')
    ? zlib.gunzipSync(buf).toString('utf8')
    : buf.toString('utf8');
  return text.split(/\r?\n/).filter(Boolean);
}

function inodeOf(filePath: string): string {
  try {
    const st = fs.statSync(filePath);
    return `${st.dev}:${st.ino}`;
  } catch {
    return '';
  }
}

async function flushBatch(
  batch: Array<{ family: string; category: BotCategory; path: string; at: Date }>
) {
  if (batch.length === 0) return;
  await recordBotHitsBatch(batch);
  batch.length = 0;
}

function processLine(
  line: string,
  cutoff: Date,
  batch: Array<{ family: string; category: BotCategory; path: string; at: Date }>
): void {
  const hit = parseLine(line);
  if (!hit) return;
  if (hit.at < cutoff) return;
  if (IGNORE_IPS.has(hit.ip.toLowerCase())) return;
  if (hit.method !== 'GET' && hit.method !== 'HEAD') return;
  if (hit.status >= 400) return;
  if (shouldSkipPath(hit.path)) return;

  const classification = classifyBot(hit.ua);
  if (!classification) return;

  batch.push({
    family: classification.family,
    category: classification.category,
    path: normalizePath(hit.path),
    at: hit.at,
  });
}

async function backfill(primary: string): Promise<void> {
  const cutoff = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  const files = listLogFiles(primary);
  log(`Backfill start: ${files.length} log file(s), since ${cutoff.toISOString()}`);

  const batch: Array<{ family: string; category: BotCategory; path: string; at: Date }> = [];
  let lines = 0;
  let hits = 0;

  for (const file of files) {
    log(`  reading ${file}`);
    let fileLines: string[];
    try {
      fileLines = readFileLines(file);
    } catch (err) {
      log(`  skip unreadable ${file}:`, err);
      continue;
    }
    for (const line of fileLines) {
      lines += 1;
      const before = batch.length;
      processLine(line, cutoff, batch);
      if (batch.length > before) hits += 1;
      if (batch.length >= 500) {
        await flushBatch(batch);
      }
    }
  }
  await flushBatch(batch);

  const st = fs.statSync(primary);
  await prisma.analyticsBotState.upsert({
    where: { key: STATE_KEY },
    create: {
      key: STATE_KEY,
      inode: inodeOf(primary),
      offset: BigInt(st.size),
      backfilledAt: new Date(),
    },
    update: {
      inode: inodeOf(primary),
      offset: BigInt(st.size),
      backfilledAt: new Date(),
    },
  });

  log(`Backfill done: scanned ${lines} lines, recorded ${hits} bot hits`);
}

async function saveCursor(inode: string, offset: number) {
  await prisma.analyticsBotState.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, inode, offset: BigInt(offset) },
    update: { inode, offset: BigInt(offset) },
  });
}

async function tailOnce(primary: string): Promise<void> {
  const state = await prisma.analyticsBotState.findUnique({ where: { key: STATE_KEY } });
  if (!fs.existsSync(primary)) return;

  const st = fs.statSync(primary);
  const inode = inodeOf(primary);
  let offset = state?.offset != null ? Number(state.offset) : 0;

  // Rotation / truncate
  if (state?.inode && state.inode !== inode) {
    log(`Log rotated (inode ${state.inode} → ${inode}); reading from start of new file`);
    offset = 0;
  } else if (offset > st.size) {
    log(`Log truncated (offset ${offset} > size ${st.size}); resetting offset`);
    offset = 0;
  }

  if (offset >= st.size) {
    await saveCursor(inode, st.size);
    return;
  }

  const fd = fs.openSync(primary, 'r');
  try {
    const length = st.size - offset;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, offset);
    const text = buf.toString('utf8');
    const lines = text.split(/\r?\n/);
    // If file doesn't end with newline, hold incomplete last line by not advancing fully
    const complete = text.endsWith('\n') ? lines.filter(Boolean) : lines.slice(0, -1).filter(Boolean);
    const consumed = text.endsWith('\n')
      ? length
      : length - Buffer.byteLength(lines[lines.length - 1] || '', 'utf8');

    const cutoff = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
    const batch: Array<{ family: string; category: BotCategory; path: string; at: Date }> = [];
    for (const line of complete) {
      processLine(line, cutoff, batch);
    }
    if (batch.length > 0) {
      await recordBotHitsBatch(batch);
      log(`Tailed ${batch.length} bot hit(s)`);
    }
    await saveCursor(inode, offset + consumed);
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  if (!ACCESS_LOG) {
    console.error('SITE_ACCESS_LOG is required');
    process.exit(1);
  }
  if (!fs.existsSync(ACCESS_LOG)) {
    console.error(`SITE_ACCESS_LOG not found: ${ACCESS_LOG}`);
    process.exit(1);
  }

  log(`Bot analytics tailer starting`);
  log(`  log: ${ACCESS_LOG}`);
  log(`  ignore IPs: ${[...IGNORE_IPS].join(', ')}`);
  log(`  backfill days: ${BACKFILL_DAYS}`);

  const state = await prisma.analyticsBotState.findUnique({ where: { key: STATE_KEY } });
  if (!state?.backfilledAt) {
    await backfill(ACCESS_LOG);
  } else {
    log(`Cursor present (offset=${state.offset}); skipping backfill`);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tailOnce(ACCESS_LOG);
    } catch (err) {
      console.error('Tail error:', err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

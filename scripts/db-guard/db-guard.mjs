#!/usr/bin/env node
// db-guard: blocks destructive database / volume / backup operations from entering the OST repo.
// Audit items 3 + 7. Same layout as scripts/phi-guard (node script + POSIX wrapper + CI job + hook).
//
//   node scripts/db-guard/db-guard.mjs --diff <base> [<head>]   CI: lines ADDED between base...head
//   node scripts/db-guard/db-guard.mjs --staged                 pre-commit: staged additions
//   node scripts/db-guard/db-guard.mjs --all [--strict]         audit report of every tracked file
//                                                               (report-only unless --strict)
// Exit: 0 clean | 1 findings | 2 usage/internal error (fails CLOSED).
//
// Override (both required): a `DESTRUCTIVE-OK: <approval-ref>` marker on the offending line (or, for a
// Prisma migration, anywhere in that migration.sql) AND env DB_GUARD_APPROVED=true, which the workflow
// sets only when the PR carries the `destructive-ok` label (applied by Drew / CEO).
// Output is file:line + rule id + the matched token only (never the whole line).
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const MIGRATION_RE = /(^|\/)prisma\/migrations\/[^/]+\/migration\.sql$/;
// Security-owned files: exempt from content rules (they define the guard / break-glass), but ANY later
// edit, rename or delete is a blocking finding (guard-changed) that needs the marker + label.
const SELF_RE = /(^|\/)scripts\/db-guard\/|(^|\/)scripts\/db\/(roles|rollback|verify)\.sql$/;
const DOC_RE = /\.(md|mdx|mdc|txt|rst)$|(^|\/)docs\//i;
const IGNORE_FILE = '.db-guard-ignore';
const MARKER_RE = /DESTRUCTIVE-OK:\s*[A-Za-z0-9][A-Za-z0-9._\/#:-]{2,}/;
const BACKUPISH_PATH_RE = /(^|\/)(scripts|ops|deploy|bin)\/|\.sh$|backup|dump|restore/i;

// [id, regex, scope, message]. scope: any | sql (.sql files) | code (non-.sql) | migration | backupish
const RULES = [
  ['sql-drop-database', /\bDROP\s+DATABASE\b|(^|[\s;&|`$(])dropdb\b/i, 'any', 'DROP DATABASE / dropdb'],
  ['sql-drop-object', /\bDROP\s+(TABLE|SCHEMA|MATERIALIZED\s+VIEW|VIEW|OWNED|EXTENSION)\b/i, 'sql', 'DROP TABLE/SCHEMA/VIEW/OWNED/EXTENSION'],
  ['sql-drop-object', /\bDROP\s+(TABLE|SCHEMA|MATERIALIZED\s+VIEW|OWNED)\b/, 'code', 'DROP TABLE/SCHEMA/OWNED in code'],
  ['sql-truncate', /\bTRUNCATE\b/i, 'sql', 'TRUNCATE'],
  ['sql-truncate', /\bTRUNCATE\s+(TABLE\s+)?["'`]?[A-Za-z_]/, 'code', 'TRUNCATE in code'],
  ['sql-raw-destructive', /\$(executeRaw|queryRaw)(Unsafe)?\b.*\b(drop\s+(table|schema|database)|truncate)\b/i, 'code', 'destructive SQL via Prisma raw query'],
  ['sql-delete-all', /^\s*DELETE\s+FROM\s+["'`]?[\w."]+["'`]?\s*;/i, 'sql', 'DELETE without WHERE'],
  ['prisma-deletemany-all', /\.deleteMany\(\s*(\{\s*\})?\s*\)/, 'code', 'Prisma deleteMany() with no where'],
  ['migration-drop-column', /\bDROP\s+COLUMN\b/i, 'migration', 'migration drops a column'],
  ['migration-alter-type', /\bALTER\s+COLUMN\s+["\w]+\s+(SET\s+DATA\s+)?TYPE\b/i, 'migration', 'migration changes a column type (possible data loss)'],
  ['migration-delete', /\bDELETE\s+FROM\b/i, 'migration', 'migration deletes rows'],
  ['migration-drop-type', /\bDROP\s+TYPE\b/i, 'migration', 'migration drops a type/enum'],
  ['db-guard-override', /ost\.allow_destructive/i, 'any', 'DB guard break-glass (SET ost.allow_destructive)'],
  ['prisma-reset', /\b(prisma\s+)?migrate\s+reset\b|--force-reset\b|--accept-data-loss\b/i, 'any', 'ORM reset / data-loss flag'],
  ['prisma-db-push', /\bprisma\s+db\s+push\b/i, 'any', 'prisma db push (bypasses migrations; can drop data)'],
  ['prisma-migrate-dev', /\bprisma\s+migrate\s+dev\b/i, 'any', 'prisma migrate dev (offers a reset on drift; never on prod)'],
  ['docker-down-volumes', /\bdocker[-\s]+compose\b[^#\n|;&]*\bdown\b[^#\n|;&]*(\s-[a-zA-Z]*v\b|--volumes\b)/i, 'any', 'docker compose down -v'],
  ['docker-volume-rm', /\bdocker\s+volume\s+(rm|remove|prune)\b/i, 'any', 'docker volume rm/prune'],
  ['docker-system-prune-volumes', /\bdocker\s+system\s+prune\b[^#\n|;&]*--volumes\b/i, 'any', 'docker system prune --volumes'],
  ['rclone-destructive', /\brclone\s+(sync|bisync|delete|deletefile|purge|rmdir|rmdirs|cleanup|dedupe|move|moveto)\b|--delete-(before|during|after|excluded)\b/i, 'any', 'rclone command that deletes or moves'],
  ['s3-delete', /\baws\s+s3\s+(rm|rb)\b|\baws\s+s3\s+sync\b[^#\n|;&]*--delete\b|\bwrangler\s+r2\s+(object|bucket)\s+delete\b|\bDeleteObjects?Command\b|\.deleteObjects?\(/i, 'backupish', 'object-store delete in a script/backup path'],
  ['wrangler-d1-prod', /\bwrangler\s+d1\s+execute\b[^#\n|;&]*--remote\b/i, 'any', 'wrangler d1 execute --remote'],
  ['rm-data', /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+[^#\n|;&]*(postgres(ql)?[_/-]?data|pgdata|\/var\/lib\/docker\/volumes|\.deploy-backups|HC_Volume|ost-db-backups|ost-wal|backups?\/|\.dump\b|\.sqlite3?\b|\.db\b)/i, 'any', 'rm -r of database data / backups'],
  ['pg-clean', /\bpg_(restore|dump(all)?)\b[^#\n|;&]*(\s-c\b|--clean\b)/i, 'any', 'pg_restore/pg_dump --clean (emits DROPs)'],
];
const UPLOAD_RE = /\brclone\s+(copy|copyto)\b|\baws\s+s3\s+(cp|mv)\b|\bwrangler\s+r2\s+object\s+put\b|\bcurl\b[^#\n|;&]*(\s-T\s|--upload-file\b)|\bgsutil\s+cp\b|\bb2\s+upload|\bscp\s|\brsync\s/i;
const DUMPISH_RE = /\.sql(\.gz)?\b|\.dump\b|\.bak\b|\bpg_dump|\bbackup_|\bdb-\d|\.tar(\.gz)?\b/i;
const ENCRYPTED_RE = /\.gpg\b|\.age\b|\.enc\b|\bgpg\b|\bage\s+-r\b|encrypt/i;
const SDK_UPLOAD_RE = /\bPutObjectCommand\b|\.putObject\(|new\s+Upload\(|\.upload\(/;

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
}
function loadIgnore() {
  if (!existsSync(IGNORE_FILE)) return [];
  return readFileSync(IGNORE_FILE, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$'));
}
function scopeOk(scope, file) {
  const isSql = /\.sql$/i.test(file);
  switch (scope) {
    case 'any': return true;
    case 'sql': return isSql;
    case 'code': return !isSql;
    case 'migration': return MIGRATION_RE.test(file);
    case 'backupish': return BACKUPISH_PATH_RE.test(file);
    default: return false;
  }
}
// Parse `git diff -U0` output -> [{file, line, text}] for added lines, plus file status list.
function parseDiff(diffText) {
  const out = []; let file = null; let ln = 0;
  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('+++ ')) { file = raw === '+++ /dev/null' ? null : raw.replace(/^\+\+\+ b\//, ''); continue; }
    if (raw.startsWith('@@')) { const m = /\+(\d+)(?:,(\d+))?/.exec(raw); ln = m ? parseInt(m[1], 10) : 0; continue; }
    if (!file) continue;
    if (raw.startsWith('+') && !raw.startsWith('+++')) { out.push({ file, line: ln, text: raw.slice(1) }); ln++; }
  }
  return out;
}
function fileContent(mode, file, head) {
  try {
    if (mode === 'staged') return git(['show', `:${file}`]);
    if (mode === 'diff') return git(['show', `${head}:${file}`]);
  } catch { /* deleted */ }
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}

const args = process.argv.slice(2);
let mode = null, base = null, head = 'HEAD', strict = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--diff') { mode = 'diff'; base = args[++i]; if (args[i + 1] && !args[i + 1].startsWith('--')) head = args[++i]; }
  else if (a === '--staged') mode = 'staged';
  else if (a === '--all') mode = 'all';
  else if (a === '--strict') strict = true;
  else if (a === '-h' || a === '--help') { console.log('usage: db-guard.mjs --diff <base> [<head>] | --staged | --all [--strict]'); process.exit(0); }
  else { console.error(`db-guard: unknown argument ${a}`); process.exit(2); }
}
if (!mode || (mode === 'diff' && !base)) { console.error('db-guard: need --diff <base> [<head>], --staged or --all'); process.exit(2); }

const approved = /^(1|true|yes)$/i.test(process.env.DB_GUARD_APPROVED || '');
const ignore = loadIgnore();
const findings = [];
let lines = [];
let statusLines = [];
try {
  if (mode === 'all') {
    for (const f of git(['ls-files', '-z']).split('\0').filter(Boolean)) {
      let txt; try { txt = readFileSync(f, 'utf8'); } catch { continue; }
      if (txt.includes('\u0000')) continue;
      txt.split('\n').forEach((t, i) => lines.push({ file: f, line: i + 1, text: t }));
    }
  } else {
    const range = mode === 'staged' ? ['--cached'] : [`${base}...${head}`];
    lines = parseDiff(git(['diff', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=AMR', ...range]));
    statusLines = git(['diff', '--name-status', '--no-color', '-M', ...range]).split('\n').filter(Boolean);
  }
} catch (e) {
  console.error(`db-guard: git failed (${e.message.split('\n')[0]}). Refusing to pass.`);
  process.exit(2);
}

// Rule: applied migrations must never be edited, renamed or deleted (Prisma checksum drift -> reset prompts).
for (const s of statusLines) {
  const [st, a, b] = s.split('\t');
  const paths = [a, b].filter(Boolean);
  if (/^[MDR]/.test(st) && paths.some((p) => MIGRATION_RE.test(p) || /(^|\/)prisma\/migrations\/migration_lock\.toml$/.test(p)))
    findings.push({ file: a, line: 0, rule: 'migration-history-edited', token: st[0], msg: 'existing migration edited/renamed/deleted', markerable: false });
  if (/^[MDR]/.test(st) && paths.some((p) => /(^|\/)\.github\/workflows\/db-guard\.yml$/.test(p) || SELF_RE.test(p)))
    findings.push({ file: a, line: 0, rule: 'guard-changed', token: st[0], msg: 'db-guard itself changed (needs Security Officer review)', markerable: true });
}

const migrationHasMarker = new Map();
const byFile = new Map();
for (const l of lines) { if (!byFile.has(l.file)) byFile.set(l.file, []); byFile.get(l.file).push(l); }

for (const [file, flines] of byFile) {
  if (file === IGNORE_FILE) {
    if (mode !== 'all') flines.filter((l) => l.text.trim() && !l.text.trim().startsWith('#'))
      .forEach((l) => findings.push({ file, line: l.line, rule: 'ignore-list-changed', token: '', msg: 'db-guard ignore list widened', markerable: true, marked: MARKER_RE.test(l.text) }));
    continue;
  }
  if (SELF_RE.test(file) || DOC_RE.test(file) || ignore.some((re) => re.test(file))) continue;
  const isMig = MIGRATION_RE.test(file);
  let full = null;
  const getFull = () => (full ??= fileContent(mode, file, head));
  if (isMig) migrationHasMarker.set(file, MARKER_RE.test(getFull()));

  for (const l of flines) {
    const text = l.text;
    const trimmed = text.trim();
    // Pure comment lines carry no executable SQL/shell (but markers live there; still scan "-- DROP" in .sql? no).
    if (/^(--|#|\/\/|\*|\/\*)/.test(trimmed) && !/ost\.allow_destructive/i.test(trimmed)) continue;
    for (const [id, re, scope, msg] of RULES) {
      if (!scopeOk(scope, file)) continue;
      const m = re.exec(text);
      if (!m) continue;
      const marked = MARKER_RE.test(text) || (isMig && migrationHasMarker.get(file));
      findings.push({ file, line: l.line, rule: id, token: m[0].trim().slice(0, 60), msg, markerable: true, marked });
    }
    if (UPLOAD_RE.test(text) && DUMPISH_RE.test(text) && !ENCRYPTED_RE.test(text)) {
      findings.push({ file, line: l.line, rule: 'unencrypted-dump-upload', token: (UPLOAD_RE.exec(text) || [''])[0].trim(), msg: 'upload of a dump/backup without gpg/age encryption on the same line', markerable: true, marked: MARKER_RE.test(text) });
    }
  }
  // SDK upload of dumps/backups in a file that never encrypts.
  const sdkLine = flines.find((l) => SDK_UPLOAD_RE.test(l.text));
  if (sdkLine && !/\.sql$/i.test(file)) {
    const body = getFull();
    if (DUMPISH_RE.test(body) && /backup|dump/i.test(file + body) && !ENCRYPTED_RE.test(body))
      findings.push({ file, line: sdkLine.line, rule: 'unencrypted-dump-upload', token: (SDK_UPLOAD_RE.exec(sdkLine.text) || [''])[0], msg: 'object-store upload in a backup/dump file that never encrypts', markerable: true, marked: MARKER_RE.test(sdkLine.text) });
  }
}

let blocking = 0, allowed = 0;
for (const f of findings) {
  const ok = f.markerable && f.marked && approved;
  const tag = ok ? 'ALLOWED' : 'BLOCK';
  if (ok) allowed++; else blocking++;
  const why = !f.markerable ? '' : f.marked && !approved ? ' (marker present but PR lacks the destructive-ok label)' : !f.marked ? ' (no DESTRUCTIVE-OK marker)' : '';
  console.log(`${tag}  ${f.file}:${f.line}  [${f.rule}] ${f.msg}${f.token ? ` :: "${f.token}"` : ''}${why}`);
}
const scanned = mode === 'all' ? 'all tracked files' : `${lines.length} added line(s) in ${byFile.size} file(s)`;
if (blocking === 0) {
  console.log(`db-guard: OK (${scanned}; ${allowed} approved override(s))`);
  process.exit(0);
}
console.log(`db-guard: ${blocking} blocking finding(s) in ${scanned}.`);
console.log('Destructive DB/volume/backup operations need Drew\'s explicit OK via CEO: add `DESTRUCTIVE-OK: <approval ref>`');
console.log('on the line (or in the migration.sql) AND have Drew/CEO apply the `destructive-ok` PR label. See AGENTS.md "Database safety".');
process.exit(mode === 'all' && !strict ? 0 : 1);

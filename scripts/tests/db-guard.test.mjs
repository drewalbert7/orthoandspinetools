// db-guard approval rules. Run: node --test scripts/tests/db-guard.test.mjs (no network).
// Unit tests cover the pure helpers; the CLI tests build throwaway git repos and run db-guard.mjs --diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelApproval, guardChangeFindings, decide } from '../db-guard/db-guard.mjs';

const GUARD = resolve(dirname(fileURLToPath(import.meta.url)), '../db-guard/db-guard.mjs');
const HEAD_DATE = '2026-01-01T12:00:00Z';
const ev = (event, created_at, login = 'drewalbert7', type = 'User') =>
  ({ event, created_at, label: { name: 'destructive-ok' }, actor: { login, type } });
const VALID = [ev('labeled', '2026-01-02T00:00:00Z')];

// ---- unit: labelApproval ----
test('label: maintainer label newer than head is accepted', () => {
  assert.equal(labelApproval({ labelPresent: true, events: VALID, headCommitDate: HEAD_DATE }).approved, true);
});
test('label: older than head commit is rejected', () => {
  const r = labelApproval({ labelPresent: true, events: [ev('labeled', '2025-12-31T00:00:00Z')], headCommitDate: HEAD_DATE });
  assert.equal(r.approved, false); assert.match(r.reason, /older than the head/);
});
test('label: non-maintainer actor is rejected', () => {
  assert.equal(labelApproval({ labelPresent: true, events: [ev('labeled', '2026-01-02T00:00:00Z', 'someone-else')], headCommitDate: HEAD_DATE }).approved, false);
});
test('label: bot actor is rejected (type Bot or [bot] login)', () => {
  assert.equal(labelApproval({ labelPresent: true, events: [ev('labeled', '2026-01-02T00:00:00Z', 'drewalbert7', 'Bot')], headCommitDate: HEAD_DATE }).approved, false);
  assert.equal(labelApproval({ labelPresent: true, events: [ev('labeled', '2026-01-02T00:00:00Z', 'github-actions[bot]', 'User')], headCommitDate: HEAD_DATE }).approved, false);
});
test('label: latest event unlabeled, no events, missing date or label absent are rejected', () => {
  const later = [...VALID, ev('unlabeled', '2026-01-03T00:00:00Z')];
  assert.equal(labelApproval({ labelPresent: true, events: later, headCommitDate: HEAD_DATE }).approved, false);
  assert.equal(labelApproval({ labelPresent: true, events: null, headCommitDate: HEAD_DATE }).approved, false);
  assert.equal(labelApproval({ labelPresent: true, events: VALID, headCommitDate: '' }).approved, false);
  assert.equal(labelApproval({ labelPresent: false, events: VALID, headCommitDate: HEAD_DATE }).approved, false);
});

// ---- unit: guardChangeFindings + decide ----
test('guard files: A is approvable, M/D/R block even when approved', () => {
  const f = guardChangeFindings([
    'A\tscripts/db-guard/db-guard.mjs',
    'M\t.github/workflows/db-guard.yml',
    'D\tscripts/db/roles.sql',
    'R100\tscripts/db/verify.sql\tscripts/db/verify2.sql',
    'M\tREADME.md',
  ]);
  assert.equal(f.length, 4);
  const d = decide(f, true);
  assert.deepEqual(d.results.map((r) => [r.token, r.ok]), [['A', true], ['M', false], ['D', false], ['R', false]]);
  assert.equal(decide(f.slice(0, 1), false).blocking, 1);
});
test('guard files: A of a path that exists at the merge base is a hard block', () => {
  const f = guardChangeFindings(['A\tscripts/db-guard/db-guard.mjs'], () => true);
  assert.equal(decide(f, true).blocking, 1);
});

// ---- CLI: real git repos ----
function sh(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_COMMITTER_DATE: HEAD_DATE, GIT_AUTHOR_DATE: HEAD_DATE } });
}
function put(dir, file, body) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), body); }
// baseFiles / headFiles: {path: content}. Returns {dir, base, head}.
function repo(baseFiles, headFiles) {
  const dir = mkdtempSync(join(tmpdir(), 'db-guard-test-'));
  sh(dir, 'init', '-q', '-b', 'main');
  put(dir, 'README.md', 'x\n');
  for (const [f, b] of Object.entries(baseFiles)) put(dir, f, b);
  sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'base');
  const base = sh(dir, 'rev-parse', 'HEAD').trim();
  for (const [f, b] of Object.entries(headFiles)) put(dir, f, b);
  sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'head');
  return { dir, base, head: sh(dir, 'rev-parse', 'HEAD').trim() };
}
function run(r, { label = false, events = VALID } = {}) {
  const env = { ...process.env, DB_GUARD_APPROVED: label ? 'true' : 'false', DB_GUARD_HEAD_DATE: HEAD_DATE };
  delete env.DB_GUARD_LABEL_EVENTS;
  if (events) { put(r.dir, '.git/label-events.ndjson', events.map((e) => JSON.stringify(e)).join('\n') + '\n'); env.DB_GUARD_LABEL_EVENTS = join(r.dir, '.git/label-events.ndjson'); }
  const p = spawnSync(process.execPath, [GUARD, '--diff', r.base, r.head], { cwd: r.dir, encoding: 'utf8', env });
  rmSync(r.dir, { recursive: true, force: true });
  return { code: p.status, out: p.stdout + p.stderr };
}
const NEW_GUARD = { '.github/workflows/db-guard.yml': 'name: db-guard\n', 'scripts/db-guard/db-guard.mjs': '// guard\n', 'scripts/db/roles.sql': 'SELECT 1;\n' };
// Built from parts so this test file itself does not trip the sql-drop-object rule.
const DROP_SQL = { 'db/cleanup.sql': ['DROP', 'TABLE old_things;', '-- DESTRUCTIVE-OK: CEO-2026-01\n'].join(' ') };

test('cli (1): added guard files + valid label => pass', () => {
  const r = run(repo({}, NEW_GUARD), { label: true });
  assert.equal(r.code, 0, r.out); assert.match(r.out, /3 approved override/);
});
test('cli (2): added guard files without label => fail, each finding approvable', () => {
  const r = run(repo({}, NEW_GUARD));
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/\[guard-changed\].*approvable: new file/g) || []).length, 3, r.out);
});
test('cli (3): modified existing guard file + valid label => fail (hard block)', () => {
  const r = run(repo({ 'scripts/db-guard/db-guard.mjs': '// v1\n' }, { 'scripts/db-guard/db-guard.mjs': '// v2\n' }), { label: true });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /hard block/);
});
test('cli (4a): destructive SQL line with marker + valid label => pass', () => {
  const r = run(repo({}, DROP_SQL), { label: true });
  assert.equal(r.code, 0, r.out); assert.match(r.out, /ALLOWED .*\[sql-drop-object\]/);
});
test('cli (4b): destructive SQL line with marker, no label => fail', () => {
  assert.equal(run(repo({}, DROP_SQL)).code, 1);
});
test('cli (5): label older than head => fail', () => {
  const r = run(repo({}, NEW_GUARD), { label: true, events: [ev('labeled', '2025-12-31T00:00:00Z')] });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /older than the head/);
});
test('cli (6): non-maintainer or bot label => fail', () => {
  assert.equal(run(repo({}, NEW_GUARD), { label: true, events: [ev('labeled', '2026-01-02T00:00:00Z', 'mallory')] }).code, 1);
  assert.equal(run(repo({}, NEW_GUARD), { label: true, events: [ev('labeled', '2026-01-02T00:00:00Z', 'dependabot[bot]', 'Bot')] }).code, 1);
});
test('cli (7): label env set but no events file => fail closed', () => {
  assert.equal(run(repo({}, NEW_GUARD), { label: true, events: null }).code, 1);
});

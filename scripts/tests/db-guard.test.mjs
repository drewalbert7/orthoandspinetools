// db-guard approval rules. Run: node --test scripts/tests/db-guard.test.mjs (no network).
// Unit tests cover the pure helpers; the CLI tests build throwaway git repos and run db-guard.mjs --diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelApproval, guardChangeFindings, decide, parseNameStatusZ } from '../db-guard/db-guard.mjs';

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

test('label: allowlist match is case-insensitive', () => {
  assert.equal(labelApproval({ labelPresent: true, events: [ev('labeled', '2026-01-02T00:00:00Z', 'DrewAlbert7')], headCommitDate: HEAD_DATE }).approved, true);
});

// ---- unit: guardChangeFindings + decide ----
test('guard files: every non-A status (T, U, X, C) is a hard block', () => {
  const f = guardChangeFindings([['T', 'scripts/db/roles.sql'], ['U', 'scripts/db-guard/db-guard.mjs'], ['X', 'scripts/db-guard/db-guard.sh'], ['C100', 'scripts/db/verify.sql', 'scripts/db/verify3.sql']]);
  assert.equal(f.length, 4); assert.equal(decide(f, true).blocking, 4);
});
test('.gitattributes anywhere, any status: finding approvable only with the label', () => {
  const f = guardChangeFindings([['A', '.gitattributes'], ['M', 'backend/.gitattributes']]);
  assert.deepEqual(f.map((x) => x.rule), ['gitattributes-changed', 'gitattributes-changed']);
  assert.equal(decide(f, false).blocking, 2); assert.equal(decide(f, true).blocking, 0);
});
test('parseNameStatusZ keeps non-ASCII paths verbatim and pairs renames', () => {
  assert.deepEqual(parseNameStatusZ('A\0scripts/db-guard/\u00e9.sh\0R100\0a.sql\0b.sql\0'), [['A', 'scripts/db-guard/\u00e9.sh'], ['R100', 'a.sql', 'b.sql']]);
});
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
  assert.deepEqual(d.results.map((r) => [r.token[0], r.ok]), [['A', true], ['M', false], ['D', false], ['R', false]]);
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
function put(dir, file, body) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  if (body && typeof body === 'object') { rmSync(join(dir, file), { force: true }); symlinkSync(body.symlink, join(dir, file)); }
  else writeFileSync(join(dir, file), body);
}
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
test('cli (8): .gitattributes `*.sql -diff` cannot hide a DROP-TABLE .sql file', () => {
  const r = run(repo({}, { '.gitattributes': '*.sql -diff\n*.sh -diff\n', ...DROP_SQL, 'scripts/wipe.sh': ['docker', 'volume rm pgdata\n'].join(' ') }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[gitattributes-changed\]/); assert.match(r.out, /db\/cleanup\.sql:1 .*\[sql-drop-object\]/); assert.match(r.out, /\[docker-volume-rm\]/);
});
test('cli (9): type change (symlink replaces a guard file) + valid label => fail', () => {
  for (const f of ['scripts/db/roles.sql', 'scripts/db-guard/db-guard.mjs']) {
    const r = run(repo({ [f]: 'v1\n' }, { [f]: { symlink: '/etc/hostname' } }), { label: true });
    assert.equal(r.code, 1, r.out); assert.match(r.out, /\[guard-changed\].*"T".*hard block/);
  }
});
test('cli (10): non-ASCII paths are matched unquoted (guard dir, migration, plain file)', () => {
  const g = run(repo({}, { 'scripts/db-guard/\u00e9.sh': ['docker', 'volume rm x\n'].join(' ') }));
  assert.equal(g.code, 1, g.out); assert.match(g.out, /scripts\/db-guard\/\u00e9\.sh:0 .*\[guard-changed\]/);
  const mig = 'backend/prisma/migrations/2026_\u00e9/migration.sql';
  const m = run(repo({ [mig]: 'SELECT 1;\n' }, { [mig]: 'SELECT 2;\n' }), { label: true });
  assert.equal(m.code, 1, m.out); assert.match(m.out, /\[migration-history-edited\]/);
  const p = run(repo({}, { 'db/\u00e9.sql': DROP_SQL['db/cleanup.sql'] }));
  assert.equal(p.code, 1, p.out); assert.match(p.out, /db\/\u00e9\.sql:1 .*\[sql-drop-object\]/);
});
test('cli (11): .db-guard-ignore is read from the base, not the PR', () => {
  const r = run(repo({}, { '.db-guard-ignore': 'db/**\n', ...DROP_SQL }));
  assert.equal(r.code, 1, r.out); assert.match(r.out, /\[sql-drop-object\]/); assert.match(r.out, /\[ignore-list-changed\]/);
});

// ---- workflow layer (static) ----
test('workflow: pull_request only, db-guard always runs, clear result checked, read-only db-guard job', () => {
  const y = readFileSync(resolve(dirname(GUARD), '../../.github/workflows/db-guard.yml'), 'utf8');
  assert.doesNotMatch(y.replace(/#.*$/gm, ''), /pull_request_target/);
  const job = y.slice(y.indexOf('\n  db-guard:'));
  assert.match(job, /^\s+if: always\(\)\s*$/m);
  assert.match(job, /CLEAR_RESULT: \$\{\{ needs\.clear-destructive-ok-on-push\.result \}\}/);
  assert.match(job, /expected=success/);
  assert.doesNotMatch(job, /write/);
  assert.match(y, /DB_GUARD_APPROVED: \$\{\{ github\.event\.action != 'synchronize' &&/);
});

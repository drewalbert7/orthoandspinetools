// db-guard approval rules. Run: node --test scripts/tests/db-guard.test.mjs (no network).
// Unit tests cover the pure helpers; the CLI tests build throwaway git repos and run db-guard.mjs --diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, chmodSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelApproval, guardChangeFindings, decide, parseRawZ, emptyDiffFinding } from '../db-guard/db-guard.mjs';

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
test('parseRawZ keeps non-ASCII paths verbatim, pairs renames and returns blob ids', () => {
  const z = '0'.repeat(40), x = 'a'.repeat(40);
  const r = parseRawZ(`:000000 100644 ${z} ${x} A\0scripts/db-guard/\u00e9.sh\0:100644 100644 ${x} ${x} R100\0a.sql\0b.sql\0`);
  assert.deepEqual(r.map((e) => e.entry), [['A', 'scripts/db-guard/\u00e9.sh'], ['R100', 'a.sql', 'b.sql']]);
  assert.equal(r[1].oldSha, x); assert.equal(r[0].newSha, x);
});
test('.db-guard-ignore: true A adds no hard block; M/D/R/T or A-existing is a hard block', () => {
  assert.deepEqual(guardChangeFindings([['A', '.db-guard-ignore']]), []);
  for (const e of [['M', '.db-guard-ignore'], ['D', '.db-guard-ignore'], ['T', '.db-guard-ignore'], ['R100', 'x', '.db-guard-ignore']]) {
    const f = guardChangeFindings([e]);
    assert.equal(f[0].rule, 'ignore-list-changed'); assert.equal(decide(f, true).blocking, 1);
  }
  assert.equal(decide(guardChangeFindings([['A', '.db-guard-ignore']], () => true), true).blocking, 1);
});
test('emptyDiffFinding: explainable no-add changes pass, anything else is a hard block', () => {
  const E = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391', x = 'a'.repeat(40), y = 'b'.repeat(40), z = '0'.repeat(40);
  const base = { file: 'f', added: 0, removed: 0 };
  assert.equal(emptyDiffFinding({ ...base, status: 'A', oldSha: z, newSha: E }), null);        // empty new file
  assert.equal(emptyDiffFinding({ ...base, status: 'R100', oldSha: x, newSha: x }), null);     // pure rename
  assert.equal(emptyDiffFinding({ ...base, status: 'M', oldSha: x, newSha: x }), null);        // mode only
  assert.equal(emptyDiffFinding({ ...base, status: 'M', oldSha: x, newSha: y, removed: 3 }), null); // removals only
  assert.equal(emptyDiffFinding({ ...base, status: 'D', oldSha: x, newSha: z }), null);
  assert.equal(emptyDiffFinding({ ...base, status: 'A', oldSha: z, newSha: x }).rule, 'empty-diff');
  assert.equal(emptyDiffFinding({ ...base, status: 'M', oldSha: x, newSha: y }).markerable, false);
  assert.equal(emptyDiffFinding({ ...base, status: 'A', oldSha: z, newSha: x, added: 1 }), null);
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
function repo(baseFiles, headFiles, headFn) {
  const dir = mkdtempSync(join(tmpdir(), 'db-guard-test-'));
  sh(dir, 'init', '-q', '-b', 'main');
  put(dir, 'README.md', 'x\n');
  for (const [f, b] of Object.entries(baseFiles)) put(dir, f, b);
  sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'base');
  const base = sh(dir, 'rev-parse', 'HEAD').trim();
  for (const [f, b] of Object.entries(headFiles)) put(dir, f, b);
  if (headFn) headFn(dir);
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
test('cli (12): pathspec-magic file names cannot hide a DROP-TABLE file', () => {
  for (const name of [':(exclude)*', ':(attr:nope)x.sql', ':(icase)z.sql']) {
    const r = run(repo({}, { [name]: DROP_SQL['db/cleanup.sql'] }));
    assert.equal(r.code, 1, `${name}: ${r.out}`); assert.match(r.out, /\[sql-drop-object\]/, name);
  }
});
test('cli (13): no false empty-diff on empty new file, pure rename, mode-only and removal-only changes', () => {
  const r = run(repo({ 'a.txt': 'one\ntwo\n', 'b.sh': 'echo hi\n', 'c.txt': 'keep\n' }, { 'empty.txt': '', 'a.txt': 'one\n' }, (d) => {
    renameSync(join(d, 'c.txt'), join(d, 'c2.txt')); chmodSync(join(d, 'b.sh'), 0o755);
  }));
  assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /empty-diff/);
});
test('cli (14): branch adds a guard file that the base tip already has (add/add) + valid label => fail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-guard-test-'));
  sh(dir, 'init', '-q', '-b', 'main'); put(dir, 'README.md', 'x\n'); sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'root');
  sh(dir, 'checkout', '-q', '-b', 'pr'); put(dir, 'scripts/db/roles.sql', 'SELECT 9;\n'); sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'pr');
  sh(dir, 'checkout', '-q', 'main'); put(dir, 'scripts/db/roles.sql', 'SELECT 1;\n'); sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'main gains it');
  const r = run({ dir, base: sh(dir, 'rev-parse', 'main').trim(), head: sh(dir, 'rev-parse', 'pr').trim() }, { label: true });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /scripts\/db\/roles\.sql:0 .*\[guard-changed\].*hard block/);
});
test('cli (15): existing .db-guard-ignore changed + valid label => fail; first addition with marker + label => pass', () => {
  const m = run(repo({ '.db-guard-ignore': '# none\n' }, { '.db-guard-ignore': '# none\n# still none\n' }), { label: true });
  assert.equal(m.code, 1, m.out); assert.match(m.out, /\[ignore-list-changed\].*hard block/);
  const add = { '.db-guard-ignore': 'docs/generated/** # DESTRUCTIVE-OK: CEO-2026-02\n' };
  assert.equal(run(repo({}, add), { label: true }).code, 0);
  assert.equal(run(repo({}, add)).code, 1);
});
test('cli (16): existing .gitattributes changed stays label-clearable', () => {
  const g = repo({ '.gitattributes': '*.png binary\n' }, { '.gitattributes': '*.png binary\n*.jpg binary\n' });
  const g2 = repo({ '.gitattributes': '*.png binary\n' }, { '.gitattributes': '*.png binary\n*.jpg binary\n' });
  assert.equal(run(g, { label: true }).code, 0);
  const r = run(g2); assert.equal(r.code, 1, r.out); assert.match(r.out, /\[gitattributes-changed\].*approvable/);
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

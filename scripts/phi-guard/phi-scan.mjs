#!/usr/bin/env node
/**
 * phi-guard: drop-in PHI (patient health information) leak scanner.
 * Ported from the OrthoWest ASC dashboard fix (scripts/phi/scan-repo.mjs + patterns.mjs).
 * Zero dependencies. Node >= 18.
 *
 * It NEVER prints a matched value. Output is "path:line  rule  [masked, N chars]".
 *
 *   node phi-scan.mjs                 # --all: every tracked file (git ls-files), or a dir walk outside git
 *   node phi-scan.mjs --staged        # pre-commit: staged blobs only (reads the index, not the worktree)
 *   node phi-scan.mjs path/a path/b   # explicit files or directories
 *
 * Options:
 *   --root DIR         repo root (default: git toplevel of cwd, else cwd)
 *   --allowlist FILE   allowlist (default: <root>/.phi-allowlist)
 *   --json             machine-readable output (rule, file, line; still no values)
 *   --quiet            print hits and the summary only
 *   --no-allowlist     ignore the allowlist (audit mode)
 *   --max-bytes N      max bytes per file to content-scan (default 8 MiB)
 *
 * Exit: 0 clean, 1 PHI hit(s), 2 usage or runtime error.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Data-file rules: path-based. A match blocks the file regardless of content. */
const DATA_DIR = /(^|\/)(data|dumps?|exports?|backups?|bak|patients?|records|imports?|raw|extracts?|clarity|epic|ehr|emr|hl7|fhir)\//i
const NAME_HINT = /(dump|export|backup|patient|census|roster|\bmrn|claims?|clarity|epic|\behr\b|\bemr\b)/i
const CODE_EXT = /\.(m?[jt]sx?|cjs|css|s[ac]ss|less|html?|astro|vue|svelte|py|rb|php|go|rs|sh|md|mdx|ya?ml|toml|conf|ini)$/i
const SCHEMA_SQL = /(^|\/)(migrations?|prisma|schema|ddl)\/|(^|\/)[^/]*(schema|migrat|maintenance|ddl|init|indexes|functions|policies|rls)[^/]*\.sql$/i
/** Config / manifest files that live in data dirs but are never data exports. */
const NOT_DATA_NAMES =
  /^(package(-lock)?\.json|tsconfig[^/]*\.json|jsconfig\.json|composer\.json|deno\.jsonc?|(site\.)?manifest\.json|[^/]*\.webmanifest|\.[^/]*rc\.json|[^/]*\.config\.json|[^/]*\.schema\.json|vercel\.json|netlify\.json|components\.json|renovate\.json|robots\.txt|humans\.txt|security\.txt|ads\.txt|llms(-full)?\.txt|requirements[^/]*\.txt|constraints\.txt|(LICENSE|LICENCE|COPYING|NOTICE|README|CHANGELOG|AUTHORS)[^/]*)$/i
export const DATA_FILE_RULES = [
  { id: 'data-file:spreadsheet', why: 'spreadsheet / tabular export', test: (p) => /\.(csv|tsv|xlsx|xlsm|xlsb|xls|ods|numbers)$/i.test(p) },
  {
    id: 'data-file:database',
    why: 'database / dump / backup file',
    test: (p) => {
      if (/\.(sqlite3?|sqlite-(wal|shm)|db|db-(wal|shm)|mdb|accdb|dump|dmp|bson)$/i.test(p)) return true
      // .bak: data backups, but not editor backups of source files (foo.tsx.bak)
      if (/\.bak$/i.test(p)) return !CODE_EXT.test(p.slice(0, -4))
      // .sql: dumps / seeds / exports, but not schema migrations
      if (/\.sql$/i.test(p)) return !SCHEMA_SQL.test(p) || DATA_DIR.test(p) || NAME_HINT.test(path.posix.basename(p))
      return false
    },
  },
  { id: 'data-file:hl7-fhir', why: 'HL7 / FHIR / CDA / DICOM file', test: (p) => /\.(hl7|hl7v2|ccd|ccda|cda|fhir|fhir\.json|dcm)$/i.test(p) },
  {
    id: 'data-file:export',
    why: 'JSON/NDJSON/XML/TXT/PDF/Office doc in a data directory or with an export-style name',
    test: (p) => {
      if (!/\.(json|ndjson|jsonl|xml|txt|pdf|docx?|rtf)$/i.test(p)) return false
      if (NOT_DATA_NAMES.test(path.posix.basename(p))) return false
      return DATA_DIR.test(p) || NAME_HINT.test(path.posix.basename(p))
    },
  },
]

/** Words that make a nearby phone / email / account number / date patient-related. */
const PATIENT_CTX =
  /(\bpatient[ _-]?(name|id|no|number|email|e-mail|phone|cell|mobile|dob|address|first|last)\b|\bpatient(Name|Id|Email|Phone|Dob|Address)\b|\bpatient\s*[:#=]|\bpt\.?[ _]?(name|id)\b|\bpt\s*[:#]|\bmrn\b|medical record|\bd\.?o\.?b\b|date of birth|\bbirth[ _-]?date\b|\bguarantor\b|\binsured\b|\bsubscriber\b|\bmember[ _-]?id\b|\bpolicy[ _-]?(no|number|holder|#)|\bssn\b|social security|\bacct\b|account (no|number|#))/i

const DATE = String.raw`(?:(?:19|20)\d{2}[-/.][01]?\d[-/.][0-3]?\d|[01]?\d[-/.][0-3]?\d[-/.](?:19|20)?\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+[0-3]?\d,?\s+(?:19|20)\d{2})`

/**
 * Content rules. scope:
 *   'any'     – fires anywhere in a text file
 *   'context' – fires only with a PATIENT_CTX keyword on the same line or within 1 line
 */
export const CONTENT_RULES = [
  { id: 'ssn', scope: 'any', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { id: 'ssn', scope: 'any', re: /\b(?:ssn|social security(?: number| no\.?)?)\b["']?\s*[:#=]\s*["']?\d{9}\b/gi },
  {
    id: 'mrn',
    scope: 'any',
    re: /\b(?:mrn|med(?:ical)?[ _-]?rec(?:ord)?[ _-]?(?:no|num(?:ber)?|#)?|medical record number|chart[ _-]?(?:no|num(?:ber)?|#))\b["']?\s*[:#=]?\s*["']?[A-Z]{0,3}-?\d{5,12}\b/gi,
  },
  {
    id: 'dob',
    scope: 'any',
    re: new RegExp(String.raw`(?:\bd\.?o\.?b\.?|date of birth|\bbirth[ _-]?date|\bbirthdate|\bdateOfBirth)\b["']?\s*[:#=]?\s*["']?` + DATE, 'gi'),
  },
  // Epic/Clarity facility account id format seen in the ASC data: A-{Account ID}
  { id: 'account-number', scope: 'context', re: /\bA-\d{5,}\b/g },
  {
    id: 'account-number',
    scope: 'any',
    re: /\b(?:(?:guarantor[ _-]?)?(?:acct|account)(?:[ _-]?(?:(?:no\.?|num(?:ber)?|id)\b|#))?|(?:guarantor|har|csn|fin|encounter|visit|member|policy|claim)[ _-]?(?:(?:no\.?|num(?:ber)?|id)\b|#))["']?\s*[:#=]\s*["']?[A-Z]{0,3}-?\d{6,}\b/gi,
  },
  { id: 'phone', scope: 'context', re: /(?:\(\d{3}\)\s?|\b\d{3}[-.\s])\d{3}[-.]\d{4}\b/g },
  { id: 'email', scope: 'context', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { id: 'hl7-message', scope: 'any', re: /^(?:MSH\|\^~\\&|PID\|\d*\|)/gm },
  {
    id: 'fhir-resource',
    scope: 'any',
    re: /"resourceType"\s*:\s*"(?:Patient|Encounter|Observation|Condition|Claim|ExplanationOfBenefit|MedicationRequest|DiagnosticReport|Coverage|Procedure|AllergyIntolerance)"/g,
  },
]

/** Record-style keys with a real-looking value (JSON / YAML / JS object literals). */
const PHI_KEY =
  /["']?\b(patient_?name|patientName|patient_?id|patientId|mrn|dob|date_?of_?birth|dateOfBirth|birth_?date|birthDate|ssn|social_?security(?:_?number)?|member_?id|memberId|guarantor(?:_?name)?|account_?id|accountId|caseId|serviceDate|insured_?name|subscriber_?id)\b["']?\s*[:=]\s*(["']?)([^"',}\]\s][^"',}\]]*)\2/gi
const TYPE_TOKENS = /^(string|number|boolean|null|undefined|true|false|text|varchar.*|int.*|date|datetime|timestamp|any|unknown|object|z\..*|optional.*|required|\$\{.*|\{\{.*|\[.*|<.*|\?.*|req\..*|row\..*|r\..*|p\..*|data\..*|body\..*|this\..*|e\..*|x\..*|item\..*|patient\..*|args?\..*|input\..*|params\..*|values?\..*|form.*|new .*|String.*|Number.*|Date.*|\w+\(.*|-?1|0)$/i
/** CSV/TSV header lines naming two or more patient identifier columns. */
const HEADER_COLS =
  /(^|[,\t;"])\s*"?(patient ?name|patient ?id|first ?name|last ?name|mrn|dob|date of birth|birth ?date|ssn|account ?(?:id|number|no)|guarantor|member ?id|service ?date|address|phone)"?\s*(?=[,\t;|"]|$)/gi

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

/** glob -> RegExp. Supports **, *, ?; a trailing "/" means "everything below". */
export function globToRegExp(glob) {
  let g = glob.trim()
  if (g.startsWith('./')) g = g.slice(2)
  if (g.startsWith('/')) g = g.slice(1)
  if (g.endsWith('/')) g += '**'
  let re = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++
        if (g[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  // A glob with no slash matches the basename anywhere (like .gitignore).
  return new RegExp((g.includes('/') ? '^' : '(^|/)') + re + '$')
}

/**
 * .phi-allowlist format, one entry per line:
 *   <glob>                         # reason   -> allow every rule for matching paths
 *   <glob>  <rule>[,<rule>...]     # reason   -> allow only those rules ("data-file:*" ok)
 */
export function parseAllowlist(text, source = '.phi-allowlist') {
  const entries = []
  const warnings = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const hashAt = raw.search(/(^|\s)#/)
    const body = (hashAt >= 0 ? raw.slice(0, hashAt) : raw).trim()
    const reason = hashAt >= 0 ? raw.slice(hashAt).replace(/^\s*#\s*/, '').trim() : ''
    if (!body) return
    const [glob, rules] = body.split(/\s+/, 2)
    if (!reason) warnings.push(`${source}:${i + 1}: entry "${glob}" has no "# reason" comment`)
    entries.push({
      glob,
      re: globToRegExp(glob),
      rules: rules ? rules.split(',').map((r) => r.trim()).filter(Boolean) : null,
      line: i + 1,
      reason,
      used: 0,
    })
  })
  return { entries, warnings }
}

function ruleMatches(pattern, rule) {
  if (pattern === '*' || pattern === rule) return true
  if (pattern.endsWith('*')) return rule.startsWith(pattern.slice(0, -1))
  return false
}

export function isAllowed(allow, file, rule) {
  for (const e of allow.entries) {
    if (e.re.test(file) && (!e.rules || e.rules.some((r) => ruleMatches(r, rule)))) {
      e.used++
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

const SKIP_CONTENT = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock|uv\.lock|go\.sum)$|\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|eot|mp3|mp4|mov|webm|wav|zip|gz|tgz|br|wasm|map)$/i
const SKIP_PATH = /(^|\/)(node_modules|\.git|\.venv|venv|__pycache__|\.next|\.astro|\.svelte-kit|\.turbo|\.cache)\//

function isBinary(buf) {
  const n = Math.min(buf.length, 8000)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

/** Returns [{rule, line, len}] for one text blob. Values are never returned. */
const STRUCTURED = /\.(json|jsonl|ndjson|ya?ml|toml|xml|csv|tsv|psv|txt|dat|hl7|fhir)$/i
const TABULAR = /\.(csv|tsv|psv|txt|dat)$/i

export function scanText(text, file = '', dataLike = false) {
  const structured = dataLike || STRUCTURED.test(file)
  const tabular = dataLike || TABULAR.test(file)
  const hits = []
  const lines = text.split(/\r?\n/)
  const ctx = lines.map((l) => PATIENT_CTX.test(l))
  const near = (i) => ctx[i] || (i > 0 && ctx[i - 1]) || (i + 1 < lines.length && ctx[i + 1])
  // line-start offsets for offset -> line mapping (multi-line regexes)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const seen = new Set()
    for (const r of CONTENT_RULES) {
      if (r.scope === 'context' && !near(i)) continue
      r.re.lastIndex = 0
      let m
      while ((m = r.re.exec(line))) {
        const key = `${r.id}@${m.index}`
        if (!seen.has(key)) {
          seen.add(key)
          hits.push({ rule: r.id, line: i + 1, len: m[0].length })
        }
        if (m[0].length === 0) r.re.lastIndex++
      }
    }
    PHI_KEY.lastIndex = 0
    let m
    while (structured && (m = PHI_KEY.exec(line))) {
      const val = m[3].trim()
      if (val.length < 2 || TYPE_TOKENS.test(val) || val.length > 200) continue
      hits.push({ rule: 'phi-field', line: i + 1, len: val.length })
    }
    if (!tabular) continue
    HEADER_COLS.lastIndex = 0
    const cols = new Set()
    while ((m = HEADER_COLS.exec(line))) cols.add(m[2].toLowerCase().replace(/\s+/g, ''))
    const idCols = [...cols].filter((c) => !/^(address|phone|firstname|lastname|servicedate)$/.test(c))
    if (cols.size >= 3 && idCols.length >= 1) hits.push({ rule: 'phi-header', line: i + 1, len: line.length })
  }
  return hits
}

function sh(root, args, opts = {}) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'], ...opts })
}

function gitRoot(cwd) {
  try {
    return sh(cwd, ['rev-parse', '--show-toplevel']).toString().trim()
  } catch {
    return null
  }
}

function walk(dir, root, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (ent.isDirectory()) {
      if (SKIP_PATH.test(rel + '/')) continue
      walk(abs, root, out)
    } else if (ent.isFile()) out.push(rel)
  }
}

function parseArgs(argv) {
  const o = { mode: 'all', paths: [], json: false, quiet: false, noAllow: false, maxBytes: 8 << 20 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--staged') o.mode = 'staged'
    else if (a === '--all') o.mode = 'all'
    else if (a === '--json') o.json = true
    else if (a === '--quiet' || a === '-q') o.quiet = true
    else if (a === '--no-allowlist') o.noAllow = true
    else if (a === '--root') o.root = argv[++i]
    else if (a === '--allowlist') o.allowlist = argv[++i]
    else if (a === '--max-bytes') o.maxBytes = Number(argv[++i])
    else if (a === '--version') o.version = true
    else if (a === '-h' || a === '--help') o.help = true
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`)
    else o.paths.push(a)
  }
  if (o.paths.length) o.mode = 'paths'
  return o
}

export function run(argv, log = console.log, err = console.error) {
  let o
  try {
    o = parseArgs(argv)
  } catch (e) {
    err(`phi-guard: ${e.message}`)
    return 2
  }
  if (o.version) {
    log(`phi-guard ${VERSION}`)
    return 0
  }
  if (o.help) {
    log('usage: phi-scan [--staged | --all | <paths...>] [--root DIR] [--allowlist FILE] [--json] [--quiet] [--no-allowlist]')
    return 0
  }
  const cwd = process.cwd()
  const root = path.resolve(o.root || gitRoot(cwd) || cwd)
  const inGit = !!gitRoot(root)
  if (o.mode === 'staged' && !inGit) {
    err('phi-guard: --staged needs a git repository')
    return 2
  }

  // allowlist
  const allowFile = o.allowlist ? path.resolve(o.allowlist) : path.join(root, '.phi-allowlist')
  let allow = { entries: [], warnings: [] }
  if (!o.noAllow && fs.existsSync(allowFile)) allow = parseAllowlist(fs.readFileSync(allowFile, 'utf8'), path.relative(root, allowFile) || allowFile)

  // file list
  let files = []
  if (o.mode === 'staged') {
    files = sh(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString().split('\0').filter(Boolean)
  } else if (o.mode === 'all') {
    if (inGit) files = sh(root, ['ls-files', '-z', '--cached']).toString().split('\0').filter(Boolean)
    else walk(root, root, files)
  } else {
    for (const p of o.paths) {
      const abs = path.resolve(cwd, p)
      if (!fs.existsSync(abs)) {
        err(`phi-guard: no such path ${p}`)
        return 2
      }
      if (fs.statSync(abs).isDirectory()) walk(abs, root, files)
      else files.push(path.relative(root, abs).split(path.sep).join('/'))
    }
  }
  files = [...new Set(files)].filter((f) => !SKIP_PATH.test(f)).sort()

  const read = (f) =>
    o.mode === 'staged' ? sh(root, ['show', `:${f}`]) : fs.readFileSync(path.join(root, f))

  const results = [] // {file, line|null, rule, len?}
  let suppressed = 0
  let skipped = 0
  const add = (h) => {
    if (isAllowed(allow, h.file, h.rule)) suppressed++
    else results.push(h)
  }

  for (const f of files) {
    let dataLike = false
    for (const r of DATA_FILE_RULES)
      if (r.test(f)) {
        dataLike = true
        add({ file: f, line: null, rule: r.id, why: r.why })
      }
    if (SKIP_CONTENT.test(f)) continue
    let buf
    try {
      const abs = path.join(root, f)
      if (o.mode !== 'staged' && fs.lstatSync(abs).isSymbolicLink()) continue
      buf = read(f)
    } catch {
      continue // deleted in worktree, submodule, unreadable
    }
    if (isBinary(buf)) continue
    if (buf.length > o.maxBytes) {
      skipped++
      if (!o.quiet && !o.json) log(`WARN  ${f}  too large to content-scan (${buf.length} bytes > --max-bytes)`)
      continue
    }
    for (const h of scanText(buf.toString('utf8'), f, dataLike)) add({ file: f, line: h.line, rule: h.rule, len: h.len })
  }

  const hitFiles = new Set(results.map((r) => r.file))
  if (o.json) {
    log(
      JSON.stringify(
        {
          version: VERSION,
          mode: o.mode,
          filesChecked: files.length,
          hits: results.map(({ file, line, rule }) => ({ file, line, rule })),
          hitCount: results.length,
          hitFiles: hitFiles.size,
          suppressed,
          skippedLarge: skipped,
          allowlistWarnings: allow.warnings,
        },
        null,
        2,
      ),
    )
  } else {
    for (const w of allow.warnings) err(`WARN  ${w}`)
    for (const r of results) {
      if (r.line == null) log(`PHI   ${r.file}  ${r.rule}  (${r.why})`)
      else log(`PHI   ${r.file}:${r.line}  ${r.rule}  [value masked, ${r.len} chars]`)
    }
    if (!o.quiet)
      for (const e of allow.entries) if (!e.used && o.mode === 'all') log(`NOTE  .phi-allowlist:${e.line} "${e.glob}" matched nothing (stale entry?)`)
    log(
      `phi-guard (${o.mode}): ${files.length} file(s) checked, ${results.length} hit(s) in ${hitFiles.size} file(s), ${suppressed} allowlisted`,
    )
    if (results.length) {
      err('phi-guard: BLOCKED. Possible patient health information above (values are masked).')
      err('  - Do NOT just delete the file or rewrite history yourself.')
      err('  - If it is real or you are unsure: stop and report the paths to the Security Officer.')
      err('  - If it is a reviewed false positive (synthetic fixture, sample data): add a scoped .phi-allowlist entry with a reason.')
    }
  }
  return results.length ? 1 : 0
}

const isMain = (() => {
  try {
    return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(new URL(import.meta.url).pathname)
  } catch {
    return false
  }
})()
if (isMain) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (e) {
    console.error(`phi-guard: error: ${e.message}`)
    process.exitCode = 2
  }
}

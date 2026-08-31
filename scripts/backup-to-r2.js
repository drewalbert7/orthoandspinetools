#!/usr/bin/env node
/**
 * Upload a local DB dump to Cloudflare R2 (off-site).
 * Usage: backup-to-r2.js <local-file> [object-key]
 * Credentials from repo .env (R2_*). Prefix defaults to backups/
 */
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require(
  path.join(__dirname, '..', 'backend', 'node_modules', '@aws-sdk/client-s3')
);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

const ROOT = path.join(__dirname, '..');
loadEnvFile(path.join(ROOT, '.env'));

const endpoint = (process.env.R2_ENDPOINT || '').trim();
const bucket = (process.env.R2_BUCKET || '').trim();
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
const prefix = (process.env.R2_BACKUP_PREFIX || 'backups/').replace(/^\/+/, '').replace(/\/?$/, '/');
const retentionDays = Number(process.env.R2_BACKUP_RETENTION_DAYS || 30);

function fail(msg) {
  console.error(`[r2-backup] ${msg}`);
  process.exit(1);
}

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  fail('Missing R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY');
}

const localFile = process.argv[2];
if (!localFile || !fs.existsSync(localFile)) {
  fail(`File not found: ${localFile || '(none)'}`);
}

const baseName = path.basename(localFile);
const objectKey = (process.argv[3] || `${prefix}${baseName}`).replace(/^\/+/, '');

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

async function upload() {
  const body = fs.readFileSync(localFile);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
      ContentType: 'application/gzip',
      Metadata: {
        source: 'orthoandspinetools',
        host: require('os').hostname(),
        created: new Date().toISOString(),
      },
    })
  );
  console.log(`[r2-backup] uploaded s3://${bucket}/${objectKey} (${body.length} bytes)`);
}

async function prune() {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let token;
  let deleted = 0;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const obj of page.Contents || []) {
      if (!obj.Key || !obj.LastModified) continue;
      if (!/backup_.*\.sql\.gz$/i.test(obj.Key)) continue;
      if (obj.LastModified.getTime() >= cutoff) continue;
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
      deleted += 1;
      console.log(`[r2-backup] pruned ${obj.Key}`);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  if (deleted > 0) {
    console.log(`[r2-backup] pruned ${deleted} object(s) older than ${retentionDays}d`);
  }
}

(async () => {
  await upload();
  await prune();
})().catch((err) => {
  fail(err && err.message ? err.message : String(err));
});

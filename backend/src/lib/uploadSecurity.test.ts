import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { decideMediaDelete, isAllowedUploadType, isPathInside, ownerIdsFromUploadLogs, resolveSafeUploadPath } from './uploadSecurity';

const base = path.resolve('/srv/app/uploads/images');

test('resolveSafeUploadPath accepts a plain filename inside the upload dir', () => {
  assert.equal(resolveSafeUploadPath(base, 'abc-123.png'), path.join(base, 'abc-123.png'));
});

test('resolveSafeUploadPath rejects traversal, separators, dot names, empty and NUL', () => {
  for (const bad of [
    '',
    '.',
    '..',
    '../secret',
    '../../etc/passwd',
    '..\\..\\windows',
    'sub/file.png',
    '/etc/passwd',
    'file.png\0.jpg',
    '\0',
  ]) {
    assert.equal(resolveSafeUploadPath(base, bad), null, `expected rejection for ${JSON.stringify(bad)}`);
  }
  assert.equal(resolveSafeUploadPath(base, undefined), null);
  assert.equal(resolveSafeUploadPath(base, ['a.png']), null);
});

test('isPathInside requires a strict child of the base dir', () => {
  assert.equal(isPathInside('/srv/app/uploads', '/srv/app/uploads/images/a.png'), true);
  assert.equal(isPathInside('/srv/app/uploads', '/srv/app/uploads'), false);
  assert.equal(isPathInside('/srv/app/uploads', '/srv/app/uploads-evil/a.png'), false);
  assert.equal(isPathInside('/srv/app/uploads', '/srv/app/uploads/../.env'), false);
});

test('isAllowedUploadType only allows known upload subdirectories', () => {
  assert.equal(isAllowedUploadType('images'), true);
  assert.equal(isAllowedUploadType('xrays'), true);
  assert.equal(isAllowedUploadType('../..'), false);
  assert.equal(isAllowedUploadType(['images']), false);
  assert.equal(isAllowedUploadType(undefined), false);
});

test('decideMediaDelete: owner allowed, admin allowed, others forbidden, unknown not found', () => {
  assert.equal(decideMediaDelete({ id: 'u1' }, ['u1']), 'allow');
  assert.equal(decideMediaDelete({ id: 'admin', isAdmin: true }, ['u1']), 'allow');
  assert.equal(decideMediaDelete({ id: 'u2' }, ['u1']), 'forbidden');
  assert.equal(decideMediaDelete({ id: 'u2', isAdmin: false }, ['u1', null]), 'forbidden');
  assert.equal(decideMediaDelete({ id: 'u1' }, []), 'not_found');
  assert.equal(decideMediaDelete({ id: 'u1' }, [null, undefined, '']), 'not_found');
});

test('decideMediaDelete: admins may delete files with no owner record', () => {
  assert.equal(decideMediaDelete({ id: 'admin', isAdmin: true }, []), 'allow');
  assert.equal(decideMediaDelete({ id: 'admin', isAdmin: true }, [null]), 'allow');
});

test('ownerIdsFromUploadLogs matches exact filenames and legacy comma lists only', () => {
  const logs = [
    { userId: 'u1', resourceId: 'images-1700000000000-111.png' },
    { userId: 'u2', resourceId: 'toolImages-1-2.png,images-1700000000000-222.png' },
    { userId: 'u3', resourceId: 'images-1700000000000-111.png.bak' },
    { userId: 'u4', resourceId: 'ximages-1700000000000-111.png' },
    { userId: null, resourceId: 'images-1700000000000-111.png' },
    { userId: 'u5', resourceId: null },
  ];
  assert.deepEqual(ownerIdsFromUploadLogs('images-1700000000000-111.png', logs), ['u1']);
  assert.deepEqual(ownerIdsFromUploadLogs('images-1700000000000-222.png', logs), ['u2']);
  assert.deepEqual(ownerIdsFromUploadLogs('images-9-9.png', logs), []);
});

test('ownership end to end: uploader deletes, other user 403, unknown 404, admin allowed', () => {
  const logs = [{ userId: 'owner', resourceId: 'images-1-1.png' }];
  const decide = (id: string, isAdmin: boolean, f: string) =>
    decideMediaDelete({ id, isAdmin }, ownerIdsFromUploadLogs(f, logs));
  assert.equal(decide('owner', false, 'images-1-1.png'), 'allow');
  assert.equal(decide('intruder', false, 'images-1-1.png'), 'forbidden');
  assert.equal(decide('intruder', false, 'images-2-2.png'), 'not_found');
  assert.equal(decide('owner', false, 'images-2-2.png'), 'not_found');
  assert.equal(decide('admin', true, 'images-2-2.png'), 'allow');
});

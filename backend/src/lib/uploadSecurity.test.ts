import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { decideMediaDelete, isAllowedUploadType, isPathInside, resolveSafeUploadPath } from './uploadSecurity';

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
  assert.equal(decideMediaDelete({ id: 'admin', isAdmin: true }, [null, undefined]), 'not_found');
});

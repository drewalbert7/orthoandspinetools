import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getJwtSecret, MIN_JWT_SECRET_LENGTH } from './jwtSecret';

describe('getJwtSecret', () => {
  const prev = process.env.JWT_SECRET;

  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prev;
  });

  it('throws when JWT_SECRET is missing', () => {
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);
  });

  it('throws when JWT_SECRET is shorter than 32 characters', () => {
    process.env.JWT_SECRET = 'x'.repeat(MIN_JWT_SECRET_LENGTH - 1);
    assert.throws(() => getJwtSecret(), /at least 32 characters/);
  });

  it('throws on whitespace-only secret', () => {
    process.env.JWT_SECRET = '   ';
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);
  });

  it('returns the secret when length is at least 32', () => {
    const secret = 'a'.repeat(MIN_JWT_SECRET_LENGTH);
    process.env.JWT_SECRET = secret;
    assert.equal(getJwtSecret(), secret);
  });

  it('trims surrounding whitespace before checking length', () => {
    const secret = 'b'.repeat(MIN_JWT_SECRET_LENGTH);
    process.env.JWT_SECRET = `  ${secret}  `;
    assert.equal(getJwtSecret(), secret);
  });
});

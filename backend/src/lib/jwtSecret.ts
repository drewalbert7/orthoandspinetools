const MIN_JWT_SECRET_LENGTH = 32;

/** Return JWT_SECRET or throw. No placeholder fallbacks. */
export function getJwtSecret(): string {
  const secret = (process.env.JWT_SECRET ?? '').trim();
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set and at least ${MIN_JWT_SECRET_LENGTH} characters (got ${secret.length})`
    );
  }
  return secret;
}

/** Call once at process startup; exits the process if JWT_SECRET is missing or too short. */
export function validateJwtSecretAtStartup(): void {
  try {
    getJwtSecret();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`FATAL: ${message}`);
    process.exit(1);
  }
}

export { MIN_JWT_SECRET_LENGTH };

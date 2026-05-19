import "server-only";

/**
 * Single source of truth for reading required env variables on the server.
 *
 * Throws a uniform "Missing env variable: NAME" error so logs and HTTP
 * error responses always name the exact variable that's missing.
 * Without this, missing env shows up as a generic HTTP 500 with no clue
 * which key is absent.
 */
export class MissingEnvError extends Error {
  readonly name = "MissingEnvError";
  readonly variable: string;
  constructor(variable: string) {
    super(`Missing env variable: ${variable}`);
    this.variable = variable;
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new MissingEnvError(name);
  }
  return v;
}

export function isMissingEnvError(err: unknown): err is MissingEnvError {
  return err instanceof MissingEnvError;
}

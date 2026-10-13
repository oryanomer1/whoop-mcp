import { homedir } from "node:os";
import { join } from "node:path";

export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";
export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

/**
 * Read-only scopes only. `offline` is not a write scope: WHOOP requires it to
 * issue a refresh token, so the server keeps working after the 1h access token expires.
 */
export const WHOOP_SCOPES = [
  "offline",
  "read:profile",
  "read:body_measurement",
  "read:cycles",
  "read:recovery",
  "read:sleep",
  "read:workout",
] as const;

export const DEFAULT_REDIRECT_URI = "http://localhost:8787/callback";

/** WHOOP's maximum page size for collection endpoints. */
export const WHOOP_MAX_PAGE_SIZE = 25;

export function tokenPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WHOOP_TOKEN_PATH) return env.WHOOP_TOKEN_PATH;
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "whoop-mcp", "tokens.json");
}

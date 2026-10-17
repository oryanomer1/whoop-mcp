import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

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

/** Per-request timeout for WHOOP API and token calls. */
export const REQUEST_TIMEOUT_MS = 30_000;

export function tokenPath(env: NodeJS.ProcessEnv = process.env): string {
  const custom = env.WHOOP_TOKEN_PATH;
  if (custom) {
    const expanded = custom.startsWith("~/") ? join(homedir(), custom.slice(2)) : custom;
    // A relative path would resolve differently for the CLI and for each MCP client's working directory.
    if (!isAbsolute(expanded)) throw new Error(`WHOOP_TOKEN_PATH must be an absolute path (got "${custom}").`);
    return expanded;
  }
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "whoop-mcp", "tokens.json");
}

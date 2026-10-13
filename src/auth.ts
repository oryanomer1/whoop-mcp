import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { WHOOP_TOKEN_URL } from "./config.js";

export interface StoredCredentials {
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  /** Epoch milliseconds. */
  expires_at: number;
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export class NotAuthenticatedError extends Error {
  constructor(message = "Not connected to WHOOP. Run `whoop-mcp auth` to connect your account.") {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

export class TokenRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`WHOOP token request failed (${status}): ${body.slice(0, 300)}`);
    this.name = "TokenRequestError";
  }
}

/** Persists credentials as a 0600 JSON file. */
export class TokenStore {
  constructor(readonly path: string) {}

  async load(): Promise<StoredCredentials | null> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    return JSON.parse(text) as StoredCredentials;
  }

  async save(creds: StoredCredentials): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    // Write-then-rename so a crash can't leave a truncated file and lose the rotating refresh token.
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
    await rename(tmp, this.path);
    await chmod(this.path, 0o600);
  }

  async clear(): Promise<boolean> {
    try {
      await rm(this.path);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }
}

export async function requestToken(
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  const res = await fetchImpl(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new TokenRequestError(res.status, text);
  return JSON.parse(text) as TokenResponse;
}

export function toStoredCredentials(
  token: TokenResponse,
  client: { clientId: string; clientSecret: string },
  now: number,
  previousRefreshToken?: string,
): StoredCredentials {
  const refreshToken = token.refresh_token ?? previousRefreshToken;
  if (!refreshToken) {
    throw new Error("WHOOP did not return a refresh token. Make sure the `offline` scope is enabled for your app.");
  }
  return {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    access_token: token.access_token,
    refresh_token: refreshToken,
    expires_at: now + token.expires_in * 1000,
    scope: token.scope,
  };
}

export interface TokenManagerOptions {
  /** Overrides the client ID saved by `whoop-mcp auth`. */
  clientId?: string;
  /** Overrides the client secret saved by `whoop-mcp auth`. */
  clientSecret?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/** Refresh this long before the access token actually expires. */
const EXPIRY_SKEW_MS = 60_000;

export class TokenManager {
  private creds: StoredCredentials | null = null;
  private refreshing: Promise<StoredCredentials> | null = null;
  private readonly now: () => number;

  constructor(
    private readonly store: TokenStore,
    private readonly opts: TokenManagerOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
  }

  async getAccessToken(): Promise<string> {
    const creds = await this.current();
    if (this.isFresh(creds)) return creds.access_token;
    return (await this.refresh()).access_token;
  }

  /**
   * Called after a 401. Refreshes only if `staleToken` is still current, so a
   * burst of concurrent 401s results in a single refresh.
   */
  async forceRefresh(staleToken: string): Promise<string> {
    const creds = await this.current();
    if (creds.access_token !== staleToken) return creds.access_token;
    return (await this.refresh()).access_token;
  }

  private async current(): Promise<StoredCredentials> {
    if (!this.creds) {
      this.creds = await this.store.load();
      if (!this.creds) throw new NotAuthenticatedError();
    }
    return this.creds;
  }

  private isFresh(creds: StoredCredentials): boolean {
    return creds.expires_at - EXPIRY_SKEW_MS > this.now();
  }

  private refresh(): Promise<StoredCredentials> {
    // WHOOP rotates refresh tokens and rejects concurrent refreshes, so keep one in flight.
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<StoredCredentials> {
    // Re-read the file: `whoop-mcp auth` or another server process may have rotated the tokens.
    const onDisk = await this.store.load();
    if (!onDisk) throw new NotAuthenticatedError();
    if (onDisk.access_token !== this.creds?.access_token && this.isFresh(onDisk)) {
      this.creds = onDisk;
      return onDisk;
    }

    const client = {
      clientId: this.opts.clientId ?? onDisk.client_id,
      clientSecret: this.opts.clientSecret ?? onDisk.client_secret,
    };
    let token: TokenResponse;
    try {
      token = await requestToken(
        {
          grant_type: "refresh_token",
          refresh_token: onDisk.refresh_token,
          client_id: client.clientId,
          client_secret: client.clientSecret,
          scope: "offline",
        },
        this.opts.fetch,
      );
    } catch (err) {
      if (err instanceof TokenRequestError && (err.status === 400 || err.status === 401)) {
        throw new NotAuthenticatedError(
          `WHOOP rejected the refresh token (${err.status}). Run \`whoop-mcp auth\` to reconnect your account.`,
        );
      }
      throw err;
    }

    const next = toStoredCredentials(token, client, this.now(), onDisk.refresh_token);
    await this.store.save(next);
    this.creds = next;
    return next;
  }
}

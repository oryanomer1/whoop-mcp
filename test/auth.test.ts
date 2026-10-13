import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { NotAuthenticatedError, TokenManager, TokenStore, type StoredCredentials } from "../src/auth.js";
import { fakeFetch, json } from "./helpers.js";

const NOW = Date.parse("2026-10-13T12:00:00Z");

function creds(overrides: Partial<StoredCredentials> = {}): StoredCredentials {
  return {
    client_id: "client",
    client_secret: "secret",
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_at: NOW + 3_600_000,
    scope: "offline read:recovery",
    ...overrides,
  };
}

const refreshed = (n: number) =>
  json({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 3600, scope: "offline", token_type: "bearer" });

let store: TokenStore;

beforeEach(() => {
  store = new TokenStore(join(mkdtempSync(join(tmpdir(), "whoop-mcp-")), "nested", "tokens.json"));
});

describe("TokenStore", () => {
  it("round-trips credentials in an owner-only file", async () => {
    expect(await store.load()).toBeNull();
    await store.save(creds());

    expect(await store.load()).toEqual(creds());
    expect(statSync(store.path).mode & 0o777).toBe(0o600);
    expect(await store.clear()).toBe(true);
    expect(await store.clear()).toBe(false);
  });
});

describe("TokenManager", () => {
  it("returns the stored token while it is fresh", async () => {
    await store.save(creds());
    const fetch = fakeFetch(() => refreshed(2));
    const manager = new TokenManager(store, { fetch, now: () => NOW });

    expect(await manager.getAccessToken()).toBe("access-1");
    expect(fetch.calls).toHaveLength(0);
  });

  it("refreshes an expired token and persists the rotated refresh token", async () => {
    await store.save(creds({ expires_at: NOW + 30_000 }));
    const fetch = fakeFetch(() => refreshed(2));
    const manager = new TokenManager(store, { fetch, now: () => NOW });

    expect(await manager.getAccessToken()).toBe("access-2");

    const { url, init } = fetch.calls[0];
    expect(url.toString()).toBe("https://api.prod.whoop.com/oauth/oauth2/token");
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "refresh-1",
      client_id: "client",
      client_secret: "secret",
      scope: "offline",
    });
    expect(await store.load()).toMatchObject({
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_at: NOW + 3_600_000,
    });
  });

  it("issues a single refresh for concurrent callers", async () => {
    await store.save(creds({ expires_at: NOW - 1 }));
    const fetch = fakeFetch(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return refreshed(2);
    });
    const manager = new TokenManager(store, { fetch, now: () => NOW });

    const tokens = await Promise.all([manager.getAccessToken(), manager.getAccessToken(), manager.getAccessToken()]);

    expect(tokens).toEqual(["access-2", "access-2", "access-2"]);
    expect(fetch.calls).toHaveLength(1);
  });

  it("forceRefresh only refreshes when the rejected token is still current", async () => {
    await store.save(creds());
    let n = 1;
    const fetch = fakeFetch(() => refreshed(++n));
    const manager = new TokenManager(store, { fetch, now: () => NOW });

    expect(await manager.forceRefresh("access-1")).toBe("access-2");
    expect(await manager.forceRefresh("access-1")).toBe("access-2");
    expect(fetch.calls).toHaveLength(1);
  });

  it("keeps the previous refresh token if WHOOP omits a new one", async () => {
    await store.save(creds({ expires_at: NOW - 1 }));
    const fetch = fakeFetch(() => json({ access_token: "access-2", expires_in: 3600 }));
    const manager = new TokenManager(store, { fetch, now: () => NOW });

    await manager.getAccessToken();

    expect((await store.load())?.refresh_token).toBe("refresh-1");
  });

  it("adopts tokens another process already rotated on disk", async () => {
    await store.save(creds({ expires_at: NOW - 1 }));
    const fetch = fakeFetch(() => refreshed(9));
    const manager = new TokenManager(store, { fetch, now: () => NOW });
    await expect(manager.forceRefresh("nope")).resolves.toBe("access-1"); // loads the expired creds into memory

    await store.save(creds({ access_token: "access-from-other-process", refresh_token: "refresh-x" }));

    expect(await manager.getAccessToken()).toBe("access-from-other-process");
    expect(fetch.calls).toHaveLength(0);
  });

  it("prefers client credentials passed via options", async () => {
    await store.save(creds({ expires_at: NOW - 1 }));
    const fetch = fakeFetch(() => refreshed(2));
    const manager = new TokenManager(store, { fetch, now: () => NOW, clientId: "env-id", clientSecret: "env-secret" });

    await manager.getAccessToken();

    const body = new URLSearchParams(String(fetch.calls[0].init?.body));
    expect(body.get("client_id")).toBe("env-id");
    expect(body.get("client_secret")).toBe("env-secret");
  });

  it("asks the user to re-authenticate when WHOOP rejects the refresh token", async () => {
    await store.save(creds({ expires_at: NOW - 1 }));
    const fetch = fakeFetch(() => json({ error: "invalid_grant" }, 400));
    const manager = new TokenManager(store, { fetch, now: () => NOW });

    const err = await manager.getAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotAuthenticatedError);
    expect((err as Error).message).toContain("whoop-mcp auth");
  });

  it("explains how to connect when there are no tokens", async () => {
    const manager = new TokenManager(store, { now: () => NOW });
    await expect(manager.getAccessToken()).rejects.toThrow(/whoop-mcp auth/);
  });
});

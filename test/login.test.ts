import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenStore } from "../src/auth.js";
import { buildAuthorizeUrl, codeFromRedirect, generateState, login } from "../src/login.js";
import { fakeFetch, json } from "./helpers.js";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

const tokenEndpoint = () =>
  fakeFetch(() => json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: "offline read:sleep" }));

let store: TokenStore;
beforeEach(() => {
  store = new TokenStore(join(mkdtempSync(join(tmpdir(), "whoop-mcp-")), "tokens.json"));
});

describe("authorization URL", () => {
  it("uses an 8-character state, as WHOOP requires", () => {
    for (let i = 0; i < 20; i++) expect(generateState()).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it("requests only read scopes plus offline", () => {
    const url = new URL(buildAuthorizeUrl("cid", "http://localhost:8787/callback", "abcd1234"));
    expect(url.origin + url.pathname).toBe("https://api.prod.whoop.com/oauth/oauth2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8787/callback");
    expect(url.searchParams.get("state")).toBe("abcd1234");
    const scopes = url.searchParams.get("scope")!.split(" ");
    expect(scopes).toContain("offline");
    for (const scope of scopes.filter((s) => s !== "offline")) expect(scope).toMatch(/^read:/);
  });

  it("validates the redirect", () => {
    expect(codeFromRedirect("http://x/cb?code=c1&state=s1", "s1")).toBe("c1");
    expect(() => codeFromRedirect("http://x/cb?code=c1&state=evil", "s1")).toThrow(/state mismatch/);
    expect(() => codeFromRedirect("http://x/cb?error=access_denied&error_description=nope", "s1")).toThrow(
      /access_denied \(nope\)/,
    );
  });
});

describe("login", () => {
  for (const host of ["127.0.0.1", "localhost"]) {
    it(`captures the callback on ${host} and saves tokens`, async () => {
      const port = await freePort();
      const redirectUri = `http://${host}:${port}/callback`;
      const fetch = tokenEndpoint();
      let callbackStatus = 0;

      const creds = await login({
        clientId: "cid",
        clientSecret: "secret",
        redirectUri,
        store,
        fetch,
        openBrowser: false,
        log: () => {},
        onAuthorizeUrl: (url) => {
          // Play the browser: WHOOP redirects back with the code and our state.
          const state = new URL(url).searchParams.get("state")!;
          void globalThis
            .fetch(`http://127.0.0.1:${port}/callback?code=the-code&state=${state}`)
            .then((r) => (callbackStatus = r.status));
        },
      });

      expect(creds).toMatchObject({ client_id: "cid", access_token: "access-1", refresh_token: "refresh-1" });
      expect(await store.load()).toEqual(creds);
      expect(Object.fromEntries(new URLSearchParams(String(fetch.calls[0].init?.body)))).toEqual({
        grant_type: "authorization_code",
        code: "the-code",
        client_id: "cid",
        client_secret: "secret",
        redirect_uri: redirectUri,
      });
      await expect.poll(() => callbackStatus).toBe(200);
    });
  }

  it("rejects a callback with the wrong state", async () => {
    const port = await freePort();
    const result = login({
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: `http://127.0.0.1:${port}/callback`,
      store,
      fetch: tokenEndpoint(),
      openBrowser: false,
      log: () => {},
      onAuthorizeUrl: () => void globalThis.fetch(`http://127.0.0.1:${port}/callback?code=x&state=forged00`),
    });

    await expect(result).rejects.toThrow(/state mismatch/);
    expect(await store.load()).toBeNull();
  });

  it("times out if the browser never comes back", async () => {
    const port = await freePort();
    await expect(
      login({
        clientId: "cid",
        clientSecret: "secret",
        redirectUri: `http://127.0.0.1:${port}/callback`,
        store,
        openBrowser: false,
        log: () => {},
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/Timed out/);
  });
});

describe("callback server", () => {
  it("fails clearly when the callback port is taken", async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", () => r()));
    const { port } = blocker.address() as { port: number };
    try {
      await expect(
        login({
          clientId: "cid",
          clientSecret: "secret",
          redirectUri: `http://localhost:${port}/callback`,
          store,
          openBrowser: false,
          log: () => {},
        }),
      ).rejects.toThrow(/Port \d+ is in use/);
    } finally {
      blocker.close();
    }
  });
});

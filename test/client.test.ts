import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WhoopApiError, WhoopClient } from "../src/client.js";
import { fakeFetch, json, staticTokens } from "./helpers.js";

const noSleep = async (_ms: number) => {};

describe("WhoopClient", () => {
  it("sends authenticated GET requests to the v2 API", async () => {
    const fetch = fakeFetch(() => json({ user_id: 1, email: "a@b.c", first_name: "A", last_name: "B" }));
    const client = new WhoopClient(staticTokens, { fetch });

    const profile = await client.getProfile();

    expect(profile.first_name).toBe("A");
    expect(fetch.calls).toHaveLength(1);
    const { url, init } = fetch.calls[0];
    expect(url.toString()).toBe("https://api.prod.whoop.com/developer/v2/user/profile/basic");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
  });

  it("passes range filters and follows next_token up to the requested limit", async () => {
    const fetch = fakeFetch((url) => {
      const page = url.searchParams.get("nextToken") ? 2 : 1;
      const size = Number(url.searchParams.get("limit"));
      return json({
        records: Array.from({ length: size }, (_, i) => ({ id: page * 100 + i })),
        next_token: `page-${page + 1}`,
      });
    });
    const client = new WhoopClient(staticTokens, { fetch });

    const res = await client.listCycles({ start: "2026-10-01T00:00:00.000Z", end: "2026-10-10T00:00:00.000Z", limit: 30 });

    expect(res.records).toHaveLength(30);
    expect(res.next_token).toBe("page-3");
    expect(fetch.calls.map((c) => c.url.searchParams.get("limit"))).toEqual(["25", "5"]);
    expect(fetch.calls[1].url.searchParams.get("nextToken")).toBe("page-2");
    for (const { url } of fetch.calls) {
      expect(url.pathname).toBe("/developer/v2/cycle");
      expect(url.searchParams.get("start")).toBe("2026-10-01T00:00:00.000Z");
      expect(url.searchParams.get("end")).toBe("2026-10-10T00:00:00.000Z");
    }
  });

  it("stops paginating when WHOOP returns no next_token", async () => {
    const fetch = fakeFetch(() => json({ records: [{ id: 1 }, { id: 2 }], next_token: null }));
    const client = new WhoopClient(staticTokens, { fetch });

    const res = await client.listWorkouts({ limit: 100 });

    expect(res).toEqual({ records: [{ id: 1 }, { id: 2 }], next_token: null });
    expect(fetch.calls).toHaveLength(1);
  });

  it("refreshes the token once on 401 and retries", async () => {
    const fetch = fakeFetch((_url, init) =>
      (init?.headers as Record<string, string>).Authorization === "Bearer token-2" ? json({ ok: true }) : json({}, 401),
    );
    const tokens = { ...staticTokens, forceRefresh: vi.fn(async () => "token-2") };
    const client = new WhoopClient(tokens, { fetch });

    await expect(client.get("/v2/cycle/1")).resolves.toEqual({ ok: true });
    expect(tokens.forceRefresh).toHaveBeenCalledWith("token-1");
  });

  it("gives up after a second 401", async () => {
    const fetch = fakeFetch(() => json({}, 401));
    const client = new WhoopClient(staticTokens, { fetch });

    await expect(client.get("/v2/cycle/1")).rejects.toMatchObject({ status: 401 });
    expect(fetch.calls).toHaveLength(2);
  });

  it("waits for Retry-After on 429 before retrying", async () => {
    let n = 0;
    const fetch = fakeFetch(() => (n++ === 0 ? json({}, 429, { "retry-after": "2" }) : json({ ok: true })));
    const sleep = vi.fn(noSleep);
    const client = new WhoopClient(staticTokens, { fetch, sleep });

    await expect(client.get("/v2/recovery")).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("retries server errors with backoff, then throws", async () => {
    const fetch = fakeFetch(() => new Response("boom", { status: 503 }));
    const sleep = vi.fn(noSleep);
    const client = new WhoopClient(staticTokens, { fetch, sleep, maxRetries: 2 });

    const err = await client.get("/v2/recovery").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WhoopApiError);
    expect((err as WhoopApiError).message).toContain("503");
    expect(fetch.calls).toHaveLength(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
  });

  it("URL-encodes path ids", async () => {
    const fetch = fakeFetch(() => json({}));
    const client = new WhoopClient(staticTokens, { fetch });

    await client.getSleep("../user/access");

    expect(fetch.calls[0].url.pathname).toBe("/developer/v2/activity/sleep/..%2Fuser%2Faccess");
  });
});

describe("read-only guarantee", () => {
  it("never issues a non-GET request to the WHOOP data API", () => {
    const srcDir = join(import.meta.dirname, "..", "src");
    for (const file of readdirSync(srcDir)) {
      const source = readFileSync(join(srcDir, file), "utf8");
      const methods = [...source.matchAll(/method:\s*"(\w+)"/g)].map((m) => m[1]);
      // auth.ts is the only place allowed to POST, and only to the OAuth token endpoint.
      const allowed = file === "auth.ts" ? ["POST"] : ["GET"];
      for (const method of methods) expect(allowed, `${file} uses ${method}`).toContain(method);
    }
    expect(readFileSync(join(srcDir, "auth.ts"), "utf8")).toMatch(/fetchImpl\(WHOOP_TOKEN_URL, \{\s*method: "POST"/);
  });
});

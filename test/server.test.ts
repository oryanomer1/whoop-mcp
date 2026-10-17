import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { TokenManager, TokenStore } from "../src/auth.js";
import { WhoopClient } from "../src/client.js";
import { createServer, parseBoundary, toCollectionQuery } from "../src/server.js";
import { cycle, fakeFetch, json, nap, recovery, sleep, staticTokens, workout } from "./helpers.js";

/** Serves the fixtures the way the WHOOP API would. */
function whoopApi() {
  return fakeFetch((url) => {
    const path = url.pathname.replace("/developer", "");
    const page = (records: unknown[]) => json({ records, next_token: null });
    switch (path) {
      case "/v2/user/profile/basic":
        return json({ user_id: 10129, email: "me@example.com", first_name: "Sam", last_name: "Doe" });
      case "/v2/user/measurement/body":
        return json({ height_meter: 1.8, weight_kilogram: 75, max_heart_rate: 190 });
      case "/v2/cycle":
        return page([cycle]);
      case `/v2/cycle/${cycle.id}`:
        return json(cycle);
      case `/v2/cycle/${cycle.id}/recovery`:
        return json(recovery);
      case `/v2/cycle/${cycle.id}/sleep`:
        return json(sleep);
      case "/v2/recovery":
        return page([recovery]);
      case "/v2/activity/sleep":
        return page([nap, sleep]);
      case `/v2/activity/sleep/${sleep.id}`:
        return json(sleep);
      case `/v2/activity/workout/${workout.id}`:
        return json(workout);
      case "/v2/activity/workout":
        return page([workout, { ...workout, id: "b0000000-0000-4000-8000-000000000000", sport_name: "cycling" }]);
      default:
        return json({ message: "not found" }, 404);
    }
  });
}

async function connect(whoop: WhoopClient) {
  const server = createServer(whoop, "test");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = (res.content[0] as { text: string }).text;
  return { isError: res.isError ?? false, text, data: res.isError ? undefined : JSON.parse(text) };
}

describe("MCP server", () => {
  it("exposes only read-only tools", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_cycle",
      "get_daily_overview",
      "get_profile",
      "get_sleep",
      "get_trends",
      "get_workout",
      "list_cycles",
      "list_recoveries",
      "list_sleeps",
      "list_workouts",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
    }
  });

  it("get_daily_overview combines the day's data", async () => {
    const fetch = whoopApi();
    const client = await connect(new WhoopClient(staticTokens, { fetch }));

    const { data } = await call(client, "get_daily_overview", { date: "2026-10-13" });

    expect(data.date).toBe("2026-10-13");
    expect(data.cycle.strain).toBe(12.3);
    expect(data.recovery.recovery_pct).toBe(72);
    expect(data.sleep.asleep_h).toBe(7.5);
    expect(data.naps).toHaveLength(1);
    expect(data.workouts.map((w: { sport: string }) => w.sport)).toEqual(["running", "cycling"]);
    expect(fetch.calls.every((c) => c.init?.method === "GET")).toBe(true);
  });

  it("get_daily_overview reports days without data", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));
    const { data } = await call(client, "get_daily_overview", { date: "2020-01-01" });
    expect(data.message).toMatch(/No WHOOP cycle/);
  });

  it("get_trends aggregates per day", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));

    const { data } = await call(client, "get_trends", { days: 7 });

    expect(data.days).toEqual([
      expect.objectContaining({
        date: "2026-10-13",
        recovery_pct: 72,
        recovery_zone: "green",
        hrv_ms: 61.2,
        asleep_h: 7.5,
        workouts: ["running", "cycling"],
      }),
    ]);
    expect(data.averages.recovery_pct).toEqual({ avg: 72, min: 72, max: 72, days: 1 });
    expect(data.recovery_zones).toEqual({ green: 1, yellow: 0, red: 0 });
    expect(data.total_workouts).toBe(2);
  });

  it("list tools return summaries by default and raw records on request", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));

    const summary = await call(client, "list_sleeps", { include_naps: false });
    expect(summary.data.records).toHaveLength(1);
    expect(summary.data.records[0].asleep_h).toBe(7.5);

    const raw = await call(client, "list_recoveries", { raw: true });
    expect(raw.data.records[0].score.hrv_rmssd_milli).toBe(61.234);
  });

  it("list_workouts filters by sport", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));
    const { data } = await call(client, "list_workouts", { sport: "RUN" });
    expect(data.records.map((w: { sport: string }) => w.sport)).toEqual(["running"]);
  });

  it("get_profile merges profile and body measurements", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));
    const { data } = await call(client, "get_profile");
    expect(data).toMatchObject({ first_name: "Sam", height_meter: 1.8, max_heart_rate: 190 });
  });

  it("get_cycle includes recovery and sleep", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));
    const { data } = await call(client, "get_cycle", { cycle_id: cycle.id });
    expect(data.cycle.cycle_id).toBe(cycle.id);
    expect(data.recovery.recovery_pct).toBe(72);
    expect(data.sleep.sleep_id).toBe(sleep.id);
  });

  it("returns a tool error telling the user to connect when there are no tokens", async () => {
    const store = new TokenStore(join(mkdtempSync(join(tmpdir(), "whoop-mcp-")), "tokens.json"));
    const client = await connect(new WhoopClient(new TokenManager(store), { fetch: whoopApi() }));

    const res = await call(client, "get_daily_overview");

    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/whoop-mcp auth/);
  });

  it("returns a tool error for invalid dates", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));
    for (const start of ["last tuesday", "2026-02-30", "2026-13-01"]) {
      const res = await call(client, "list_cycles", { start });
      expect(res.isError, start).toBe(true);
      expect(res.text).toMatch(/Invalid start/);
    }
    const overview = await call(client, "get_daily_overview", { date: "2026-02-30" });
    expect(overview.isError).toBe(true);
  });

  it("get_sleep and get_workout fetch one record by id", async () => {
    const client = await connect(new WhoopClient(staticTokens, { fetch: whoopApi() }));

    const s = await call(client, "get_sleep", { sleep_id: sleep.id });
    expect(s.data).toMatchObject({ sleep_id: sleep.id, asleep_h: 7.5 });

    const w = await call(client, "get_workout", { workout_id: workout.id, raw: true });
    expect(w.data).toEqual(workout);

    const bad = await call(client, "get_workout", { workout_id: "../user/access" });
    expect(bad.isError).toBe(true);
  });

  it("get_trends keeps only the requested number of days", async () => {
    const yesterday = { ...cycle, id: 93844, start: "2026-10-11T20:30:00.000Z", end: cycle.start };
    const fetch = fakeFetch((url) => {
      const path = url.pathname.replace("/developer", "");
      if (path === "/v2/cycle") return json({ records: [cycle, yesterday], next_token: null });
      return whoopApi()(url);
    });
    const client = await connect(new WhoopClient(staticTokens, { fetch }));

    const { data } = await call(client, "get_trends", { days: 1 });

    expect(data.days.map((d: { date: string }) => d.date)).toEqual(["2026-10-13"]);
  });
});

describe("date ranges", () => {
  it("treats dates as local days and end dates as inclusive", () => {
    expect(parseBoundary("2026-10-01", "start")).toBe(new Date(2026, 9, 1).toISOString());
    expect(parseBoundary("2026-10-01", "end")).toBe(new Date(2026, 9, 2).toISOString());
    expect(parseBoundary("2026-12-31", "end")).toBe(new Date(2027, 0, 1).toISOString());
    expect(parseBoundary("2026-10-01T08:00:00Z", "end")).toBe("2026-10-01T08:00:00.000Z");
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(() => parseBoundary("2026-02-30", "start")).toThrow(/no such date/);
    expect(() => parseBoundary("2026-13-01", "start")).toThrow(/no such date/);
    expect(new Date(parseBoundary("0050-01-01", "start")).getFullYear()).toBe(50);
  });

  it("supports a days shortcut and rejects inverted ranges", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(toCollectionQuery({ days: 7, limit: 25 }, now)).toEqual({
      start: "2026-10-06T12:00:00.000Z",
      end: undefined,
      limit: 25,
      nextToken: undefined,
    });
    expect(() => toCollectionQuery({ start: "2026-10-10", end: "2026-10-01", limit: 25 })).toThrow(/before end/);
  });
});

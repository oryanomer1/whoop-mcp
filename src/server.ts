import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { CollectionQuery, WhoopClient } from "./client.js";
import { summarizeCycle, summarizeRecovery, summarizeSleep, summarizeWorkout } from "./format.js";
import { dailyOverview, orNull, trends } from "./insights.js";

const INSTRUCTIONS = `Read-only access to the user's WHOOP data (recovery, sleep, strain/cycles, workouts, profile).
- For "today", "last night" or a specific day, start with get_daily_overview.
- For "this week", "last month" or trend questions, use get_trends.
- Use the list_* tools for raw history and the get_* tools to drill into one record by id.
- A WHOOP "cycle" is one physiological day: it starts when the user falls asleep and ends at the next sleep onset.
- Times in summaries are shown in the user's local timezone offset as recorded by WHOOP.
- score_state PENDING_SCORE means WHOOP is still computing that score; UNSCORABLE means it never will.`;

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses YYYY-MM-DD strictly: rejects dates like 2026-02-30 that Date would silently roll over. */
function parseDateOnly(value: string): [number, number, number] | null {
  const m = DATE_ONLY.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(0);
  check.setUTCFullYear(y, mo - 1, d);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return [y, mo, d];
}

const dateOnly = z.string().refine((v) => parseDateOnly(v) !== null, "Use a real date in YYYY-MM-DD format");

const rangeShape = {
  start: z
    .string()
    .optional()
    .describe("Inclusive lower bound: a date (YYYY-MM-DD, local midnight) or ISO 8601 date-time."),
  end: z
    .string()
    .optional()
    .describe("Upper bound: a date (YYYY-MM-DD) includes that whole day; a date-time is exclusive. Defaults to now."),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Shortcut for start: look back this many days from now. Ignored when start is set."),
  limit: z.number().int().min(1).max(200).default(25).describe("Maximum number of records to return."),
  next_token: z.string().optional().describe("Pass the next_token from a previous call to get the following records."),
  raw: z
    .boolean()
    .default(false)
    .describe("Return WHOOP's raw API objects instead of compact summaries with friendly units."),
};

type RangeArgs = {
  start?: string;
  end?: string;
  days?: number;
  limit: number;
  next_token?: string;
};

/** Converts a date or date-time argument into an ISO 8601 instant. */
export function parseBoundary(value: string, kind: "start" | "end"): string {
  if (DATE_ONLY.test(value)) {
    const parts = parseDateOnly(value);
    if (!parts) throw new Error(`Invalid ${kind} "${value}": no such date.`);
    const [y, m, d] = parts;
    // Dates are local calendar days; an end date includes the whole day.
    // setFullYear (unlike the Date constructor) keeps years below 100 as-is.
    const local = new Date(2000, 0, 1);
    local.setFullYear(y, m - 1, kind === "end" ? d + 1 : d);
    return local.toISOString();
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Invalid ${kind} "${value}". Use YYYY-MM-DD or an ISO 8601 date-time.`);
  return new Date(ms).toISOString();
}

export function toCollectionQuery(args: RangeArgs, now = Date.now()): CollectionQuery {
  const start = args.start
    ? parseBoundary(args.start, "start")
    : args.days
      ? new Date(now - args.days * 86_400_000).toISOString()
      : undefined;
  const end = args.end ? parseBoundary(args.end, "end") : undefined;
  if (start && end && start >= end) throw new Error("start must be before end.");
  return { start, end, limit: args.limit, nextToken: args.next_token };
}

async function respond(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn()) }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] };
  }
}

export function createServer(client: WhoopClient, version = "0.0.0"): McpServer {
  const server = new McpServer({ name: "whoop-mcp", version }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "get_profile",
    {
      title: "Get WHOOP profile",
      description: "The user's WHOOP profile (name, email) and body measurements (height, weight, max heart rate).",
      annotations: READ_ONLY,
    },
    ({ signal }) =>
      respond(async () => {
        const whoop = client.withSignal(signal);
        const [profile, body] = await Promise.all([whoop.getProfile(), whoop.getBodyMeasurement()]);
        return { ...profile, ...body };
      }),
  );

  server.registerTool(
    "get_daily_overview",
    {
      title: "Daily overview",
      description:
        "Everything for one WHOOP day: recovery (score, HRV, resting HR, SpO2, skin temp), last night's sleep, naps, day strain and calories, and workouts. Omit date for the current/latest day.",
      inputSchema: {
        date: dateOnly
          .optional()
          .describe("Day to show (YYYY-MM-DD), i.e. the day you woke up on. Defaults to the latest day."),
      },
      annotations: READ_ONLY,
    },
    ({ date }, { signal }) => respond(() => dailyOverview(client.withSignal(signal), date)),
  );

  server.registerTool(
    "get_trends",
    {
      title: "Trends",
      description:
        "Day-by-day table and averages (avg/min/max) over the last N days for recovery, HRV, resting HR, strain, calories, sleep hours and sleep performance, plus recovery zone counts and workouts per day.",
      inputSchema: {
        days: z.number().int().min(1).max(90).default(7).describe("How many days to look back (1-90)."),
      },
      annotations: READ_ONLY,
    },
    ({ days }, { signal }) => respond(() => trends(client.withSignal(signal), days)),
  );

  server.registerTool(
    "list_cycles",
    {
      title: "List cycles (day strain)",
      description:
        "Physiological cycles (WHOOP days) with day strain, calories, average/max heart rate and steps, most recent first.",
      inputSchema: rangeShape,
      annotations: READ_ONLY,
    },
    ({ raw, ...args }, { signal }) =>
      respond(async () => {
        const res = await client.withSignal(signal).listCycles(toCollectionQuery(args));
        return { records: raw ? res.records : res.records.map(summarizeCycle), next_token: res.next_token };
      }),
  );

  server.registerTool(
    "get_cycle",
    {
      title: "Get cycle",
      description: "One physiological cycle by id, together with its recovery and main sleep.",
      inputSchema: {
        cycle_id: z.number().int().positive().describe("Cycle id (from list_cycles or get_daily_overview)."),
        raw: rangeShape.raw,
      },
      annotations: READ_ONLY,
    },
    ({ cycle_id, raw }, { signal }) =>
      respond(async () => {
        const whoop = client.withSignal(signal);
        const cycle = await whoop.getCycle(cycle_id);
        const [recovery, sleep] = await Promise.all([
          orNull(whoop.getCycleRecovery(cycle_id)),
          orNull(whoop.getCycleSleep(cycle_id)),
        ]);
        if (raw) return { cycle, recovery, sleep };
        return {
          cycle: summarizeCycle(cycle),
          recovery: recovery && summarizeRecovery(recovery),
          sleep: sleep && summarizeSleep(sleep),
        };
      }),
  );

  server.registerTool(
    "list_recoveries",
    {
      title: "List recoveries",
      description:
        "Daily recovery scores with HRV (RMSSD), resting heart rate, SpO2 and skin temperature, most recent first.",
      inputSchema: rangeShape,
      annotations: READ_ONLY,
    },
    ({ raw, ...args }, { signal }) =>
      respond(async () => {
        const res = await client.withSignal(signal).listRecoveries(toCollectionQuery(args));
        return { records: raw ? res.records : res.records.map(summarizeRecovery), next_token: res.next_token };
      }),
  );

  server.registerTool(
    "list_sleeps",
    {
      title: "List sleeps",
      description:
        "Sleeps and naps with performance, efficiency, consistency, stage breakdown (light/deep/REM/awake), disturbances, respiratory rate and sleep need, most recent first.",
      inputSchema: {
        ...rangeShape,
        include_naps: z.boolean().default(true).describe("Set false to return only main sleeps."),
      },
      annotations: READ_ONLY,
    },
    ({ raw, include_naps, ...args }, { signal }) =>
      respond(async () => {
        const res = await client.withSignal(signal).listSleeps(toCollectionQuery(args));
        const records = include_naps ? res.records : res.records.filter((s) => !s.nap);
        return { records: raw ? records : records.map(summarizeSleep), next_token: res.next_token };
      }),
  );

  server.registerTool(
    "get_sleep",
    {
      title: "Get sleep",
      description: "One sleep or nap by id.",
      inputSchema: {
        sleep_id: z.guid().describe("Sleep id (UUID)."),
        raw: rangeShape.raw,
      },
      annotations: READ_ONLY,
    },
    ({ sleep_id, raw }, { signal }) =>
      respond(async () => {
        const sleep = await client.withSignal(signal).getSleep(sleep_id);
        return raw ? sleep : summarizeSleep(sleep);
      }),
  );

  server.registerTool(
    "list_workouts",
    {
      title: "List workouts",
      description:
        "Workouts with sport, duration, strain, heart rate, calories, distance, altitude gain and time in each heart-rate zone, most recent first.",
      inputSchema: {
        ...rangeShape,
        sport: z
          .string()
          .optional()
          .describe(
            'Only return workouts whose sport name contains this text (case-insensitive), e.g. "running". Applied to the fetched records, so raise limit or widen the range to search further back.',
          ),
      },
      annotations: READ_ONLY,
    },
    ({ raw, sport, ...args }, { signal }) =>
      respond(async () => {
        const res = await client.withSignal(signal).listWorkouts(toCollectionQuery(args));
        const needle = sport?.toLowerCase();
        const records = needle ? res.records.filter((w) => w.sport_name.toLowerCase().includes(needle)) : res.records;
        return { records: raw ? records : records.map(summarizeWorkout), next_token: res.next_token };
      }),
  );

  server.registerTool(
    "get_workout",
    {
      title: "Get workout",
      description: "One workout by id.",
      inputSchema: {
        workout_id: z.guid().describe("Workout id (UUID)."),
        raw: rangeShape.raw,
      },
      annotations: READ_ONLY,
    },
    ({ workout_id, raw }, { signal }) =>
      respond(async () => {
        const workout = await client.withSignal(signal).getWorkout(workout_id);
        return raw ? workout : summarizeWorkout(workout);
      }),
  );

  return server;
}

import { WhoopApiError, type WhoopClient } from "./client.js";
import { cycleDate, round, summarizeCycle, summarizeRecovery, summarizeSleep, summarizeWorkout } from "./format.js";
import type { Cycle, Recovery, Sleep, Workout } from "./types.js";

const DAY_MS = 86_400_000;

/** Maps a 404 to null; WHOOP returns 404 when a cycle has no recovery or sleep yet. */
export async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof WhoopApiError && err.status === 404) return null;
    throw err;
  }
}

/** Finds the cycle WHOOP shows for `date` (YYYY-MM-DD), or the latest cycle when omitted. */
async function findCycle(client: WhoopClient, date?: string): Promise<Cycle | undefined> {
  if (!date) return (await client.listCycles({ limit: 1 })).records[0];
  const day = Date.parse(`${date}T00:00:00Z`);
  // A day's cycle starts the evening before (or early that morning), in any timezone,
  // so a ±2 day window always contains it.
  const { records } = await client.listCycles({
    start: new Date(day - 2 * DAY_MS).toISOString(),
    end: new Date(day + 2 * DAY_MS).toISOString(),
    limit: 10,
  });
  return records.find((c) => cycleDate(c) === date);
}

export async function dailyOverview(client: WhoopClient, date?: string) {
  const cycle = await findCycle(client, date);
  if (!cycle) {
    return { date: date ?? null, message: "No WHOOP cycle found for this day." };
  }
  const window = { start: cycle.start, end: cycle.end ?? undefined };
  const [recovery, sleep, sleeps, workouts] = await Promise.all([
    orNull(client.getCycleRecovery(cycle.id)),
    orNull(client.getCycleSleep(cycle.id)),
    client.listSleeps({ ...window, limit: 25 }),
    client.listWorkouts({ ...window, limit: 25 }),
  ]);
  return {
    date: cycleDate(cycle),
    cycle: summarizeCycle(cycle),
    recovery: recovery && summarizeRecovery(recovery),
    sleep: sleep && summarizeSleep(sleep),
    naps: sleeps.records.filter((s) => s.nap).map(summarizeSleep),
    workouts: workouts.records.map(summarizeWorkout),
  };
}

function stats(values: (number | undefined)[]) {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    avg: round(sum / nums.length, 1),
    min: round(Math.min(...nums), 1),
    max: round(Math.max(...nums), 1),
    days: nums.length,
  };
}

const duration = (s: Sleep) => Date.parse(s.end) - Date.parse(s.start);

/** WHOOP's recovery color bands. */
function recoveryZone(pct: number | undefined): "green" | "yellow" | "red" | undefined {
  if (pct == null) return undefined;
  return pct >= 67 ? "green" : pct >= 34 ? "yellow" : "red";
}

export async function trends(client: WhoopClient, days: number, now = Date.now()) {
  const start = new Date(now - days * DAY_MS).toISOString();
  const [cycles, recoveries, sleeps, workouts] = await Promise.all([
    client.listCycles({ start, limit: days + 2 }),
    client.listRecoveries({ start, limit: days + 2 }),
    client.listSleeps({ start, limit: days * 3 }),
    client.listWorkouts({ start, limit: days * 6 }),
  ]);

  const recoveryByCycle = new Map<number, Recovery>(recoveries.records.map((r) => [r.cycle_id, r]));
  const sleepById = new Map<string, Sleep>(sleeps.records.map((s) => [s.id, s]));
  // WHOOP's `start` filter also returns the cycle already in progress at `start`, so keep the last `days`.
  const ordered = [...cycles.records].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(-days);
  /** The sleep WHOOP based the day's recovery on, else the cycle's longest main sleep. */
  const mainSleep = (c: Cycle): Sleep | undefined => {
    const scored = sleepById.get(recoveryByCycle.get(c.id)?.sleep_id ?? "");
    if (scored) return scored;
    const candidates = sleeps.records.filter((s) => s.cycle_id === c.id && !s.nap);
    return candidates.sort((a, b) => duration(b) - duration(a))[0];
  };
  const workoutsByCycle = new Map<number, Workout[]>();
  for (const w of workouts.records) {
    const t = Date.parse(w.start);
    const owner = ordered.find((c) => t >= Date.parse(c.start) && (!c.end || t < Date.parse(c.end)));
    if (owner) workoutsByCycle.set(owner.id, [...(workoutsByCycle.get(owner.id) ?? []), w]);
  }

  const rows = ordered.map((c) => {
    const cycle = summarizeCycle(c);
    const recovery = recoveryByCycle.get(c.id);
    const r = recovery && summarizeRecovery(recovery);
    const sleep = mainSleep(c);
    const s = sleep && summarizeSleep(sleep);
    const dayWorkouts = workoutsByCycle.get(c.id) ?? [];
    return {
      date: cycle.date,
      in_progress: cycle.in_progress || undefined,
      recovery_pct: r?.recovery_pct,
      recovery_zone: recoveryZone(r?.recovery_pct),
      hrv_ms: r?.hrv_rmssd_ms,
      resting_hr_bpm: r?.resting_hr_bpm,
      spo2_pct: r?.spo2_pct,
      skin_temp_c: r?.skin_temp_c,
      strain: cycle.strain,
      calories_kcal: cycle.calories_kcal,
      asleep_h: s?.asleep_h,
      sleep_performance_pct: s?.performance_pct,
      sleep_efficiency_pct: s?.efficiency_pct,
      respiratory_rate: s?.respiratory_rate,
      workouts: dayWorkouts.map((w) => w.sport_name),
    };
  });

  // An in-progress day has partial strain, so keep it out of strain/calorie averages.
  const complete = rows.filter((r) => !r.in_progress);
  const zones = { green: 0, yellow: 0, red: 0 };
  for (const r of rows) if (r.recovery_zone) zones[r.recovery_zone]++;

  return {
    period: { days, from: rows[0]?.date ?? null, to: rows.at(-1)?.date ?? null },
    averages: {
      recovery_pct: stats(rows.map((r) => r.recovery_pct)),
      hrv_ms: stats(rows.map((r) => r.hrv_ms)),
      resting_hr_bpm: stats(rows.map((r) => r.resting_hr_bpm)),
      strain: stats(complete.map((r) => r.strain)),
      calories_kcal: stats(complete.map((r) => r.calories_kcal)),
      asleep_h: stats(rows.map((r) => r.asleep_h)),
      sleep_performance_pct: stats(rows.map((r) => r.sleep_performance_pct)),
      respiratory_rate: stats(rows.map((r) => r.respiratory_rate)),
    },
    recovery_zones: zones,
    total_workouts: rows.reduce((n, r) => n + r.workouts.length, 0),
    days: rows,
  };
}

import { describe, expect, it } from "vitest";
import {
  cycleDate,
  offsetMinutes,
  summarizeCycle,
  summarizeRecovery,
  summarizeSleep,
  summarizeWorkout,
  toLocalIso,
} from "../src/format.js";
import { cycle, recovery, sleep, workout } from "./helpers.js";

describe("time helpers", () => {
  it("parses WHOOP timezone offsets", () => {
    expect(offsetMinutes("+03:00")).toBe(180);
    expect(offsetMinutes("-05:30")).toBe(-330);
    expect(offsetMinutes("-0800")).toBe(-480);
    expect(offsetMinutes("Z")).toBe(0);
  });

  it("renders instants in the recorded local offset", () => {
    expect(toLocalIso("2026-10-12T20:30:00.000Z", "+03:00")).toBe("2026-10-12T23:30:00+03:00");
    expect(toLocalIso("2026-10-13T02:15:00.000Z", "-05:00")).toBe("2026-10-12T21:15:00-05:00");
    expect(toLocalIso("2026-10-13T02:15:00.000Z", "Z")).toBe("2026-10-13T02:15:00Z");
  });

  it("assigns a cycle to the day the user wakes up on", () => {
    // Fell asleep 23:30 local on Oct 12 -> Oct 13.
    expect(cycleDate({ start: "2026-10-12T20:30:00Z", timezone_offset: "+03:00" })).toBe("2026-10-13");
    // Fell asleep 01:30 local on Oct 13 -> Oct 13.
    expect(cycleDate({ start: "2026-10-12T22:30:00Z", timezone_offset: "+03:00" })).toBe("2026-10-13");
    // Fell asleep 22:00 local on Oct 12 in New York (02:00Z Oct 13) -> Oct 13.
    expect(cycleDate({ start: "2026-10-13T02:00:00Z", timezone_offset: "-04:00" })).toBe("2026-10-13");
  });
});

describe("summaries", () => {
  it("summarizes a cycle with friendly units", () => {
    expect(summarizeCycle(cycle)).toEqual({
      cycle_id: 93845,
      date: "2026-10-13",
      start: "2026-10-12T23:30:00+03:00",
      end: "2026-10-13T23:00:00+03:00",
      in_progress: false,
      score_state: "SCORED",
      strain: 12.3,
      calories_kcal: 2390,
      avg_hr_bpm: 68,
      max_hr_bpm: 171,
      steps: 9876,
    });
  });

  it("marks an in-progress cycle", () => {
    const current = summarizeCycle({ ...cycle, end: undefined });
    expect(current.in_progress).toBe(true);
    expect(current.end).toBeNull();
  });

  it("summarizes recovery", () => {
    expect(summarizeRecovery(recovery)).toMatchObject({
      recovery_pct: 72,
      hrv_rmssd_ms: 61.2,
      resting_hr_bpm: 52,
      spo2_pct: 96.4,
      skin_temp_c: 33.71,
      calibrating: false,
    });
  });

  it("summarizes sleep stages in hours", () => {
    expect(summarizeSleep(sleep)).toMatchObject({
      nap: false,
      start: "2026-10-12T23:30:00+03:00",
      end: "2026-10-13T07:30:00+03:00",
      performance_pct: 94,
      efficiency_pct: 93.8,
      respiratory_rate: 15.2,
      in_bed_h: 8,
      asleep_h: 7.5,
      light_h: 3.5,
      deep_sws_h: 1.75,
      rem_h: 2.25,
      awake_h: 0.5,
      disturbances: 9,
      sleep_cycles: 4,
      sleep_need_h: 8,
    });
  });

  it("summarizes a workout", () => {
    expect(summarizeWorkout(workout)).toMatchObject({
      sport: "running",
      duration_min: 45.5,
      strain: 11.9,
      calories_kcal: 598,
      distance_km: 8.12,
      altitude_gain_m: 55,
      hr_zone_minutes: { zone0: 0, zone1: 1, zone2: 10, zone3: 20, zone4: 13.5, zone5: 1 },
    });
  });

  it("omits score fields for records WHOOP has not scored", () => {
    const pending = summarizeSleep({ ...sleep, score_state: "PENDING_SCORE", score: undefined });
    expect(pending.score_state).toBe("PENDING_SCORE");
    expect(JSON.parse(JSON.stringify(pending))).not.toHaveProperty("asleep_h");
  });
});

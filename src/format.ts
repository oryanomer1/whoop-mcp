import type { Cycle, Recovery, Sleep, Workout } from "./types.js";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const KCAL_PER_KJ = 0.239006;

export function round(value: number | null | undefined, digits = 1): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const hours = (ms: number | undefined) => (ms == null ? undefined : round(ms / MS_PER_HOUR, 2));
const minutes = (ms: number | undefined) => (ms == null ? undefined : round(ms / MS_PER_MINUTE, 1));
const kcal = (kj: number | undefined) => (kj == null ? undefined : round(kj * KCAL_PER_KJ, 0));

/** Parses a WHOOP timezone offset ("+03:00", "-0500", "Z") into minutes east of UTC. */
export function offsetMinutes(offset: string | undefined): number {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset ?? "");
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/** Renders an instant as wall-clock time in the given offset, e.g. "2026-10-13T07:12:00+03:00". */
export function toLocalIso(iso: string, offset: string): string {
  const mins = offsetMinutes(offset);
  const shifted = new Date(Date.parse(iso) + mins * MS_PER_MINUTE).toISOString().slice(0, 19);
  if (mins === 0) return `${shifted}Z`;
  const abs = Math.abs(mins);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${shifted}${mins < 0 ? "-" : "+"}${hh}:${mm}`;
}

/**
 * The calendar day (YYYY-MM-DD) a cycle represents. Cycles begin at sleep onset,
 * so a cycle starting at 23:30 on Oct 12 is the "Oct 13" day you wake up into.
 * Shifting the local start time by 12h maps both late-night and after-midnight
 * sleep onsets to the wake-up day.
 */
export function cycleDate(cycle: Pick<Cycle, "start" | "timezone_offset">): string {
  const localMs = Date.parse(cycle.start) + offsetMinutes(cycle.timezone_offset) * MS_PER_MINUTE;
  return new Date(localMs + 12 * MS_PER_HOUR).toISOString().slice(0, 10);
}

export function summarizeCycle(c: Cycle) {
  return {
    cycle_id: c.id,
    date: cycleDate(c),
    start: toLocalIso(c.start, c.timezone_offset),
    end: c.end ? toLocalIso(c.end, c.timezone_offset) : null,
    in_progress: !c.end,
    score_state: c.score_state,
    strain: round(c.score?.strain, 1),
    calories_kcal: kcal(c.score?.kilojoule),
    avg_hr_bpm: c.score?.average_heart_rate,
    max_hr_bpm: c.score?.max_heart_rate,
    steps: c.step_count ?? undefined,
  };
}

export function summarizeRecovery(r: Recovery) {
  return {
    cycle_id: r.cycle_id,
    sleep_id: r.sleep_id,
    score_state: r.score_state,
    recovery_pct: r.score?.recovery_score,
    hrv_rmssd_ms: round(r.score?.hrv_rmssd_milli, 1),
    resting_hr_bpm: r.score?.resting_heart_rate,
    spo2_pct: round(r.score?.spo2_percentage, 1),
    skin_temp_c: round(r.score?.skin_temp_celsius, 2),
    calibrating: r.score?.user_calibrating,
  };
}

export function summarizeSleep(s: Sleep) {
  const stages = s.score?.stage_summary;
  const need = s.score?.sleep_needed;
  const asleepMs = stages
    ? stages.total_light_sleep_time_milli + stages.total_slow_wave_sleep_time_milli + stages.total_rem_sleep_time_milli
    : undefined;
  const needMs = need
    ? need.baseline_milli + need.need_from_sleep_debt_milli + need.need_from_recent_strain_milli + need.need_from_recent_nap_milli
    : undefined;
  return {
    sleep_id: s.id,
    cycle_id: s.cycle_id,
    nap: s.nap,
    start: toLocalIso(s.start, s.timezone_offset),
    end: toLocalIso(s.end, s.timezone_offset),
    score_state: s.score_state,
    performance_pct: round(s.score?.sleep_performance_percentage, 0),
    efficiency_pct: round(s.score?.sleep_efficiency_percentage, 1),
    consistency_pct: round(s.score?.sleep_consistency_percentage, 0),
    respiratory_rate: round(s.score?.respiratory_rate, 1),
    in_bed_h: hours(stages?.total_in_bed_time_milli),
    asleep_h: hours(asleepMs),
    light_h: hours(stages?.total_light_sleep_time_milli),
    deep_sws_h: hours(stages?.total_slow_wave_sleep_time_milli),
    rem_h: hours(stages?.total_rem_sleep_time_milli),
    awake_h: hours(stages?.total_awake_time_milli),
    disturbances: stages?.disturbance_count,
    sleep_cycles: stages?.sleep_cycle_count,
    sleep_need_h: hours(needMs),
  };
}

export function summarizeWorkout(w: Workout) {
  const z = w.score?.zone_durations;
  return {
    workout_id: w.id,
    sport: w.sport_name,
    start: toLocalIso(w.start, w.timezone_offset),
    end: toLocalIso(w.end, w.timezone_offset),
    duration_min: minutes(Date.parse(w.end) - Date.parse(w.start)),
    score_state: w.score_state,
    strain: round(w.score?.strain, 1),
    avg_hr_bpm: w.score?.average_heart_rate,
    max_hr_bpm: w.score?.max_heart_rate,
    calories_kcal: kcal(w.score?.kilojoule),
    distance_km: w.score?.distance_meter == null ? undefined : round(w.score.distance_meter / 1000, 2),
    altitude_gain_m: round(w.score?.altitude_gain_meter, 0),
    percent_recorded: round(w.score?.percent_recorded, 0),
    hr_zone_minutes: z && {
      zone0: minutes(z.zone_zero_milli),
      zone1: minutes(z.zone_one_milli),
      zone2: minutes(z.zone_two_milli),
      zone3: minutes(z.zone_three_milli),
      zone4: minutes(z.zone_four_milli),
      zone5: minutes(z.zone_five_milli),
    },
  };
}

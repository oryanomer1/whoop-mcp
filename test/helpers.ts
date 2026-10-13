import type { Cycle, Recovery, Sleep, Workout } from "../src/types.js";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export interface RecordedCall {
  url: URL;
  init?: RequestInit;
}

/** A fetch stand-in that records calls and delegates responses to `handler`. */
export function fakeFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

export const staticTokens = {
  getAccessToken: async () => "token-1",
  forceRefresh: async () => "token-2",
};

export const cycle: Cycle = {
  id: 93845,
  user_id: 10129,
  created_at: "2026-10-12T21:00:00.000Z",
  updated_at: "2026-10-13T12:00:00.000Z",
  // 23:30 local (+03:00) on Oct 12 -> the "Oct 13" day.
  start: "2026-10-12T20:30:00.000Z",
  end: "2026-10-13T20:00:00.000Z",
  timezone_offset: "+03:00",
  score_state: "SCORED",
  score: { strain: 12.3456, kilojoule: 10000, average_heart_rate: 68, max_heart_rate: 171 },
  step_count: 9876,
};

export const recovery: Recovery = {
  cycle_id: 93845,
  sleep_id: "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
  user_id: 10129,
  created_at: "2026-10-13T04:30:00.000Z",
  updated_at: "2026-10-13T04:30:00.000Z",
  score_state: "SCORED",
  score: {
    user_calibrating: false,
    recovery_score: 72,
    resting_heart_rate: 52,
    hrv_rmssd_milli: 61.234,
    spo2_percentage: 96.4375,
    skin_temp_celsius: 33.71,
  },
};

const HOUR = 3_600_000;

export const sleep: Sleep = {
  id: "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
  cycle_id: 93845,
  user_id: 10129,
  created_at: "2026-10-13T04:30:00.000Z",
  updated_at: "2026-10-13T04:30:00.000Z",
  start: "2026-10-12T20:30:00.000Z",
  end: "2026-10-13T04:30:00.000Z",
  timezone_offset: "+03:00",
  nap: false,
  score_state: "SCORED",
  score: {
    stage_summary: {
      total_in_bed_time_milli: 8 * HOUR,
      total_awake_time_milli: 0.5 * HOUR,
      total_no_data_time_milli: 0,
      total_light_sleep_time_milli: 3.5 * HOUR,
      total_slow_wave_sleep_time_milli: 1.75 * HOUR,
      total_rem_sleep_time_milli: 2.25 * HOUR,
      sleep_cycle_count: 4,
      disturbance_count: 9,
    },
    sleep_needed: {
      baseline_milli: 7.5 * HOUR,
      need_from_sleep_debt_milli: 0.5 * HOUR,
      need_from_recent_strain_milli: 0.25 * HOUR,
      need_from_recent_nap_milli: -0.25 * HOUR,
    },
    respiratory_rate: 15.234,
    sleep_performance_percentage: 94,
    sleep_consistency_percentage: 88,
    sleep_efficiency_percentage: 93.75,
  },
};

export const nap: Sleep = {
  ...sleep,
  id: "0b2f6b1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b",
  start: "2026-10-13T11:00:00.000Z",
  end: "2026-10-13T11:30:00.000Z",
  nap: true,
};

export const workout: Workout = {
  id: "a8b2c3d4-e5f6-4789-abcd-ef0123456789",
  user_id: 10129,
  created_at: "2026-10-13T15:00:00.000Z",
  updated_at: "2026-10-13T15:00:00.000Z",
  start: "2026-10-13T14:00:00.000Z",
  end: "2026-10-13T14:45:30.000Z",
  timezone_offset: "+03:00",
  sport_name: "running",
  score_state: "SCORED",
  score: {
    strain: 11.87,
    average_heart_rate: 152,
    max_heart_rate: 178,
    kilojoule: 2500,
    percent_recorded: 100,
    distance_meter: 8123.4,
    altitude_gain_meter: 54.6,
    altitude_change_meter: 1.2,
    zone_durations: {
      zone_zero_milli: 0,
      zone_one_milli: 60_000,
      zone_two_milli: 600_000,
      zone_three_milli: 1_200_000,
      zone_four_milli: 810_000,
      zone_five_milli: 60_000,
    },
  },
};

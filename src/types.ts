// Response types for the WHOOP Developer API v2.
// Source: https://api.prod.whoop.com/developer/doc/openapi.json

export type ScoreState = "SCORED" | "PENDING_SCORE" | "UNSCORABLE";

export interface Paginated<T> {
  records: T[];
  next_token?: string | null;
}

export interface UserBasicProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface UserBodyMeasurement {
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate: number;
}

export interface CycleScore {
  strain: number;
  kilojoule: number;
  average_heart_rate: number;
  max_heart_rate: number;
}

export interface Cycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  /** Absent while the user is still in this cycle. */
  end?: string | null;
  timezone_offset: string;
  score_state: ScoreState;
  score?: CycleScore;
  step_count?: number | null;
}

export interface RecoveryScore {
  user_calibrating: boolean;
  recovery_score: number;
  resting_heart_rate: number;
  hrv_rmssd_milli: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
}

export interface Recovery {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: ScoreState;
  score?: RecoveryScore;
}

export interface SleepStageSummary {
  total_in_bed_time_milli: number;
  total_awake_time_milli: number;
  total_no_data_time_milli: number;
  total_light_sleep_time_milli: number;
  total_slow_wave_sleep_time_milli: number;
  total_rem_sleep_time_milli: number;
  sleep_cycle_count: number;
  disturbance_count: number;
}

export interface SleepNeeded {
  baseline_milli: number;
  need_from_sleep_debt_milli: number;
  need_from_recent_strain_milli: number;
  need_from_recent_nap_milli: number;
}

export interface SleepScore {
  stage_summary: SleepStageSummary;
  sleep_needed: SleepNeeded;
  respiratory_rate?: number;
  sleep_performance_percentage?: number;
  sleep_consistency_percentage?: number;
  sleep_efficiency_percentage?: number;
}

export interface Sleep {
  id: string;
  cycle_id: number;
  v1_id?: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: ScoreState;
  score?: SleepScore;
}

export interface ZoneDurations {
  zone_zero_milli?: number;
  zone_one_milli?: number;
  zone_two_milli?: number;
  zone_three_milli?: number;
  zone_four_milli?: number;
  zone_five_milli?: number;
}

export interface WorkoutScore {
  strain: number;
  average_heart_rate: number;
  max_heart_rate: number;
  kilojoule: number;
  percent_recorded: number;
  distance_meter?: number;
  altitude_gain_meter?: number;
  altitude_change_meter?: number;
  zone_durations: ZoneDurations;
}

export interface Workout {
  id: string;
  v1_id?: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string;
  sport_id?: number;
  score_state: ScoreState;
  score?: WorkoutScore;
}

# Tool reference

All tools are read-only (`readOnlyHint: true`, `destructiveHint: false`) and return JSON text. Values shown below are illustrative.

- [Conventions](#conventions)
- [`get_daily_overview`](#get_daily_overview) · [`get_trends`](#get_trends) · [`get_profile`](#get_profile)
- [`list_cycles`](#list_cycles) · [`get_cycle`](#get_cycle) · [`list_recoveries`](#list_recoveries)
- [`list_sleeps`](#list_sleeps) · [`get_sleep`](#get_sleep) · [`list_workouts`](#list_workouts) · [`get_workout`](#get_workout)

## Conventions

**WHOOP day (cycle).** WHOOP measures days as *physiological cycles*. A cycle starts when you fall asleep and ends when you next fall asleep. The `date` of a cycle is the day you woke up into: a cycle that starts at 23:30 on Oct 12 is **Oct 13**, matching the WHOOP app.

**Times.** Summaries show times in the timezone offset WHOOP recorded for that activity, e.g. `2026-10-13T07:30:00+03:00`.

**Units.** Summary field names carry their unit: `_h` hours, `_min` minutes, `_ms` milliseconds, `_pct` percent, `_bpm` beats per minute, `_kcal` kilocalories, `_km`, `_m`, `_c` (°C).

**Score states.** `score_state` is one of `SCORED`, `PENDING_SCORE` (WHOOP is still computing it; try again later) or `UNSCORABLE` (WHOOP won't score it). Score fields are omitted unless the state is `SCORED`.

**Ranges (all `list_*` tools).** Dates without a time are interpreted in the timezone of the computer running whoop-mcp.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `start` | string | none | `YYYY-MM-DD` (local midnight) or ISO 8601 date-time. Inclusive. |
| `end` | string | now | `YYYY-MM-DD` includes that whole day; a date-time is exclusive. |
| `days` | integer 1–365 | none | Look back this many days from now. Ignored when `start` is set. |
| `limit` | integer 1–200 | 25 | Maximum records. Pages of 25 are fetched automatically. |
| `next_token` | string | none | Continue from a previous response's `next_token`. |
| `raw` | boolean | `false` | Return WHOOP's original API objects instead of summaries. |

List responses look like `{ "records": [...], "next_token": "..." | null }`. Records are ordered most recent first.

---

## `get_daily_overview`

Everything for one WHOOP day: the cycle (strain, calories), recovery, the main sleep, naps and workouts.

| Parameter | Type | Default |
| --- | --- | --- |
| `date` | `YYYY-MM-DD` | the latest (current) day |

```json
{
  "date": "2026-10-13",
  "cycle": {
    "cycle_id": 93845, "date": "2026-10-13",
    "start": "2026-10-12T23:30:00+03:00", "end": "2026-10-13T23:00:00+03:00", "in_progress": false,
    "score_state": "SCORED", "strain": 12.3, "calories_kcal": 2390, "avg_hr_bpm": 68, "max_hr_bpm": 171, "steps": 9876
  },
  "recovery": {
    "cycle_id": 93845, "sleep_id": "ecfc6a15-4661-442f-a9a4-f160dd7afae8", "score_state": "SCORED",
    "recovery_pct": 72, "hrv_rmssd_ms": 61.2, "resting_hr_bpm": 52, "spo2_pct": 96.4, "skin_temp_c": 33.71, "calibrating": false
  },
  "sleep": {
    "sleep_id": "ecfc6a15-4661-442f-a9a4-f160dd7afae8", "cycle_id": 93845, "nap": false,
    "start": "2026-10-12T23:30:00+03:00", "end": "2026-10-13T07:30:00+03:00", "score_state": "SCORED",
    "performance_pct": 94, "efficiency_pct": 93.8, "consistency_pct": 88, "respiratory_rate": 15.2,
    "in_bed_h": 8, "asleep_h": 7.5, "light_h": 3.5, "deep_sws_h": 1.75, "rem_h": 2.25, "awake_h": 0.5,
    "disturbances": 9, "sleep_cycles": 4, "sleep_need_h": 8
  },
  "naps": [],
  "workouts": [
    {
      "workout_id": "a8b2c3d4-e5f6-4789-abcd-ef0123456789", "sport": "running",
      "start": "2026-10-13T17:00:00+03:00", "end": "2026-10-13T17:45:30+03:00", "duration_min": 45.5,
      "score_state": "SCORED", "strain": 11.9, "avg_hr_bpm": 152, "max_hr_bpm": 178, "calories_kcal": 598,
      "distance_km": 8.12, "altitude_gain_m": 55, "percent_recorded": 100,
      "hr_zone_minutes": { "zone0": 0, "zone1": 1, "zone2": 10, "zone3": 20, "zone4": 13.5, "zone5": 1 }
    }
  ]
}
```

`recovery` or `sleep` is `null` if WHOOP has none for that day yet. If there is no cycle for the date, the response is `{ "date": "...", "message": "No WHOOP cycle found for this day." }`.

## `get_trends`

A day-by-day table and summary statistics.

| Parameter | Type | Default |
| --- | --- | --- |
| `days` | integer 1–90 | 7 |

```json
{
  "period": { "days": 7, "from": "2026-10-07", "to": "2026-10-13" },
  "averages": {
    "recovery_pct": { "avg": 64.3, "min": 31, "max": 88, "days": 7 },
    "hrv_ms":       { "avg": 58.1, "min": 41.2, "max": 72.9, "days": 7 },
    "resting_hr_bpm": { "...": "..." }, "strain": { "...": "..." }, "calories_kcal": { "...": "..." },
    "asleep_h": { "...": "..." }, "sleep_performance_pct": { "...": "..." }, "respiratory_rate": { "...": "..." }
  },
  "recovery_zones": { "green": 3, "yellow": 3, "red": 1 },
  "total_workouts": 5,
  "days": [
    {
      "date": "2026-10-13", "recovery_pct": 72, "recovery_zone": "green", "hrv_ms": 61.2, "resting_hr_bpm": 52,
      "spo2_pct": 96.4, "skin_temp_c": 33.71, "strain": 12.3, "calories_kcal": 2390, "asleep_h": 7.5,
      "sleep_performance_pct": 94, "sleep_efficiency_pct": 93.8, "respiratory_rate": 15.2, "workouts": ["running"]
    }
  ]
}
```

- Recovery zones use WHOOP's bands: green ≥ 67, yellow 34–66, red ≤ 33.
- Today's cycle is marked `"in_progress": true` and is left out of the strain and calorie averages, because its totals are still growing.

## `get_profile`

No parameters. Returns the basic profile merged with body measurements:

```json
{ "user_id": 10129, "email": "sam@example.com", "first_name": "Sam", "last_name": "Doe",
  "height_meter": 1.8, "weight_kilogram": 75, "max_heart_rate": 190 }
```

## `list_cycles`

[Range parameters](#conventions). Each record has the same shape as `cycle` in [`get_daily_overview`](#get_daily_overview).

## `get_cycle`

| Parameter | Type |
| --- | --- |
| `cycle_id` | positive integer |
| `raw` | boolean, default `false` |

Returns `{ "cycle": {...}, "recovery": {...} | null, "sleep": {...} | null }`.

## `list_recoveries`

[Range parameters](#conventions). Each record has the same shape as `recovery` in [`get_daily_overview`](#get_daily_overview). SpO2 and skin temperature appear only for WHOOP 4.0 and newer devices. `calibrating: true` means WHOOP doesn't have enough history for an accurate score yet.

## `list_sleeps`

[Range parameters](#conventions), plus:

| Parameter | Type | Default |
| --- | --- | --- |
| `include_naps` | boolean | `true` |

Each record has the same shape as `sleep` in [`get_daily_overview`](#get_daily_overview). `asleep_h` is light + deep (slow-wave) + REM. `sleep_need_h` is WHOOP's total need: baseline + sleep debt + recent strain − recent naps.

## `get_sleep`

| Parameter | Type |
| --- | --- |
| `sleep_id` | UUID |
| `raw` | boolean, default `false` |

## `list_workouts`

[Range parameters](#conventions), plus:

| Parameter | Type | Notes |
| --- | --- | --- |
| `sport` | string | Case-insensitive substring match on the sport name, e.g. `"run"`. Applied to the fetched records, so raise `limit` or widen the range to search further back. |

Each record has the same shape as the items in `workouts` in [`get_daily_overview`](#get_daily_overview). `distance_km` and `altitude_gain_m` are present only when WHOOP has GPS data. `percent_recorded` is how much heart-rate data WHOOP received during the workout.

## `get_workout`

| Parameter | Type |
| --- | --- |
| `workout_id` | UUID |
| `raw` | boolean, default `false` |

## Errors

Tool failures come back as MCP tool errors (`isError: true`) with a plain-language message, for example:

- `Not connected to WHOOP. Run whoop-mcp auth to connect your account.`
- `WHOOP rejected the refresh token (400). Run whoop-mcp auth to reconnect your account.`
- `WHOOP denied access to /v2/activity/workout (403). The token may be missing a scope; run whoop-mcp auth again.`
- `Invalid start "last tuesday". Use YYYY-MM-DD or an ISO 8601 date-time.`
- `Invalid start "2026-02-30": no such date.`
- `WHOOP did not respond within 30s (/v2/cycle).`

import { WHOOP_API_BASE, WHOOP_MAX_PAGE_SIZE } from "./config.js";
import type {
  Cycle,
  Paginated,
  Recovery,
  Sleep,
  UserBasicProfile,
  UserBodyMeasurement,
  Workout,
} from "./types.js";

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  forceRefresh(staleToken: string): Promise<string>;
}

export class WhoopApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(describeError(status, path, body));
    this.name = "WhoopApiError";
  }
}

function describeError(status: number, path: string, body: string): string {
  switch (status) {
    case 401:
      return "WHOOP rejected the access token (401). Run `whoop-mcp auth` to reconnect your account.";
    case 403:
      return `WHOOP denied access to ${path} (403). The token may be missing a scope; run \`whoop-mcp auth\` again.`;
    case 404:
      return `Not found: ${path} (404).`;
    case 429:
      return "WHOOP rate limit reached (429). Try again in a minute.";
    default:
      return `WHOOP API error ${status} on ${path}: ${body.slice(0, 300)}`;
  }
}

export interface CollectionQuery {
  /** Inclusive ISO 8601 date-time. */
  start?: string;
  /** Exclusive ISO 8601 date-time. WHOOP defaults to now. */
  end?: string;
  /** Total records to return across pages. Defaults to one full page. */
  limit?: number;
  nextToken?: string;
}

export interface CollectionResult<T> {
  records: T[];
  /** Pass back as `nextToken` to continue; null when there is nothing more. */
  next_token: string | null;
}

export interface WhoopClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

type Query = Record<string, string | number | undefined>;

export class WhoopClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly tokens: AccessTokenProvider,
    opts: WhoopClientOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.baseUrl = opts.baseUrl ?? WHOOP_API_BASE;
    this.maxRetries = opts.maxRetries ?? 3;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  getProfile(): Promise<UserBasicProfile> {
    return this.get("/v2/user/profile/basic");
  }

  getBodyMeasurement(): Promise<UserBodyMeasurement> {
    return this.get("/v2/user/measurement/body");
  }

  listCycles(q: CollectionQuery = {}): Promise<CollectionResult<Cycle>> {
    return this.collection("/v2/cycle", q);
  }

  getCycle(cycleId: number): Promise<Cycle> {
    return this.get(`/v2/cycle/${cycleId}`);
  }

  getCycleRecovery(cycleId: number): Promise<Recovery> {
    return this.get(`/v2/cycle/${cycleId}/recovery`);
  }

  getCycleSleep(cycleId: number): Promise<Sleep> {
    return this.get(`/v2/cycle/${cycleId}/sleep`);
  }

  listRecoveries(q: CollectionQuery = {}): Promise<CollectionResult<Recovery>> {
    return this.collection("/v2/recovery", q);
  }

  listSleeps(q: CollectionQuery = {}): Promise<CollectionResult<Sleep>> {
    return this.collection("/v2/activity/sleep", q);
  }

  getSleep(sleepId: string): Promise<Sleep> {
    return this.get(`/v2/activity/sleep/${encodeURIComponent(sleepId)}`);
  }

  listWorkouts(q: CollectionQuery = {}): Promise<CollectionResult<Workout>> {
    return this.collection("/v2/activity/workout", q);
  }

  getWorkout(workoutId: string): Promise<Workout> {
    return this.get(`/v2/activity/workout/${encodeURIComponent(workoutId)}`);
  }

  /** Follows `next_token` until `limit` records are collected or the data runs out. */
  async collection<T>(path: string, q: CollectionQuery): Promise<CollectionResult<T>> {
    const want = q.limit ?? WHOOP_MAX_PAGE_SIZE;
    const records: T[] = [];
    let next = q.nextToken;
    do {
      const page = await this.get<Paginated<T>>(path, {
        limit: Math.min(WHOOP_MAX_PAGE_SIZE, want - records.length),
        start: q.start,
        end: q.end,
        nextToken: next,
      });
      records.push(...page.records);
      next = page.next_token || undefined;
    } while (next && records.length < want);
    return { records, next_token: next ?? null };
  }

  /**
   * The only HTTP primitive in this client. There is deliberately no
   * POST/PUT/PATCH/DELETE path, so the server cannot modify WHOOP data.
   */
  async get<T>(path: string, query: Query = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    let token = await this.tokens.getAccessToken();
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.status === 401 && !refreshed) {
        await res.body?.cancel();
        refreshed = true;
        token = await this.tokens.forceRefresh(token);
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        await res.body?.cancel();
        await this.sleep(retryDelayMs(res, attempt));
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new WhoopApiError(res.status, path, text);
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }
}

const MAX_RETRY_DELAY_MS = 30_000;

function retryDelayMs(res: Response, attempt: number): number {
  for (const header of ["retry-after", "x-ratelimit-reset"]) {
    const seconds = Number(res.headers.get(header));
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(500 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

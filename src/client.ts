import { REQUEST_TIMEOUT_MS, WHOOP_API_BASE, WHOOP_MAX_PAGE_SIZE } from "./config.js";
import type {
  Cycle,
  Paginated,
  Recovery,
  Sleep,
  UserBasicProfile,
  UserBodyMeasurement,
  Workout,
} from "./types.js";
import { errorName, sanitize, sleep } from "./util.js";

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  forceRefresh(staleToken: string): Promise<string>;
}

export class WhoopApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body: string,
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
      return `WHOOP API error ${status} on ${path}: ${sanitize(body, 300)}`;
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
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Cancels in-flight and pending requests, e.g. when the MCP client cancels a tool call. */
  signal?: AbortSignal;
}

type Query = Record<string, string | number | undefined>;

export class WhoopClient {
  private readonly fetchImpl: typeof fetch;
  private readonly base: URL;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly signal?: AbortSignal;

  constructor(
    private readonly tokens: AccessTokenProvider,
    private readonly opts: WhoopClientOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.base = new URL(opts.baseUrl ?? WHOOP_API_BASE);
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.sleep = opts.sleep ?? sleep;
    this.signal = opts.signal;
  }

  /** A view of this client whose requests are cancelled by `signal`. */
  withSignal(signal: AbortSignal | undefined): WhoopClient {
    return signal ? new WhoopClient(this.tokens, { ...this.opts, signal }) : this;
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
    // Bounded even if WHOOP returns empty pages that still carry a next_token.
    const maxPages = Math.ceil(want / WHOOP_MAX_PAGE_SIZE) + 1;
    const records: T[] = [];
    const seen = new Set<string>();
    let next = q.nextToken;
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<Paginated<T>>(path, {
        limit: Math.min(WHOOP_MAX_PAGE_SIZE, want - records.length),
        start: q.start,
        end: q.end,
        nextToken: next,
      });
      records.push(...(res.records ?? []));
      next = res.next_token || undefined;
      if (next && seen.has(next)) next = undefined; // a repeated token would loop forever
      if (!next || !res.records?.length || records.length >= want) break;
      seen.add(next);
    }
    return { records: records.slice(0, want), next_token: next ?? null };
  }

  /**
   * The only HTTP primitive in this client. There is deliberately no
   * POST/PUT/PATCH/DELETE path, so the server cannot modify WHOOP data.
   */
  async get<T>(path: string, query: Query = {}): Promise<T> {
    const url = new URL(this.base.pathname.replace(/\/$/, "") + path, this.base);
    assertReadOnlyEndpoint(url, this.base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    let token = await this.tokens.getAccessToken();
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      this.signal?.throwIfAborted();
      const canRetry = attempt < this.maxRetries;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: this.requestSignal(),
        });
      } catch (err) {
        if (this.signal?.aborted) throw err;
        // Timeouts and network failures are worth another try; give up with a clear message.
        if (canRetry) {
          await this.sleep(backoffMs(attempt));
          continue;
        }
        throw new Error(
          errorName(err) === "TimeoutError"
            ? `WHOOP did not respond within ${this.timeoutMs / 1000}s (${path}).`
            : `Could not reach WHOOP (${path}): ${sanitize((err as Error).message)}`,
        );
      }
      if (res.status === 401 && !refreshed) {
        await res.body?.cancel();
        refreshed = true;
        token = await this.tokens.forceRefresh(token);
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && canRetry) {
        await res.body?.cancel();
        await this.sleep(retryDelayMs(res, attempt));
        continue;
      }
      let text: string;
      try {
        text = await res.text();
      } catch (err) {
        if (this.signal?.aborted) throw err;
        if (canRetry) continue;
        throw new Error(`WHOOP stopped responding while sending ${path}. Try again.`);
      }
      if (!res.ok) throw new WhoopApiError(res.status, path, text);
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`WHOOP returned an unexpected (non-JSON) response for ${path}.`);
      }
    }
  }

  private requestSignal(): AbortSignal {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    return this.signal ? AbortSignal.any([timeout, this.signal]) : timeout;
  }
}

/** Defence in depth for the read-only guarantee: only v2 read endpoints on the WHOOP API host. */
function assertReadOnlyEndpoint(url: URL, base: URL): void {
  const prefix = `${base.pathname.replace(/\/$/, "")}/v2/`;
  if (url.origin !== base.origin || !url.pathname.startsWith(prefix) || url.pathname.startsWith(`${prefix}user/access`)) {
    throw new Error(`Refusing to request ${url.pathname}: not a read-only WHOOP endpoint.`);
  }
}

const MAX_RETRY_DELAY_MS = 30_000;

function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function retryDelayMs(res: Response, attempt: number): number {
  for (const header of ["retry-after", "x-ratelimit-reset"]) {
    const seconds = Number(res.headers.get(header));
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }
  return backoffMs(attempt);
}

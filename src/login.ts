import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createInterface } from "node:readline/promises";
import { requestToken, toStoredCredentials, type StoredCredentials, type TokenStore } from "./auth.js";
import { WHOOP_AUTH_URL, WHOOP_SCOPES } from "./config.js";

export interface LoginOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  store: TokenStore;
  fetch?: typeof fetch;
  openBrowser?: boolean;
  timeoutMs?: number;
  log?: (message: string) => void;
  /** Receives the authorization URL; tests use it to play the browser. */
  onAuthorizeUrl?: (url: string) => void;
}

const STATE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** WHOOP requires a client-generated state to be exactly 8 characters. */
export function generateState(): string {
  return Array.from(randomBytes(8), (b) => STATE_ALPHABET[b % STATE_ALPHABET.length]).join("");
}

export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL(WHOOP_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", WHOOP_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

/** Runs the OAuth authorization-code flow and saves the resulting tokens. */
export async function login(opts: LoginOptions): Promise<StoredCredentials> {
  const log = opts.log ?? ((m: string) => console.error(m));
  const redirect = new URL(opts.redirectUri);
  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl(opts.clientId, opts.redirectUri, state);

  let code: string;
  if (isLoopback(redirect)) {
    const pending = waitForCallback(redirect, state, opts.timeoutMs ?? 5 * 60_000);
    await pending.listening;
    log(`Opening your browser to authorize WHOOP access. If it doesn't open, visit:\n\n  ${authorizeUrl}\n`);
    opts.onAuthorizeUrl?.(authorizeUrl);
    if (opts.openBrowser !== false) openInBrowser(authorizeUrl);
    code = await pending.code;
  } else {
    // A non-local redirect can't be captured here, so the user pastes the URL they land on.
    log(`Open this URL, approve access, then copy the full URL you are redirected to:\n\n  ${authorizeUrl}\n`);
    opts.onAuthorizeUrl?.(authorizeUrl);
    if (opts.openBrowser !== false) openInBrowser(authorizeUrl);
    code = codeFromRedirect(await promptLine("Paste the redirected URL: "), state);
  }

  const token = await requestToken(
    {
      grant_type: "authorization_code",
      code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
    },
    opts.fetch,
  );
  const creds = toStoredCredentials(token, { clientId: opts.clientId, clientSecret: opts.clientSecret }, Date.now());
  await opts.store.save(creds);
  return creds;
}

function isLoopback(url: URL): boolean {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function codeFromRedirect(redirectedUrl: string, expectedState: string): string {
  const params = new URL(redirectedUrl.trim()).searchParams;
  const error = params.get("error");
  if (error) {
    const description = params.get("error_description");
    throw new Error(`WHOOP authorization failed: ${error}${description ? ` (${description})` : ""}`);
  }
  if (params.get("state") !== expectedState) {
    throw new Error("OAuth state mismatch. Start `whoop-mcp auth` again and use the newest browser tab.");
  }
  const code = params.get("code");
  if (!code) throw new Error("The redirect URL has no authorization code.");
  return code;
}

function waitForCallback(
  redirect: URL,
  state: string,
  timeoutMs: number,
): { listening: Promise<void>; code: Promise<string> } {
  const port = Number(redirect.port || 80);
  // Bind to loopback only. "localhost" may resolve to IPv4 or IPv6, so listen on both.
  const hosts = redirect.hostname === "localhost" ? ["127.0.0.1", "::1"] : [redirect.hostname.replace(/^\[|\]$/g, "")];
  const servers: Server[] = [];
  let timer: NodeJS.Timeout | undefined;
  const close = () => {
    clearTimeout(timer);
    for (const s of servers) s.close();
  };

  const code = new Promise<string>((resolve, reject) => {
    const handler = (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", redirect);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }
      try {
        const result = codeFromRedirect(url.toString(), state);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", Connection: "close" });
        res.end(page("WHOOP connected", "You can close this tab and return to your terminal."));
        close();
        resolve(result);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8", Connection: "close" });
        res.end(page("WHOOP authorization failed", (err as Error).message));
        close();
        reject(err);
      }
    };
    servers.push(...hosts.map(() => createServer(handler)));
    timer = setTimeout(() => {
      close();
      reject(new Error("Timed out waiting for the WHOOP authorization callback."));
    }, timeoutMs);
  });

  const listening = Promise.allSettled(
    servers.map(
      (server, i) =>
        new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(port, hosts[i], () => resolve());
        }),
    ),
  ).then((results) => {
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason as NodeJS.ErrnoException);
    // Tolerate a missing address family (e.g. IPv6 disabled), but not a port taken by another program.
    const fatal = errors.find((e) => e.code !== "EADDRNOTAVAIL" && e.code !== "EAFNOSUPPORT");
    if (fatal || errors.length === servers.length) {
      close();
      const reason = fatal ?? errors[0];
      throw new Error(
        reason.code === "EADDRINUSE"
          ? `Port ${port} is in use. Free it or set WHOOP_REDIRECT_URI to another port (and register it in the WHOOP dashboard).`
          : `Could not start the callback server on ${redirect.host}: ${reason.message}`,
      );
    }
  });
  // The caller stops awaiting `code` if listening fails; avoid an unhandled rejection.
  code.catch(() => {});
  return { listening, code };
}

function page(title: string, message: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>${esc(title)}</h1><p>${esc(message)}</p></body>`;
}

function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The URL is already printed; opening the browser is best-effort.
  }
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

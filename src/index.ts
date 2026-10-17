#!/usr/bin/env node
import { createRequire } from "node:module";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TokenManager, TokenStore } from "./auth.js";
import { WhoopClient } from "./client.js";
import { DEFAULT_REDIRECT_URI, tokenPath } from "./config.js";
import { login } from "./login.js";
import { promptLine, promptSecret } from "./prompt.js";
import { createServer } from "./server.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const USAGE = `whoop-mcp ${version}: read-only MCP server for your WHOOP data

Usage:
  whoop-mcp           Start the MCP server on stdio (what your MCP client runs)
  whoop-mcp auth      Connect your WHOOP account (opens your browser)
  whoop-mcp status    Check the stored connection
  whoop-mcp logout    Delete the locally stored tokens

Environment:
  WHOOP_CLIENT_ID       Client ID of your app at developer-dashboard.whoop.com (auth asks if unset)
  WHOOP_CLIENT_SECRET   Client secret of that app (auth asks, without echoing, if unset)
  WHOOP_REDIRECT_URI    Redirect URI registered on the app (default: ${DEFAULT_REDIRECT_URI})
  WHOOP_TOKEN_PATH      Token file (default: ~/.config/whoop-mcp/tokens.json)
`;

const env = process.env;

function tokenManager(store: TokenStore): TokenManager {
  return new TokenManager(store, {
    clientId: env.WHOOP_CLIENT_ID || undefined,
    clientSecret: env.WHOOP_CLIENT_SECRET || undefined,
  });
}

async function serve(store: TokenStore): Promise<void> {
  const server = createServer(new WhoopClient(tokenManager(store)), version);
  await server.connect(new StdioServerTransport());
  // stdout carries the MCP protocol, so diagnostics go to stderr.
  console.error(`whoop-mcp ${version} running on stdio (tokens: ${store.path})`);
}

async function auth(store: TokenStore): Promise<void> {
  const redirectUri = env.WHOOP_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  // Re-running auth can reuse the client credentials saved last time.
  const saved = await store.load().catch(() => null);
  let clientId = env.WHOOP_CLIENT_ID || saved?.client_id;
  let clientSecret = env.WHOOP_CLIENT_SECRET || saved?.client_secret;
  if ((!clientId || !clientSecret) && process.stdin.isTTY) {
    console.log(
      `You need a WHOOP developer app: https://developer-dashboard.whoop.com/apps/create\n` +
        `Enable all read:* scopes and add the redirect URI ${redirectUri}\n`,
    );
    clientId ||= await promptLine("Client ID: ");
    clientSecret ||= await promptSecret("Client Secret (hidden): ");
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET first. Create an app at https://developer-dashboard.whoop.com " +
        `with redirect URI ${redirectUri}. See the README for details.`,
    );
  }
  await login({
    clientId,
    clientSecret,
    redirectUri,
    store,
    log: (m) => console.log(m),
  });
  const profile = await new WhoopClient(new TokenManager(store)).getProfile();
  console.log(`Connected as ${profile.first_name} ${profile.last_name}. Tokens saved to ${store.path}`);
}

async function status(store: TokenStore): Promise<void> {
  const creds = await store.load();
  if (!creds) {
    console.log(`Not connected (no tokens at ${store.path}). Run: whoop-mcp auth`);
    process.exitCode = 1;
    return;
  }
  console.log(`Token file:   ${store.path}`);
  console.log(`Scopes:       ${creds.scope ?? "(unknown)"}`);
  console.log(`Access token: expires ${new Date(creds.expires_at).toISOString()} (refreshed automatically)`);
  const profile = await new WhoopClient(tokenManager(store)).getProfile();
  console.log(`Connected as ${profile.first_name} ${profile.last_name}`);
}

async function logout(store: TokenStore): Promise<void> {
  const removed = await store.clear();
  console.log(removed ? `Deleted ${store.path}.` : `No tokens stored at ${store.path}.`);
}

async function main(argv: string[]): Promise<void> {
  const store = new TokenStore(tokenPath());
  const command = argv[0] ?? "serve";
  switch (command) {
    case "serve":
      return serve(store);
    case "auth":
    case "login":
      return auth(store);
    case "status":
      return status(store);
    case "logout":
      return logout(store);
    case "-v":
    case "--version":
      console.log(version);
      return;
    case "-h":
    case "--help":
    case "help":
      console.log(USAGE);
      return;
    default:
      console.error(`Unknown command: ${command}\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

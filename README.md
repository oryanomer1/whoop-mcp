# whoop-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server for your [WHOOP](https://www.whoop.com) data. Connect it to Claude (or any MCP client) and ask questions like:

- *"How did I sleep last night, and why is my recovery low today?"*
- *"Compare my HRV and resting heart rate over the last 30 days."*
- *"How many runs did I do this month, and what was my average strain?"*
- *"Do I recover worse after days with strain above 15?"*

It talks directly to the official [WHOOP Developer API v2](https://developer.whoop.com/api) using your own WHOOP developer app, and your tokens never leave your machine.

## Read-only by design

- The OAuth flow requests only `read:*` scopes, plus `offline`, which WHOOP requires before it issues a refresh token.
- The API client has a single `GET` method. There is no code path for `POST`/`PUT`/`PATCH`/`DELETE` against your data, and a test enforces this.
- Every tool is annotated `readOnlyHint: true`, so MCP clients know they can't change anything.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_daily_overview` | One day's recovery, sleep, naps, strain, calories and workouts (defaults to today) |
| `get_trends` | Day-by-day table plus avg/min/max for recovery, HRV, RHR, strain, sleep and more over 1–90 days |
| `get_profile` | Name, email, height, weight, max heart rate |
| `list_cycles` / `get_cycle` | Physiological days: strain, calories, average/max heart rate, steps |
| `list_recoveries` | Recovery %, HRV (RMSSD), resting heart rate, SpO2, skin temperature |
| `list_sleeps` / `get_sleep` | Sleep performance, efficiency, consistency, stages, disturbances, respiratory rate, sleep need |
| `list_workouts` / `get_workout` | Sport, duration, strain, heart rate, calories, distance, heart-rate zones (filterable by sport) |

List tools accept `start` / `end` (`YYYY-MM-DD` or ISO date-time), a `days` shortcut, `limit` (up to 200, with automatic pagination) and `next_token`. They return compact summaries in friendly units (hours, km, kcal, local times); pass `raw: true` to get WHOOP's original objects instead.

## Setup

You need Node.js 20+ and a WHOOP membership.

### 1. Create a WHOOP developer app

1. Go to the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com) and create a team if prompted.
2. [Create an app](https://developer-dashboard.whoop.com/apps/create):
   - **Scopes:** select all the `read:*` scopes (recovery, cycles, workout, sleep, profile, body measurement).
   - **Redirect URI:** `http://localhost:8787/callback`
3. Copy the **Client ID** and **Client Secret**.

### 2. Install

Nothing to install: the commands below run it straight from GitHub with `npx`. If you'd rather have a local copy, clone and build it, then use `node /absolute/path/to/whoop-mcp/dist/index.js` wherever this README says `npx -y github:oryanomer1/whoop-mcp`:

```bash
git clone https://github.com/oryanomer1/whoop-mcp.git
cd whoop-mcp
npm install   # also builds dist/
```

### 3. Connect your WHOOP account

```bash
WHOOP_CLIENT_ID=your-client-id WHOOP_CLIENT_SECRET=your-client-secret npx -y github:oryanomer1/whoop-mcp auth
```

Your browser opens the WHOOP login page. After you approve, tokens are saved to `~/.config/whoop-mcp/tokens.json` (permissions `0600`) and refreshed automatically from then on. Check the connection at any time:

```bash
npx -y github:oryanomer1/whoop-mcp status
```

### 4. Add it to your MCP client

**Claude Code**

```bash
claude mcp add whoop --scope user -- npx -y github:oryanomer1/whoop-mcp
```

**Claude Desktop**: edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "whoop": {
      "command": "npx",
      "args": ["-y", "github:oryanomer1/whoop-mcp"]
    }
  }
}
```

**Cursor, VS Code, and other clients**: run `npx -y github:oryanomer1/whoop-mcp` as a stdio server.

No environment variables are needed in the client config: the client ID and secret are saved with your tokens during `auth`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WHOOP_CLIENT_ID` | from token file | Your app's client ID (required for the first `auth`) |
| `WHOOP_CLIENT_SECRET` | from token file | Your app's client secret (required for the first `auth`) |
| `WHOOP_REDIRECT_URI` | `http://localhost:8787/callback` | Must exactly match a redirect URI registered on your app |
| `WHOOP_TOKEN_PATH` | `~/.config/whoop-mcp/tokens.json` | Where credentials are stored (honours `XDG_CONFIG_HOME`) |

If port 8787 is taken, register a different localhost URI on your app (e.g. `http://localhost:9876/callback`) and set `WHOOP_REDIRECT_URI` to match. If you set a non-localhost redirect URI, `auth` asks you to paste the URL you were redirected to.

### CLI

```text
whoop-mcp           Start the MCP server on stdio (what your MCP client runs)
whoop-mcp auth      Connect your WHOOP account (opens your browser)
whoop-mcp status    Check the stored connection
whoop-mcp logout    Delete the locally stored tokens
```

## How authentication works

- WHOOP access tokens last one hour. The server refreshes them about a minute before they expire, and again if WHOOP ever returns a 401.
- WHOOP replaces the refresh token on every refresh and rejects concurrent refreshes. The server sends refreshes one at a time and writes the new tokens to disk atomically. It also re-reads the token file before each refresh, so several clients (e.g. Claude Desktop and Claude Code) can share one token file.
- Rate-limited (429) and 5xx responses are retried with backoff, honouring `Retry-After`.
- If the refresh token is ever rejected, tools return an error asking you to run `whoop-mcp auth` again.

Your client secret and tokens are stored only in the local token file and sent only to `api.prod.whoop.com`. Run `whoop-mcp logout` to delete them. To fully revoke access, delete the app or rotate its secret in the WHOOP Developer Dashboard.

## Development

```bash
npm install
npm test            # unit + MCP integration tests (no network)
npm run typecheck
npm run build
npm run inspect     # open the MCP Inspector against dist/
```

Source layout:

- `src/index.ts`: CLI entry point (`serve`, `auth`, `status`, `logout`)
- `src/server.ts`: MCP tool definitions
- `src/client.ts`: read-only WHOOP API client (pagination, retries, 401 refresh)
- `src/auth.ts`: token storage and refresh
- `src/login.ts`: OAuth authorization-code flow with a loopback callback
- `src/insights.ts`: daily overview and trend aggregation
- `src/format.ts`: compact summaries and unit conversions

## Disclaimer

This is an unofficial project, not affiliated with or endorsed by WHOOP, Inc. WHOOP data is not medical advice.

## License

[MIT](LICENSE)

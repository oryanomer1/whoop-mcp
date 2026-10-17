# WHOOP plugin for Claude Code (read-only)

Ask Claude about your WHOOP recovery, HRV, sleep, strain, workouts and multi-day trends. The plugin starts the [whoop-mcp](https://github.com/oryanomer1/whoop-mcp) server (`@oryanomer/whoop-mcp` on npm) and adds a `/whoop:auth` skill for the one-time sign-in. It is read-only by design: it requests only WHOOP's `read:*` scopes and can never change your data.

## Install

```text
/plugin marketplace add oryanomer1/whoop-mcp
/plugin install whoop@whoop-mcp
```

## Connect your WHOOP account (once)

1. Create a WHOOP developer app at https://developer-dashboard.whoop.com/apps/create with all `read:*` scopes and the redirect URI `http://localhost:8787/callback`.
2. In a terminal, run `npx -y @oryanomer/whoop-mcp auth`, paste the Client ID and Client Secret, and approve access in your browser.

Or run `/whoop:auth` and Claude will walk you through it. Then ask: *"Give me my WHOOP overview for today."*

## Tools

`get_daily_overview`, `get_trends`, `get_profile`, `list_cycles`, `get_cycle`, `list_recoveries`, `list_sleeps`, `get_sleep`, `list_workouts`, `get_workout`. See the [tool reference](https://github.com/oryanomer1/whoop-mcp/blob/main/docs/tools.md).

## Privacy and terms

Tokens stay on your computer, and data is fetched only from WHOOP's official API. Read the [Privacy Policy](https://github.com/oryanomer1/whoop-mcp/blob/main/PRIVACY.md) and [Terms of Use (EULA)](https://github.com/oryanomer1/whoop-mcp/blob/main/EULA.md). Unofficial; not affiliated with WHOOP, Inc. Not medical advice. MIT licensed.

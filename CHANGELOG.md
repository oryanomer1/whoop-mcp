# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.3] - 2026-10-17

### Added

- [Terms of Use (EULA)](EULA.md), linked from the README, Privacy Policy, CONTRIBUTING.md and the Claude Desktop / Smithery bundle.

## [1.0.2] - 2026-10-17

### Added

- [Privacy Policy](PRIVACY.md), linked from the README, SECURITY.md and the Claude Desktop / Smithery bundle.

## [1.0.1] - 2026-10-17

### Changed

- The release workflow can be re-run safely: it skips npm, MCP Registry and GitHub release steps that already completed, and waits for npm to serve a new version before registering it in the MCP Registry.
- First release listed in the MCP Registry and on GitHub Releases (1.0.0 was published to npm only). No changes to the server itself.

## [1.0.0] - 2026-10-17

First generally available release, published to npm as `@oryanomer/whoop-mcp`.

### Added

- Ten read-only MCP tools over the WHOOP Developer API v2: `get_daily_overview`, `get_trends`, `get_profile`, `list_cycles`, `get_cycle`, `list_recoveries`, `list_sleeps`, `get_sleep`, `list_workouts`, `get_workout`.
- Compact summaries in friendly units and local times, with `raw: true` for WHOOP's original objects.
- `whoop-mcp auth`, `status` and `logout` commands, using an OAuth authorization-code flow with a loopback callback (or paste-the-URL for non-local redirect URIs).
- A one-click `.mcpb` bundle for Claude Desktop (and Smithery), attached to each GitHub release; a Dockerfile for container use and directory checks.
- `auth` asks for the client ID and secret interactively (the secret is not echoed), or reads `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET`.
- Automatic token refresh that handles WHOOP's rotating refresh tokens safely: single-flight within a process, a lock file across processes, atomic writes, and in-memory fallback if a write fails.
- Automatic, bounded pagination, plus retries for rate limits (429, honouring `Retry-After`), server errors, timeouts and network errors. Requests time out after 30s and stop when the client cancels the tool call.
- Defence in depth for read-only access: a runtime endpoint allow-list, in addition to the GET-only client and read-only scopes.
- Hardened OAuth callback: forged or stale callbacks are refused without aborting the login, and malformed requests are handled.
- Unit, MCP integration, end-to-end (subprocess) and packaging tests, with coverage thresholds; CI on Linux, macOS and Windows with Node 20, 22 and 24.

[1.0.3]: https://github.com/oryanomer1/whoop-mcp/releases/tag/v1.0.3
[1.0.2]: https://github.com/oryanomer1/whoop-mcp/releases/tag/v1.0.2
[1.0.1]: https://github.com/oryanomer1/whoop-mcp/releases/tag/v1.0.1
[1.0.0]: https://www.npmjs.com/package/@oryanomer/whoop-mcp/v/1.0.0

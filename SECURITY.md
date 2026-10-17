# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through [GitHub private vulnerability reporting](https://github.com/oryanomer1/whoop-mcp/security/advisories/new). You'll get an acknowledgement within a few days, and a fix or mitigation plan once the report is confirmed.

## Supported versions

Security fixes are released for the latest `1.x` version.

## Security model

whoop-mcp runs locally, on behalf of one person, against their own WHOOP account.

| Asset | Protection |
| --- | --- |
| Your WHOOP data | Only `read:*` OAuth scopes (plus `offline` for refresh) are requested. The API client can only send `GET`. At runtime it refuses any URL that isn't a `/developer/v2/` endpoint on `api.prod.whoop.com`, and always refuses the access-revocation endpoint. A test fails the build if any other HTTP method appears outside the OAuth token exchange. Every tool is annotated `readOnlyHint: true`. |
| Access/refresh tokens and client secret | Stored in one JSON file (default `~/.config/whoop-mcp/tokens.json`), mode `0600`, in a directory created with mode `0700`. Writes go to a randomly named temp file opened with exclusive create (never through a pre-existing file or symlink), are fsynced, then atomically renamed. A lock file serializes refreshes across processes. It carries a random owner token, so a process only removes its own lock, and a heartbeat, so a crashed process's lock is reclaimed after 20s. `auth` writes under the same lock. If the file can't be written, refreshed tokens are kept in memory instead of being lost. Secrets are sent only to `api.prod.whoop.com` over HTTPS, the token request refuses redirects, and secrets are never logged or included in tool output. A corrupt token file is reported without echoing its contents. |
| OAuth login | Authorization-code flow with a random 8-character `state` (WHOOP's required length), checked before anything else in the callback. The callback server binds to loopback only, answers only `GET` on the callback path, refuses callbacks with the wrong `state` while it keeps waiting for the real one (so a web page can't abort or hijack the login), survives malformed requests, HTML-escapes what it echoes, and shuts down after success or a 5-minute timeout. The client secret can be entered at a hidden prompt, so it stays out of shell history. |
| MCP protocol stream | stdout carries only JSON-RPC. Diagnostics go to stderr. Text that came from WHOOP has control characters stripped before it reaches a terminal or tool result. |
| Tool inputs | Validated with zod: ids must be integers or UUIDs and are URL-encoded, dates are parsed strictly (`2026-02-30` is rejected, not rolled over), and `limit` (≤ 200) and `days` (≤ 365, or ≤ 90 for trends) bound the work per call. Pagination is capped and stops on empty pages or repeated tokens. Every request has a 30s timeout and is cancelled when the MCP client cancels the call. |
| Release pipeline | npm packages are published from GitHub Actions with provenance. Tests run in a separate job without publishing permissions. The publishing job installs dependencies with `--ignore-scripts` and no cache, pins npm to an exact version, and verifies the MCP Registry publisher against a pinned SHA-256. Actions are pinned to commit SHAs. The tarball contains only `dist/`, README, LICENSE and package.json, which a test enforces. |

### What whoop-mcp cannot protect

- **Your MCP client and model provider.** Data returned by a tool is passed to the language model your client uses. Choose a client and provider you trust with health data.
- **Your local account.** Anyone who can read files as your OS user can read the token file. Use `whoop-mcp logout` to delete it, and delete the app or rotate its secret in the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com) to revoke access completely.

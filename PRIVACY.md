# Privacy Policy

**Effective date:** October 17, 2026

This policy explains how **whoop-mcp** (the open-source software at [github.com/oryanomer1/whoop-mcp](https://github.com/oryanomer1/whoop-mcp), published on npm as `@oryanomer/whoop-mcp`) handles your information. whoop-mcp is maintained by Oryan Omer as an independent project. It is not affiliated with or endorsed by WHOOP, Inc.

## Summary

- whoop-mcp runs **on your own computer**. There is no whoop-mcp server, account, website backend or database.
- It **reads** your WHOOP data from WHOOP's official API and hands it to the MCP client you connect it to (for example Claude Desktop, Claude Code, Cursor or VS Code). It **cannot change** your WHOOP data.
- It sends **no telemetry, analytics, crash reports or usage data** to the maintainer or anyone else.
- The only network service it contacts is WHOOP's API at `api.prod.whoop.com`.

## What whoop-mcp accesses

When you connect your account with `whoop-mcp auth`, you authorize your own WHOOP developer app to read the following through WHOOP's OAuth scopes (`read:profile`, `read:body_measurement`, `read:cycles`, `read:recovery`, `read:sleep`, `read:workout`, plus `offline` so the connection stays active):

- **Profile:** name and email address on your WHOOP account.
- **Body measurements:** height, weight and maximum heart rate.
- **Physiological cycles:** day strain, energy expenditure, heart rate and step counts.
- **Recovery:** recovery score, heart-rate variability, resting heart rate, blood-oxygen saturation (SpO2) and skin temperature.
- **Sleep:** sleep and nap times, stages, performance, efficiency, consistency, respiratory rate and sleep need.
- **Workouts:** sport, duration, strain, heart rate, energy expenditure, distance, altitude and heart-rate zones.

This is health and fitness information. whoop-mcp only fetches it when your MCP client calls one of its tools, typically because you asked a question.

## What is stored, and where

| Data | Where | How long |
| --- | --- | --- |
| Your WHOOP app's client ID and client secret, and the OAuth access and refresh tokens | One file on your computer, by default `~/.config/whoop-mcp/tokens.json`, readable only by your user account | Until you run `whoop-mcp logout` or delete the file |
| Your WHOOP health and fitness data | Nowhere. It is held in memory only while a request is being answered, then returned to your MCP client | Not stored by whoop-mcp |

whoop-mcp does not write your WHOOP data to disk, and its diagnostic messages (written to your MCP client's log) never include your health data, tokens or client secret.

## Who receives your data

- **WHOOP.** whoop-mcp sends your OAuth tokens and app credentials only to WHOOP, to authenticate and to request your data. WHOOP's handling of your data is governed by the [WHOOP Privacy Policy](https://www.whoop.com/privacy/full-privacy-policy/).
- **Your MCP client and its AI model provider.** Tool results are returned to the MCP client you choose. Most clients send them to a large language model to answer your question, so your WHOOP data is then processed under that client's and model provider's privacy policies. Choose a client and provider you are comfortable sharing health data with.
- **No one else.** The maintainer does not receive, see or store any of your data. whoop-mcp does not sell, share or use your data for advertising, profiling or training.

Directories where whoop-mcp is listed (such as npm, GitHub, the MCP Registry, Smithery and Glama) distribute the software. They do not receive your WHOOP data from whoop-mcp when it runs on your computer. If you run whoop-mcp through a hosted or remote service instead of locally, that service's privacy policy applies to the data it handles.

## Your choices and control

- **Disconnect:** run `whoop-mcp logout` to delete the stored tokens and credentials from your computer.
- **Revoke access completely:** delete your developer app, or rotate its secret, in the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com).
- **Uninstall:** remove whoop-mcp from your MCP client's configuration and delete `~/.config/whoop-mcp/`.

Because the maintainer holds none of your data, requests to access, correct or delete it should go to WHOOP, your MCP client or your AI model provider, as applicable.

## Security

Credentials are stored with owner-only file permissions and are sent only over HTTPS to WHOOP. The software is read-only by design and is checked by automated tests. See [SECURITY.md](SECURITY.md) for the full security model and how to report a vulnerability privately.

## Children

whoop-mcp is a developer tool and is not directed at children. It should only be used with a WHOOP account you are entitled to use under WHOOP's terms.

## Not medical advice

whoop-mcp and the answers your AI assistant gives from your WHOOP data are not medical advice and are not a medical device.

## Changes to this policy

Changes are published in this file in the project's GitHub repository, and the effective date above is updated. The full history of changes is visible in the repository's commit history.

## Contact

Questions about this policy: open an issue at [github.com/oryanomer1/whoop-mcp/issues](https://github.com/oryanomer1/whoop-mcp/issues) or email **oryandrive@gmail.com**. Report security issues privately through [GitHub security advisories](https://github.com/oryanomer1/whoop-mcp/security/advisories/new).

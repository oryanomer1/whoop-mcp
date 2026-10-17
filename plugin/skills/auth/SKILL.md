---
name: auth
description: Connect or reconnect the user's WHOOP account for the whoop plugin. Use when a WHOOP tool returns "Not connected to WHOOP" or "rejected the refresh token", or when the user asks to set up, connect, check or disconnect WHOOP.
---

# Connect WHOOP

The whoop plugin's tools need a one-time sign-in. The sign-in asks for a secret and opens a browser, so **the user must run it in their own terminal**. Never run `auth` yourself, and never ask the user to paste their client secret into the chat.

1. **Check the current state** by running:

   ```bash
   npx -y @oryanomer/whoop-mcp@1.0.3 status
   ```

   If it prints `Connected as …`, the plugin is ready and nothing else is needed.

2. **If not connected**, ask the user to:
   - Create a WHOOP developer app at https://developer-dashboard.whoop.com/apps/create with all `read:*` scopes and the redirect URI `http://localhost:8787/callback` (exactly as written).
   - Run this in a separate terminal window, paste the app's Client ID and Client Secret when asked (the secret is not echoed), and approve access in the browser:

     ```bash
     npx -y @oryanomer/whoop-mcp@1.0.3 auth
     ```

3. **Common problems:**
   - WHOOP shows `400 Request Header Or Cookie Too Large`: open the link that `auth` prints in a private/incognito window.
   - `Port 8787 is in use`: another `auth` is still waiting; finish or close it, or wait 5 minutes for it to time out.
   - WHOOP reports a redirect URI error: the app's redirect URI must match `http://localhost:8787/callback` exactly.

4. **After it prints `Connected as …`**, retry the WHOOP question. No restart is needed: the server reads the new tokens on its next call.

To disconnect, the user can run `npx -y @oryanomer/whoop-mcp@1.0.3 logout`. Everything is read-only; see the [Privacy Policy](https://github.com/oryanomer1/whoop-mcp/blob/main/PRIVACY.md) and [Terms of Use](https://github.com/oryanomer1/whoop-mcp/blob/main/EULA.md).

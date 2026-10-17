// Live end-to-end check against your own WHOOP account (read-only).
// Run after `whoop-mcp auth`:  npm run smoke:live
// Prints only tool names, pass/fail and record counts — never your health data.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TokenManager, TokenStore } from "../dist/auth.js";
import { WhoopClient } from "../dist/client.js";
import { tokenPath } from "../dist/config.js";
import { createServer } from "../dist/server.js";

const store = new TokenStore(tokenPath());
const tokens = new TokenManager(store);
let failed = 0;

// 1. Force one refresh: proves refresh-token rotation and that access keeps every read scope.
const before = await store.load();
if (!before) {
  console.error(`No tokens at ${store.path}. Run \`whoop-mcp auth\` first.`);
  process.exit(1);
}
await tokens.forceRefresh(await tokens.getAccessToken());
const after = await store.load();
const rotated = after.access_token !== before.access_token && after.refresh_token !== before.refresh_token;
console.log(`${rotated ? "✓" : "✗"} token refresh: ${rotated ? "rotated and saved" : "tokens did not change"}`);
console.log(`  granted scopes: ${after.scope ?? "(not reported)"}`);
if (!rotated) failed++;

// 2. Call every tool through a real MCP client.
const server = createServer(new WhoopClient(tokens), "live-smoke");
const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
await server.connect(serverSide);
const client = new Client({ name: "live-smoke", version: "1.0.0" });
await client.connect(clientSide);

async function check(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  if (res.isError) {
    failed++;
    console.log(`✗ ${name}: ${text}`);
    return undefined;
  }
  const data = JSON.parse(text);
  const shape = Array.isArray(data.records)
    ? `${data.records.length} records`
    : Array.isArray(data.days)
      ? `${data.days.length} days`
      : `fields: ${Object.keys(data).join(", ")}`;
  console.log(`✓ ${name}: ${shape}`);
  return data;
}

await check("get_profile", {});
await check("get_daily_overview", {});
await check("get_trends", { days: 7 });
const cycles = await check("list_cycles", { days: 7 });
await check("list_recoveries", { days: 7 });
const sleeps = await check("list_sleeps", { days: 7 });
const workouts = await check("list_workouts", { days: 60 });

const cycleId = cycles?.records[0]?.cycle_id;
const sleepId = sleeps?.records[0]?.sleep_id;
const workoutId = workouts?.records[0]?.workout_id;
if (cycleId) await check("get_cycle", { cycle_id: cycleId });
if (sleepId) await check("get_sleep", { sleep_id: sleepId });
if (workoutId) await check("get_workout", { workout_id: workoutId });
else console.log("- get_workout: skipped (no workouts in the last 60 days)");

await client.close();
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll live checks passed.");
process.exitCode = failed ? 1 : 0;

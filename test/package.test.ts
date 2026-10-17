// Release hygiene: registry metadata stays in sync and the npm tarball contains only the build.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { WhoopClient } from "../src/client.js";
import { createServer } from "../src/server.js";
import { staticTokens } from "./helpers.js";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const server = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));

describe("MCP registry metadata", () => {
  it("server.json matches package.json", () => {
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toEqual([
      { registryType: "npm", identifier: pkg.name, version: pkg.version, transport: { type: "stdio" } },
    ]);
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});

describe("npm package", () => {
  it("publishes only the compiled server and docs", () => {
    const [packed] = JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
        cwd: root,
        encoding: "utf8",
        shell: process.platform === "win32",
      }),
    ) as [{ files: { path: string }[] }];
    const files = packed.files.map((f) => f.path).sort();

    for (const file of files) {
      expect(file, `unexpected file in tarball: ${file}`).toMatch(/^(dist\/.+\.js(\.map)?|README\.md|LICENSE|package\.json)$/);
    }
    expect(files).toContain("dist/index.js");
    expect(files).toContain("LICENSE");
  });

  it("exposes the CLI and requires a supported Node", () => {
    expect(pkg.bin).toEqual({ "whoop-mcp": "dist/index.js" });
    expect(pkg.engines.node).toBe(">=20.11");
    expect(pkg.publishConfig).toEqual({ access: "public" });
  });
});

describe("MCPB bundle manifest", () => {
  const manifest = JSON.parse(readFileSync(join(root, "mcpb", "manifest.json"), "utf8"));

  it("lists exactly the tools the server exposes", async () => {
    const server = createServer(new WhoopClient(staticTokens), "test");
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const client = new Client({ name: "test", version: "1" });
    await client.connect(a);
    const { tools } = await client.listTools();

    expect(manifest.tools.map((t: { name: string }) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it("starts the same entry point as the npm bin", () => {
    expect(manifest.server.entry_point).toBe(pkg.bin["whoop-mcp"]);
    expect(manifest.server.mcp_config.args).toEqual([`\${__dirname}/${pkg.bin["whoop-mcp"]}`]);
    expect(manifest.description).toBe(server.description);
  });
});

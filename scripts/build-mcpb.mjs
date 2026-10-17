// Builds build/whoop-mcp-<version>.mcpb: a one-click bundle for Claude Desktop and Smithery.
// Usage: npm run bundle
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const MCPB = "@anthropic-ai/mcpb@2.1.2";
const stage = "build/mcpb";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("mcpb/manifest.json", "utf8"));
manifest.version = pkg.version;

const run = (cmd, args, cwd = ".") =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

rmSync("build", { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
run("npm", ["run", "build"]);
cpSync("dist", `${stage}/dist`, { recursive: true });
for (const file of ["package.json", "package-lock.json", "LICENSE", "README.md"]) cpSync(file, `${stage}/${file}`);
writeFileSync(`${stage}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], stage);
run("npx", ["-y", MCPB, "validate", `${stage}/manifest.json`]);
run("npx", ["-y", MCPB, "pack", stage, `build/whoop-mcp-${pkg.version}.mcpb`]);

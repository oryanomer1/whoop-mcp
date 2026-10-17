// Keeps server.json (MCP Registry metadata) in step with package.json. Runs on `npm version`.
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const server = JSON.parse(readFileSync("server.json", "utf8"));

server.name = pkg.mcpName;
server.version = pkg.version;
for (const p of server.packages) {
  if (p.registryType === "npm") {
    p.identifier = pkg.name;
    p.version = pkg.version;
  }
}
writeFileSync("server.json", JSON.stringify(server, null, 2) + "\n");
console.log(`server.json -> ${pkg.name}@${pkg.version}`);

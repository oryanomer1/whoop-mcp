// Records a real Claude answer that uses this server, and renders it as docs/demo.svg
// (an animated chat card that GitHub plays inline in the README).
//
//   npm run build && node scripts/demo.mjs ["Why is my recovery low today?"]
//   node scripts/demo.mjs --from build/demo-transcript.json   # re-render without asking again
//   add --out <file.svg> to write somewhere other than docs/demo.svg
//
// Needs `whoop-mcp auth` first. The answer contains your real data: review the SVG before committing it.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args.splice(args.indexOf(name), 2)[1] : undefined);
const from = option("--from");
const outFile = option("--out") ?? "docs/demo.svg";
let transcript;

if (from) {
  transcript = JSON.parse(readFileSync(from, "utf8"));
} else {
  const question = args[0] ?? "Why is my recovery low today?";
  const server = { mcpServers: { whoop: { command: "node", args: [resolve("dist/index.js")] } } };
  const out = execFileSync(
    "claude",
    [
      "-p",
      question,
      "--mcp-config",
      JSON.stringify(server),
      "--strict-mcp-config",
      "--allowedTools",
      "mcp__whoop",
      "--output-format",
      "stream-json",
      "--verbose",
      "--append-system-prompt",
      "Answer using the WHOOP tools. Keep the answer to at most 7 short lines of plain text: no markdown headings or tables.",
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const events = out.trim().split("\n").map((line) => JSON.parse(line));
  const tools = events
    .filter((e) => e.type === "assistant")
    .flatMap((e) => e.message.content.filter((c) => c.type === "tool_use").map((c) => c.name.replace(/^mcp__whoop__/, "")));
  const result = events.find((e) => e.type === "result");
  if (!result || result.is_error) throw new Error(`Claude run failed: ${JSON.stringify(result)}`);
  transcript = { question, tools, answer: result.result };
  mkdirSync("build", { recursive: true });
  writeFileSync("build/demo-transcript.json", JSON.stringify(transcript, null, 2));
}

writeFileSync(outFile, render(transcript));
console.log(`Wrote ${outFile} (${transcript.tools.length} tool calls). Review it before committing: it shows your data.`);

function render({ question, tools, answer }) {
  const W = 760;
  const PAD = 28;
  const LINE = 22;
  const WRAP = 96;
  const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const plain = (s) =>
    s
      .replace(/\*\*|__|`/g, "")
      .replace(/^#+\s*/gm, "")
      .replace(/^\s*[-*]\s+/gm, "• ");
  const wrap = (text) =>
    plain(text)
      .split("\n")
      .flatMap((para) => {
        if (!para.trim()) return [""];
        const lines = [];
        let line = "";
        for (const word of para.split(/\s+/)) {
          if (line && (line + " " + word).length > WRAP) {
            lines.push(line);
            // Non-breaking spaces: SVG collapses ordinary leading spaces.
            line = para.startsWith("• ") ? "\u00a0\u00a0\u00a0" + word : word;
          } else line = line ? `${line} ${word}` : word;
        }
        return [...lines, line];
      })
      .filter((l, i, all) => l || (i > 0 && all[i - 1]));

  const answerLines = wrap(answer).slice(0, 18);
  const items = []; // { y, svg, at }
  let y = 64;
  let t = 0.6;

  // The question, right-aligned as the user's message.
  const qLines = wrap(question);
  const qWidth = Math.min(W - 2 * PAD, Math.max(...qLines.map((l) => l.length)) * 8 + 32);
  const qHeight = qLines.length * LINE + 18;
  items.push({
    at: t,
    svg: `<rect x="${W - PAD - qWidth}" y="${y}" width="${qWidth}" height="${qHeight}" rx="14" class="user"/>` +
      qLines.map((l, i) => `<text x="${W - PAD - qWidth + 16}" y="${y + 27 + i * LINE}" class="utext">${esc(l)}</text>`).join(""),
  });
  y += qHeight + 22;
  t += 1.2;

  // One chip per tool call.
  let x = PAD;
  for (const name of tools) {
    const label = `⚙ ${name}`;
    const w = label.length * 7.6 + 24;
    if (x + w > W - PAD) {
      x = PAD;
      y += 34;
    }
    items.push({ at: t, svg: `<rect x="${x}" y="${y}" width="${w}" height="26" rx="13" class="chip"/><text x="${x + 12}" y="${y + 17.5}" class="ctext">${esc(label)}</text>` });
    x += w + 8;
    t += 0.5;
  }
  if (tools.length) y += 48;
  t += 0.4;

  // The answer, line by line.
  for (const line of answerLines) {
    items.push({ at: t, svg: `<text x="${PAD}" y="${y}" class="atext">${esc(line)}</text>` });
    y += LINE;
    t += 0.18;
  }

  const H = y + PAD;
  const cycle = t + 6; // hold the finished answer, then loop
  const pct = (s) => ((s / cycle) * 100).toFixed(2);
  const css = items
    .map(
      (item, i) =>
        `@keyframes k${i}{0%,${pct(item.at)}%{opacity:0;transform:translateY(6px)}${pct(item.at + 0.35)}%,96%{opacity:1;transform:none}100%{opacity:0}}` +
        `.i${i}{animation:k${i} ${cycle.toFixed(2)}s infinite;opacity:0}`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Claude answering ${esc(question)} using whoop-mcp">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px}
.card{fill:#0d1117;stroke:#30363d}.title{fill:#8b949e;font-size:12px}
.user{fill:#1f6feb}.utext{fill:#fff}.chip{fill:#161b22;stroke:#30363d}.ctext{fill:#7ee787;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.atext{fill:#e6edf3}
${css}
@media (prefers-reduced-motion:reduce){[class^="i"]{animation:none!important;opacity:1!important}}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" class="card"/>
<circle cx="24" cy="24" r="6" fill="#ff5f57"/><circle cx="44" cy="24" r="6" fill="#febc2e"/><circle cx="64" cy="24" r="6" fill="#28c840"/>
<text x="${W / 2}" y="28" text-anchor="middle" class="title">Claude + whoop-mcp (read-only)</text>
${items.map((item, i) => `<g class="i${i}">${item.svg}</g>`).join("\n")}
</svg>
`;
}

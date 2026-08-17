#!/usr/bin/env node
/**
 * memory-mcp.mjs — a local MCP (Model Context Protocol) server for Claude
 * memory, backed by ~/.claude/memory/*.md.
 *
 * Purpose: Claude desktop ("Co-work") and Claude Code can connect to this
 * server as an MCP tool. Everything they `remember` is written as a plain
 * Markdown file in ~/.claude/memory/ — the SAME folder the Northstar
 * memory bridge watches — so whatever Claude learns shows up on the
 * dashboard automatically.
 *
 * Setup (one time):
 *   Claude desktop:  Settings → MCP servers → Add → "Local" →
 *     command: node  /Users/Zhuanz/Desktop/northstar/memory-mcp.mjs
 *   Claude Code CLI: claude mcp add memory -- node /Users/Zhuanz/Desktop/northstar/memory-mcp.mjs
 *
 * Protocol: MCP stdio (JSON-RPC 2.0, newline-delimited). Pure stdlib.
 *
 * Tools:
 *   remember(name, description?, body)   → write/update a memory
 *   recall(name)                          → read a memory
 *   list_memories()                       → names + descriptions
 *   forget(name)                          → soft-delete a memory
 */

import { createInterface } from "node:readline";
import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const MEM_DIR = path.join(os.homedir(), ".claude", "memory");
const SERVER_NAME = "northstar-memory";
const PROTOCOL_VERSION = "2024-11-05";

function slugify(name) {
  return String(name || "memory").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "memory";
}

function frontMatter(name, description, modified) {
  return [
    "---",
    `name: ${name}`,
    `description: ${description || ""}`,
    "metadata:",
    "  node_type: memory",
    "  type: shared",
    `  modified: ${modified}`,
    "---",
    "",
  ].join("\n");
}

async function remember(args) {
  const name = slugify(args?.name);
  const body = String(args?.body || "").trim();
  if (!name || !body) throw new Error("both name and body are required");
  await mkdir(MEM_DIR, { recursive: true });
  const file = path.join(MEM_DIR, `${name}.md`);
  const content = frontMatter(name, args?.description || "", new Date().toISOString()) + body + "\n";
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, content, "utf-8");
  await rename(tmp, file);
  return `remembered "${name}" → ${file}`;
}

async function recall(args) {
  const name = slugify(args?.name);
  const file = path.join(MEM_DIR, `${name}.md`);
  try {
    return await readFile(file, "utf-8");
  } catch {
    return `no memory named "${name}"`;
  }
}

async function listMemories() {
  let files = [];
  try {
    files = await readdir(MEM_DIR);
  } catch { /* empty */ }
  const out = [];
  for (const f of files.filter((f) => f.endsWith(".md") && !f.includes(".deleted-"))) {
    try {
      const text = await readFile(path.join(MEM_DIR, f), "utf-8");
      const desc = (text.match(/^description:\s*(.*)$/m) || [])[1] || "";
      out.push(`${f.replace(/\.md$/, "")}${desc ? ` — ${desc.replace(/^"|"$/g, "")}` : ""}`);
    } catch { /* skip */ }
  }
  return out.join("\n") || "(no memories yet)";
}

async function forget(args) {
  const name = slugify(args?.name);
  const file = path.join(MEM_DIR, `${name}.md`);
  try {
    await rename(file, `${file}.deleted-${Date.now()}`);
    return `forgot "${name}"`;
  } catch {
    return `no memory named "${name}"`;
  }
}

const TOOLS = [
  {
    name: "remember",
    description: "Persist a memory to the shared memory folder (~/.claude/memory). Use for durable facts, preferences, decisions and lessons that should survive across sessions and appear on the Northstar dashboard.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "short slug, e.g. trading-desk-rules" },
        description: { type: "string", description: "one-line summary" },
        body: { type: "string", description: "the memory content" },
      },
      required: ["name", "body"],
    },
  },
  {
    name: "recall",
    description: "Read a previously remembered memory.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "list_memories",
    description: "List all stored memories with their one-line descriptions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "forget",
    description: "Remove a memory (soft delete).",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
];

function resultText(id, text, isError = false) {
  return JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError } });
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // not JSON — ignore
  }
  // Notifications have no id — acknowledge silently.
  if (msg.id === undefined || msg.id === null) return;
  const id = msg.id;
  try {
    switch (msg.method) {
      case "initialize":
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: msg.params?.protocolVersion || PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: "1.0.0" },
          },
        }) + "\n");
        break;
      case "ping":
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: {} }) + "\n");
        break;
      case "tools/list":
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { tools: TOOLS } }) + "\n");
        break;
      case "tools/call": {
        const { name, arguments: args } = msg.params || {};
        let text;
        let isError = false;
        try {
          switch (name) {
            case "remember": text = await remember(args); break;
            case "recall": text = await recall(args); break;
            case "list_memories": text = await listMemories(); break;
            case "forget": text = await forget(args); break;
            default: text = `unknown tool: ${name}`; isError = true;
          }
        } catch (err) {
          text = `error: ${err.message}`;
          isError = true;
        }
        process.stdout.write(resultText(id, text, isError) + "\n");
        break;
      }
      case "notifications/initialized":
        break;
      default:
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${msg.method}` } }) + "\n");
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message } }) + "\n");
  }
});

#!/usr/bin/env node
/**
 * memory-bridge.mjs — Claude memory sync for the Northstar dashboard.
 *
 * Watches Claude Code's on-disk memory files and serves them to the
 * dashboard over HTTP (CORS open), with two-way write-back.
 *
 * Memory sources (all are plain Markdown with a YAML front-matter header):
 *   1. ~/.claude/projects/<slug>/memory/*.md   per-project Claude Code memory
 *   2. ~/.claude/memory/*.md                   shared memory (used by the
 *      memory MCP server for Co-work/desktop sessions too)
 *
 * HTTP API (port 3793):
 *   GET  /memory            full index { memories: [...], syncedAt }
 *   GET  /memory?project=X  filtered by project
 *   GET  /health
 *   POST /memory            upsert a memory { project, name, description,
 *                            body } — writes/updates the .md file, returns
 *                            the stored record (two-way edit from dashboard)
 *   POST /memory/delete     delete by name within a project
 *
 * Design: pure stdlib, no dependencies, no secrets. The files Claude Code
 * writes are the source of truth; this index is a derived view.
 */

import { createServer } from "node:http";
import { readdir, readFile, writeFile, mkdir, stat, rename } from "node:fs/promises";
import { existsSync, watch } from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = Number(process.env.MEMORY_BRIDGE_PORT || 3793);
const HOME = os.homedir();
const PROJECTS_DIR = path.join(HOME, ".claude", "projects");
const SHARED_DIR = path.join(HOME, ".claude", "memory");

// ── index store ─────────────────────────────────────────────────────
const store = { memories: [], syncedAt: null };
let scanTimer = null;

function debouncedScan(delay = 800) {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanAll, delay);
}

// ── parsing ─────────────────────────────────────────────────────────
function parseFrontMatter(text) {
  const head = text.replace(/^\uFEFF/, "");
  if (!head.startsWith("---")) return { name: null, description: null, modified: null, body: head.trim() };
  const end = head.indexOf("\n---", 3);
  if (end === -1) return { name: null, description: null, modified: null, body: head.trim() };
  const raw = head.slice(3, end);
  const body = head.slice(end + 4).trim();
  const meta = { name: null, description: null, modified: null };
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim().replace(/^"(.*)"$/, "$1");
    if (key === "name" || key === "description" || key === "modified") meta[key] = val || null;
  }
  return { ...meta, body };
}

function projectSlugFromDir(dirName) {
  // "-Users-Zhuanz-Desktop-test-project" -> "Desktop-test-project"
  const parts = String(dirName).split("-").filter(Boolean);
  const segs = parts[0] === "Users" ? parts.slice(2) : parts;
  return segs.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "") || dirName;
}

async function scanDir(dir, project, source, acc) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // not present / not readable — not an error
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const full = path.join(dir, entry.name);
    try {
      const text = await readFile(full, "utf-8");
      const { name, description, modified, body } = parseFrontMatter(text);
      const st = await stat(full);
      acc.push({
        project,
        source,
        name: name || entry.name.replace(/\.md$/, ""),
        description: description || null,
        body: body || "",
        modified: modified || st.mtime.toISOString(),
        file: full,
        size: text.length,
      });
    } catch (err) {
      acc.push({ project, source, name: entry.name, description: null, body: `[unreadable: ${err.message}]`, modified: null, file: full, size: 0 });
    }
  }
}

async function scanAll() {
  const acc = [];
  // shared memory (Co-work / MCP writes here)
  await scanDir(SHARED_DIR, "shared", "claude", acc);
  // per-project Claude Code memory
  let projects = [];
  try {
    projects = await readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch { /* no projects dir yet */ }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    await scanDir(path.join(PROJECTS_DIR, p.name, "memory"), projectSlugFromDir(p.name), "claude-code", acc);
  }
  acc.sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
  store.memories = acc;
  store.syncedAt = new Date().toISOString();
}

// ── write-back (two-way edit) ───────────────────────────────────────
function slugify(name) {
  return String(name || "memory").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "memory";
}

async function writeMemory({ project = "shared", name, description = "", body = "" }) {
  const nameClean = String(name || "").trim();
  if (!nameClean) throw Object.assign(new Error("name is required"), { status: 400 });
  const bodyText = String(body || "").trim();
  if (!bodyText) throw Object.assign(new Error("body is required"), { status: 400 });
  const slug = slugify(nameClean);
  const dir = project === "shared" ? SHARED_DIR : path.join(PROJECTS_DIR, `-Users-Zhuanz-${project}`, "memory");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slug}.md`);
  const now = new Date().toISOString();
  const content = [
    "---",
    `name: ${slug}`,
    `description: ${JSON.stringify(description).replace(/^"|"$/g, "")}`,
    "metadata:",
    "  node_type: memory",
    `  modified: ${now}`,
    "---",
    "",
    bodyText,
    "",
  ].join("\n");
  // atomic write: tmp + rename
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, content, "utf-8");
  await rename(tmp, file);
  await debouncedScan(200);
  return { project, name: slug, description, body: bodyText, modified: now, file };
}

async function deleteMemory({ project = "shared", name }) {
  const slug = slugify(name);
  const dir = project === "shared" ? SHARED_DIR : path.join(PROJECTS_DIR, `-Users-Zhuanz-${project}`, "memory");
  const file = path.join(dir, `${slug}.md`);
  try {
    await stat(file);
  } catch {
    throw Object.assign(new Error(`no memory '${slug}' in project '${project}'`), { status: 404 });
  }
  await rename(file, `${file}.deleted-${Date.now()}`);
  await debouncedScan(200);
  return { deleted: true, name: slug, project };
}

// ── HTTP ────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, memories: store.memories.length, syncedAt: store.syncedAt, port: PORT }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/memory") {
      const project = url.searchParams.get("project");
      const q = (url.searchParams.get("q") || "").toLowerCase();
      let out = store.memories;
      if (project) out = out.filter((m) => m.project === project);
      if (q) out = out.filter((m) => (m.name || "").toLowerCase().includes(q) || (m.body || "").toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ memories: out, syncedAt: store.syncedAt }));
      return;
    }
    if (req.method === "POST" && (url.pathname === "/memory" || url.pathname === "/memory/delete")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || "{}");
      const result = url.pathname.endsWith("/delete") ? await deleteMemory(data) : await writeMemory(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...result }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } catch (err) {
    res.writeHead(err.status || 500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`[memory-bridge] http://127.0.0.1:${PORT}`);
  console.log(`  GET  /memory            — memory index`);
  console.log(`  POST /memory            — upsert (two-way edit)`);
  console.log(`  POST /memory/delete     — delete by name`);
});

// watch sources — ensure the shared dir exists first so the watcher registers
await mkdir(SHARED_DIR, { recursive: true }).catch(() => {});
if (existsSync(PROJECTS_DIR)) watch(PROJECTS_DIR, { recursive: true }, () => debouncedScan());
if (existsSync(SHARED_DIR)) watch(SHARED_DIR, () => debouncedScan());

// initial scan
scanAll().then(() => console.log(`[memory-bridge] indexed ${store.memories.length} memories`));

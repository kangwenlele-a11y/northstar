import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnv();

const port = Number(process.env.AGENT_BRIDGE_PORT || 8787);
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "http://127.0.0.1:4175").split(",").map((value) => value.trim()).filter(Boolean));
const model = process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V4-Flash";
const apiKey = process.env.SILICONFLOW_API_KEY;

if (!apiKey) throw new Error("SILICONFLOW_API_KEY is required to start the agent bridge.");

function send(request, response, status, body) {
  const requestOrigin = request.headers.origin;
  const origin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : [...allowedOrigins][0];
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(body));
}

function parseBody(request) {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 32_000) reject(new Error("Request too large."));
    });
    request.on("end", () => {
      try { resolveBody(JSON.parse(raw)); } catch { reject(new Error("Invalid JSON.")); }
    });
    request.on("error", reject);
  });
}

function numberInRange(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10, Math.round(parsed))) : fallback;
}

function normalizeAssessment(value, fallback) {
  const lanes = ["automation", "agency", "art", "creator", "personal"];
  const verdicts = ["Do now", "Schedule", "Protect", "Park it"];
  return {
    longTerm: numberInRange(value.longTerm, fallback.longTerm),
    shortTerm: numberInRange(value.shortTerm, fallback.shortTerm),
    lane: lanes.includes(value.lane) ? value.lane : fallback.lane,
    verdict: verdicts.includes(value.verdict) ? value.verdict : fallback.verdict,
    reason: typeof value.reason === "string" ? value.reason.slice(0, 480) : fallback.reason,
    nextAction: typeof value.nextAction === "string" ? value.nextAction.slice(0, 300) : fallback.nextAction,
    agent: "Northstar Strategist",
    source: "live",
  };
}

async function assess({ activity, mission, fallback }) {
  const prompt = `You are the Northstar Strategist for a founder building an AI-first automation company. Assess one activity against this mission:\n${mission}\n\nActivity: ${activity}\n\nReturn only valid JSON with exactly: longTerm (integer 1-10), shortTerm (integer 1-10), lane (automation|agency|art|creator|personal), verdict (Do now|Schedule|Protect|Park it), reason (max 2 concise sentences), nextAction (one concrete 30-60 minute move). Be direct. Prioritize reusable systems, automation, software, data, and learning. Treat current e-commerce work as cash flow and a testing environment. Keep investing low priority unless it is essential. Do not use markdown.`;
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), 35_000);
  const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 180, temperature: 0.2, enable_thinking: false }),
    signal: aborter.signal,
  });
  clearTimeout(timer);
  if (!response.ok) throw new Error(`SiliconFlow request failed with status ${response.status}.`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("SiliconFlow returned no usable answer.");
  const cleaned = text.replace(/^```json\s*|^```|```$/gm, "").trim();
  return normalizeAssessment(JSON.parse(cleaned), fallback);
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(request, response, 204, {});
  if (request.method !== "POST" || request.url !== "/v1/decision-assessments") return send(request, response, 404, { error: "Not found." });
  try {
    const body = await parseBody(request);
    if (typeof body.activity !== "string" || body.activity.trim().length < 3 || body.activity.length > 1200) return send(request, response, 400, { error: "Provide a concise activity." });
    if (typeof body.mission !== "string" || body.mission.trim().length < 10 || body.mission.length > 5000) return send(request, response, 400, { error: "A valid mission is required." });
    if (!body.fallback || typeof body.fallback !== "object") return send(request, response, 400, { error: "A fallback assessment is required." });
    const result = await assess(body);
    send(request, response, 200, result);
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "SiliconFlow request timed out after 35 seconds." : error instanceof Error ? error.message : "Unknown error";
    console.error("Agent bridge assessment failed:", message);
    send(request, response, 502, { error: "The live agent is unavailable. Try again shortly." });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Northstar agent bridge listening on http://127.0.0.1:${port}`);
});

# Northstar Handoff

## Project Overview
Northstar is a personal command center for deciding what work compounds. Stack: React + Vite frontend, Cloudflare Worker-compatible backend deployed through ChatGPT Sites, Supabase/PostgREST data, and SiliconFlow DeepSeek-V4-Flash AI.

## Production
- URL: https://northstar-command-2026.joewick.chatgpt.site
- Sites project ID: `appgprj_6a61daf6f2a48191bacdbc9b006af8c9`

## Required Environment Variables
Names only, never values:
- `SILICONFLOW_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NORTHSTAR_ACCESS_CODE` (currently intentionally bypassed in Worker code)

## Current State
### Phase 2A
- Schema was reported as applied. GET `/api/memory/state` works and returns five agent rows.
- PUT `/api/memory/state/codex` fails: initially Worker 1101; direct test returns exact `HTTP 500` with an empty body.
- Shared state is not functional until a PUT updates Supabase and a follow-up GET proves it.

### Phase 2B
- Source includes `/api/plan` plus a goal input. It calls DeepSeek, creates a goal, schedules blocks, and queues codex/hermes/openclaw-lane work.
- It is not end-to-end verified and depends on the broken Phase 2A write route.

### Phase 2C
- Not started. Do not start until Phase 2A write works.

## Exact Bug and Diagnostic Status
- Diagnostic `try/catch` was added around `memory()` and deployed in commit `2a78aa21487604d4818258fee60fc96256863481`.
- It should return JSON with error/detail/stack for in-function exceptions.
- Retesting after deployment still returned exactly `HTTP 500` and no body. This suggests the failure is outside `memory()` or before the Worker can return its response.

## Deployment
1. Run `pnpm run build:hosted`.
2. Commit and push the exact source using a short-lived Sites source credential.
3. Archive complete `dist/` plus `.openai/hosting.json`; archive must contain `dist/server/index.js`, assets, and `dist/.openai/hosting.json`.
4. Save version with Sites, deploy publicly, and poll deployment status.

## Next Steps
1. Add a top-level Worker fetch `try/catch` and diagnostics around the Supabase REST POST.
2. Reproduce PUT state and capture real error/status/body.
3. Fix root cause; PUT Codex as working; GET state and confirm saved row.
4. Remove public stack diagnostics.
5. End-to-end verify Phase 2B.
6. Build Phase 2C (`northstar_roadmaps`, `/api/roadmap`, UI, agent queueing).
7. Update Hermes/OpenClaw/Claude prompts to read/write shared state.

## Complete Current Source: `worker/bridge-worker.mjs`

```js
const model = "deepseek-ai/DeepSeek-V4-Flash";
const lanes = new Set(["automation", "agency", "art", "creator", "personal"]);
const verdicts = new Set(["Do now", "Schedule", "Protect", "Park it"]);
const ownerKey = "richard";
/* __NORTHSTAR_APP_HTML__ */

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const score = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(1, Math.min(10, Math.round(Number(value)))) : fallback;

const isAuthorized = () => true;

async function supabase(request, env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Memory service is not configured." }, 503);
  const baseUrl = env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) return json({ error: "Memory service request failed." }, 502);
  return response;
}

async function memory(request, env, url) {
  try {
  if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
  const path = url.pathname.replace("/api/memory/", "");
  if (path === "state" && request.method === "GET") {
    const result = await supabase(request, env, "northstar_agent_state?select=*&order=agent.asc");
    return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
  }
  if (path.startsWith("state/") && request.method === "PUT") {
    const agent = path.split("/")[1];
    if (!['richard', 'claude', 'codex', 'hermes', 'openclaw'].includes(agent)) return json({ error: "Unknown agent." }, 400);
    const body = await request.json();
    const result = await supabase(request, env, "northstar_agent_state?on_conflict=agent", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ agent, current_task: body.current_task || null, status: body.status || 'idle', detail: body.detail || null, blocked_reason: body.blocked_reason || null, updated_at: new Date().toISOString() }) });
    return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
  }
  if (path === "profile") {
    if (request.method === "GET") {
      const result = await supabase(request, env, `northstar_profiles?owner_key=eq.${ownerKey}&select=mission,operating_brief`);
      if (result instanceof Response && result.headers.get("Content-Type")?.includes("application/json")) return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
    }
    if (request.method === "PUT") {
      const body = await request.json();
      const result = await supabase(request, env, "northstar_profiles?on_conflict=owner_key", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_key: ownerKey, mission: body.mission, operating_brief: body.operating_brief, updated_at: new Date().toISOString() }) });
      return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
    }
  }
  if (path === "decisions" && request.method === "GET") {
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const result = await supabase(request, env, `northstar_decisions?owner_key=eq.${ownerKey}&select=*&order=created_at.desc&limit=${limit}`);
    return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
  }
  if (path === "decisions" && request.method === "POST") {
    const body = await request.json();
    const result = await supabase(request, env, "northstar_decisions", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ owner_key: ownerKey, activity: body.activity, long_term_score: body.longTerm, short_term_score: body.shortTerm, lane: body.lane, verdict: body.verdict, reason: body.reason, next_action: body.nextAction }) });
    return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
  }
  if (path === "daily") {
    if (request.method === "GET") {
      const date = url.searchParams.get("date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json({ error: "Invalid date." }, 400);
      const result = await supabase(request, env, `northstar_daily_blocks?owner_key=eq.${ownerKey}&date=eq.${date}&select=*&order=hour.asc`);
      return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
    }
    if (request.method === "PUT") {
      const body = await request.json();
      const result = await supabase(request, env, "northstar_daily_blocks?on_conflict=owner_key,date,hour", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_key: ownerKey, date: body.date, hour: body.hour, task: body.task, lane: body.lane, done: body.done, updated_at: new Date().toISOString() }) });
      return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
    }
  }
  if (path === "active-focus") {
    if (request.method === "GET") {
      const result = await supabase(request, env, `northstar_active_focus?owner_key=eq.${ownerKey}&select=*`);
      return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
    }
    if (request.method === "PUT") {
      const body = await request.json();
      if (!body.task) {
        const result = await supabase(request, env, `northstar_active_focus?owner_key=eq.${ownerKey}`, { method: "DELETE" });
        return new Response(null, { status: result.status });
      }
      const result = await supabase(request, env, "northstar_active_focus?on_conflict=owner_key", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_key: ownerKey, task: body.task, lane: body.lane, started_at: body.started_at, updated_at: new Date().toISOString() }) });
      return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
    }
  }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Northstar memory route failed", error);
    return json({
      error: "Unhandled memory route error",
      detail: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
}

async function assess(request, env) {
  if (!env.SILICONFLOW_API_KEY) return json({ error: "The live agent has not been configured." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const activity = typeof body.activity === "string" ? body.activity.trim() : "";
  const mission = typeof body.mission === "string" ? body.mission.trim() : "";
  const operatingBrief = typeof body.operatingBrief === "string" ? body.operatingBrief.trim() : "";
  const fallback = body.fallback;
  if (activity.length < 3 || activity.length > 1200 || mission.length < 10 || mission.length > 5000 || operatingBrief.length < 100 || operatingBrief.length > 12000 || !fallback) return json({ error: "Provide a valid activity and operating brief." }, 400);

  const prompt = `You are the Northstar Strategist for a founder building an AI-first automation company. Use the full operating brief as the source of truth, not just the short mission.\n\nShort mission:\n${mission}\n\nFull operating brief:\n${operatingBrief}\n\nActivity: ${activity}\n\nReturn only valid JSON with exactly: longTerm (integer 1-10), shortTerm (integer 1-10), lane (automation|agency|art|creator|personal), verdict (Do now|Schedule|Protect|Park it), reason (max 2 concise sentences), nextAction (one concrete 30-60 minute move). Be direct. Prioritize reusable systems, automation, software, data, and learning. Treat e-commerce work as cash flow and a testing environment. Keep investing low priority unless essential. Do not use markdown.`;
  try {
    const upstream = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SILICONFLOW_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 180, temperature: 0.2, enable_thinking: false }),
    });
    if (!upstream.ok) {
      const errorBody = await upstream.text();
      console.error("SiliconFlow assessment failed", { status: upstream.status, body: errorBody.slice(0, 2000) });
      return json({ error: "AI unavailable. The live Strategist could not reach SiliconFlow." }, 502);
    }
    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return json({ error: "The live agent returned no assessment." }, 502);
    const answer = JSON.parse(content.replace(/^```json\s*|^```|```$/gm, "").trim());
    return json({
      longTerm: score(answer.longTerm, score(fallback.longTerm, 5)),
      shortTerm: score(answer.shortTerm, score(fallback.shortTerm, 5)),
      lane: lanes.has(answer.lane) ? answer.lane : fallback.lane,
      verdict: verdicts.has(answer.verdict) ? answer.verdict : fallback.verdict,
      reason: typeof answer.reason === "string" ? answer.reason.slice(0, 480) : fallback.reason,
      nextAction: typeof answer.nextAction === "string" ? answer.nextAction.slice(0, 300) : fallback.nextAction,
      agent: "Northstar Strategist",
      source: "live",
    });
  } catch (error) {
    console.error("SiliconFlow assessment exception", { message: error instanceof Error ? error.message : String(error) });
    return json({ error: "AI unavailable. The live Strategist request failed." }, 502);
  }
}

async function createPlan(request, env) {
  const body = await request.json();
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const operatingBrief = typeof body.operatingBrief === "string" ? body.operatingBrief.trim() : "";
  if (goal.length < 3 || goal.length > 500 || operatingBrief.length < 100) return json({ error: "Provide a valid goal and operating brief." }, 400);
  const prompt = `Given this goal: ${goal}\n\nOperating brief:\n${operatingBrief}\n\nReturn only JSON array of 3-8 ordered steps. Each object: title, detail, estimated_minutes, lane (agency|art|creatorconnect|personal|codex|hermes|openclaw), depends_on (prior step index or null).`;
  const upstream = await fetch("https://api.siliconflow.cn/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SILICONFLOW_API_KEY}` }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 700, temperature: 0.2, enable_thinking: false }) });
  if (!upstream.ok) return json({ error: "Planner unavailable." }, 502);
  const payload = await upstream.json();
  let steps;
  try { steps = JSON.parse(payload?.choices?.[0]?.message?.content?.replace(/^```json\s*|^```|```$/gm, "").trim()); } catch { return json({ error: "Planner returned invalid steps." }, 502); }
  if (!Array.isArray(steps) || !steps.length) return json({ error: "Planner returned no steps." }, 502);
  const goalResponse = await supabase(request, env, "northstar_goals", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ title: goal }) });
  const goals = await goalResponse.json(); const goalId = goals?.[0]?.id;
  const today = new Date(); let hour = Math.max(9, today.getHours() + 1); let day = today.toISOString().slice(0, 10); const scheduled=[];
  for (let index=0; index<Math.min(8, steps.length); index++) { const step=steps[index]; if(hour>21){ today.setDate(today.getDate()+1); day=today.toISOString().slice(0,10); hour=9; }
    const lane = ["agency","art","creatorconnect","personal","codex","hermes","openclaw"].includes(step.lane) ? step.lane : "personal";
    await supabase(request, env, "northstar_daily_blocks?on_conflict=owner_key,date,hour", { method:"POST", headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"}, body:JSON.stringify({owner_key:ownerKey,date:day,hour,task:`${step.title}: ${step.detail}`,lane,goal_id:goalId,depends_on:Number.isInteger(step.depends_on)?step.depends_on:null,done:false}) });
    scheduled.push({ ...step, date:day, hour }); if (["codex","hermes","openclaw"].includes(lane)) await supabase(request, env, "northstar_agent_state?on_conflict=agent", {method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},body:JSON.stringify({agent:lane,current_task:step.title,status:"idle",detail:step.detail,updated_at:new Date().toISOString()})}); hour += Math.max(1, Math.ceil((Number(step.estimated_minutes)||60)/60)); }
  return json({ goal_id:goalId, steps:scheduled });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/decision-assessments") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
      return assess(request, env);
    }
    if (url.pathname === "/api/plan") { if (request.method !== "POST") return json({ error: "Method not allowed." }, 405); return createPlan(request, env); }
    if (url.pathname.startsWith("/api/memory/")) return memory(request, env, url);
    return new Response(appHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};

```

## Complete Current Source: `supabase/northstar-phase-2.sql`

```sql
create table if not exists northstar_agent_state (
  agent text primary key,
  current_task text,
  status text check (status in ('idle', 'working', 'blocked', 'waiting_on_richard')),
  detail text,
  blocked_reason text,
  updated_at timestamptz default now()
);
alter table northstar_agent_state enable row level security;

insert into northstar_agent_state (agent, status) values
  ('richard', 'idle'), ('claude', 'idle'), ('codex', 'idle'),
  ('hermes', 'idle'), ('openclaw', 'idle')
on conflict (agent) do nothing;

create table if not exists northstar_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);
alter table northstar_goals enable row level security;

alter table northstar_daily_blocks add column if not exists goal_id uuid references northstar_goals(id);
alter table northstar_daily_blocks add column if not exists depends_on int;

```

## Complete Current Source: `src/App.jsx`

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Flame,
  Gauge,
  ListTodo,
  LockKeyhole,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { hasLiveAgentBridge, requestLiveAssessment } from "./agentClient";
import { memoryApi } from "./memoryClient";

const STORAGE_KEY = "personal-command-center:v1";
const HOURS = Array.from({ length: 17 }, (_, index) => index + 6);
const LANES = [
  { id: "automation", label: "AI automation", color: "#00a58b", tint: "#def7f0" },
  { id: "agency", label: "Web agency", color: "#4c80ff", tint: "#e8efff" },
  { id: "art", label: "Art store", color: "#e2773a", tint: "#fff0e7" },
  { id: "creator", label: "CreatorConnect", color: "#9968d9", tint: "#f1eaff" },
  { id: "personal", label: "Personal / rest", color: "#6b9665", tint: "#e8f4e6" },
];

const DEFAULT_MISSION = "Build a durable AI-first company by turning recurring work into reusable systems, products, and knowledge.";
const OPERATING_DRAFT = `Career & Business Operating Summary

Core mission
Build an AI-first company that creates automation systems to replace repetitive digital work. Every business should strengthen this objective by generating reusable workflows, data, software, or knowledge, not only short-term income.

1. Current job - cash flow and learning
Work in Shopify, TikTok Shop, eBay, social media, product operations, and customer acquisition. Products include Montessori toys, AutoBrush, electric bikes, and assigned products. Treat this as paid training: learn operations, marketing, acquisition, and automation opportunities while building future assets.

2. AI automation business - highest long-term priority
Use e-commerce stores as testing environments. The real product is the automation system: product uploads, descriptions, image processing, inventory, social posting, customer service, market research, and workflow management. Build workflows, package them into services or software, and eventually sell automation solutions to businesses.

3. English / IELTS personal brand
Build an audience by teaching spoken English and IELTS while sharing the learning journey. Build trust before products such as a subscription website, community, courses, coaching, or AI English tools. English gives access to global knowledge, customers, and AI communities.

4. AI software and vibe coding
When a repeated pain point appears, find the real problem and build the smallest useful tool: AI agents, productivity tools, workflow software, internal operating systems, or AI-assisted coding products.

5. AI-assisted investing - very low priority
Use AI for research and analysis only later. Focus first on businesses under direct control.

6. Self-improvement operating system
Technical skills come first: Python, APIs, databases, Git, AI tools, automation, and system architecture. Then English, fitness, appearance, and art/creativity for balance.

Decision rules
Does this strengthen the AI automation ecosystem? Can it become a reusable asset? Can AI automate most of it? Can it scale beyond my time? Does it create knowledge, software, or systems? Does it move me closer to one AI-driven ecosystem? If most answers are yes, act. Otherwise postpone or reject.`;
const DEFAULT_STATE = {
  mission: DEFAULT_MISSION,
  operatingDraft: OPERATING_DRAFT,
  days: {},
  decisions: [],
  active: null,
};

const pad = (value) => String(value).padStart(2, "0");
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDateKey = (key) => new Date(...key.split("-").map((value, index) => index === 1 ? Number(value) - 1 : Number(value)));
const shiftDate = (key, amount) => {
  const next = parseDateKey(key);
  next.setDate(next.getDate() + amount);
  return localDateKey(next);
};
const formatHour = (hour) => `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;
const formatDate = (key) => parseDateKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const emptyDay = () => ({ goal: "", blocks: {}, energy: "steady" });

function readStore() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored && typeof stored === "object" ? { ...DEFAULT_STATE, ...stored } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function scoreActivity(value) {
  const input = value.toLowerCase();
  const match = (words) => words.some((word) => input.includes(word));
  const automation = match(["automation", "agent", "workflow", "api", "system", "script", "code", "database", "build", "product"]);
  const cash = match(["client", "agency", "shopify", "store", "sales", "customer", "campaign", "revenue", "order"]);
  const audience = match(["content", "video", "instagram", "tiktok", "creator", "english", "post", "community"]);
  const recovery = match(["rest", "sleep", "walk", "gym", "basketball", "eat", "family", "health"]);
  const investing = match(["invest", "stock", "crypto", "trading", "market prediction"]);
  const admin = match(["scroll", "browse", "meeting", "email", "message", "research", "watch"]);
  const longTerm = Math.max(1, Math.min(10, 2 + (automation ? 5 : 0) + (audience ? 2 : 0) + (recovery ? 2 : 0) + (cash ? 1 : 0) - (investing ? 3 : 0) - (admin ? 1 : 0)));
  const shortTerm = Math.min(10, 2 + (cash ? 5 : 0) + (recovery ? 3 : 0) + (automation ? 2 : 0) + (audience ? 2 : 0));
  const lane = automation ? "automation" : cash ? "agency" : audience ? "creator" : recovery ? "personal" : "personal";
  const verdict = longTerm >= 8 || (shortTerm >= 7 && longTerm >= 5) ? "Do now" : longTerm >= 6 ? "Schedule" : recovery ? "Protect" : "Park it";
  const reason = verdict === "Do now"
    ? "This moves a present result while strengthening something reusable. Give it an uninterrupted block."
    : verdict === "Schedule"
      ? "It has real value, but it needs a defined time box so it does not displace the highest-leverage work."
      : verdict === "Protect"
        ? "Recovery is productive infrastructure. Treat it as a commitment, not a reward you have to earn."
        : "Its value is unclear against the mission right now. Capture it, then return to the current priority.";
  const nextAction = automation
    ? "Define the smallest reusable output you can ship in the next 60 minutes."
    : cash
      ? "Set a clear revenue or learning outcome, then time-box the work to 60 minutes."
      : audience
        ? "Turn the idea into one useful artifact: a post, a conversation, or a reusable content template."
        : recovery
          ? "Choose the minimum restorative action and put it on the calendar without guilt."
          : "Write the concrete outcome. If it cannot be named, move it to the parking lot.";
  return { longTerm, shortTerm, lane, verdict, reason, nextAction };
}

function useCommandStore() {
  const [store, setStore] = useState(readStore);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(store)), 150);
    return () => clearTimeout(timer.current);
  }, [store]);
  return { store, setStore };
}

function Score({ label, value, accent }) {
  return <div className="score"><div><span>{label}</span><strong>{value}/10</strong></div><div className="score-track"><i style={{ width: `${value * 10}%`, background: accent }} /></div></div>;
}

function AgentCard({ icon: Icon, title, detail, state, tone }) {
  return <div className="agent-card">
    <span className={`agent-icon ${tone}`}><Icon size={16} /></span>
    <div><strong>{title}</strong><small>{detail}</small></div>
    <span className={`agent-state ${state === "Ready" ? "ready" : "waiting"}`}><i />{state}</span>
  </div>;
}

function BlockEditor({ hour, block, onSave, onCancel }) {
  const [task, setTask] = useState(block?.task || "");
  const [laneId, setLaneId] = useState(block?.laneId || "automation");
  return <form className="block-editor" onSubmit={(event) => { event.preventDefault(); if (task.trim()) onSave({ task: task.trim(), laneId, done: block?.done || false }); }}>
    <select value={laneId} onChange={(event) => setLaneId(event.target.value)} aria-label="Work area">
      {LANES.map((lane) => <option key={lane.id} value={lane.id}>{lane.label}</option>)}
    </select>
    <input autoFocus value={task} onChange={(event) => setTask(event.target.value)} placeholder={`Focus at ${formatHour(hour)}`} aria-label="Focus block" />
    <button type="submit" className="square-button accent" aria-label="Save focus block"><Check size={16} /></button>
    <button type="button" className="square-button" onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
  </form>;
}

function ScheduleRow({ hour, block, editing, onEdit, onSave, onCancel, onToggle }) {
  const lane = block ? LANES.find((item) => item.id === block.laneId) || LANES[0] : null;
  return <div className="schedule-row">
    <time>{formatHour(hour)}</time>
    <div className="schedule-content">
      {editing ? <BlockEditor hour={hour} block={block} onSave={onSave} onCancel={onCancel} /> : block ? (
        <div className={`focus-block ${block.done ? "done" : ""}`} style={{ "--lane": lane.color, "--lane-tint": lane.tint }}>
          <button className="complete-button" onClick={onToggle} aria-label={block.done ? "Mark incomplete" : "Mark complete"}>{block.done && <Check size={13} />}</button>
          <button className="block-label" onClick={onEdit}><span>{block.task}</span><small>{lane.label}</small></button>
          <button className="block-edit" onClick={onEdit} aria-label="Edit focus block">Edit</button>
        </div>
      ) : <button className="add-focus" onClick={onEdit}><Plus size={15} /> Protect an hour</button>}
    </div>
  </div>;
}

export function App() {
  const [accessCode, setAccessCode] = useState(() => sessionStorage.getItem("northstar-access-code") || "");
  const [date, setDate] = useState(localDateKey());
  const [activity, setActivity] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [agentError, setAgentError] = useState("");
  const [agentMode, setAgentMode] = useState(hasLiveAgentBridge() ? "ready" : "local");
  const [editingHour, setEditingHour] = useState(null);
  const [showMission, setShowMission] = useState(false);
  const [showOperatingDraft, setShowOperatingDraft] = useState(false);
  const [agentStates, setAgentStates] = useState([]);
  const [goal, setGoal] = useState("");
  const [planning, setPlanning] = useState(false);
  const { store, setStore } = useCommandStore();
  useEffect(() => {
    Promise.all([memoryApi.profile(accessCode), memoryApi.decisions(accessCode), memoryApi.active(accessCode)]).then(([profiles, decisions, active]) => {
      const profile = profiles?.[0];
      const mapped = (decisions || []).map((item) => ({ ...item, longTerm: item.long_term_score, shortTerm: item.short_term_score, nextAction: item.next_action, at: item.created_at }));
      const savedActive = active?.[0] ? { ...active[0], title: active[0].task, startedAt: active[0].started_at } : current.active;
      setStore((current) => ({ ...current, mission: profile?.mission || current.mission, operatingDraft: profile?.operating_brief?.text || current.operatingDraft, decisions: mapped.length ? mapped : current.decisions, active: savedActive }));
    }).catch(() => setAccessCode(""));
  }, [accessCode]);
  useEffect(() => { memoryApi.saveProfile(accessCode, { mission: store.mission, operating_brief: { text: store.operatingDraft } }).catch(() => {}); }, [accessCode, store.mission, store.operatingDraft]);
  useEffect(() => { memoryApi.agentState(accessCode).then(setAgentStates).catch(() => {}); }, [accessCode]);
  const day = store.days[date] || emptyDay();
  const blocks = Object.entries(day.blocks || {});
  const completed = blocks.filter(([, block]) => block.done).length;
  const activeLane = store.active ? LANES.find((lane) => lane.id === store.active.lane) : null;
  const recentDecisions = store.decisions.slice(0, 4);

  const allocation = useMemo(() => LANES.map((lane) => ({ ...lane, count: Object.values(day.blocks || {}).filter((block) => block.laneId === lane.id).length })), [day.blocks]);
  const updateDay = (nextDay) => setStore((current) => ({ ...current, days: { ...current.days, [date]: nextDay } }));
  const runAnalysis = async () => {
    if (!activity.trim()) return;
    const localResult = scoreActivity(activity);
    setAgentError("");
    setAgentMode(hasLiveAgentBridge() ? "thinking" : "local");
    let result;
    if (hasLiveAgentBridge()) {
      try {
        result = { ...localResult, ...(await requestLiveAssessment({
          activity: activity.trim(),
          mission: store.mission,
          operatingBrief: store.operatingDraft,
          fallback: localResult,
          accessCode,
        })) };
        setAgentMode("live");
      } catch (error) {
        setAgentMode("error");
        setAgentError(error instanceof Error ? error.message : "AI unavailable.");
        return;
      }
    }
    const entry = { id: crypto.randomUUID(), activity: activity.trim(), ...result, at: new Date().toISOString() };
    setAnalysis(entry);
    setStore((current) => ({ ...current, decisions: [entry, ...current.decisions].slice(0, 30) }));
    if (accessCode) memoryApi.saveDecision(accessCode, entry).catch(() => {});
  };
  const startFocus = () => {
    if (!analysis) return;
    const next = { title: analysis.activity, task: analysis.activity, lane: analysis.lane, startedAt: new Date().toISOString() };
    setStore((current) => ({ ...current, active: next }));
    if (accessCode) memoryApi.saveActive(accessCode, { task: next.task, lane: next.lane, started_at: next.startedAt }).catch(() => {});
  };
  const clearActive = () => { setStore((current) => ({ ...current, active: null })); if (accessCode) memoryApi.saveActive(accessCode, {}).catch(() => {}); };
  const saveBlock = (hour, block) => { updateDay({ ...day, blocks: { ...day.blocks, [hour]: block } }); if (accessCode) memoryApi.saveDaily(accessCode, { date, hour, task: block.task, lane: block.laneId, done: block.done }).catch(() => {}); setEditingHour(null); };
  const copyYesterday = () => {
    const prior = store.days[shiftDate(date, -1)];
    if (!prior) return;
    updateDay({ ...day, blocks: Object.fromEntries(Object.entries(prior.blocks).map(([hour, block]) => [hour, { ...block, done: false }])) });
  };
  const createPlan = async (event) => {
    event.preventDefault();
    if (!goal.trim()) return;
    setPlanning(true);
    try { await memoryApi.plan(accessCode, goal.trim(), store.operatingDraft); setGoal(""); } finally { setPlanning(false); }
  };

  return <main className="command-app">
    <aside className="command-sidebar">
      <div className="brand"><span><Flame size={19} /></span><strong>Northstar</strong></div>
      <div className="sidebar-label">YOUR OPERATING SYSTEM</div>
      <button className="side-nav active"><Gauge size={17} /> Command center</button>
      <button className="side-nav"><ListTodo size={17} /> Daily focus</button>
      <button className="side-nav"><Clock3 size={17} /> Decision history</button>
      <section className="mission-card">
        <div><Sparkles size={16} /><span>North star</span></div>
        <p>{store.mission}</p>
        <button onClick={() => setShowMission((value) => !value)}>{showMission ? "Close" : "Adjust mission"}</button>
        {showMission && <textarea value={store.mission} onChange={(event) => setStore((current) => ({ ...current, mission: event.target.value }))} aria-label="Your mission" />}
      </section>
      <section className="agent-list">
        <div className="sidebar-label">AGENT NETWORK</div>
        <AgentCard icon={Target} title="Strategist" detail="Long-term alignment" state={agentMode === "thinking" ? "Thinking" : "Ready"} tone="teal" />
        <AgentCard icon={Activity} title="Operator" detail="Short-term payoff" state={agentMode === "thinking" ? "Thinking" : "Ready"} tone="blue" />
        <AgentCard icon={LockKeyhole} title="Guardian" detail="Energy and attention" state="Ready" tone="amber" />
        {agentStates.map((item) => <AgentCard key={item.agent} icon={Bot} title={item.agent} detail={item.current_task || item.detail || "No task queued"} state={item.status || "idle"} tone="blue" />)}
      </section>
      <p className="local-note">Private by default. Your decisions stay on this device until you connect a secure agent bridge.</p>
    </aside>

    <section className="command-main">
      <header className="command-header">
        <div><p className="eyebrow">PERSONAL COMMAND CENTER</p><h1>Choose the work that compounds.</h1><p className="subhead">Tell the agents what you are about to do. Get a clear decision before your time disappears.</p></div>
        <div className="date-controls"><button className="square-button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ChevronLeft size={18} /></button><div><strong>{date === localDateKey() ? "Today" : formatDate(date)}</strong><small>{formatDate(date)}</small></div><button className="square-button" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day"><ChevronRight size={18} /></button></div>
      </header>

      <section className="operating-draft">
        <button className="draft-toggle" onClick={() => setShowOperatingDraft((value) => !value)} aria-expanded={showOperatingDraft}>
          <span><Target size={16} /><strong>Operating brief</strong><small>Draft saved - used by your decision system</small></span>
          <ChevronDown size={17} className={showOperatingDraft ? "open" : ""} />
        </button>
        {showOperatingDraft && <div className="draft-body"><div className="strategy-lens"><span>Priority lens</span><strong>AI automation 鈫?cash-flow learning 鈫?English / software 鈫?self-improvement</strong><small>AI-assisted investing stays low priority until your controlled businesses are stronger.</small></div><textarea value={store.operatingDraft} onChange={(event) => setStore((current) => ({ ...current, operatingDraft: event.target.value }))} aria-label="Operating brief draft" /></div>}
      </section>
      <form className="activity-form" onSubmit={createPlan}>
        <label htmlFor="goal">What are you trying to achieve?</label>
        <div className="activity-row"><input id="goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe one outcome to plan" /><button type="submit" disabled={planning}>{planning ? "Planning..." : "Build plan"}</button></div>
      </form>

      {activeLane && <section className="active-strip" style={{ "--active": activeLane.color }}><CircleDot size={16} /><span>In focus now</span><strong>{store.active.title}</strong><button onClick={clearActive}>End focus</button></section>}

      <section className="capture-panel">
        <div className="capture-heading"><div><span className="pulse-dot" />LIVE INPUT</div><small>Update this whenever your attention changes.</small></div>
        <div className="capture-form"><textarea value={activity} onChange={(event) => setActivity(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runAnalysis(); }} placeholder="I am about to spend time on..." aria-label="What are you doing right now" /><button className="analyze-button" onClick={runAnalysis} disabled={agentMode === "thinking"}><Sparkles size={17} /> {agentMode === "thinking" ? "Agents thinking" : "Ask the agents"} <ArrowRight size={16} /></button></div>
        {agentError && <p role="alert" style={{ color: "#b42318", margin: "12px 0 0" }}>{agentError}</p>}
        <div className="capture-prompts"><span>Try:</span><button onClick={() => setActivity("Spend two hours manually uploading product listings")}>Manual product work</button><button onClick={() => setActivity("Build a reusable creator outreach workflow")}>Build outreach system</button><button onClick={() => setActivity("Scroll Instagram for inspiration")}>Scroll for inspiration</button></div>
      </section>

      {analysis ? <section className="analysis-grid">
        <article className="decision-card"><div className="decision-top"><div><span className="eyebrow">AGENT VERDICT</span><h2>{analysis.verdict}</h2></div><span className={`verdict ${analysis.verdict.toLowerCase().replace(" ", "-")}`}>{analysis.lane.replace("automation", "AI automation")}</span></div><p className="activity-quote">鈥渰analysis.activity}鈥?/p><p className="decision-reason">{analysis.reason}</p><div className="score-pair"><Score label="Long-term compounding" value={analysis.longTerm} accent="#00a58b" /><Score label="Short-term return" value={analysis.shortTerm} accent="#4c80ff" /></div><div className="decision-action"><div><span>Next smallest move</span><strong>{analysis.nextAction}</strong></div><button className="start-button" onClick={startFocus}><Play size={15} /> Start focus</button></div></article>
        <article className="agent-discussion"><div className="discussion-title"><Bot size={17} /><h3>Agent discussion</h3><span>{agentMode === "live" ? "Live" : "Local"}</span></div><div className="thought"><span className="agent-initial teal">S</span><div><strong>{analysis.agent || "Strategist"}</strong><p>{analysis.longTerm >= 7 ? "This creates a reusable asset or strengthens the company鈥檚 core direction." : "This does not yet show a strong path to a reusable asset. Tighten the outcome first."}</p></div></div><div className="thought"><span className="agent-initial blue">O</span><div><strong>Operator</strong><p>{analysis.shortTerm >= 7 ? "There is a clear short-term payoff. Protect a time box and define the measurable result." : "The immediate return is limited. Only do this after your essential work is protected."}</p></div></div><div className="thought"><span className="agent-initial amber">G</span><div><strong>Guardian</strong><p>Keep the work bounded. A good priority can still become avoidance when it has no finish line.</p></div></div><div className="bridge-note"><LockKeyhole size={14} /> {agentMode === "live" ? "Live response received from your secure agent bridge." : agentMode === "fallback" ? "Live bridge did not respond, so Northstar used the local strategic model." : "Local strategic model active. Add a secure agent bridge to use live Hermes or OpenAI agents."}</div></article>
      </section> : <section className="empty-analysis"><Sparkles size={22} /><div><strong>Your agents are standing by.</strong><p>Describe the activity in plain language. They will weigh immediate payoff, long-term leverage, and the cost to your attention.</p></div></section>}

      <section className="focus-section">
        <div className="section-header"><div><span className="eyebrow">TURN DECISIONS INTO TIME</span><h2>Protected focus</h2><p>{completed} of {blocks.length} blocks complete today.</p></div><button className="quiet-button" onClick={copyYesterday}><RotateCcw size={15} /> Copy yesterday</button></div>
        <div className="goal-row"><Target size={17} /><input value={day.goal} onChange={(event) => updateDay({ ...day, goal: event.target.value })} placeholder="What one result makes today count?" aria-label="Daily result" /></div>
        <div className="schedule">
          {HOURS.map((hour) => <ScheduleRow key={hour} hour={hour} block={day.blocks?.[hour]} editing={editingHour === hour} onEdit={() => setEditingHour(hour)} onSave={(block) => saveBlock(hour, block)} onCancel={() => setEditingHour(null)} onToggle={() => saveBlock(hour, { ...day.blocks[hour], done: !day.blocks[hour].done })} />)}
        </div>
      </section>
      <section className="history-section"><div className="section-header"><div><span className="eyebrow">LEARNING LOOP</span><h2>Recent decisions</h2></div><span>{store.decisions.length} decisions captured</span></div>{recentDecisions.length ? <div className="history-grid">{recentDecisions.map((decision) => <article key={decision.id}><span className={`history-verdict ${decision.verdict.toLowerCase().replace(" ", "-")}`}>{decision.verdict}</span><strong>{decision.activity}</strong><p>{decision.longTerm}/10 long-term 路 {decision.shortTerm}/10 short-term</p></article>)}</div> : <p className="empty-history">Your decision history will become your evidence: what compounds, what pays, and what quietly drains you.</p>}</section>
    </section>
  </main>;
}

```

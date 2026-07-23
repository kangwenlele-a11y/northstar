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

const isAuthorized = (request, env) => Boolean(env.NORTHSTAR_ACCESS_CODE) && request.headers.get("X-Access-Code") === env.NORTHSTAR_ACCESS_CODE;

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
  if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
  const path = url.pathname.replace("/api/memory/", "");
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
    if (!upstream.ok) return json({ error: "The live agent is temporarily unavailable." }, 502);
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
  } catch {
    return json({ error: "The live agent is temporarily unavailable." }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/decision-assessments") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
      return assess(request, env);
    }
    if (url.pathname.startsWith("/api/memory/")) return memory(request, env, url);
    return new Response(appHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};

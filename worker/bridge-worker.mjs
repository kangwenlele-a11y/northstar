const model = "deepseek-ai/DeepSeek-V4-Flash";
const lanes = new Set(["automation", "agency", "art", "creator", "personal"]);
const verdicts = new Set(["Do now", "Schedule", "Protect", "Park it"]);
const agentLanes = ["codex", "hermes", "openclaw"];
const ownerKey = "richard";
/* __NORTHSTAR_APP_HTML__ */

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const score = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(1, Math.min(10, Math.round(Number(value)))) : fallback;

const isAuthorized = () => true;

async function callDeepSeek(prompt, maxTokens, env) {
  if (!env.SILICONFLOW_API_KEY) return json({ error: "The live agent has not been configured." }, 503);
  try {
    const upstream = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SILICONFLOW_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.2, enable_thinking: false }),
    });
    if (!upstream.ok) {
      const errorBody = await upstream.text();
      console.error("DeepSeek call failed", { status: upstream.status, body: errorBody.slice(0, 2000) });
      return null;
    }
    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return content.replace(/^```json\s*|^```|```$/gm, "").trim();
  } catch (error) {
    console.error("DeepSeek exception", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function supabase(request, env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Memory service is not configured." }, 503);
  const baseUrl = env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  let response;
  try {
    response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    console.error("Supabase fetch exception", { message: error instanceof Error ? error.message : String(error) });
    return json({ error: "Memory service network error.", detail: error instanceof Error ? error.message : String(error) }, 502);
  }
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("Supabase non-ok response", { status: response.status, body: errorBody.slice(0, 2000) });
    return json({ error: "Memory service request failed.", detail: errorBody.slice(0, 2000) }, response.status);
  }
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
  if (path === "roadmaps" && request.method === "GET") {
    const result = await supabase(request, env, `northstar_roadmaps?owner_key=eq.${ownerKey}&select=*&order=created_at.desc&limit=10`);
    return new Response(await result.text(), { headers: { "Content-Type": "application/json" } });
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
  const raw = await callDeepSeek(prompt, 180, env);
  if (!raw) return json({ error: "AI unavailable. The live Strategist could not be reached." }, 502);
  const answer = parseAssessment(raw);
  if (!answer) return json({ error: "The live agent returned an invalid assessment." }, 502);
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
}

function parseAssessment(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.longTerm === "number" && typeof parsed.verdict === "string") return parsed;
  } catch {}
  return null;
}

async function analyze(request, env) {
  if (!env.SILICONFLOW_API_KEY) return json({ error: "The live agent has not been configured." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const activity = typeof body.activity === "string" ? body.activity.trim() : "";
  const mission = typeof body.mission === "string" ? body.mission.trim() : "";
  const operatingBrief = typeof body.operatingBrief === "string" ? body.operatingBrief.trim() : "";
  const fallback = body.fallback;
  const mode = body.mode === "deep" ? "deep" : "quick";
  if (activity.length < 3 || activity.length > 1200 || mission.length < 10 || mission.length > 5000 || operatingBrief.length < 100 || operatingBrief.length > 12000 || !fallback) return json({ error: "Provide a valid activity and operating brief." }, 400);

  const draftPrompt = `You are the Northstar Strategist for a founder building an AI-first automation company. Use the full operating brief as the source of truth, not just the short mission.\n\nShort mission:\n${mission}\n\nFull operating brief:\n${operatingBrief}\n\nActivity: ${activity}\n\nReturn only valid JSON with exactly: longTerm (integer 1-10), shortTerm (integer 1-10), lane (automation|agency|art|creator|personal), verdict (Do now|Schedule|Protect|Park it), reason (max 2 concise sentences), nextAction (one concrete 30-60 minute move). Be direct. Prioritize reusable systems, automation, software, data, and learning. Treat e-commerce work as cash flow and a testing environment. Keep investing low priority unless essential. Do not use markdown.`;

  const draftRaw = await callDeepSeek(draftPrompt, 180, env);
  if (!draftRaw) return json({ error: "AI unavailable. The live Strategist could not produce a draft." }, 502);
  const draft = parseAssessment(draftRaw);
  if (!draft) return json({ error: "The live agent returned an invalid draft." }, 502);

  const scoreResult = (raw) => ({
    longTerm: score(raw.longTerm, score(fallback.longTerm, 5)),
    shortTerm: score(raw.shortTerm, score(fallback.shortTerm, 5)),
    lane: lanes.has(raw.lane) ? raw.lane : fallback.lane,
    verdict: verdicts.has(raw.verdict) ? raw.verdict : fallback.verdict,
    reason: typeof raw.reason === "string" ? raw.reason.slice(0, 480) : fallback.reason,
    nextAction: typeof raw.nextAction === "string" ? raw.nextAction.slice(0, 300) : fallback.nextAction,
  });

  if (mode === "quick") {
    return json({ final: scoreResult(draft), draft: null, critique: null, changed: false });
  }

  const critiquePrompt = `You are a critical reviewer for the Northstar decision system. Given the original question, the operating brief, and the draft assessment below, identify specific flaws.\n\nOriginal question: ${activity}\n\nOperating brief:\n${operatingBrief}\n\nDraft assessment:\n${JSON.stringify(draft)}\n\nFind at least one concrete issue among:\n1. Wrong niche/lane assignment — does the suggested lane match the activity and stated priorities?\n2. Missed dependencies — does the plan assume things that are not in place?\n3. Unrealistic timeboxing — is the suggested next action achievable in 30-60 minutes?\n4. Contradictions with stated priorities — does the verdict contradict the operating brief?\n\nReturn only valid JSON with exactly: objections (array of strings, each a concise concrete issue), severity ("minor"|"major"|"critical"), suggestedDirection (string describing what should change, or null). Do not rubber-stamp — find real problems.`;

  const critiqueRaw = await callDeepSeek(critiquePrompt, 300, env);
  let critique = { objections: ["Critique could not be generated."], severity: "minor", suggestedDirection: null };
  if (critiqueRaw) {
    try {
      const parsed = JSON.parse(critiqueRaw);
      if (parsed && Array.isArray(parsed.objections)) critique = parsed;
    } catch {}
  }

  const synthesisPrompt = `You are the final decision-maker for the Northstar system. Consider the original question, the draft assessment, and the critique below. Produce the best final verdict.\n\nOriginal question: ${activity}\n\nOperating brief:\n${operatingBrief}\n\nDraft:\n${JSON.stringify(draft)}\n\nCritique:\n${JSON.stringify(critique)}\n\nIf the critique raised valid points, adjust your answer. If not, the draft stands.\n\nReturn only valid JSON with exactly: longTerm (integer 1-10), shortTerm (integer 1-10), lane (automation|agency|art|creator|personal), verdict (Do now|Schedule|Protect|Park it), reason (max 2 concise sentences), nextAction (one concrete 30-60 minute move), addressedCritique (boolean), finalReasoning (string explaining how the critique changed or did not change the answer). Do not use markdown.`;

  const synthesisRaw = await callDeepSeek(synthesisPrompt, 300, env);
  if (!synthesisRaw) return json({ error: "AI unavailable. The live Strategist could not produce a synthesis." }, 502);
  const synthesis = parseAssessment(synthesisRaw);
  if (!synthesis) return json({ error: "The live agent returned an invalid synthesis." }, 502);

  const final = scoreResult(synthesis);
  const draftResult = scoreResult(draft);
  const changed = draftResult.verdict !== final.verdict || draftResult.lane !== final.lane;

  return json({
    final,
    draft: draftResult,
    critique: critique.objections.join(" "),
    changed,
  });
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

const ROADMAP_INSTRUCTION = `Given this goal and the full operating brief, produce a sequenced roadmap across the relevant niches. For each niche, in recommended order, return: niche, sequence_position, actions (2-4 concrete steps), reasoning (2-3 sentences on why this niche belongs at this position). Only include relevant niches. Respond ONLY as JSON array.`;

// The endpoint takes only { goal }, so the brief is read from the stored profile.
async function loadOperatingBrief(request, env) {
  const result = await supabase(request, env, `northstar_profiles?owner_key=eq.${ownerKey}&select=operating_brief&order=updated_at.desc&limit=1`);
  if (!result.ok) return "";
  try {
    const brief = (await result.json())?.[0]?.operating_brief;
    if (typeof brief === "string") return brief;
    if (brief && typeof brief.text === "string") return brief.text;
  } catch {}
  return "";
}

function parseRoadmap(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.roadmap) ? parsed.roadmap : Array.isArray(parsed?.niches) ? parsed.niches : null;
    return entries && entries.length ? entries : null;
  } catch {}
  return null;
}

function normalizeRoadmap(entries) {
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => ({
      niche: String(entry.niche ?? "").trim().slice(0, 120),
      sequence_position: Number.isFinite(Number(entry.sequence_position)) ? Number(entry.sequence_position) : index + 1,
      actions: (Array.isArray(entry.actions) ? entry.actions : [])
        .map((action) => typeof action === "string"
          ? { step: action.trim(), lane: null }
          : { step: String(action?.step ?? action?.title ?? action?.action ?? "").trim(), lane: typeof action?.lane === "string" ? action.lane.toLowerCase() : null })
        .filter((action) => action.step)
        .slice(0, 4),
      reasoning: typeof entry.reasoning === "string" ? entry.reasoning.trim().slice(0, 800) : "",
    }))
    .filter((entry) => entry.niche && entry.actions.length)
    .sort((a, b) => a.sequence_position - b.sequence_position)
    .map((entry, index) => ({ ...entry, sequence_position: index + 1 }));
}

const detectAgent = (value) => agentLanes.find((agent) => new RegExp(`\\b${agent}\\b`).test(String(value || "").toLowerCase())) || null;

async function createRoadmap(request, env) {
  if (!env.SILICONFLOW_API_KEY) return json({ error: "The live agent has not been configured." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (goal.length < 3 || goal.length > 500) return json({ error: "Provide a goal between 3 and 500 characters." }, 400);

  const stored = await loadOperatingBrief(request, env);
  const operatingBrief = stored || (typeof body.operatingBrief === "string" ? body.operatingBrief.trim() : "");
  if (operatingBrief.length < 100) return json({ error: "No operating brief is saved yet. Fill in the operating brief before building a roadmap." }, 400);

  const draftPrompt = `Goal: ${goal}\n\nFull operating brief:\n${operatingBrief}\n\n${ROADMAP_INSTRUCTION}`;
  const draftRaw = await callDeepSeek(draftPrompt, 1400, env);
  const draftEntries = parseRoadmap(draftRaw);
  if (!draftEntries) return json({ error: "The live agent could not produce a roadmap draft." }, 502);
  const draft = normalizeRoadmap(draftEntries);
  if (!draft.length) return json({ error: "The live agent returned an empty roadmap." }, 502);

  const critiquePrompt = `You are a critical reviewer for the Northstar roadmap planner. Given the goal, the operating brief, and the draft roadmap below, identify specific flaws.\n\nGoal: ${goal}\n\nOperating brief:\n${operatingBrief}\n\nDraft roadmap:\n${JSON.stringify(draft)}\n\nFind at least one concrete issue among:\n1. Wrong sequencing — is a niche placed before something it depends on?\n2. Irrelevant niches — does any niche fail to serve this goal?\n3. Missing niches — is a niche the brief treats as essential absent?\n4. Vague actions — is any step too abstract to start in one sitting?\n\nReturn only valid JSON with exactly: objections (array of strings, each a concise concrete issue), severity ("minor"|"major"|"critical"), suggestedDirection (string describing what should change, or null). Do not rubber-stamp — find real problems.`;
  const critiqueRaw = await callDeepSeek(critiquePrompt, 500, env);
  let critique = { objections: ["Critique could not be generated."], severity: "minor", suggestedDirection: null };
  if (critiqueRaw) {
    try {
      const parsed = JSON.parse(critiqueRaw);
      if (parsed && Array.isArray(parsed.objections)) critique = parsed;
    } catch {}
  }

  const synthesisPrompt = `You are the final planner for the Northstar system. Consider the goal, the draft roadmap, and the critique below. Produce the best final roadmap.\n\nGoal: ${goal}\n\nOperating brief:\n${operatingBrief}\n\nDraft roadmap:\n${JSON.stringify(draft)}\n\nCritique:\n${JSON.stringify(critique)}\n\nIf the critique raised valid points, adjust the roadmap. If not, the draft stands.\n\n${ROADMAP_INSTRUCTION}`;
  const synthesisRaw = await callDeepSeek(synthesisPrompt, 1400, env);
  const synthesisEntries = parseRoadmap(synthesisRaw);
  const roadmap = synthesisEntries ? normalizeRoadmap(synthesisEntries) : [];
  const niches = roadmap.length ? roadmap : draft;
  const changed = JSON.stringify(niches) !== JSON.stringify(draft);

  const savedResponse = await supabase(request, env, "northstar_roadmaps", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ owner_key: ownerKey, goal, niches }),
  });
  if (!savedResponse.ok) return savedResponse;
  const saved = await savedResponse.json().catch(() => null);

  // northstar_agent_state is keyed by agent, so each agent's steps collapse into one row.
  const byAgent = new Map();
  for (const entry of niches) {
    const entryAgent = detectAgent(entry.niche);
    for (const action of entry.actions) {
      const agent = detectAgent(action.lane) || entryAgent;
      if (!agent) continue;
      if (!byAgent.has(agent)) byAgent.set(agent, []);
      byAgent.get(agent).push(action.step);
    }
  }
  const assigned = [];
  for (const [agent, steps] of byAgent) {
    await supabase(request, env, "northstar_agent_state?on_conflict=agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ agent, current_task: steps[0], status: "idle", detail: steps.join(" · "), updated_at: new Date().toISOString() }),
    });
    assigned.push({ agent, steps });
  }

  return json({ id: saved?.[0]?.id ?? null, goal, niches, changed, critique: critique.objections.join(" "), assigned });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/decision-assessments") {
        if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
        if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
        return assess(request, env);
      }
      if (url.pathname === "/api/analyze") {
        if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
        if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
        return analyze(request, env);
      }
      if (url.pathname === "/api/plan") { if (request.method !== "POST") return json({ error: "Method not allowed." }, 405); return createPlan(request, env); }
      if (url.pathname === "/api/roadmap") {
        if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
        if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
        return createRoadmap(request, env);
      }
      if (url.pathname.startsWith("/api/memory/")) return memory(request, env, url);
      return new Response(appHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Northstar worker top-level exception", error);
      return json({
        error: "Unhandled worker error",
        detail: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, 500);
    }
  },
};

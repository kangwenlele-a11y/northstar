const model = "deepseek-ai/DeepSeek-V4-Flash";
const planLanes = new Set(["automation", "agency", "art", "creator", "personal"]);
const agentLanes = new Set(["codex", "hermes", "openclaw"]);
const allWorkLanes = new Set([...planLanes, ...agentLanes]);
const verdicts = new Set(["Do now", "Schedule", "Protect", "Park it"]);
const ownerKey = "richard";
/* __NORTHSTAR_APP_HTML__ */

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const score = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(1, Math.min(10, Math.round(Number(value)))) : fallback;

// Every agent route shares one wall-clock budget. Browsers give up on this
// Worker at roughly 22s, so a request that outlives the budget is useless even
// if it eventually succeeds — better to return a readable 504.
const AGENT_BUDGET_MS = 18000;
// Deep mode makes three sequential round trips and writes nothing to Supabase,
// so it can afford a slightly larger slice than routes that follow up with DB
// work. Everything stays under the ~22s the browser is willing to wait.
const DEEP_BUDGET_MS = 20000;
const startBudget = (ms = AGENT_BUDGET_MS) => Date.now() + ms;
const remainingMs = (deadline) => Math.max(1000, deadline - Date.now());

const isAuthorized = () => true;

class DeepSeekTimeout extends Error {}

// timeoutMs > 0 makes a slow upstream throw DeepSeekTimeout instead of hanging
// until the Worker is killed. Callers that omit it keep the old behaviour.
async function callDeepSeek(prompt, maxTokens, env, timeoutMs = 0) {
  if (!env.SILICONFLOW_API_KEY) return json({ error: "The live agent has not been configured." }, 503);
  try {
    const upstream = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SILICONFLOW_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.2, enable_thinking: false }),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
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
    if (timeoutMs && (error?.name === "TimeoutError" || error?.name === "AbortError")) throw new DeepSeekTimeout();
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

// Relays a Supabase result to the client with its status intact. Returning the
// body under a bare 200 made every upstream failure look like a success.
async function passthrough(result) {
  return new Response(await result.text(), {
    status: result.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function memory(request, env, url) {
  try {
  if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
  const path = url.pathname.replace("/api/memory/", "");
  if (path === "state" && request.method === "GET") {
    const result = await supabase(request, env, "northstar_agent_state?select=*&order=agent.asc");
    return passthrough(result);
  }
  if (path.startsWith("state/") && request.method === "PUT") {
    const agent = path.split("/")[1];
    if (!['richard', 'claude', 'codex', 'hermes', 'openclaw'].includes(agent)) return json({ error: "Unknown agent." }, 400);
    const body = await request.json();
    const result = await supabase(request, env, "northstar_agent_state?on_conflict=agent", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ agent, current_task: body.current_task || null, status: body.status || 'idle', detail: body.detail || null, blocked_reason: body.blocked_reason || null, updated_at: new Date().toISOString() }) });
    return passthrough(result);
  }
  if (path === "profile") {
    if (request.method === "GET") {
      const result = await supabase(request, env, `northstar_profiles?owner_key=eq.${ownerKey}&select=mission,operating_brief`);
      return passthrough(result);
    }
    if (request.method === "PUT") {
      const body = await request.json();
      const result = await supabase(request, env, "northstar_profiles?on_conflict=owner_key", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_key: ownerKey, mission: body.mission, operating_brief: body.operating_brief, updated_at: new Date().toISOString() }) });
      return passthrough(result);
    }
  }
  if (path === "decisions" && request.method === "GET") {
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const result = await supabase(request, env, `northstar_decisions?owner_key=eq.${ownerKey}&select=*&order=created_at.desc&limit=${limit}`);
    return passthrough(result);
  }
  if (path === "decisions" && request.method === "POST") {
    const body = await request.json();
    const result = await supabase(request, env, "northstar_decisions", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ owner_key: ownerKey, activity: body.activity, long_term_score: body.longTerm, short_term_score: body.shortTerm, lane: body.lane, verdict: body.verdict, reason: body.reason, next_action: body.nextAction }) });
    return passthrough(result);
  }
  if (path === "daily") {
    if (request.method === "GET") {
      const date = url.searchParams.get("date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json({ error: "Invalid date." }, 400);
      const result = await supabase(request, env, `northstar_daily_blocks?owner_key=eq.${ownerKey}&date=eq.${date}&select=*,northstar_goals(title)&order=hour.asc`);
      return passthrough(result);
    }
    if (request.method === "PUT") {
      const body = await request.json();
      const task = body.blocked_reason
        ? JSON.stringify({ version: 1, task: body.task, blockedReason: body.blocked_reason })
        : body.task;
      const fields = { owner_key: ownerKey, date: body.date, hour: body.hour, task, lane: body.lane, done: body.done, goal_id: body.goal_id || null, updated_at: new Date().toISOString() };
      if (body.niche) fields.niche = body.niche;
      const result = await supabase(request, env, "northstar_daily_blocks?on_conflict=owner_key,date,hour", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(fields) });
      return passthrough(result);
    }
  }
  if (path === "roadmaps" && request.method === "GET") {
    const result = await supabase(request, env, `northstar_roadmaps?owner_key=eq.${ownerKey}&select=*&order=created_at.desc&limit=10`);
    return passthrough(result);
  }
  if (path.startsWith("roadmaps/") && request.method === "PUT") {
    const id = path.split("/")[1];
    if (!/^[0-9a-f-]{36}$/i.test(id || "")) return json({ error: "Invalid roadmap." }, 400);
    const body = await request.json();
    if (!Array.isArray(body.niches)) return json({ error: "Invalid roadmap actions." }, 400);
    const result = await supabase(request, env, `northstar_roadmaps?id=eq.${id}&owner_key=eq.${ownerKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ niches: body.niches }),
    });
    return passthrough(result);
  }
  if (path === "active-focus") {
    if (request.method === "GET") {
      const result = await supabase(request, env, `northstar_active_focus?owner_key=eq.${ownerKey}&select=*`);
      return passthrough(result);
    }
    if (request.method === "PUT") {
      const body = await request.json();
      if (!body.task) {
        const result = await supabase(request, env, `northstar_active_focus?owner_key=eq.${ownerKey}`, { method: "DELETE" });
        if (!result.ok) return passthrough(result);
        return new Response(null, { status: 204 });
      }
      const result = await supabase(request, env, "northstar_active_focus?on_conflict=owner_key", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_key: ownerKey, task: body.task, lane: body.lane, started_at: body.started_at, updated_at: new Date().toISOString() }) });
      return passthrough(result);
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
  const raw = await callDeepSeek(prompt, 180, env, remainingMs(startBudget()));
  if (!raw) return json({ error: "AI unavailable. The live Strategist could not be reached." }, 502);
  const answer = parseAssessment(raw);
  if (!answer) return json({ error: "The live agent returned an invalid assessment." }, 502);
  return json({
    longTerm: score(answer.longTerm, score(fallback.longTerm, 5)),
    shortTerm: score(answer.shortTerm, score(fallback.shortTerm, 5)),
    lane: planLanes.has(answer.lane) ? answer.lane : fallback.lane,
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

  // One budget spans all three passes, not 18s each.
  const deadline = startBudget(mode === "deep" ? DEEP_BUDGET_MS : AGENT_BUDGET_MS);
  const draftRaw = await callDeepSeek(draftPrompt, 180, env, remainingMs(deadline));
  if (!draftRaw) return json({ error: "AI unavailable. The live Strategist could not produce a draft." }, 502);
  const draft = parseAssessment(draftRaw);
  if (!draft) return json({ error: "The live agent returned an invalid draft." }, 502);

  const scoreResult = (raw) => ({
    longTerm: score(raw.longTerm, score(fallback.longTerm, 5)),
    shortTerm: score(raw.shortTerm, score(fallback.shortTerm, 5)),
    lane: planLanes.has(raw.lane) ? raw.lane : fallback.lane,
    verdict: verdicts.has(raw.verdict) ? raw.verdict : fallback.verdict,
    reason: typeof raw.reason === "string" ? raw.reason.slice(0, 480) : fallback.reason,
    nextAction: typeof raw.nextAction === "string" ? raw.nextAction.slice(0, 300) : fallback.nextAction,
  });

  if (mode === "quick") {
    return json({ final: scoreResult(draft), draft: null, critique: null, changed: false });
  }

  const critiquePrompt = `You are a critical reviewer for the Northstar decision system. Given the original question, the operating brief, and the draft assessment below, identify specific flaws.\n\nOriginal question: ${activity}\n\nOperating brief:\n${operatingBrief}\n\nDraft assessment:\n${JSON.stringify(draft)}\n\nFind at least one concrete issue among:\n1. Wrong niche/lane assignment — does the suggested lane match the activity and stated priorities?\n2. Missed dependencies — does the plan assume things that are not in place?\n3. Unrealistic timeboxing — is the suggested next action achievable in 30-60 minutes?\n4. Contradictions with stated priorities — does the verdict contradict the operating brief?\n\nReturn only valid JSON with exactly: objections (array of strings, each a concise concrete issue), severity ("minor"|"major"|"critical"), suggestedDirection (string describing what should change, or null). Do not rubber-stamp — find real problems.`;

  // Deep mode makes three sequential round trips against an upstream whose
  // latency is unpredictable, so the review passes regularly outrun the budget.
  // The draft is already good enough to return — degrade to it rather than
  // throwing away a usable answer and erroring.
  const degraded = () => json({
    final: scoreResult(draft),
    draft: null,
    critique: null,
    changed: false,
    degraded: "Deep review ran out of time, so this is the first-pass answer.",
  });

  let critiqueRaw;
  try {
    critiqueRaw = await callDeepSeek(critiquePrompt, 300, env, remainingMs(deadline));
  } catch (error) {
    if (error instanceof DeepSeekTimeout) return degraded();
    throw error;
  }
  let critique = { objections: ["Critique could not be generated."], severity: "minor", suggestedDirection: null };
  if (critiqueRaw) {
    try {
      const parsed = JSON.parse(critiqueRaw);
      if (parsed && Array.isArray(parsed.objections)) critique = parsed;
    } catch {}
  }

  const synthesisPrompt = `You are the final decision-maker for the Northstar system. Consider the original question, the draft assessment, and the critique below. Produce the best final verdict.\n\nOriginal question: ${activity}\n\nOperating brief:\n${operatingBrief}\n\nDraft:\n${JSON.stringify(draft)}\n\nCritique:\n${JSON.stringify(critique)}\n\nIf the critique raised valid points, adjust your answer. If not, the draft stands.\n\nReturn only valid JSON with exactly: longTerm (integer 1-10), shortTerm (integer 1-10), lane (automation|agency|art|creator|personal), verdict (Do now|Schedule|Protect|Park it), reason (max 2 concise sentences), nextAction (one concrete 30-60 minute move), addressedCritique (boolean), finalReasoning (string explaining how the critique changed or did not change the answer). Do not use markdown.`;

  let synthesisRaw;
  try {
    synthesisRaw = await callDeepSeek(synthesisPrompt, 300, env, remainingMs(deadline));
  } catch (error) {
    if (error instanceof DeepSeekTimeout) return degraded();
    throw error;
  }
  if (!synthesisRaw) return degraded();
  const synthesis = parseAssessment(synthesisRaw);
  if (!synthesis) return degraded();

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
  if (!env.SILICONFLOW_API_KEY) return json({ error: "The live agent has not been configured." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const operatingBrief = typeof body.operatingBrief === "string" ? body.operatingBrief.trim() : "";
  const niche = typeof body.niche === "string" ? body.niche.trim().toLowerCase() : "";
  if (goal.length < 3 || goal.length > 500 || operatingBrief.length < 100) return json({ error: "Provide a valid goal and operating brief." }, 400);

  // Single LLM call — classify complexity AND produce tasks in one round trip.
  const prompt = `Given this goal: ${goal}\n\nOperating brief:\n${operatingBrief}\n\nClassify the goal's complexity and return tasks in ONE JSON object.

A goal is "simple" when it describes one concrete action the user could just do (edit prices, upload a listing, reply to a client, post one video). A single clear action is simple even if it takes an hour.

A goal is "complex" when it requires sequencing multiple distinct activities with real dependencies or unknowns — decisions, building, or multi-step outcomes.

Return only valid JSON with exactly:
- complexity: "simple" or "complex"
- tasks: array of steps

If simple: tasks has exactly 1 item. Return the goal verbatim or lightly cleaned as that single step title. detail is a one-sentence description. estimated_minutes reflects the actual time. depends_on is null.

If complex: tasks has 3-6 items. Each item: title (under 10 words), detail (one sentence, under 20 words), estimated_minutes, depends_on (prior step index or null, first step has null).

The niche is already known from the form field — do NOT infer or assign lane. The system will handle niche assignment separately. Be terse.`;
  const raw = await callDeepSeek(prompt, 900, env, remainingMs(startBudget()));
  if (!raw) return json({ error: "Planner unavailable. The live planner could not be reached." }, 502);
  let steps, complexity;
  try { const parsed = JSON.parse(raw); complexity = parsed.complexity; steps = parsed.tasks; } catch { return json({ error: "The planner returned a response that could not be read. Try a shorter goal." }, 502); }
  if (!Array.isArray(steps) || !steps.length) return json({ error: "The planner returned no steps." }, 502);
  const goalResponse = await supabase(request, env, "northstar_goals", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ title: goal }) });
  const goals = await goalResponse.json(); const goalId = goals?.[0]?.id;
  const today = new Date(); let hour = Math.max(9, today.getHours() + 1); let day = today.toISOString().slice(0, 10); const scheduled=[];
  for (let index=0; index<Math.min(8, steps.length); index++) { const step=steps[index]; if(hour>21){ today.setDate(today.getDate()+1); day=today.toISOString().slice(0,10); hour=9; }
    await supabase(request, env, "northstar_daily_blocks?on_conflict=owner_key,date,hour", { method:"POST", headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"}, body:JSON.stringify({owner_key:ownerKey,date:day,hour,task:`${step.title}: ${step.detail}`,niche,goal_id:goalId,depends_on:Number.isInteger(step.depends_on)?step.depends_on:null,done:false}) });
    scheduled.push({ ...step, date:day, hour, niche }); hour += Math.max(1, Math.ceil((Number(step.estimated_minutes)||60)/60)); }
  return json({ goal_id:goalId, niche, complexity, steps:scheduled });
}

// Bounded to keep generation inside the Worker execution limit — the upstream
// model runs at roughly 20 tokens/sec, so output length drives wall-clock time.
const ROADMAP_INSTRUCTION = `Given this goal and the full operating brief, produce a sequenced roadmap across the relevant niches. Return exactly 2 or 3 niches, never more. For each niche, in recommended order, return: niche, sequence_position, actions (2-3 concrete steps, each under 12 words), reasoning (2 sentences, under 35 words total, on why this niche belongs at this position). Only include relevant niches. Be terse. Respond ONLY as JSON array.`;

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
    .slice(0, 3)
    .map((entry, index) => ({ ...entry, sequence_position: index + 1 }));
}

const detectAgent = (value) => { for (const agent of agentLanes) { if (new RegExp(`\\b${agent}\\b`).test(String(value || "").toLowerCase())) return agent; } return null; };

async function createRoadmap(request, env) {
  if (!env.SILICONFLOW_API_KEY) return json({ error: "The live agent has not been configured." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (goal.length < 3 || goal.length > 500) return json({ error: "Provide a goal between 3 and 500 characters." }, 400);

  const stored = await loadOperatingBrief(request, env);
  const operatingBrief = stored || (typeof body.operatingBrief === "string" ? body.operatingBrief.trim() : "");
  if (operatingBrief.length < 100) return json({ error: "No operating brief is saved yet. Fill in the operating brief before building a roadmap." }, 400);

  // Single pass: the 3-pass deep flow exceeded the Worker execution limit.
  const prompt = `Goal: ${goal}\n\nFull operating brief:\n${operatingBrief}\n\n${ROADMAP_INSTRUCTION}`;
  const raw = await callDeepSeek(prompt, 600, env, remainingMs(startBudget()));
  const entries = parseRoadmap(raw);
  if (!entries) return json({ error: "The live agent could not produce a roadmap." }, 502);
  const niches = normalizeRoadmap(entries);
  if (!niches.length) return json({ error: "The live agent returned an empty roadmap." }, 502);

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

  return json({ id: saved?.[0]?.id ?? null, goal, niches, assigned });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      // Any agent route that outruns its budget answers 504 with readable text
      // instead of leaving the browser on a dead socket.
      const agentRoute = async (handler) => {
        try {
          return await handler(request, env);
        } catch (error) {
          if (error instanceof DeepSeekTimeout) return json({ error: "The agent did not respond in time. Try a shorter, more specific request." }, 504);
          throw error;
        }
      };
      if (url.pathname === "/api/decision-assessments") {
        if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
        if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
        return agentRoute(assess);
      }
      if (url.pathname === "/api/analyze") {
        if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
        if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
        return agentRoute(analyze);
      }
      if (url.pathname === "/api/plan") { if (request.method !== "POST") return json({ error: "Method not allowed." }, 405); return agentRoute(createPlan); }
      if (url.pathname === "/api/roadmap") {
        if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
        if (!isAuthorized(request, env)) return json({ error: "Access code required." }, 401);
        return agentRoute(createRoadmap);
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

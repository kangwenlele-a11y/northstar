const model = "deepseek-ai/DeepSeek-V4-Flash";
const lanes = new Set(["automation", "agency", "art", "creator", "personal"]);
const verdicts = new Set(["Do now", "Schedule", "Protect", "Park it"]);
/* __NORTHSTAR_APP_HTML__ */

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const score = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(1, Math.min(10, Math.round(Number(value)))) : fallback;

async function assess(request, env) {
  if (!env.SILICONFLOW_API_KEY) return json({ error: "The live agent has not been configured." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const activity = typeof body.activity === "string" ? body.activity.trim() : "";
  const mission = typeof body.mission === "string" ? body.mission.trim() : "";
  const fallback = body.fallback;
  if (activity.length < 3 || activity.length > 1200 || mission.length < 10 || mission.length > 5000 || !fallback) return json({ error: "Provide a valid activity and mission." }, 400);

  const prompt = `You are the Northstar Strategist for a founder building an AI-first automation company. Assess one activity against this mission:\n${mission}\n\nActivity: ${activity}\n\nReturn only valid JSON with exactly: longTerm (integer 1-10), shortTerm (integer 1-10), lane (automation|agency|art|creator|personal), verdict (Do now|Schedule|Protect|Park it), reason (max 2 concise sentences), nextAction (one concrete 30-60 minute move). Be direct. Prioritize reusable systems, automation, software, data, and learning. Treat e-commerce work as cash flow and a testing environment. Keep investing low priority unless essential. Do not use markdown.`;
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
      return assess(request, env);
    }
    return new Response(appHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};

const API = "/api/memory";

async function request(code, path, options = {}) {
  const { timeoutMs, ...init } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      signal: controller?.signal,
      headers: { "Content-Type": "application/json", "X-Access-Code": code, ...(init.headers || {}) },
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s. The agent did not respond in time — try a shorter goal.`);
    throw new Error("Could not reach the agent. Check your connection and try again.");
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error("Access code rejected.");
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

export const memoryApi = {
  profile: (code) => request(code, "/profile"),
  saveProfile: (code, data) => request(code, "/profile", { method: "PUT", body: JSON.stringify(data) }),
  decisions: (code) => request(code, "/decisions?limit=50"),
  saveDecision: (code, data) => request(code, "/decisions", { method: "POST", body: JSON.stringify(data) }),
  daily: (code, date) => request(code, `/daily?date=${encodeURIComponent(date)}`),
  saveDaily: (code, data) => request(code, "/daily", { method: "PUT", body: JSON.stringify(data) }),
  active: (code) => request(code, "/active-focus"),
  saveActive: (code, data) => request(code, "/active-focus", { method: "PUT", body: JSON.stringify(data) }),
  agentState: (code) => request(code, "/state"),
  saveAgentState: (code, agent, data) => request(code, `/state/${encodeURIComponent(agent)}`, { method: "PUT", body: JSON.stringify(data) }),
  plan: (code, goal, operatingBrief) => request(code, "/../plan", { method: "POST", timeoutMs: 20000, body: JSON.stringify({ goal, operatingBrief }) }),
  roadmaps: (code) => request(code, "/roadmaps"),
  buildRoadmap: (code, goal) => request(code, "/../roadmap", { method: "POST", timeoutMs: 20000, body: JSON.stringify({ goal }) }),
};

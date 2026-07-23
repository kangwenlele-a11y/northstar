const API = "/api/memory";

async function request(code, path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Access-Code": code, ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Access code rejected." : "Memory service unavailable.");
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
};

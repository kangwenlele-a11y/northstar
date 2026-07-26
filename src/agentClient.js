const bridgeUrl = import.meta.env.MODE === "hosted" ? "" : import.meta.env.VITE_AGENT_BRIDGE_URL?.replace(/\/$/, "") || "";

export function hasLiveAgentBridge() {
  return true;
}

export async function requestLiveAssessment({ activity, mission, operatingBrief, fallback, accessCode, mode = "quick" }) {
  const endpoint = bridgeUrl ? `${bridgeUrl}/v1/analyze` : "/api/analyze";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Access-Code": accessCode },
      body: JSON.stringify({ activity, mission, operatingBrief, fallback, mode }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Timed out after 20s. The agent did not respond in time — try a shorter activity.");
    throw new Error("Could not reach the agent. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "AI unavailable. The agent bridge request failed.");
  }
  const result = await response.json();
  if (!result || typeof result !== "object") throw new Error("The agent bridge returned an invalid response.");
  return result;
}
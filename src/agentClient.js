const bridgeUrl = import.meta.env.MODE === "hosted" ? "" : import.meta.env.VITE_AGENT_BRIDGE_URL?.replace(/\/$/, "") || "";

export function hasLiveAgentBridge() {
  return true;
}

export async function requestLiveAssessment({ activity, mission, fallback }) {
  const endpoint = bridgeUrl ? `${bridgeUrl}/v1/decision-assessments` : "/api/decision-assessments";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activity, mission, fallback }),
  });
  if (!response.ok) throw new Error("The agent bridge did not accept this request.");
  const result = await response.json();
  if (!result || typeof result !== "object") throw new Error("The agent bridge returned an invalid response.");
  return result;
}

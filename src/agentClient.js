const bridgeUrl = import.meta.env.MODE === "hosted" ? "" : import.meta.env.VITE_AGENT_BRIDGE_URL?.replace(/\/$/, "") || "";

export function hasLiveAgentBridge() {
  return true;
}

export async function requestLiveAssessment({ activity, mission, operatingBrief, fallback, accessCode }) {
  const endpoint = bridgeUrl ? `${bridgeUrl}/v1/decision-assessments` : "/api/decision-assessments";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Code": accessCode },
    body: JSON.stringify({ activity, mission, operatingBrief, fallback }),
  });
  if (!response.ok) throw new Error("The agent bridge did not accept this request.");
  const result = await response.json();
  if (!result || typeof result !== "object") throw new Error("The agent bridge returned an invalid response.");
  return result;
}

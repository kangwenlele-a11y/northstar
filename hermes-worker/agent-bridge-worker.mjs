/* Run this on the Hermes device. Keep its worker token on that device only. */
const bridgeUrl = process.env.AGENT_BRIDGE_URL;
const workerToken = process.env.HERMES_WORKER_TOKEN;

if (!bridgeUrl || !workerToken) {
  throw new Error("Set AGENT_BRIDGE_URL and HERMES_WORKER_TOKEN before starting the worker.");
}

async function callHermes(job) {
  // Replace this with the documented local Hermes/OpenClaw command or gateway call.
  // Return JSON matching ../agent-bridge/decision-contract.json.
  throw new Error("callHermes() is not connected to your Hermes gateway yet.");
}

const root = bridgeUrl.replace(/\/$/, "");
const next = await fetch(`${root}/v1/worker/next`, { headers: { Authorization: `Bearer ${workerToken}` } });
if (next.status !== 204) {
  if (!next.ok) throw new Error(`Could not fetch agent work (${next.status}).`);
  const job = await next.json();
  try {
    const assessment = await callHermes(job);
    await fetch(`${root}/v1/worker/${job.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify(assessment),
    });
  } catch (error) {
    await fetch(`${root}/v1/worker/${job.id}/failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({ message: error instanceof Error ? error.message : "Unknown Hermes worker error" }),
    });
  }
}

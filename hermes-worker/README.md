# Hermes worker

Northstar sends work to an authenticated bridge. Hermes pulls the next item, evaluates it locally, then returns the assessment through that same bridge. No inbound port needs to be opened on the Hermes device, and the browser never sees the worker token or an AI key.

Set `AGENT_BRIDGE_URL` and `HERMES_WORKER_TOKEN` only on the Hermes device, then replace `callHermes()` with the documented API or command for that Hermes installation.

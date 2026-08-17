import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Live agent network view for the Northstar command center.
//
// Shows, in real time, what every agent on this machine is doing and which
// processes are active — across ALL projects (the room and bus are
// project-agnostic; nothing here is A-share specific).
//
// Data sources (CORS is open on both):
//   bridge  http://127.0.0.1:3792/api/agents   per-agent status/task/lastSeen
//   bridge  http://127.0.0.1:3792/api/messages the agent room's message log
//   bus     http://127.0.0.1:3791/events       the universal activity bus

const BRIDGE = "http://127.0.0.1:3792";
const BUS = "http://127.0.0.1:3791";

function fetchJson(url) {
  return fetch(url, { signal: AbortSignal.timeout(6000) }).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  });
}

function relTime(iso) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const stripRe = (subject) => String(subject || "").replace(/^re:\s*/i, "").trim();

export function AgentsView() {
  const [agents, setAgents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [bridgeOk, setBridgeOk] = useState(true);
  const [busOk, setBusOk] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [paused, setPaused] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    const [a, m, e] = await Promise.allSettled([
      fetchJson(`${BRIDGE}/api/agents`),
      fetchJson(`${BRIDGE}/api/messages`),
      fetchJson(`${BUS}/events`),
    ]);
    if (a.status === "fulfilled") { setAgents(a.value.agents || []); setBridgeOk(true); }
    else setBridgeOk(false);
    if (m.status === "fulfilled") setMessages(m.value.messages || []);
    if (e.status === "fulfilled") setEvents(e.value || []);
    setBusOk(e.status === "fulfilled");
    setLastSync(new Date());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!paused) load(); }, 10000);
    return () => clearInterval(id);
  }, [load, paused]);

  // ── Agent board ────────────────────────────────────────────────
  const sortedAgents = useMemo(() => {
    const rank = { working: 0, idle: 1, assigned: 1, unknown: 2 };
    return [...agents].sort((x, y) => (rank[x.status] ?? 2) - (rank[y.status] ?? 2) || String(x.agent).localeCompare(String(y.agent)));
  }, [agents]);
  const workingCount = agents.filter((a) => a.status === "working" || a.online).length;

  // ── Process tracker: group room messages into threads ───────────
  const threads = useMemo(() => {
    const room = (messages || []).filter((m) => m.kind === "message" && m.subject);
    const bySubject = new Map();
    for (const m of room) {
      const key = stripRe(m.subject).toLowerCase();
      const entry = bySubject.get(key) || { subject: m.subject, latest: m.ts, count: 0, participants: new Set(), lastBody: "" };
      entry.latest = entry.latest > m.ts ? entry.latest : m.ts;
      entry.count += 1;
      entry.participants.add(m.from);
      for (const t of Array.isArray(m.to) ? m.to : [m.to]) if (t) entry.participants.add(t);
      entry.lastBody = m.body || entry.lastBody;
      bySubject.set(key, entry);
    }
    return [...bySubject.values()]
      .sort((x, y) => (y.latest > x.latest ? 1 : -1))
      .slice(0, 8)
      .map((t) => ({ ...t, participants: [...t.participants] }));
  }, [messages]);

  // ── Unified activity feed (room messages + bus events) ──────────
  const feed = useMemo(() => {
    const items = [];
    for (const m of messages || []) {
      if (m.kind === "message" && m.subject) {
        items.push({ id: m.id || `msg-${m.ts}`, ts: m.ts, kind: "message", from: m.from, to: Array.isArray(m.to) ? m.to : [m.to], subject: m.subject, body: m.body });
      }
    }
    for (const e of events || []) {
      if (e.type === "message" && e.data?.subject) {
        items.push({ id: `bus-${e.ts}-${e.data.subject}`, ts: e.ts, kind: "message", from: e.data.from, to: Array.isArray(e.data.to) ? e.data.to : [e.data.to], subject: e.data.subject, body: e.data.body });
      } else if (e.type !== "message" && e.data?.activity) {
        items.push({ id: `evt-${e.ts}-${e.data.activity}`, ts: e.ts, kind: "activity", from: e.data.agent || e.source, activity: e.data.activity });
      }
    }
    const seen = new Set();
    return items
      .sort((x, y) => (y.ts > x.ts ? 1 : -1))
      .filter((item) => {
        const key = `${item.kind}|${item.ts}|${item.subject || item.activity}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 30);
  }, [messages, events]);

  const statusClass = (agent) => (agent.status === "working" || agent.online ? "working" : agent.status === "idle" || agent.status === "assigned" ? "idle" : "unknown");

  return <section className="agents-view">
    <header className="command-header">
      <div>
        <p className="eyebrow">LIVE AGENT NETWORK — all projects</p>
        <h1>What the agents are doing, right now.</h1>
        <p className="subhead">Agent status, active processes and the activity feed, polled from the room bridge and the bus. Nothing here is specific to one project.</p>
      </div>
      <div className="agents-header-actions">
        <span className={`source-chip ${bridgeOk ? "ok" : "down"}`}>bridge {bridgeOk ? "ok" : "down"}</span>
        <span className={`source-chip ${busOk ? "ok" : "down"}`}>bus {busOk ? "ok" : "down"}</span>
        <button className="quiet-button" onClick={() => setPaused((v) => !v)}>{paused ? "▶ resume" : "❚❚ pause"}</button>
        <button className="quiet-button" onClick={load}>refresh</button>
      </div>
    </header>

    <p className="agents-sync-note">{workingCount} working · {agents.length} registered · synced {lastSync ? relTime(lastSync.toISOString()) : "…"} · auto-refresh {paused ? "paused" : "every 10s"}</p>

    <section className="agents-board">
      {sortedAgents.length === 0 && <p className="board-empty">No agents visible — is the bridge (127.0.0.1:3792) running?</p>}
      {sortedAgents.map((agent) => (
        <article key={agent.agent} className="agent-live-card">
          <div className="agent-live-head">
            <span className={`live-dot ${statusClass(agent)}`} />
            <strong>{agent.agent}</strong>
            <span className={`agent-live-status ${statusClass(agent)}`}>{agent.status || "unknown"}</span>
            {agent.unread > 0 && <span className="unread-badge">{agent.unread}</span>}
          </div>
          <p className="agent-live-task">{agent.task || agent.detail || "No task queued"}</p>
          <div className="agent-live-meta">
            <span>seen {relTime(agent.lastSeen)}</span>
            <span>{agent.messagesSent ?? 0}→{agent.messagesReceived ?? 0}</span>
          </div>
        </article>
      ))}
    </section>

    <section className="processes-section">
      <div className="section-header"><div><span className="eyebrow">ACTIVE PROCESSES</span><h2>What is being worked on</h2><p>The most recent conversation threads in the room, with who is in each.</p></div></div>
      {threads.length === 0 ? <p className="board-empty">No active threads.</p> : <div className="process-list">
        {threads.map((t) => (
          <article key={t.subject} className="process-card">
            <div className="process-head">
              <span className="process-subject">{t.subject}</span>
              <span className="process-ago">{relTime(t.latest)}</span>
            </div>
            <div className="process-meta">
              <span className="process-participants">{t.participants.join(" · ")}</span>
              <span className="process-count">{t.count} msg{t.count > 1 ? "s" : ""}</span>
            </div>
            {t.lastBody && <p className="process-preview">{String(t.lastBody).slice(0, 200)}{String(t.lastBody).length > 200 ? "…" : ""}</p>}
          </article>
        ))}
      </div>}
    </section>

    <section className="feed-section">
      <div className="section-header"><div><span className="eyebrow">ACTIVITY FEED</span><h2>Latest messages</h2><p>Room messages and bus events, newest first. Click a row to expand.</p></div></div>
      {feed.length === 0 ? <p className="board-empty">No activity yet.</p> : <div className="feed-list">
        {feed.map((item) => (
          <article key={item.id} className={`feed-row ${item.kind}`} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
            <div className="feed-line">
              <span className="feed-time">{relTime(item.ts)}</span>
              <span className="feed-from">{item.from || "?"}</span>
              <span className="feed-arrow">→</span>
              <span className="feed-to">{(item.to || []).join(",") || "*"}</span>
              <span className="feed-subject">{item.kind === "activity" ? item.activity : item.subject}</span>
            </div>
            {expandedId === item.id && item.body && <p className="feed-body">{item.body}</p>}
          </article>
        ))}
      </div>}
    </section>
  </section>;
}

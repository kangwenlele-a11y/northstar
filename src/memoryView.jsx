import { useCallback, useEffect, useMemo, useState } from "react";

// Memory view — Claude's learned knowledge, synced into Northstar.
//
// Reads the memory bridge (127.0.0.1:3793): Claude Code writes memories as
// Markdown files under ~/.claude/projects/**/memory/ and (for Co-work /
// desktop sessions via the memory MCP) ~/.claude/memory/; this view shows
// them grouped by project, searchable, and lets you add/edit/delete with
// write-back to those same files (two-way).

const BRIDGE = "http://127.0.0.1:3793";

function fetchJson(url, init) {
  return fetch(url, { signal: AbortSignal.timeout(6000), ...init }).then((res) => {
    if (!res.ok) return res.json().then((e) => { throw new Error(e?.error || `${res.status}`); });
    return res.json();
  });
}

function relTime(iso) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const EMPTY_FORM = { project: "shared", name: "", description: "", body: "" };

export function MemoryView() {
  const [memories, setMemories] = useState([]);
  const [bridgeOk, setBridgeOk] = useState(true);
  const [syncedAt, setSyncedAt] = useState(null);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null); // {project, name} being edited
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await fetchJson(`${BRIDGE}/memory`);
      setMemories(d.memories || []);
      setSyncedAt(d.syncedAt);
      setBridgeOk(true);
    } catch {
      setBridgeOk(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const projects = useMemo(() => {
    const set = new Set();
    for (const m of memories) set.add(m.project);
    return ["all", ...[...set].sort()];
  }, [memories]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return memories.filter((m) => {
      if (projectFilter !== "all" && m.project !== projectFilter) return false;
      if (!q) return true;
      return (m.name || "").toLowerCase().includes(q) || (m.body || "").toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q);
    });
  }, [memories, query, projectFilter]);

  const sourceCount = (src) => memories.filter((m) => m.source === src).length;

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.body.trim() || busy) return;
    setBusy(true); setError(""); setSaved("");
    try {
      await fetchJson(`${BRIDGE}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSaved(editing ? `Updated ${editing.name}.` : `Saved ${form.name}.`);
      setForm(EMPTY_FORM);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (m) => {
    setEditing({ project: m.project, name: m.name });
    setForm({ project: m.project, name: m.name, description: m.description || "", body: m.body });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete memory '${m.name}' (${m.project})? This removes the file.`)) return;
    setBusy(true); setError("");
    try {
      await fetchJson(`${BRIDGE}/memory/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: m.project, name: m.name }),
      });
      setSaved(`Deleted ${m.name}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="memory-view">
    <header className="command-header">
      <div>
        <p className="eyebrow">MEMORY — WHAT CLAUDE KNOWS</p>
        <h1>Learned knowledge, synced.</h1>
        <p className="subhead">Claude Code memory files and (via the memory MCP) Co-work/desktop memories — shown here and editable, with write-back to the same files.</p>
      </div>
      <div className="agents-header-actions">
        <span className={`source-chip ${bridgeOk ? "ok" : "down"}`}>bridge {bridgeOk ? "ok" : "down"}</span>
        <button className="quiet-button" onClick={load}>refresh</button>
      </div>
    </header>

    <p className="agents-sync-note">{memories.length} memories · {sourceCount("claude-code")} from Claude Code · {sourceCount("claude")} from Co-work/shared · synced {syncedAt ? relTime(syncedAt) : "…"} · auto-refresh 15s</p>

    {error && <p role="alert" className="load-error">{error}</p>}
    {saved && <p className="memory-saved">{saved}</p>}

    <form className="memory-form" onSubmit={submit}>
      <div className="section-header"><div><span className="eyebrow">{editing ? "EDIT MEMORY" : "NEW MEMORY"}</span><h2>{editing ? `Editing ${editing.name}` : "Add what Claude should remember"}</h2><p>Writes a Markdown file back into the memory folder. Claude Code picks it up automatically; Co-work sessions see it once the memory MCP is connected.</p></div></div>
      <div className="memory-form-grid">
        <label>Project
          <select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}>
            {projects.filter((p) => p !== "all").map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. trading-desk-rules" disabled={!!editing} />
        </label>
        <label className="memory-form-wide">Description
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="One line — what this memory is about" />
        </label>
        <label className="memory-form-wide">Body
          <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="What should be remembered…" />
        </label>
      </div>
      <div className="memory-form-actions">
        <button type="submit" className="analyze-button" disabled={busy || !form.name.trim() || !form.body.trim()}>{busy ? "Saving…" : editing ? "Update memory" : "Save memory"}</button>
        {editing && <button type="button" className="quiet-button" onClick={() => { setEditing(null); setForm(EMPTY_FORM); }}>Cancel edit</button>}
      </div>
    </form>

    <section className="memory-list-section">
      <div className="section-header">
        <div><span className="eyebrow">MEMORY INDEX</span><h2>{filtered.length} {filtered.length === 1 ? "memory" : "memories"}</h2><p>Search across names, descriptions and bodies.</p></div>
        <div className="memory-controls">
          <input className="memory-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memory…" />
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filter by project">
            {projects.map((p) => <option key={p} value={p}>{p === "all" ? "All projects" : p}</option>)}
          </select>
        </div>
      </div>
      {filtered.length === 0 ? <p className="board-empty">{bridgeOk ? "No memories match." : "Memory bridge unreachable — is memory-bridge.mjs running on :3793?"}</p> : <div className="memory-list">
        {filtered.map((m) => {
          const key = `${m.project}/${m.name}`;
          const open = expanded === key;
          return <article key={key} className="memory-card">
            <div className="memory-card-head" onClick={() => setExpanded(open ? null : key)}>
              <div className="memory-card-title">
                <strong>{m.name}</strong>
                <span className={`source-badge ${m.source === "claude-code" ? "cc" : "cowork"}`}>{m.source === "claude-code" ? "Claude Code" : "Co-work/shared"}</span>
                {m.description && <small>{m.description}</small>}
              </div>
              <div className="memory-card-meta">
                <span>{m.project}</span>
                <span>{relTime(m.modified)}</span>
              </div>
            </div>
            {open && <div className="memory-card-body">
              <pre>{m.body}</pre>
              <div className="memory-card-actions">
                <button className="quiet-button" onClick={() => startEdit(m)}>Edit</button>
                <button className="quiet-button" onClick={() => remove(m)}>Delete</button>
              </div>
            </div>}
          </article>;
        })}
      </div>}
    </section>
  </section>;
}

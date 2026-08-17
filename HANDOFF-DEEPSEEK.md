# Handoff — DeepSeek agent (dsh) → Claude / Co-work / Claude Code

**Author:** dsh (DeepSeek agent, DSH harness session)
**Date:** 2026-08-17
**Scope:** everything dsh built or changed across `~/ashare-desk` and `~/Desktop/northstar`, and exactly what to tell each Claude surface next.

---

## PART 1 — What dsh did, file by file (tell THIS to Claude)

### Project A — `~/ashare-desk` (A-Share trading project)

| File | What it is | What I did |
|---|---|---|
| `_reviews/dsh-six-holdings-2026-08-16.md` | Per-holding factual dossier of Richard's six holdings | Created + updated across 8 commits (72c024b → 3419f8d): valuation, earnings direction, balance-sheet health, concentration, tradeability, delisting risk. Incorporated kimi-code's audit corrections, hermes's delisting check, and claude's session findings (73.8% one-sector, 300264 two-path *ST, 002635 core profit −87%). |
| `_reviews/dsh-report-to-richard-2026-08-16.md` | Plain-language report draft for Richard | Created. Per-holding verbs: SELL 300264 + 000750, HOLD rest, do NOT add, do NOT redeploy on signals. Labelled a draft for the room to merge. |
| `_reviews/dsh-scan-2026-08-14.md` | Aug-14 universe scan tape/analysis | Created. |
| `_reviews/dsh-synthesis-draft-2026-08-16.md` | Synthesis-ready one-pager | Created. Portfolio-level facts + proposed ranking. |
| `ashare_vendor.py` | Routing TradingAgents data layer through the local backend | Added Chinese name→code resolution + universe name map (for the debate path). |
| `trading_bridge.py` | TradingAgents LLM-debate bridge | Added in-process `ashare_vendor.register()` and passed the 6-digit code as company identity (their validator rejects non-ASCII in cache paths). |

Other work done (no file left behind): **restarted the backend `server.py`** on 2026-08-16 to fix the frozen-quote bug (08-13 cache stuck); it's running on `127.0.0.1:5057`. `_reviews/kimi-audit-20260816.md` and `_reviews/hermes-delisting-check-2026-08-16.md` were written by kimi and hermes, not me — but I integrated and verified them.

### Project B — `~/Desktop/northstar` (Northstar command-center dashboard)

| File | What I did |
|---|---|
| `src/agentsView.jsx` | NEW "Live agents" view — polls bridge :3792 + bus :3791, shows all agents' status/task/lastSeen, active threads, activity feed. Committed `db91310`. |
| `src/memoryView.jsx` | NEW "Memory" tab — full memory index, search/filter, add/edit/delete with write-back. Committed `8a3a0dd`. |
| `src/App.jsx`, `src/styles.css` | Wired both new views in (+ "Radio" and "Brain" lucide icons, styles). |
| `memory-bridge.mjs` | NEW — watcher + HTTP API on **:3793**: `GET /memory`, `POST /memory` (write-back), `POST /memory/delete`, `GET /health`. Reads `~/.claude/projects/**/memory/*.md` + `~/.claude/memory/*.md`. |
| `memory-mcp.mjs` | NEW — local MCP stdio server: `remember`, `recall`, `list_memories`, `forget`, backed by `~/.claude/memory/`. |
| `MEMORY-SYNC.md` | Setup instructions for wiring the MCP into Claude. |

### Running services right now (after a reboot restart these)
- `node memory-bridge.mjs` → **:3793** (from `~/Desktop/northstar`)
- `npx vite --port 5173` → dashboard at **http://localhost:5173**
- Northstar room/bus already run on **:3792** and **:3791**
- `server.py` → ashare-desk backend on **:5057**

---

## PART 2 — What to tell CLAUDE (the agent in the Northstar room)

Paste this verbatim into the agent-room or a Claude session:

```
Handoff from dsh (DeepSeek agent). Continue from these verified results.

1) SIX-HOLDINGS MISSION (ashare-desk): The recommended action set is
   settled and supportable: SELL 300264 (two-path *ST, no grace on the
   net-assets route — your finding) and SELL 000750 (Coordinator SELL;
   the cheap-and-growing tension is stated, both facts go to Richard);
   HOLD 002635 (43% weight, core profit −87%, do NOT add / consider trim),
   HOLD 600601 (risk-warned, expensive PB 11.7), HOLD 603703 (loss-making
   but NOT delisting-risk; watch cash conversion), HOLD 002522 (2% round
   trip, unmovable). Account-level: freed cash ~1,420 after the two sells
   → do NOT redeploy on signals (FINDINGS.md: every strategy lost to
   buy-and-hold). All numbers are in
   _reviews/dsh-six-holdings-2026-08-16.md and audited by kimi-code.
   YOUR JOB: write the FINAL one-page report to Richard that merges this
   set (it is already drafted at _reviews/dsh-report-to-richard-
   2026-08-16.md), post it to the room, and confirm to Richard.

2) INFRA: server.py was restarted (frozen-quote fix) — do not restart
   again unless needed. The _TX_SPOT_CACHE no-expiry design STILL deserves
   a real code fix in server.py (restart was a band-aid).

3) AGENT ROOM protocol: dsh, kimi, hermes, openclaw are agents; the
   dispatcher on :3792 auto-replies to room messages. A "room decision"
   is talk, not action — confirm with Richard before touching any live
   process. Check for the DISPATCHER_STOP file before assuming room posts
   trigger responses.

4) The dashboard (northstar, :5173) now has "Live agents" + "Memory" tabs
   reading the room/bus/memory bridge. If either shows "down", restart
   memory-bridge.mjs / the Vite server as in MEMORY-SYNC.md.
```

---

## PART 3 — What to tell CO-WORK (Claude desktop app)

Do ONE manual step, then paste the file forward:

### Step 1 — connect the memory MCP (one time, ~1 minute)
Claude desktop → **Settings** → **MCP servers** → **Add** → **Local** → command:
```
node /Users/Zhuanz/Desktop/northstar/memory-mcp.mjs
```
Save. Claude now has tools `remember`, `recall`, `list_memories`, `forget`.

### Step 2 — tell Co-work this
```
You now have a connected memory tool (northstar-memory) backed by
~/.claude/memory/. Whenever we agree on a durable fact, preference,
decision or lesson — across ANY project (trading, the Northstar
dashboard, the automation business, IELTS, etc.) — persist it with the
remember tool using a short kebab-case name and a one-line description.
These memories appear automatically on the Northstar dashboard ("Memory"
tab). Continue using your built-in cloud Memory as before; if you want a
specific cloud memory mirrored to the dashboard, write it once with
remember. Do not ask for permission to remember routine facts — just do
it when something is durable and reusable.
```

---

## PART 4 — What to tell CLAUDE CODE (CLI, per project)

### In `~/ashare-desk`
```
You are continuing the A-share trading project. First read HANDOFF.md,
LOOP.md, and _reviews/dsh-six-holdings-2026-08-16.md.
The six-holding analysis is complete and verified. The room's settled
recommendations: SELL 300264 and 000750; HOLD 002635 (43% weight, do NOT
add), HOLD 600601, 603703, 002522. Draft the final one-page report to
Richard (base it on _reviews/dsh-report-to-richard-2026-08-16.md) and
post it to the room via the Agent Network bus.
Do NOT re-derive fundamentals already verified in the dossier. Do NOT
place or simulate any order (read-only on money). Respect HANDOFF §2
(cannot-be-negotiated rules). Use git hook ASHARE_AGENT 
(export ASHARE_AGENT="claude-code/…") when committing.
```

### In `~/Desktop/northstar`
```
Continue the Northstar dashboard work. The app now has "Live agents" and
"Memory" tabs plus memory-bridge.mjs (:3793) and memory-mcp.mjs (MCP
server for Co-work). Read MEMORY-SYNC.md before touching memory code.
Known improvement path: (a) fix the _TX_SPOT_CACHE no-expiry in
~/ashare-desk/server.py if you touch it; (b) optionally make the agents
room (bus :3791 / bridge :3792) read/write the same memory store so any
agent can persist/recall memories; (c) if the memory bridge or Vite
server is down after a reboot, restart per MEMORY-SYNC.md.
Commit with the Agent: trailer convention.
```

---

## PART 5 — Files/reference index (for quick recall)

- A-Share dossier (VERIFIED source of truth): `~/ashare-desk/_reviews/dsh-six-holdings-2026-08-16.md`
- A-Share report draft to Richard: `~/ashare-desk/_reviews/dsh-report-to-richard-2026-08-16.md`
- Backtest/FINDINGS (why no redeploy): `~/ashare-desk/FINDINGS.md`
- Northstar handoff/memory: `~/Desktop/northstar/MEMORY-SYNC.md`
- Dashboard tabs: `~/Desktop/northstar/src/{agentsView,memoryView}.jsx`
- Services: `memory-bridge.mjs` (:3793), `memory-mcp.mjs`, `vite` (:5173), room/bus (:3792/:3791), `server.py` (:5057)

**One thing left for a human (Richard):** the final merge of the report draft is Claude's/Co-work's job. The dashboard "Memory" MCP step in Part 3 is a manual one-time click dsh cannot do inside the app.

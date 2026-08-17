# Memory Sync — Claude → Northstar Dashboard

Claude's learned knowledge (memories) appears on the Northstar dashboard
("Memory" tab) automatically. Three pieces:

```
Claude Code memory files ─┐
(~/.claude/projects/*/memory/*.md)
                          ├─► memory-bridge.mjs (:3793) ──► Dashboard "Memory" tab
Claude memory MCP (Co-work) ─┘     (watches both folders)
(~/.claude/memory/*.md)
```

## What is already running

| Piece | Command | Port |
|---|---|---|
| Memory bridge (watcher + API) | `node memory-bridge.mjs` | 3793 |
| Dashboard dev server | `npx vite` | 5173 |

Both are started from `~/Desktop/northstar/`. If you reboot, start them with:

```bash
cd ~/Desktop/northstar
node memory-bridge.mjs &     # memory API
npx vite --port 5173 &       # dashboard
```

## Wire Co-work / Claude desktop to the memory MCP (one time)

1. Claude desktop → **Settings** → **MCP servers** → **Add** → **Local** (or
   "Command-line").
2. Command: `node /Users/Zhuanz/Desktop/northstar/memory-mcp.mjs`
3. Save. Claude now has tools: `remember`, `recall`, `list_memories`,
   `forget` — everything it `remember`s is written to
   `~/.claude/memory/*.md`, which the dashboard reads.

Claude Code CLI (same server):

```bash
claude mcp add memory -- node /Users/Zhuanz/Desktop/northstar/memory-mcp.mjs
```

## Test it end to end

```bash
# from the CLI
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"remember","arguments":{"name":"hello","body":"This is a test memory."}}}' \
  | node ~/Desktop/northstar/memory-mcp.mjs

curl -s http://127.0.0.1:3793/memory | python3 -m json.tool   # see it in the index
```

## What this syncs — and what it cannot

**Syncs:** every Claude Code memory file (per-project and shared), plus
anything Claude desktop writes through the memory MCP. Two-way: the
dashboard can add/edit/delete, which writes back to the same Markdown files.

**Cannot sync:** Claude's *built-in cloud memories* (the "Memory" feature in
the Co-work/desktop app). Those live in Claude's cloud, not on this machine
— there is no local file and no public API/MCP for them. If you want a
specific cloud memory mirrored into the dashboard, ask Claude to `remember`
it once via the MCP; from then on it syncs.

## Files

- `memory-bridge.mjs` — watcher + HTTP API (:3793), front-matter parsing,
  atomic write-back
- `memory-mcp.mjs` — MCP stdio server (remember/recall/list_memories/forget)
- `src/memoryView.jsx` — dashboard "Memory" tab

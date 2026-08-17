import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Clock3,
  Flame,
  Gauge,
  ListTodo,
  LockKeyhole,
  Milestone,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { hasLiveAgentBridge, requestLiveAssessment } from "./agentClient";
import { memoryApi } from "./memoryClient";
import { AgentsView } from "./agentsView";
import { MemoryView } from "./memoryView";

const AGENT_LANES = ["codex", "hermes", "openclaw"];
const HOURS = Array.from({ length: 17 }, (_, index) => index + 6);
const LANES = [
  { id: "automation", label: "AI automation", color: "#00a58b", tint: "#def7f0" },
  { id: "agency", label: "Web agency", color: "#4c80ff", tint: "#e8efff" },
  { id: "art", label: "Art store", color: "#e2773a", tint: "#fff0e7" },
  { id: "creator", label: "CreatorConnect", color: "#9968d9", tint: "#f1eaff" },
  { id: "personal", label: "Personal / rest", color: "#6b9665", tint: "#e8f4e6" },
];

const NICHES = [
  { id: "current_job", label: "Current job (cash flow) — Shopify / TikTok Shop / eBay", emoji: "💼" },
  { id: "ai_automation", label: "AI automation business", emoji: "🤖" },
  { id: "ielts", label: "English / IELTS personal brand", emoji: "📚" },
  { id: "vibe_coding", label: "AI software & vibe coding", emoji: "⚡" },
  { id: "investing", label: "AI-assisted investing", emoji: "📈" },
  { id: "self_improvement", label: "Self-improvement", emoji: "🧠" },
];

const DEFAULT_MISSION = "Build a durable AI-first company by turning recurring work into reusable systems, products, and knowledge.";
const OPERATING_DRAFT = `Career & Business Operating Summary

Core mission
Build an AI-first company that creates automation systems to replace repetitive digital work. Every business should strengthen this objective by generating reusable workflows, data, software, or knowledge, not only short-term income.

1. Current job - cash flow and learning
Work in Shopify, TikTok Shop, eBay, social media, product operations, and customer acquisition. Products include Montessori toys, AutoBrush, electric bikes, and assigned products. Treat this as paid training: learn operations, marketing, acquisition, and automation opportunities while building future assets.

2. AI automation business - highest long-term priority
Use e-commerce stores as testing environments. The real product is the automation system: product uploads, descriptions, image processing, inventory, social posting, customer service, market research, and workflow management. Build workflows, package them into services or software, and eventually sell automation solutions to businesses.

3. English / IELTS personal brand
Build an audience by teaching spoken English and IELTS while sharing the learning journey. Build trust before products such as a subscription website, community, courses, coaching, or AI English tools. English gives access to global knowledge, customers, and AI communities.

4. AI software and vibe coding
When a repeated pain point appears, find the real problem and build the smallest useful tool: AI agents, productivity tools, workflow software, internal operating systems, or AI-assisted coding products.

5. AI-assisted investing - very low priority
Use AI for research and analysis only later. Focus first on businesses under direct control.

6. Self-improvement operating system
Technical skills come first: Python, APIs, databases, Git, AI tools, automation, and system architecture. Then English, fitness, appearance, and art/creativity for balance.

Decision rules
Does this strengthen the AI automation ecosystem? Can it become a reusable asset? Can AI automate most of it? Can it scale beyond my time? Does it create knowledge, software, or systems? Does it move me closer to one AI-driven ecosystem? If most answers are yes, act. Otherwise postpone or reject.`;
const DEFAULT_STATE = {
  mission: DEFAULT_MISSION,
  operatingDraft: OPERATING_DRAFT,
  days: {},
  decisions: [],
  active: null,
};

const pad = (value) => String(value).padStart(2, "0");
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDateKey = (key) => new Date(...key.split("-").map((value, index) => index === 1 ? Number(value) - 1 : Number(value)));
const shiftDate = (key, amount) => {
  const next = parseDateKey(key);
  next.setDate(next.getDate() + amount);
  return localDateKey(next);
};
const formatHour = (hour) => `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;
const formatDate = (key) => parseDateKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const emptyDay = () => ({ goal: "", goalId: null, nicheGoals: {}, blocks: {}, energy: "steady" });

function scoreActivity(value) {
  const input = value.toLowerCase();
  const match = (words) => words.some((word) => input.includes(word));
  const automation = match(["automation", "agent", "workflow", "api", "system", "script", "code", "database", "build", "product"]);
  const cash = match(["client", "agency", "shopify", "store", "sales", "customer", "campaign", "revenue", "order"]);
  const audience = match(["content", "video", "instagram", "tiktok", "creator", "english", "post", "community"]);
  const recovery = match(["rest", "sleep", "walk", "gym", "basketball", "eat", "family", "health"]);
  const investing = match(["invest", "stock", "crypto", "trading", "market prediction"]);
  const admin = match(["scroll", "browse", "meeting", "email", "message", "research", "watch"]);
  const longTerm = Math.max(1, Math.min(10, 2 + (automation ? 5 : 0) + (audience ? 2 : 0) + (recovery ? 2 : 0) + (cash ? 1 : 0) - (investing ? 3 : 0) - (admin ? 1 : 0)));
  const shortTerm = Math.min(10, 2 + (cash ? 5 : 0) + (recovery ? 3 : 0) + (automation ? 2 : 0) + (audience ? 2 : 0));
  const lane = automation ? "automation" : cash ? "agency" : audience ? "creator" : recovery ? "personal" : "personal";
  const verdict = longTerm >= 8 || (shortTerm >= 7 && longTerm >= 5) ? "Do now" : longTerm >= 6 ? "Schedule" : recovery ? "Protect" : "Park it";
  const reason = verdict === "Do now"
    ? "This moves a present result while strengthening something reusable. Give it an uninterrupted block."
    : verdict === "Schedule"
      ? "It has real value, but it needs a defined time box so it does not displace the highest-leverage work."
      : verdict === "Protect"
        ? "Recovery is productive infrastructure. Treat it as a commitment, not a reward you have to earn."
        : "Its value is unclear against the mission right now. Capture it, then return to the current priority.";
  const nextAction = automation
    ? "Define the smallest reusable output you can ship in the next 60 minutes."
    : cash
      ? "Set a clear revenue or learning outcome, then time-box the work to 60 minutes."
      : audience
        ? "Turn the idea into one useful artifact: a post, a conversation, or a reusable content template."
        : recovery
          ? "Choose the minimum restorative action and put it on the calendar without guilt."
          : "Write the concrete outcome. If it cannot be named, move it to the parking lot.";
  return { longTerm, shortTerm, lane, verdict, reason, nextAction };
}

function useCommandStore() {
  const [store, setStore] = useState(DEFAULT_STATE);
  return { store, setStore };
}

function Score({ label, value, accent }) {
  return <div className="score"><div><span>{label}</span><strong>{value}/10</strong></div><div className="score-track"><i style={{ width: `${value * 10}%`, background: accent }} /></div></div>;
}

function AgentCard({ icon: Icon, title, detail, state, tone }) {
  return <div className="agent-card">
    <span className={`agent-icon ${tone}`}><Icon size={16} /></span>
    <div><strong>{title}</strong><small>{detail}</small></div>
    <span className={`agent-state ${state === "Ready" ? "ready" : "waiting"}`}><i />{state}</span>
  </div>;
}

function BlockEditor({ hour, block, onSave, onCancel }) {
  const [task, setTask] = useState(block?.task || "");
  const [laneId, setLaneId] = useState(block?.laneId || "automation");
  return <form className="block-editor" onSubmit={(event) => { event.preventDefault(); if (task.trim()) onSave({ task: task.trim(), laneId, done: block?.done || false }); }}>
    <select value={laneId} onChange={(event) => setLaneId(event.target.value)} aria-label="Work area">
      {LANES.map((lane) => <option key={lane.id} value={lane.id}>{lane.label}</option>)}
    </select>
    <input autoFocus value={task} onChange={(event) => setTask(event.target.value)} placeholder={`Focus at ${formatHour(hour)}`} aria-label="Focus block" />
    <button type="submit" className="square-button accent" aria-label="Save focus block"><Check size={16} /></button>
    <button type="button" className="square-button" onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
  </form>;
}

function ScheduleRow({ hour, block, editing, onEdit, onSave, onCancel, onToggle }) {
  const lane = block ? LANES.find((item) => item.id === block.laneId) || LANES[0] : null;
  return <div className="schedule-row">
    <time>{formatHour(hour)}</time>
    <div className="schedule-content">
      {editing ? <BlockEditor hour={hour} block={block} onSave={onSave} onCancel={onCancel} /> : block ? (
        <div className={`focus-block ${block.done ? "done" : ""}`} style={{ "--lane": lane.color, "--lane-tint": lane.tint }}>
          <button className="complete-button" onClick={onToggle} aria-label={block.done ? "Mark incomplete" : "Mark complete"}>{block.done && <Check size={13} />}</button>
          <button className="block-label" onClick={onEdit}><span>{block.task}</span><small>{lane.label}</small></button>
          <button className="block-edit" onClick={onEdit} aria-label="Edit focus block">Edit</button>
        </div>
      ) : <button className="add-focus" onClick={onEdit}><Plus size={15} /> Block this hour</button>}
    </div>
  </div>;
}

const OUTCOME_METRICS = [
  { id: "revenue", label: "Money in", unit: "CNY", placeholder: "0" },
  { id: "hours_saved", label: "Hours saved", unit: "hours", placeholder: "0" },
  { id: "shipped", label: "Shipped", unit: "count", placeholder: "1" },
];

function DailyStep({ index, block, isNext, onToggle, onBlock, onStart, onRecord }) {
  const [showBlocker, setShowBlocker] = useState(false);
  const [reason, setReason] = useState(block.blockedReason || "");
  // Recording a result is the only place reality enters this system. Everything
  // else on this screen is the model's opinion about work not yet done.
  const [showOutcome, setShowOutcome] = useState(false);
  const [metric, setMetric] = useState("revenue");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const lane = LANES.find((item) => item.id === block.laneId) || LANES[0];
  return <article className={`daily-step${block.done ? " done" : ""}${block.blockedReason ? " blocked" : ""}${isNext ? " next" : ""}`} style={{ "--step-lane": lane.color }}>
    <button className="step-check" onClick={onToggle} aria-label={block.done ? "Mark step incomplete" : "Complete step"}>{block.done && <Check size={13} />}</button>
    <div className="step-copy">
      <div className="step-meta"><span>STEP {index + 1}</span><small>{lane.label}</small>{isNext && <strong>NEXT</strong>}</div>
      <p>{block.task}</p>
      {block.blockedReason && <div className="blocker-note"><TriangleAlert size={13} /><span>{block.blockedReason}</span></div>}
      {showBlocker && <form className="blocker-form" onSubmit={(event) => { event.preventDefault(); onBlock(reason.trim()); setShowBlocker(false); }}>
        <input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell me what got in the way..." />
        <button type="submit">I'll remember this</button>
        <button type="button" onClick={() => setShowBlocker(false)} aria-label="Cancel blocker"><X size={14} /></button>
      </form>}
      {showOutcome && <form className="outcome-form" onSubmit={(event) => {
        event.preventDefault();
        const numeric = Number(amount);
        if (!Number.isFinite(numeric) || numeric < 0) return;
        onRecord({ metric, value: numeric, unit: OUTCOME_METRICS.find((m) => m.id === metric)?.unit || null, note: note.trim() || null });
        setShowOutcome(false);
      }}>
        <select value={metric} onChange={(event) => setMetric(event.target.value)} aria-label="Result type">
          {OUTCOME_METRICS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <input autoFocus type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={OUTCOME_METRICS.find((m) => m.id === metric)?.placeholder || "0"} aria-label="Result value" />
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" aria-label="Result note" />
        <button type="submit">Record</button>
        <button type="button" onClick={() => setShowOutcome(false)} aria-label="Cancel result"><X size={14} /></button>
      </form>}
    </div>
    {!block.done && <div className="step-actions">
      {isNext && <button className="step-start" onClick={onStart}><Play size={13} /> Start on this</button>}
      <button className="step-block" onClick={() => setShowBlocker((value) => !value)}>{block.blockedReason ? "Edit reason" : "Why this didn't work"}</button>
    </div>}
    {block.done && !block.outcome && <div className="step-actions">
      <button className="step-block" onClick={() => setShowOutcome((value) => !value)}>What did this actually produce?</button>
    </div>}
    {block.done && block.outcome && <div className="outcome-note">
      <TrendingUp size={13} />
      <span>{OUTCOME_METRICS.find((m) => m.id === block.outcome.metric)?.label || block.outcome.metric}: <strong>{block.outcome.value}</strong>{block.outcome.note ? ` — ${block.outcome.note}` : ""}</span>
    </div>}
  </article>;
}

export function App() {
  const accessCode = "";
  const [date, setDate] = useState(localDateKey());
  const [activity, setActivity] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [agentError, setAgentError] = useState("");
  const [agentMode, setAgentMode] = useState(hasLiveAgentBridge() ? "ready" : "local");
  const [checkMode, setCheckMode] = useState("quick");
  const [showReasoning, setShowReasoning] = useState(false);
  const [editingHour, setEditingHour] = useState(null);
  const [showMission, setShowMission] = useState(false);
  const [showOperatingDraft, setShowOperatingDraft] = useState(false);
  const [agentStates, setAgentStates] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [nicheGoals, setNicheGoals] = useState(Object.fromEntries(NICHES.map((n) => [n.id, ""])));
  const [planningNiches, setPlanningNiches] = useState({});
  const [planErrors, setPlanErrors] = useState({});
  const [activeGoalNiche, setActiveGoalNiche] = useState(null);
  const [view, setView] = useState("command");
  const [roadmapGoal, setRoadmapGoal] = useState("");
  const [roadmap, setRoadmap] = useState(null);
  const [roadmapBuilding, setRoadmapBuilding] = useState(false);
  const [roadmapError, setRoadmapError] = useState("");
  const [cloudStatus, setCloudStatus] = useState("connecting");
  const [loadError, setLoadError] = useState("");
  const [principles, setPrinciples] = useState([]);
  const [replanning, setReplanning] = useState({});
  const { store, setStore } = useCommandStore();
  useEffect(() => {
    Promise.all([memoryApi.profile(accessCode), memoryApi.decisions(accessCode), memoryApi.active(accessCode)]).then(([profiles, decisions, active]) => {
      const profile = profiles?.[0];
      const mapped = (decisions || []).map((item) => ({ ...item, longTerm: item.long_term_score, shortTerm: item.short_term_score, nextAction: item.next_action, at: item.created_at }));
      const savedActive = active?.[0] ? { ...active[0], title: active[0].task, startedAt: active[0].started_at } : null;
      setStore((current) => ({ ...current, mission: profile?.mission || current.mission, operatingDraft: profile?.operating_brief?.text || current.operatingDraft, decisions: mapped.length ? mapped : current.decisions, active: savedActive }));
      setCloudStatus("synced");
      setLoadError("");
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "Could not load your saved data.";
      if (message === "Access code rejected.") setAccessCode("");
      setCloudStatus("error");
      setLoadError(message);
    });
  }, [accessCode]);
  const cloudWrite = (request) => {
    setCloudStatus("syncing");
    return request.then((result) => {
      setCloudStatus("synced");
      return result;
    }).catch((error) => {
      setCloudStatus("error");
      throw error;
    });
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      cloudWrite(memoryApi.saveProfile(accessCode, { mission: store.mission, operating_brief: { text: store.operatingDraft } })).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [accessCode, store.mission, store.operatingDraft]);
  useEffect(() => { memoryApi.agentState(accessCode).then(setAgentStates).catch(() => {}); }, [accessCode]);
  // Outcomes live in their own table, so the board has to fetch them back or a
  // recorded result would vanish on reload.
  useEffect(() => { memoryApi.outcomes(accessCode).then((rows) => setOutcomes(Array.isArray(rows) ? rows : [])).catch(() => {}); }, [accessCode]);
  useEffect(() => {
    memoryApi.daily(accessCode, date).then((rows) => {
      if (!Array.isArray(rows)) return;
      const remoteBlocks = Object.fromEntries(rows.map((row) => {
        let task = row.task;
        let blockedReason = "";
        try {
          const saved = JSON.parse(row.task);
          if (saved?.version === 1 && typeof saved.task === "string") {
            task = saved.task;
            blockedReason = typeof saved.blockedReason === "string" ? saved.blockedReason : "";
          }
        } catch {
          // Existing plain-text tasks remain valid.
        }
        return [row.hour, {
          task,
          laneId: row.lane === "creatorconnect" ? "creator" : LANES.some((lane) => lane.id === row.lane) ? row.lane : "personal",
          done: Boolean(row.done),
          blockedReason,
          goalId: row.goal_id || null,
          // Without this the niche is lost on every reload, which made blocks
          // match the old `niche === undefined` fallback in all six cards.
          niche: row.niche || null,
        }];
      }));
      const remoteGoal = rows.find((row) => row.northstar_goals?.title)?.northstar_goals?.title || "";
      setStore((current) => ({
        ...current,
        days: {
          ...current.days,
          [date]: {
            ...(current.days[date] || emptyDay()),
            goal: remoteGoal || current.days[date]?.goal || "",
            goalId: rows[0]?.goal_id || current.days[date]?.goalId || null,
            blocks: remoteBlocks,
            nicheGoals: current.days[date]?.nicheGoals || {},
          },
        },
      }));
    }).catch(() => {});
  }, [accessCode, date, setStore]);
  useEffect(() => { memoryApi.principles(accessCode).then((rows) => setPrinciples(Array.isArray(rows) ? rows : [])).catch(() => {}); }, [accessCode]);
  useEffect(() => {
    memoryApi.roadmaps(accessCode).then((rows) => {
      const latest = Array.isArray(rows) ? rows[0] : null;
      if (latest) setRoadmap({ id: latest.id, goal: latest.goal, niches: Array.isArray(latest.niches) ? latest.niches : [] });
    }).catch(() => {});
  }, [accessCode]);
  const day = store.days[date] || emptyDay();
  const blocks = Object.entries(day.blocks || {});
  const completed = blocks.filter(([, block]) => block.done).length;
  const activeLane = store.active ? LANES.find((lane) => lane.id === store.active.lane) : null;
  const recentDecisions = store.decisions.slice(0, 4);

  const allocation = useMemo(() => LANES.map((lane) => ({ ...lane, count: Object.values(day.blocks || {}).filter((block) => block.laneId === lane.id).length })), [day.blocks]);
  const updateDay = (nextDay) => setStore((current) => ({ ...current, days: { ...current.days, [date]: nextDay } }));
  const runAnalysis = async () => {
    if (!activity.trim()) return;
    const localResult = scoreActivity(activity);
    setAgentError("");
    setAgentMode(hasLiveAgentBridge() ? "thinking" : "local");
    let result;
    if (hasLiveAgentBridge()) {
      try {
        const response = await requestLiveAssessment({
          activity: activity.trim(),
          mission: store.mission,
          operatingBrief: store.operatingDraft,
          fallback: localResult,
          accessCode,
          mode: checkMode,
        });
        result = { ...localResult, ...(response.final || response) };
        result._draft = response.draft || null;
        result._critique = response.critique || null;
        result._changed = response.changed || false;
        result._degraded = response.degraded || null;
        result._mode = checkMode;
        setAgentMode("live");
      } catch (error) {
        setAgentMode("error");
        setAgentError(error instanceof Error ? error.message : "AI unavailable.");
        return;
      }
    }
    const entry = { id: crypto.randomUUID(), activity: activity.trim(), ...result, at: new Date().toISOString() };
    setAnalysis(entry);
    setShowReasoning(false);
    setStore((current) => ({ ...current, decisions: [entry, ...current.decisions].slice(0, 30) }));
    cloudWrite(memoryApi.saveDecision(accessCode, entry)).catch(() => {});
  };
  const startFocus = () => {
    if (!analysis) return;
    const next = { title: analysis.activity, task: analysis.activity, lane: analysis.lane, startedAt: new Date().toISOString() };
    setStore((current) => ({ ...current, active: next }));
    cloudWrite(memoryApi.saveActive(accessCode, { task: next.task, lane: next.lane, started_at: next.startedAt })).catch(() => {});
  };
  const clearActive = () => {
    setStore((current) => ({ ...current, active: null }));
    cloudWrite(memoryApi.saveActive(accessCode, {})).catch(() => {});
  };
  const saveBlock = (hour, block) => {
    updateDay({ ...day, blocks: { ...day.blocks, [hour]: block } });
    const goalTitle = Object.values(day.nicheGoals || {}).find((ng) => ng?.goalId && ng.goalId === (block.goalId || day.goalId))?.text || day.goal || null;
    cloudWrite(memoryApi.saveDaily(accessCode, { date, hour, task: block.task, lane: block.laneId, done: block.done, blocked_reason: block.blockedReason || null, goal_id: block.goalId || day.goalId || null, niche: block.niche || null, goal_title: goalTitle })).catch(() => {});
    // A fresh correction becomes a standing rule server-side; pick it up so the
    // principles panel reflects it without a reload.
    if (block.blockedReason) setTimeout(() => { memoryApi.principles(accessCode).then(setPrinciples).catch(() => {}); }, 4000);
    setEditingHour(null);
  };
  // The one write in this app whose value the model did not produce. It is
  // stored against the block so predicted-vs-actual can be read back later: the
  // prediction below comes from the decision that scored this work, and is left
  // null when no decision matches rather than being guessed.
  const recordOutcome = (hour, block, outcome) => {
    const prediction = store.decisions.find((entry) => entry.activity && block.task && block.task.includes(entry.activity)) || null;
    const stored = { ...outcome, at: new Date().toISOString() };
    updateDay({ ...day, blocks: { ...day.blocks, [hour]: { ...block, outcome: stored } } });
    cloudWrite(memoryApi.saveOutcome(accessCode, {
      date,
      hour: Number(hour),
      goal_id: block.goalId || day.goalId || null,
      niche: block.niche || null,
      task: block.task || null,
      metric: outcome.metric,
      value: outcome.value,
      unit: outcome.unit,
      note: outcome.note,
      predicted_long_term: prediction ? prediction.longTerm : null,
      predicted_short_term: prediction ? prediction.shortTerm : null,
    })).catch(() => {});
    setOutcomes((current) => [{ date, hour: Number(hour), metric: outcome.metric, value: outcome.value, note: outcome.note }, ...current]);
  };
  // Recorded results for the day on screen, keyed by hour, so a reload restores
  // the badge on each finished step.
  const outcomeByHour = {};
  for (const row of outcomes) {
    if (String(row.date) === date && row.hour !== null && row.hour !== undefined && !outcomeByHour[row.hour]) outcomeByHour[row.hour] = row;
  }
  const copyYesterday = () => {
    const prior = store.days[shiftDate(date, -1)];
    if (!prior) return;
    updateDay({ ...day, blocks: Object.fromEntries(Object.entries(prior.blocks).map(([hour, block]) => [hour, { ...block, done: false }])) });
  };
  const pinNicheGoal = async (nicheId, goalText, replanGoalId = null) => {
    if (!goalText.trim()) return;
    setPlanningNiches((p) => ({ ...p, [nicheId]: true }));
    setPlanErrors((p) => ({ ...p, [nicheId]: "" }));
    try {
      // Date and hour both read from the browser's clock so the worker never
      // has to guess a calendar or a timezone.
      const result = await memoryApi.plan(accessCode, goalText.trim(), store.operatingDraft, nicheId, date, date === localDateKey() ? new Date().getHours() : null, replanGoalId);
      const generated = Array.isArray(result?.steps) ? result.steps : [];
      const planDate = generated[0]?.date || date;
      const planBlocks = Object.fromEntries(generated.filter((step) => step.date === planDate).map((step) => [step.hour, {
        task: `${step.title}: ${step.detail}`,
        laneId: step.lane === "creatorconnect" ? "creator" : LANES.some((lane) => lane.id === step.lane) ? step.lane : "personal",
        done: false,
        blockedReason: "",
        goalId: result.goal_id,
        niche: nicheId,
      }]));
      setDate(planDate);
      setStore((current) => ({
        ...current,
        days: {
          ...current.days,
          [planDate]: {
            ...(current.days[planDate] || emptyDay()),
            nicheGoals: { ...(current.days[planDate]?.nicheGoals || {}), [nicheId]: { text: goalText.trim(), goalId: result.goal_id } },
            // On re-plan the worker deleted the unfinished blocks for this goal;
            // drop them locally too. Completed steps stay.
            blocks: {
              ...Object.fromEntries(Object.entries(current.days[planDate]?.blocks || {}).filter(([, b]) => !(replanGoalId && b.goalId === replanGoalId && !b.done))),
              ...planBlocks,
            },
          },
        },
      }));
      if (!replanGoalId) setNicheGoals((g) => ({ ...g, [nicheId]: "" }));
    } catch (error) {
      setPlanErrors((p) => ({ ...p, [nicheId]: error instanceof Error ? error.message : "Planner unavailable." }));
    } finally {
      setPlanningNiches((p) => ({ ...p, [nicheId]: false }));
    }
  };
  const replanNiche = async (nicheId) => {
    const nicheGoal = day.nicheGoals?.[nicheId];
    if (!nicheGoal?.text?.trim() || !nicheGoal.goalId) return;
    setReplanning((r) => ({ ...r, [nicheId]: true }));
    try {
      await pinNicheGoal(nicheId, nicheGoal.text, nicheGoal.goalId);
    } finally {
      setReplanning((r) => ({ ...r, [nicheId]: false }));
    }
  };
  const removePrinciple = async (id) => {
    setPrinciples((current) => current.filter((p) => p.id !== id));
    try { await memoryApi.deletePrinciple(accessCode, id); }
    catch { memoryApi.principles(accessCode).then((rows) => setPrinciples(Array.isArray(rows) ? rows : [])).catch(() => {}); }
  };
  const buildRoadmap = async (event) => {
    event.preventDefault();
    if (!roadmapGoal.trim() || roadmapBuilding) return;
    setRoadmapBuilding(true);
    setRoadmapError("");
    try {
      const result = await memoryApi.buildRoadmap(accessCode, roadmapGoal.trim());
      setRoadmap({ id: result.id, goal: result.goal, niches: Array.isArray(result.niches) ? result.niches : [] });
      setRoadmapGoal("");
      memoryApi.agentState(accessCode).then(setAgentStates).catch(() => {});
    } catch (error) {
      setRoadmapError(error instanceof Error ? error.message : "Roadmap unavailable.");
    } finally {
      setRoadmapBuilding(false);
    }
  };
  const toggleAction = (nicheIndex, actionIndex) => {
    if (!roadmap?.id) return;
    const niches = roadmap.niches.map((entry, entryIndex) => {
      if (entryIndex !== nicheIndex) return entry;
      return {
        ...entry,
        actions: (entry.actions || []).map((action, index) => {
          if (index !== actionIndex) return action;
          const step = typeof action === "string" ? action : action?.step;
          return { step, done: !(typeof action === "object" && action?.done) };
        }),
      };
    });
    setRoadmap((current) => ({ ...current, niches }));
    cloudWrite(memoryApi.saveRoadmap(accessCode, roadmap.id, niches)).catch(() => {});
  };
  const orderedSteps = Object.entries(day.blocks || {}).sort(([first], [second]) => Number(first) - Number(second));
  const nextStepIndex = orderedSteps.findIndex(([, block]) => !block.done && !block.blockedReason);
  const startDailyStep = (block) => {
    const next = { title: block.task, task: block.task, lane: block.laneId, startedAt: new Date().toISOString() };
    setStore((current) => ({ ...current, active: next }));
    cloudWrite(memoryApi.saveActive(accessCode, { task: next.task, lane: next.lane, started_at: next.startedAt })).catch(() => {});
  };

  return <main className="command-app">
    <aside className="command-sidebar">
      <div className="brand"><span><Flame size={19} /></span><strong>Northstar</strong></div>
      <div className="sidebar-label">YOUR OPERATING SYSTEM</div>
      <button className={`side-nav${view === "command" ? " active" : ""}`} onClick={() => setView("command")}><Gauge size={17} /> Command center</button>
      <button className={`side-nav${view === "agents" ? " active" : ""}`} onClick={() => setView("agents")}><Radio size={17} /> Live agents</button>
      <button className={`side-nav${view === "memory" ? " active" : ""}`} onClick={() => setView("memory")}><Brain size={17} /> Memory</button>
      <button className={`side-nav${view === "roadmap" ? " active" : ""}`} onClick={() => setView("roadmap")}><Milestone size={17} /> Roadmap</button>
      <button className="side-nav" onClick={() => setView("command")}><ListTodo size={17} /> Daily focus</button>
      <button className="side-nav" onClick={() => setView("command")}><Clock3 size={17} /> Decision history</button>
      <section className="mission-card">
        <div><Sparkles size={16} /><span>Your mission — as I understand it</span></div>
        <p>{store.mission}</p>
        <button onClick={() => setShowMission((value) => !value)}>{showMission ? "Close" : "Update my directive"}</button>
        {showMission && <textarea value={store.mission} onChange={(event) => setStore((current) => ({ ...current, mission: event.target.value }))} aria-label="Your mission" />}
      </section>
      <section className="agent-list">
        <div className="sidebar-label">AGENT NETWORK</div>
        <AgentCard icon={Target} title="Strategic Advisor" detail="Long-term alignment" state={agentMode === "thinking" ? "Thinking" : "Ready"} tone="teal" />
        <AgentCard icon={Activity} title="Operations Advisor" detail="Short-term payoff" state={agentMode === "thinking" ? "Thinking" : "Ready"} tone="blue" />
        <AgentCard icon={LockKeyhole} title="Energy Guardian" detail="Energy and attention" state="Ready" tone="amber" />
        {agentStates.map((item) => <AgentCard key={item.agent} icon={Bot} title={item.agent} detail={item.current_task || item.detail || "No task queued"} state={item.status || "idle"} tone="blue" />)}
      </section>
      <p className="local-note">Private by default. Your decisions stay on this device until you connect a secure agent bridge.</p>
    </aside>

    <section className="command-main">
      <div className={`cloud-state ${cloudStatus}`}><i />{cloudStatus === "synced" ? "Cloud synced" : cloudStatus === "syncing" ? "Saving to cloud..." : cloudStatus === "error" ? "Cloud save failed" : "Connecting to cloud..."}</div>
      {loadError && <p role="alert" className="load-error">Could not load your saved data: {loadError}</p>}
      {view === "agents" ? <AgentsView /> : view === "memory" ? <MemoryView /> : view === "roadmap" ? <>
      <header className="command-header">
        <div><p className="eyebrow">SEQUENCED PLAN</p><h1>Let me figure out what to focus on first.</h1><p className="subhead">Tell me your goal, and I will sequence the work across niches.</p></div>
      </header>
      <form className="activity-form" onSubmit={buildRoadmap}>
        <label htmlFor="roadmap-goal">What outcome are we working toward?</label>
        <div className="activity-row"><input id="roadmap-goal" value={roadmapGoal} onChange={(event) => setRoadmapGoal(event.target.value)} placeholder="Describe the goal to sequence" /><button type="submit" disabled={roadmapBuilding}>{roadmapBuilding ? "Mapping the path..." : "Map it out"}</button></div>
      </form>
      {roadmapError && <p role="alert" style={{ color: "#b42318", margin: "12px 0 0" }}>{roadmapError}</p>}
      {roadmapBuilding && <p className="roadmap-progress"><Sparkles size={15} /> Mapping your niches. This usually takes about ten seconds.</p>}
      {roadmap?.niches?.length ? <section className="roadmap-section">
        <div className="section-header"><div><span className="eyebrow">CURRENT ROADMAP</span><h2>{roadmap.goal}</h2><p>{roadmap.niches.length} niches sequenced.</p></div></div>
        <div className="roadmap-list">
          {roadmap.niches.map((entry, index) => <article key={`${entry.niche}-${index}`} className="roadmap-card">
            <div className="roadmap-head"><span className="roadmap-number">{entry.sequence_position ?? index + 1}</span><div><h3>{entry.niche}</h3>{AGENT_LANES.some((agent) => String(entry.niche).toLowerCase().includes(agent)) && <span className="roadmap-agent">Agent lane</span>}</div></div>
            <ul className="roadmap-actions">
              {(entry.actions || []).map((action, actionIndex) => {
                const key = `${index}:${actionIndex}`;
                const step = typeof action === "string" ? action : action?.step;
                const done = typeof action === "object" && Boolean(action?.done);
                return <li key={key}><button type="button" className={`roadmap-check${done ? " done" : ""}`} onClick={() => toggleAction(index, actionIndex)} aria-pressed={done}><span className="roadmap-box">{done ? <Check size={12} /> : null}</span><span>{step}</span></button></li>;
              })}
            </ul>
            {entry.reasoning && <p className="roadmap-reasoning">{entry.reasoning}</p>}
          </article>)}
        </div>
      </section> : !roadmapBuilding && <section className="empty-analysis"><Milestone size={22} /><div><strong>No roadmap yet. Give me a goal and I will sequence it.</strong><p>Describe one goal above. I will sequence only the relevant niches and explain the order.</p></div></section>}
      </> : <>
      <header className="command-header">
        <div><p className="eyebrow">YOUR COMMAND CENTER — Jarvis</p><h1>Let's decide what matters most right now.</h1><p className="subhead">Tell me what you're working on, and I'll help you assess it.</p></div>
        <div className="date-controls"><button className="square-button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ChevronLeft size={18} /></button><div><strong>{date === localDateKey() ? "Today" : formatDate(date)}</strong><small>{formatDate(date)}</small></div><button className="square-button" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day"><ChevronRight size={18} /></button></div>
      </header>

      <section className="operating-draft">
        <button className="draft-toggle" onClick={() => setShowOperatingDraft((value) => !value)} aria-expanded={showOperatingDraft}>
          <span><Target size={16} /><strong>Operating brief</strong><small>Saved — I use this to assess every decision</small></span>
          <ChevronDown size={17} className={showOperatingDraft ? "open" : ""} />
        </button>
        {showOperatingDraft && <div className="draft-body"><div className="strategy-lens"><span>My priority guide</span><strong>AI automation → cash-flow learning → English / software → self-improvement</strong><small>AI-assisted investing stays low priority until your controlled businesses are stronger.</small></div><textarea value={store.operatingDraft} onChange={(event) => setStore((current) => ({ ...current, operatingDraft: event.target.value }))} aria-label="Operating brief draft" /></div>}
      </section>

      {principles.length > 0 && <section className="principles-panel">
        <div className="principles-head"><Bot size={15} /><strong>What I have learned from your feedback</strong><small>{principles.length} active {principles.length === 1 ? "lesson" : "lessons"}</small></div>
        <div className="principles-groups">
          {NICHES.filter((n) => principles.some((p) => p.niche === n.id)).map((n) => <div key={n.id} className="principles-group">
            <span className="principles-niche">{n.emoji} {n.label}</span>
            <ul>
              {principles.filter((p) => p.niche === n.id).map((p) => <li key={p.id}>
                <span>{p.rule}</span>
                <button type="button" onClick={() => removePrinciple(p.id)} aria-label={`Delete principle: ${p.rule}`}><X size={13} /></button>
              </li>)}
            </ul>
          </div>)}
          {principles.some((p) => !p.niche || !NICHES.some((n) => n.id === p.niche)) && <div className="principles-group">
            <span className="principles-niche">General</span>
            <ul>
              {principles.filter((p) => !p.niche || !NICHES.some((n) => n.id === p.niche)).map((p) => <li key={p.id}>
                <span>{p.rule}</span>
                <button type="button" onClick={() => removePrinciple(p.id)} aria-label={`Delete principle: ${p.rule}`}><X size={13} /></button>
              </li>)}
            </ul>
          </div>}
        </div>
      </section>}

      <section className="niche-goals-section">
        <div className="section-header"><div><span className="eyebrow">DAILY GOALS BY NICHE</span><h2>What should we accomplish today?</h2><p>Tell me which niches to focus on today. Leave blank to skip.</p></div></div>
        <div className="niche-form-grid">
          {NICHES.map((niche) => {
            const planning = planningNiches[niche.id];
            const error = planErrors[niche.id];
            return <div key={niche.id} className="niche-form-card">
              <div className="niche-form-label"><span>{niche.emoji}</span><strong>{niche.label}</strong></div>
              <div className="niche-form-row">
                <textarea
                  value={nicheGoals[niche.id] || ""}
                  onChange={(event) => setNicheGoals((g) => ({ ...g, [niche.id]: event.target.value }))}
                  placeholder="What's the outcome you want here today?"
                  rows={2}
                  aria-label={`Goal for ${niche.label}`}
                />
                <button
                  type="button"
                  className="niche-pin-button"
                  disabled={planning || !(nicheGoals[niche.id] || "").trim()}
                  onClick={() => pinNicheGoal(niche.id, nicheGoals[niche.id] || "")}
                >{planning ? "Breaking down..." : "Plan this"}</button>
              </div>
              {error && <p role="alert" className="niche-form-error">{error}</p>}
            </div>;
          })}
        </div>
      </section>

      {activeLane && <section className="active-strip" style={{ "--active": activeLane.color }}><CircleDot size={16} /><span>Currently focused on</span><strong>{store.active.title}</strong><button onClick={clearActive}>End focus</button></section>}

      {day.nicheGoals && Object.keys(day.nicheGoals).length > 0 && Object.values(day.nicheGoals).some((ng) => ng?.text?.trim()) && <div className="niche-boards">
        {NICHES.map((niche) => {
          const nicheGoal = day.nicheGoals?.[niche.id];
          if (!nicheGoal?.text?.trim()) return null;
          // Match on identity only. A block with no niche and no matching goal
          // belongs to the general schedule, never to a niche card.
          const nicheBlocks = Object.entries(day.blocks || {}).filter(([, block]) =>
            (nicheGoal.goalId && block.goalId === nicheGoal.goalId) || block.niche === niche.id
          );
          const nicheCompleted = nicheBlocks.filter(([, block]) => block.done).length;
          const nicheOrderedSteps = nicheBlocks.sort(([a], [b]) => Number(a) - Number(b));
          const nicheNextStepIndex = nicheOrderedSteps.findIndex(([, block]) => !block.done && !block.blockedReason);
          return <section key={niche.id} className="niche-board">
            <div className="niche-board-head">
              <div><span className="eyebrow">{niche.emoji} {niche.label}</span><h3>{nicheGoal.text}</h3><p>{nicheCompleted} of {nicheOrderedSteps.length} steps complete</p></div>
              <div className="board-progress" aria-label={`${nicheCompleted} of ${nicheOrderedSteps.length} complete`}><i style={{ width: `${nicheOrderedSteps.length ? nicheCompleted / nicheOrderedSteps.length * 100 : 0}%` }} /></div>
            </div>
            {nicheOrderedSteps.some(([, block]) => block.blockedReason) && nicheGoal.goalId && <div className="replan-row">
              <button type="button" className="replan-button" onClick={() => replanNiche(niche.id)} disabled={replanning[niche.id] || planningNiches[niche.id]}>
                <RotateCcw size={14} /> {replanning[niche.id] ? "Re-planning..." : "Re-plan — I have learned from this"}
              </button>
              <small>Keeps what you finished, replans the rest.</small>
            </div>}
            <div className="daily-steps">
              {nicheOrderedSteps.map(([hour, block], index) => <DailyStep
                key={hour}
                index={index}
                block={block.outcome ? block : { ...block, outcome: outcomeByHour[hour] || null }}
                isNext={index === nicheNextStepIndex}
                onToggle={() => saveBlock(hour, { ...block, done: !block.done, blockedReason: block.done ? block.blockedReason : "" })}
                onBlock={(blockedReason) => saveBlock(hour, { ...block, blockedReason })}
                onStart={() => startDailyStep(block)}
                onRecord={(outcome) => recordOutcome(hour, block, outcome)}
              />)}
            </div>
            {!nicheOrderedSteps.length && <p className="board-empty">Goal set. Add time blocks below or refine the goal.</p>}
          </section>;
        })}
      </div>}

      <section className="capture-panel">
        <div className="capture-heading"><div><span className="pulse-dot" />WHAT I'M WORKING ON</div><small>Tell me when your focus shifts.</small></div>
        <div className="capture-form"><textarea value={activity} onChange={(event) => setActivity(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runAnalysis(); }} placeholder="Tell me what you're about to work on..." aria-label="What are you working on" /><div className="analyze-column"><label className="mode-toggle"><span className={checkMode === "quick" ? "active" : ""}>Quick</span><button type="button" className="toggle-track" onClick={() => setCheckMode((m) => m === "quick" ? "deep" : "quick")} aria-label="Toggle analysis mode"><i className={checkMode === "deep" ? "deep" : ""} /></button><span className={checkMode === "deep" ? "active" : ""}>Deep</span></label><button className="analyze-button" onClick={runAnalysis} disabled={agentMode === "thinking"}><Sparkles size={17} /> {agentMode === "thinking" ? "Jarvis is thinking" : "Assess with Jarvis"} <ArrowRight size={16} /></button></div></div>
        {agentError && <p role="alert" style={{ color: "#b42318", margin: "12px 0 0" }}>{agentError}</p>}
        <div className="capture-prompts"><span>Try:</span><button onClick={() => setActivity("Spend two hours manually uploading product listings")}>Manual product work</button><button onClick={() => setActivity("Build a reusable creator outreach workflow")}>Build outreach system</button><button onClick={() => setActivity("Scroll Instagram for inspiration")}>Scroll for inspiration</button></div>
      </section>

      {analysis ? <section className="analysis-grid">
        <article className="decision-card"><div className="decision-top"><div><span className="eyebrow">JARVIS'S VERDICT</span><h2>{analysis.verdict}</h2></div><span className={`verdict ${analysis.verdict.toLowerCase().replace(" ", "-")}`}>{analysis.lane.replace("automation", "AI automation")}</span></div><p className="activity-quote">"{analysis.activity}"</p><p className="decision-reason">{analysis.reason}</p><div className="score-pair"><Score label="Long-term compounding" value={analysis.longTerm} accent="#00a58b" /><Score label="Short-term return" value={analysis.shortTerm} accent="#4c80ff" /></div><div className="decision-action"><div><span>Next smallest move</span><strong>{analysis.nextAction}</strong></div><button className="start-button" onClick={startFocus}><Play size={15} /> Start focus</button></div></article>
        <article className="agent-discussion"><div className="discussion-title"><Bot size={17} /><h3>Jarvis's assessment</h3><span>{agentMode === "live" ? "Live" : "Local"}</span></div><div className="thought"><span className="agent-initial teal">J</span><div><strong>Jarvis</strong><p>{analysis.longTerm >= 7 ? "This creates a reusable asset or strengthens the company's core direction." : "This does not yet show a strong path to a reusable asset. Tighten the outcome first."}</p></div></div><div className="thought"><span className="agent-initial blue">O</span><div><strong>Operations View</strong><p>{analysis.shortTerm >= 7 ? "There is a clear short-term payoff. Protect a time box and define the measurable result." : "The immediate return is limited. Only do this after your essential work is protected."}</p></div></div><div className="thought"><span className="agent-initial amber">E</span><div><strong>Energy View</strong><p>Keep the work bounded. Even a good priority can become avoidance without a finish line.</p></div></div><div className="bridge-note"><LockKeyhole size={14} /> {agentMode === "live" ? "Live response from your secure agent bridge." : agentMode === "fallback" ? "Bridge unreachable — used local assessment." : "Local model active. Connect a bridge for live AI agents."}</div>
          {analysis._degraded ? <p className="degraded-note"><Clock3 size={14} /> {analysis._degraded}</p> : null}
          {analysis._mode === "deep" && analysis._draft ? <div className="reasoning-section"><button className="reasoning-toggle" onClick={() => setShowReasoning((v) => !v)}><span><Bot size={15} /> How we got here{analysis._changed ? <span className="changed-badge">Critique changed outcome</span> : <span className="unchanged-badge">Critique confirmed draft</span>}</span><span className="reasoning-arrow">{showReasoning ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span></button>{showReasoning ? <div className="reasoning-trace"><div className="reasoning-step draft-step"><span className="step-label">Draft</span><div className="step-content"><div className="score-pair"><Score label="Long-term" value={analysis._draft.longTerm} accent="#00a58b" /><Score label="Short-term" value={analysis._draft.shortTerm} accent="#4c80ff" /></div><p><strong>Verdict:</strong> {analysis._draft.verdict} · <strong>Lane:</strong> {analysis._draft.lane}</p><p>{analysis._draft.reason}</p></div></div><div className="reasoning-step critique-step"><span className="step-label">Critique</span><div className="step-content"><p>{analysis._critique}</p></div></div><div className="reasoning-step synthesis-step"><span className="step-label">Synthesis</span><div className="step-content"><div className="score-pair"><Score label="Long-term" value={analysis._draft.longTerm} accent="#00a58b" /><Score label="Short-term" value={analysis._draft.shortTerm} accent="#4c80ff" /></div><p><strong>Verdict:</strong> {analysis.verdict} · <strong>Lane:</strong> {analysis.lane}</p><p>{analysis.reason}</p><p className="synthesis-note">{analysis._changed ? "The critique changed the final outcome." : "The critique confirmed the draft was sound."}</p></div></div></div> : null}</div> : null}
        </article>
      </section> : <section className="empty-analysis"><Sparkles size={22} /><div><strong>I'm here. What are you working on?</strong><p>Describe what you are doing. I will weigh short-term payoff, long-term leverage, and the cost to your attention.</p></div></section>}

      <section className="focus-section">
        <div className="section-header"><div><span className="eyebrow">OPTIONAL TIME BLOCKS</span><h2>Put the work on the schedule</h2><p>The niche board tracks sequence. Time blocks are optional.</p></div><button className="quiet-button" onClick={copyYesterday}><RotateCcw size={15} /> Copy from yesterday</button></div>
        <div className="schedule">
          {HOURS.map((hour) => <ScheduleRow key={hour} hour={hour} block={day.blocks?.[hour]} editing={editingHour === hour} onEdit={() => setEditingHour(hour)} onSave={(block) => saveBlock(hour, block)} onCancel={() => setEditingHour(null)} onToggle={() => saveBlock(hour, { ...day.blocks[hour], done: !day.blocks[hour].done })} />)}
        </div>
      </section>
      <section className="history-section"><div className="section-header"><div><span className="eyebrow">LEARNING LOOP</span><h2>Recent decisions</h2></div><span>{store.decisions.length} decisions captured</span></div>{recentDecisions.length ? <div className="history-grid">{recentDecisions.map((decision) => <article key={decision.id}><span className={`history-verdict ${decision.verdict.toLowerCase().replace(" ", "-")}`}>{decision.verdict}</span><strong>{decision.activity}</strong><p>{decision.longTerm}/10 long-term · {decision.shortTerm}/10 short-term</p></article>)}</div> : <p className="empty-history">Every decision logged here helps me understand what works and what drains you.</p>}</section>
      </>}
    </section>
  </main>;
}

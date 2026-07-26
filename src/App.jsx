import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
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
  RotateCcw,
  Sparkles,
  Target,
  TriangleAlert,
  X,
} from "lucide-react";
import { hasLiveAgentBridge, requestLiveAssessment } from "./agentClient";
import { memoryApi } from "./memoryClient";

const STORAGE_KEY = "personal-command-center:v1";
const AGENT_LANES = ["codex", "hermes", "openclaw"];
const HOURS = Array.from({ length: 17 }, (_, index) => index + 6);
const LANES = [
  { id: "automation", label: "AI automation", color: "#00a58b", tint: "#def7f0" },
  { id: "agency", label: "Web agency", color: "#4c80ff", tint: "#e8efff" },
  { id: "art", label: "Art store", color: "#e2773a", tint: "#fff0e7" },
  { id: "creator", label: "CreatorConnect", color: "#9968d9", tint: "#f1eaff" },
  { id: "personal", label: "Personal / rest", color: "#6b9665", tint: "#e8f4e6" },
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
const emptyDay = () => ({ goal: "", goalId: null, blocks: {}, energy: "steady" });

function readStore() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored && typeof stored === "object" ? { ...DEFAULT_STATE, ...stored } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

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
  const [store, setStore] = useState(readStore);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(store)), 150);
    return () => clearTimeout(timer.current);
  }, [store]);
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
      ) : <button className="add-focus" onClick={onEdit}><Plus size={15} /> Protect an hour</button>}
    </div>
  </div>;
}

function DailyStep({ index, block, isNext, onToggle, onBlock, onStart }) {
  const [showBlocker, setShowBlocker] = useState(false);
  const [reason, setReason] = useState(block.blockedReason || "");
  const lane = LANES.find((item) => item.id === block.laneId) || LANES[0];
  return <article className={`daily-step${block.done ? " done" : ""}${block.blockedReason ? " blocked" : ""}${isNext ? " next" : ""}`} style={{ "--step-lane": lane.color }}>
    <button className="step-check" onClick={onToggle} aria-label={block.done ? "Mark step incomplete" : "Complete step"}>{block.done && <Check size={13} />}</button>
    <div className="step-copy">
      <div className="step-meta"><span>STEP {index + 1}</span><small>{lane.label}</small>{isNext && <strong>NEXT</strong>}</div>
      <p>{block.task}</p>
      {block.blockedReason && <div className="blocker-note"><TriangleAlert size={13} /><span>{block.blockedReason}</span></div>}
      {showBlocker && <form className="blocker-form" onSubmit={(event) => { event.preventDefault(); onBlock(reason.trim()); setShowBlocker(false); }}>
        <input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What is stopping this step?" />
        <button type="submit">Pin blocker</button>
        <button type="button" onClick={() => setShowBlocker(false)} aria-label="Cancel blocker"><X size={14} /></button>
      </form>}
    </div>
    {!block.done && <div className="step-actions">
      {isNext && <button className="step-start" onClick={onStart}><Play size={13} /> Focus</button>}
      <button className="step-block" onClick={() => setShowBlocker((value) => !value)}>{block.blockedReason ? "Edit blocker" : "Blocked?"}</button>
    </div>}
  </article>;
}

export function App() {
  const [accessCode, setAccessCode] = useState(() => sessionStorage.getItem("northstar-access-code") || "");
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
  const [goal, setGoal] = useState("");
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");
  const [view, setView] = useState("command");
  const [roadmapGoal, setRoadmapGoal] = useState("");
  const [roadmap, setRoadmap] = useState(null);
  const [roadmapBuilding, setRoadmapBuilding] = useState(false);
  const [roadmapError, setRoadmapError] = useState("");
  const [checkedActions, setCheckedActions] = useState({});
  const { store, setStore } = useCommandStore();
  useEffect(() => {
    Promise.all([memoryApi.profile(accessCode), memoryApi.decisions(accessCode), memoryApi.active(accessCode)]).then(([profiles, decisions, active]) => {
      const profile = profiles?.[0];
      const mapped = (decisions || []).map((item) => ({ ...item, longTerm: item.long_term_score, shortTerm: item.short_term_score, nextAction: item.next_action, at: item.created_at }));
      const savedActive = active?.[0] ? { ...active[0], title: active[0].task, startedAt: active[0].started_at } : current.active;
      setStore((current) => ({ ...current, mission: profile?.mission || current.mission, operatingDraft: profile?.operating_brief?.text || current.operatingDraft, decisions: mapped.length ? mapped : current.decisions, active: savedActive }));
    }).catch(() => setAccessCode(""));
  }, [accessCode]);
  useEffect(() => { memoryApi.saveProfile(accessCode, { mission: store.mission, operating_brief: { text: store.operatingDraft } }).catch(() => {}); }, [accessCode, store.mission, store.operatingDraft]);
  useEffect(() => { memoryApi.agentState(accessCode).then(setAgentStates).catch(() => {}); }, [accessCode]);
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
          },
        },
      }));
    }).catch(() => {});
  }, [accessCode, date, setStore]);
  useEffect(() => {
    memoryApi.roadmaps(accessCode).then((rows) => {
      const latest = Array.isArray(rows) ? rows[0] : null;
      if (latest) setRoadmap({ goal: latest.goal, niches: Array.isArray(latest.niches) ? latest.niches : [] });
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
    if (accessCode) memoryApi.saveDecision(accessCode, entry).catch(() => {});
  };
  const startFocus = () => {
    if (!analysis) return;
    const next = { title: analysis.activity, task: analysis.activity, lane: analysis.lane, startedAt: new Date().toISOString() };
    setStore((current) => ({ ...current, active: next }));
    if (accessCode) memoryApi.saveActive(accessCode, { task: next.task, lane: next.lane, started_at: next.startedAt }).catch(() => {});
  };
  const clearActive = () => { setStore((current) => ({ ...current, active: null })); if (accessCode) memoryApi.saveActive(accessCode, {}).catch(() => {}); };
  const saveBlock = (hour, block) => {
    updateDay({ ...day, blocks: { ...day.blocks, [hour]: block } });
    memoryApi.saveDaily(accessCode, { date, hour, task: block.task, lane: block.laneId, done: block.done, blocked_reason: block.blockedReason || null, goal_id: block.goalId || day.goalId || null }).catch(() => {});
    setEditingHour(null);
  };
  const copyYesterday = () => {
    const prior = store.days[shiftDate(date, -1)];
    if (!prior) return;
    updateDay({ ...day, blocks: Object.fromEntries(Object.entries(prior.blocks).map(([hour, block]) => [hour, { ...block, done: false }])) });
  };
  const createPlan = async (event) => {
    event.preventDefault();
    if (!goal.trim()) return;
    setPlanning(true);
    setPlanError("");
    try {
      const result = await memoryApi.plan(accessCode, goal.trim(), store.operatingDraft);
      const generated = Array.isArray(result?.steps) ? result.steps : [];
      const planDate = generated[0]?.date || date;
      const planBlocks = Object.fromEntries(generated.filter((step) => step.date === planDate).map((step) => [step.hour, {
        task: `${step.title}: ${step.detail}`,
        laneId: step.lane === "creatorconnect" ? "creator" : LANES.some((lane) => lane.id === step.lane) ? step.lane : "personal",
        done: false,
        blockedReason: "",
        goalId: result.goal_id,
      }]));
      setDate(planDate);
      setStore((current) => ({
        ...current,
        days: {
          ...current.days,
          [planDate]: {
            ...(current.days[planDate] || emptyDay()),
            goal: goal.trim(),
            goalId: result.goal_id,
            blocks: planBlocks,
          },
        },
      }));
      setGoal("");
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Planner unavailable.");
    } finally {
      setPlanning(false);
    }
  };
  const buildRoadmap = async (event) => {
    event.preventDefault();
    if (!roadmapGoal.trim() || roadmapBuilding) return;
    setRoadmapBuilding(true);
    setRoadmapError("");
    try {
      const result = await memoryApi.buildRoadmap(accessCode, roadmapGoal.trim());
      setRoadmap({ goal: result.goal, niches: Array.isArray(result.niches) ? result.niches : [] });
      setCheckedActions({});
      setRoadmapGoal("");
      memoryApi.agentState(accessCode).then(setAgentStates).catch(() => {});
    } catch (error) {
      setRoadmapError(error instanceof Error ? error.message : "Roadmap unavailable.");
    } finally {
      setRoadmapBuilding(false);
    }
  };
  const toggleAction = (key) => setCheckedActions((current) => ({ ...current, [key]: !current[key] }));
  const orderedSteps = Object.entries(day.blocks || {}).sort(([first], [second]) => Number(first) - Number(second));
  const nextStepIndex = orderedSteps.findIndex(([, block]) => !block.done && !block.blockedReason);
  const startDailyStep = (block) => {
    const next = { title: block.task, task: block.task, lane: block.laneId, startedAt: new Date().toISOString() };
    setStore((current) => ({ ...current, active: next }));
    memoryApi.saveActive(accessCode, { task: next.task, lane: next.lane, started_at: next.startedAt }).catch(() => {});
  };

  return <main className="command-app">
    <aside className="command-sidebar">
      <div className="brand"><span><Flame size={19} /></span><strong>Northstar</strong></div>
      <div className="sidebar-label">YOUR OPERATING SYSTEM</div>
      <button className={`side-nav${view === "command" ? " active" : ""}`} onClick={() => setView("command")}><Gauge size={17} /> Command center</button>
      <button className={`side-nav${view === "roadmap" ? " active" : ""}`} onClick={() => setView("roadmap")}><Milestone size={17} /> Roadmap</button>
      <button className="side-nav" onClick={() => setView("command")}><ListTodo size={17} /> Daily focus</button>
      <button className="side-nav" onClick={() => setView("command")}><Clock3 size={17} /> Decision history</button>
      <section className="mission-card">
        <div><Sparkles size={16} /><span>North star</span></div>
        <p>{store.mission}</p>
        <button onClick={() => setShowMission((value) => !value)}>{showMission ? "Close" : "Adjust mission"}</button>
        {showMission && <textarea value={store.mission} onChange={(event) => setStore((current) => ({ ...current, mission: event.target.value }))} aria-label="Your mission" />}
      </section>
      <section className="agent-list">
        <div className="sidebar-label">AGENT NETWORK</div>
        <AgentCard icon={Target} title="Strategist" detail="Long-term alignment" state={agentMode === "thinking" ? "Thinking" : "Ready"} tone="teal" />
        <AgentCard icon={Activity} title="Operator" detail="Short-term payoff" state={agentMode === "thinking" ? "Thinking" : "Ready"} tone="blue" />
        <AgentCard icon={LockKeyhole} title="Guardian" detail="Energy and attention" state="Ready" tone="amber" />
        {agentStates.map((item) => <AgentCard key={item.agent} icon={Bot} title={item.agent} detail={item.current_task || item.detail || "No task queued"} state={item.status || "idle"} tone="blue" />)}
      </section>
      <p className="local-note">Private by default. Your decisions stay on this device until you connect a secure agent bridge.</p>
    </aside>

    <section className="command-main">
      {view === "roadmap" ? <>
      <header className="command-header">
        <div><p className="eyebrow">SEQUENCED PLAN</p><h1>Know which niche comes first.</h1><p className="subhead">Give the agents one goal. They sequence the relevant niches, then hand any agent-lane steps to Codex, Hermes and OpenClaw.</p></div>
      </header>
      <form className="activity-form" onSubmit={buildRoadmap}>
        <label htmlFor="roadmap-goal">What outcome should the roadmap reach?</label>
        <div className="activity-row"><input id="roadmap-goal" value={roadmapGoal} onChange={(event) => setRoadmapGoal(event.target.value)} placeholder="Describe the goal to sequence" /><button type="submit" disabled={roadmapBuilding}>{roadmapBuilding ? "Sequencing..." : "Build roadmap"}</button></div>
      </form>
      {roadmapError && <p role="alert" style={{ color: "#b42318", margin: "12px 0 0" }}>{roadmapError}</p>}
      {roadmapBuilding && <p className="roadmap-progress"><Sparkles size={15} /> Sequencing your niches. This usually takes about ten seconds.</p>}
      {roadmap?.niches?.length ? <section className="roadmap-section">
        <div className="section-header"><div><span className="eyebrow">CURRENT ROADMAP</span><h2>{roadmap.goal}</h2><p>{roadmap.niches.length} niches sequenced.</p></div></div>
        <div className="roadmap-list">
          {roadmap.niches.map((entry, index) => <article key={`${entry.niche}-${index}`} className="roadmap-card">
            <div className="roadmap-head"><span className="roadmap-number">{entry.sequence_position ?? index + 1}</span><div><h3>{entry.niche}</h3>{AGENT_LANES.some((agent) => String(entry.niche).toLowerCase().includes(agent)) && <span className="roadmap-agent">Agent lane</span>}</div></div>
            <ul className="roadmap-actions">
              {(entry.actions || []).map((action, actionIndex) => {
                const key = `${index}:${actionIndex}`;
                const step = typeof action === "string" ? action : action?.step;
                return <li key={key}><button type="button" className={`roadmap-check${checkedActions[key] ? " done" : ""}`} onClick={() => toggleAction(key)} aria-pressed={Boolean(checkedActions[key])}><span className="roadmap-box">{checkedActions[key] ? <Check size={12} /> : null}</span><span>{step}</span></button></li>;
              })}
            </ul>
            {entry.reasoning && <p className="roadmap-reasoning">{entry.reasoning}</p>}
          </article>)}
        </div>
      </section> : !roadmapBuilding && <section className="empty-analysis"><Milestone size={22} /><div><strong>No roadmap yet.</strong><p>Describe one goal above. The agents sequence only the niches that actually serve it, and explain why each one sits where it does.</p></div></section>}
      </> : <>
      <header className="command-header">
        <div><p className="eyebrow">PERSONAL COMMAND CENTER</p><h1>Choose the work that compounds.</h1><p className="subhead">Tell the agents what you are about to do. Get a clear decision before your time disappears.</p></div>
        <div className="date-controls"><button className="square-button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ChevronLeft size={18} /></button><div><strong>{date === localDateKey() ? "Today" : formatDate(date)}</strong><small>{formatDate(date)}</small></div><button className="square-button" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day"><ChevronRight size={18} /></button></div>
      </header>

      <section className="operating-draft">
        <button className="draft-toggle" onClick={() => setShowOperatingDraft((value) => !value)} aria-expanded={showOperatingDraft}>
          <span><Target size={16} /><strong>Operating brief</strong><small>Draft saved - used by your decision system</small></span>
          <ChevronDown size={17} className={showOperatingDraft ? "open" : ""} />
        </button>
        {showOperatingDraft && <div className="draft-body"><div className="strategy-lens"><span>Priority lens</span><strong>AI automation → cash-flow learning → English / software → self-improvement</strong><small>AI-assisted investing stays low priority until your controlled businesses are stronger.</small></div><textarea value={store.operatingDraft} onChange={(event) => setStore((current) => ({ ...current, operatingDraft: event.target.value }))} aria-label="Operating brief draft" /></div>}
      </section>
      <form className="activity-form" onSubmit={createPlan}>
        <label htmlFor="goal">What must be true by the end of today?</label>
        <div className="activity-row"><input id="goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Example: improve the Shopify homepage until the banner is clear" /><button type="submit" disabled={planning}>{planning ? "Breaking it down..." : "Pin today's goal"}</button></div>
        {planError && <p role="alert" style={{ color: "#b42318", margin: "10px 0 0", fontSize: 12 }}>{planError}</p>}
      </form>

      {activeLane && <section className="active-strip" style={{ "--active": activeLane.color }}><CircleDot size={16} /><span>In focus now</span><strong>{store.active.title}</strong><button onClick={clearActive}>End focus</button></section>}

      {day.goal && <section className="today-board">
        <div className="board-head">
          <div><span className="eyebrow">TODAY'S WORKFLOW</span><h2>{day.goal}</h2><p>{completed} of {orderedSteps.length} steps complete</p></div>
          <div className="board-progress" aria-label={`${completed} of ${orderedSteps.length} complete`}><i style={{ width: `${orderedSteps.length ? completed / orderedSteps.length * 100 : 0}%` }} /></div>
        </div>
        <div className="daily-steps">
          {orderedSteps.map(([hour, block], index) => <DailyStep
            key={hour}
            index={index}
            block={block}
            isNext={index === nextStepIndex}
            onToggle={() => saveBlock(hour, { ...block, done: !block.done, blockedReason: block.done ? block.blockedReason : "" })}
            onBlock={(blockedReason) => saveBlock(hour, { ...block, blockedReason })}
            onStart={() => startDailyStep(block)}
          />)}
        </div>
        {!orderedSteps.length && <p className="board-empty">The goal is pinned. Add a step below or rebuild the plan.</p>}
      </section>}

      <section className="capture-panel">
        <div className="capture-heading"><div><span className="pulse-dot" />LIVE INPUT</div><small>Update this whenever your attention changes.</small></div>
        <div className="capture-form"><textarea value={activity} onChange={(event) => setActivity(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runAnalysis(); }} placeholder="I am about to spend time on..." aria-label="What are you doing right now" /><div className="analyze-column"><label className="mode-toggle"><span className={checkMode === "quick" ? "active" : ""}>Quick</span><button type="button" className="toggle-track" onClick={() => setCheckMode((m) => m === "quick" ? "deep" : "quick")} aria-label="Toggle analysis mode"><i className={checkMode === "deep" ? "deep" : ""} /></button><span className={checkMode === "deep" ? "active" : ""}>Deep</span></label><button className="analyze-button" onClick={runAnalysis} disabled={agentMode === "thinking"}><Sparkles size={17} /> {agentMode === "thinking" ? "Agents thinking" : "Ask the agents"} <ArrowRight size={16} /></button></div></div>
        {agentError && <p role="alert" style={{ color: "#b42318", margin: "12px 0 0" }}>{agentError}</p>}
        <div className="capture-prompts"><span>Try:</span><button onClick={() => setActivity("Spend two hours manually uploading product listings")}>Manual product work</button><button onClick={() => setActivity("Build a reusable creator outreach workflow")}>Build outreach system</button><button onClick={() => setActivity("Scroll Instagram for inspiration")}>Scroll for inspiration</button></div>
      </section>

      {analysis ? <section className="analysis-grid">
        <article className="decision-card"><div className="decision-top"><div><span className="eyebrow">AGENT VERDICT</span><h2>{analysis.verdict}</h2></div><span className={`verdict ${analysis.verdict.toLowerCase().replace(" ", "-")}`}>{analysis.lane.replace("automation", "AI automation")}</span></div><p className="activity-quote">"{analysis.activity}"</p><p className="decision-reason">{analysis.reason}</p><div className="score-pair"><Score label="Long-term compounding" value={analysis.longTerm} accent="#00a58b" /><Score label="Short-term return" value={analysis.shortTerm} accent="#4c80ff" /></div><div className="decision-action"><div><span>Next smallest move</span><strong>{analysis.nextAction}</strong></div><button className="start-button" onClick={startFocus}><Play size={15} /> Start focus</button></div></article>
        <article className="agent-discussion"><div className="discussion-title"><Bot size={17} /><h3>Agent discussion</h3><span>{agentMode === "live" ? "Live" : "Local"}</span></div><div className="thought"><span className="agent-initial teal">S</span><div><strong>{analysis.agent || "Strategist"}</strong><p>{analysis.longTerm >= 7 ? "This creates a reusable asset or strengthens the company's core direction." : "This does not yet show a strong path to a reusable asset. Tighten the outcome first."}</p></div></div><div className="thought"><span className="agent-initial blue">O</span><div><strong>Operator</strong><p>{analysis.shortTerm >= 7 ? "There is a clear short-term payoff. Protect a time box and define the measurable result." : "The immediate return is limited. Only do this after your essential work is protected."}</p></div></div><div className="thought"><span className="agent-initial amber">G</span><div><strong>Guardian</strong><p>Keep the work bounded. A good priority can still become avoidance when it has no finish line.</p></div></div><div className="bridge-note"><LockKeyhole size={14} /> {agentMode === "live" ? "Live response received from your secure agent bridge." : agentMode === "fallback" ? "Live bridge did not respond, so Northstar used the local strategic model." : "Local strategic model active. Add a secure agent bridge to use live Hermes or OpenAI agents."}</div>
          {analysis._mode === "deep" && analysis._draft ? <div className="reasoning-section"><button className="reasoning-toggle" onClick={() => setShowReasoning((v) => !v)}><span><Bot size={15} /> How we got here{analysis._changed ? <span className="changed-badge">Critique changed outcome</span> : <span className="unchanged-badge">Critique confirmed draft</span>}</span><span className="reasoning-arrow">{showReasoning ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span></button>{showReasoning ? <div className="reasoning-trace"><div className="reasoning-step draft-step"><span className="step-label">Draft</span><div className="step-content"><div className="score-pair"><Score label="Long-term" value={analysis._draft.longTerm} accent="#00a58b" /><Score label="Short-term" value={analysis._draft.shortTerm} accent="#4c80ff" /></div><p><strong>Verdict:</strong> {analysis._draft.verdict} · <strong>Lane:</strong> {analysis._draft.lane}</p><p>{analysis._draft.reason}</p></div></div><div className="reasoning-step critique-step"><span className="step-label">Critique</span><div className="step-content"><p>{analysis._critique}</p></div></div><div className="reasoning-step synthesis-step"><span className="step-label">Synthesis</span><div className="step-content"><div className="score-pair"><Score label="Long-term" value={analysis._draft.longTerm} accent="#00a58b" /><Score label="Short-term" value={analysis._draft.shortTerm} accent="#4c80ff" /></div><p><strong>Verdict:</strong> {analysis.verdict} · <strong>Lane:</strong> {analysis.lane}</p><p>{analysis.reason}</p><p className="synthesis-note">{analysis._changed ? "The critique changed the final outcome." : "The critique confirmed the draft was sound."}</p></div></div></div> : null}</div> : null}
        </article>
      </section> : <section className="empty-analysis"><Sparkles size={22} /><div><strong>Your agents are standing by.</strong><p>Describe the activity in plain language. They will weigh immediate payoff, long-term leverage, and the cost to your attention.</p></div></section>}

      <section className="focus-section">
        <div className="section-header"><div><span className="eyebrow">OPTIONAL TIME BLOCKS</span><h2>Place the work on the clock</h2><p>The board above tracks sequence. Use time blocks only when they help.</p></div><button className="quiet-button" onClick={copyYesterday}><RotateCcw size={15} /> Copy yesterday</button></div>
        <div className="schedule">
          {HOURS.map((hour) => <ScheduleRow key={hour} hour={hour} block={day.blocks?.[hour]} editing={editingHour === hour} onEdit={() => setEditingHour(hour)} onSave={(block) => saveBlock(hour, block)} onCancel={() => setEditingHour(null)} onToggle={() => saveBlock(hour, { ...day.blocks[hour], done: !day.blocks[hour].done })} />)}
        </div>
      </section>
      <section className="history-section"><div className="section-header"><div><span className="eyebrow">LEARNING LOOP</span><h2>Recent decisions</h2></div><span>{store.decisions.length} decisions captured</span></div>{recentDecisions.length ? <div className="history-grid">{recentDecisions.map((decision) => <article key={decision.id}><span className={`history-verdict ${decision.verdict.toLowerCase().replace(" ", "-")}`}>{decision.verdict}</span><strong>{decision.activity}</strong><p>{decision.longTerm}/10 long-term · {decision.shortTerm}/10 short-term</p></article>)}</div> : <p className="empty-history">Your decision history will become your evidence: what compounds, what pays, and what quietly drains you.</p>}</section>
      </>}
    </section>
  </main>;
}

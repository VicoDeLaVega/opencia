// OpenCode Agent Visualizer — backend
//
// Connects to a running `opencode serve` instance, subscribes to its
// event stream, reconstructs the live session/subagent tree, and
// pushes graph updates to any connected browser over WebSocket.
//
// Usage:
//   1. In one terminal:  opencode serve --port 4096
//   2. In another:       OPENCODE_URL=http://localhost:4096 node server.mjs
//   3. Open http://localhost:8787 in a browser

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createOpencodeClient } from "@opencode-ai/sdk";
import chokidar from "chokidar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";
const VIS_PORT = Number(process.env.VIS_PORT || 8787);
// Where to look for an `openspec/` directory (OpenSpec's own convention).
// Defaults to sitting next to this server, which is our own setup — a
// separate opencode project being watched would need to point this at
// itself instead.
const OPENSPEC_ROOT = process.env.OPENSPEC_ROOT || path.join(__dirname, "openspec");
// `files:` entries in tasks.md are relative to the project root (see
// openspec/schemas/task-graph/schema.yaml's apply.instruction) - which is
// openspec/'s parent, not this server's own directory (a separate project
// being watched would set OPENSPEC_ROOT, and PROJECT_ROOT follows it).
const PROJECT_ROOT = path.dirname(OPENSPEC_ROOT);

// ---- graph state -----------------------------------------------------
// nodes: sessionId -> { id, parentID, title, agent, status, lastEvent, updatedAt }
// edges are derived from parentID, so we don't store them separately.
const nodes = new Map();

// `file.edited` events aren't guaranteed to carry a sessionID (the SDK's own
// type definition for this event has no sessionID field, unlike most others
// we've verified). When we can attribute an edit to a session it's stored on
// that node (`.files`); otherwise it lands here as a project-wide fallback.
const globalFilesEdited = new Set();

function upsertNode(id, patch) {
  const existing = nodes.get(id) || { id, status: "idle" };
  nodes.set(id, { ...existing, ...patch, updatedAt: Date.now() });
  broadcastGraph();
}

// Build a partial patch from a session `info` object, only including fields
// that are actually present — a spread with an explicit `undefined` value
// still overwrites the existing key, so we can't just pass s.title etc through.
function sessionInfoPatch(s) {
  const patch = {};
  if (s.parentID) patch.parentID = s.parentID;
  if (s.title) patch.title = s.title;
  if (s.agent) patch.agent = s.agent;
  if (s.directory) patch.directory = s.directory;
  if (s.model?.id) patch.model = `${s.model.providerID}/${s.model.id}`;
  if (s.tokens) patch.tokens = s.tokens;
  if (s.cost != null) patch.cost = s.cost;
  return patch;
}

function snapshotGraph() {
  return {
    nodes: [...nodes.values()],
    filesEdited: [...globalFilesEdited],
    openspecChanges: [...openspecChanges.values()],
  };
}

// ---- OpenSpec task-graph ingestion ---------------------------------------
// Pure file-based, no API from OpenSpec's side — we watch
// openspec/changes/*/tasks.md ourselves and parse our own extended task
// line format (see openspec/schemas/task-graph/schema.yaml):
//   - [ ] 1.1 Description | depends: 1.2,2.1 | difficulty: medium | verify: ...
// `openspec status`/`apply` only look at the leading "- [ ]"/"- [x]", so
// this stays fully compatible with them — we're not modifying OpenSpec,
// just reading the same file with a richer parser.
const openspecChanges = new Map(); // changeName -> { name, tasks: [...] }

const TASK_LINE = /^- \[([ xX])\]\s+(\S+)\s+(.*)$/;
const HEADING_LINE = /^##\s+(.*)$/;

function parseTasksMd(content) {
  const tasks = [];
  let group = null;
  for (const line of content.split("\n")) {
    const h = line.match(HEADING_LINE);
    if (h) {
      group = h[1].trim();
      continue;
    }
    const m = line.match(TASK_LINE);
    if (!m) continue;
    const [, mark, id, rest] = m;
    const segments = rest.split("|").map((s) => s.trim());
    const description = segments[0];
    const meta = {};
    for (const seg of segments.slice(1)) {
      const idx = seg.indexOf(":");
      if (idx === -1) continue;
      meta[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
    }
    const depends = (meta.depends || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== "none");
    const files = (meta.files || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== "none");
    const checked = mark.toLowerCase() === "x";
    tasks.push({
      id,
      group,
      description,
      checked,
      depends,
      difficulty: meta.difficulty || null,
      verify: meta.verify || null,
      // Older tasks.md files (written before this field existed) have no
      // `status` — fall back to the checkbox so they still render sanely.
      status: meta.status || (checked ? "done" : "not_started"),
      files,
    });
  }
  return tasks;
}

async function loadChangeTasks(changeDir) {
  const name = path.basename(changeDir);
  try {
    const content = await readFile(path.join(changeDir, "tasks.md"), "utf8");
    const tasks = parseTasksMd(content);
    openspecChanges.set(name, { name, tasks });
  } catch {
    // tasks.md doesn't exist yet (change proposed but not through the
    // tasks phase) — drop it from the graph rather than show stale data.
    openspecChanges.delete(name);
  }
  broadcastGraph();
}

function watchOpenSpecChanges() {
  // chokidar 5+ dropped glob-string support — watch the directory and
  // filter for tasks.md ourselves instead (verified live: a glob pattern
  // silently matched nothing, watching the dir directly works).
  const changesDir = path.join(OPENSPEC_ROOT, "changes");
  const watcher = chokidar.watch(changesDir, { ignoreInitial: false });
  const isTasksFile = (file) => path.basename(file) === "tasks.md";
  watcher.on("add", (file) => { if (isTasksFile(file)) loadChangeTasks(path.dirname(file)); });
  watcher.on("change", (file) => { if (isTasksFile(file)) loadChangeTasks(path.dirname(file)); });
  watcher.on("unlink", (file) => {
    if (!isTasksFile(file)) return;
    openspecChanges.delete(path.basename(path.dirname(file)));
    broadcastGraph();
  });
  watcher.on("error", (err) => console.error("OpenSpec watcher error:", err.message));
  console.log(`Watching OpenSpec changes: ${changesDir}`);
}

// ---- websocket fan-out -------------------------------------------------
const clients = new Set();

function broadcastGraph() {
  const payload = JSON.stringify({ type: "graph", data: snapshotGraph() });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// Preview a file a task claims to have produced (its `files:` field).
// Those paths are project-root-relative and come from LLM-authored
// tasks.md, so we resolve and then verify the result is still inside
// PROJECT_ROOT before serving anything — a `files: ../../etc/passwd` entry
// (buggy or malicious) must not escape the project directory.
const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };
const TEXT_TYPES = { ".md": "text/markdown", ".json": "application/json", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".html": "text/html" };

async function serveTaskFile(req, res) {
  const url = new URL(req.url, "http://localhost");
  const rel = url.searchParams.get("path") || "";
  const resolved = path.resolve(PROJECT_ROOT, rel);
  if (!resolved.startsWith(PROJECT_ROOT + path.sep)) {
    res.writeHead(403);
    res.end("path escapes project root");
    return;
  }
  try {
    const body = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const type = IMAGE_TYPES[ext] || TEXT_TYPES[ext] || "text/plain";
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("file not found");
  }
}

// ---- static file + websocket http server --------------------------------
const server = createServer(async (req, res) => {
  if (req.url.startsWith("/task-file")) return serveTaskFile(req, res);
  try {
    const filePath =
      req.url === "/" || !req.url
        ? "/index.html"
        : req.url.split("?")[0];
    const full = path.join(__dirname, "public", filePath);
    const body = await readFile(full);
    const ext = path.extname(full);
    const type =
      ext === ".html" ? "text/html" : ext === ".js" ? "application/javascript" : "text/plain";
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "graph", data: snapshotGraph() }));
  ws.on("close", () => clients.delete(ws));
});

server.listen(VIS_PORT, () => {
  console.log(`Visualizer UI:      http://localhost:${VIS_PORT}`);
  console.log(`Watching OpenCode:  ${OPENCODE_URL}`);
});

// ---- OpenCode event ingestion --------------------------------------------
const client = createOpencodeClient({ baseUrl: OPENCODE_URL });

// Populate the graph with sessions that already existed before this
// visualizer started (e.g. it was restarted after OpenCode), instead of
// starting from a blank graph and only showing new activity from now on.
const MAX_PRELOAD_SESSIONS = Number(process.env.MAX_PRELOAD_SESSIONS || 1);

async function loadExistingSessions() {
  try {
    const { data } = await client.session.list();
    // Only the most recent ones — a project can accumulate many unrelated
    // one-shot sessions over time, and showing all of them just clutters the
    // graph with disconnected dots that aren't actually related to anything.
    const recent = [...(data ?? [])]
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
      .slice(0, MAX_PRELOAD_SESSIONS);
    for (const s of recent) {
      const existing = nodes.get(s.id);
      nodes.set(s.id, {
        id: s.id,
        status: "idle",
        lastEvent: "loaded",
        ...existing,
        ...sessionInfoPatch(s),
        parentID: s.parentID ?? existing?.parentID ?? null,
        title: s.title || existing?.title || s.id,
        updatedAt: Date.now(),
      });
    }
    broadcastGraph();
    console.log(`Loaded ${recent.length} of ${data?.length ?? 0} existing session(s) from ${OPENCODE_URL} (most recent; set MAX_PRELOAD_SESSIONS to change)`);
  } catch (err) {
    console.error("Could not load existing sessions:", err.message);
  }
}

async function watchEvents() {
  const { stream } = await client.event.subscribe();
  for await (const event of stream) {
    console.log("[event]", event.type, JSON.stringify(event.properties));
    switch (event.type) {
      case "session.created": {
        const s = event.properties?.info ?? event.properties ?? {};
        upsertNode(s.id ?? event.sessionID, {
          ...sessionInfoPatch(s),
          parentID: s.parentID ?? null,
          title: s.title || s.id || "session",
          agent: s.agent || (s.parentID ? "subagent" : "primary"),
          status: "running",
          lastEvent: "created",
        });
        break;
      }
      // OpenCode creates sessions with a placeholder title ("New session - <ts>")
      // and renames them once the model has produced a real title. Track that.
      case "session.updated": {
        const s = event.properties?.info ?? event.properties ?? {};
        const id = s.id ?? event.properties?.sessionID ?? event.sessionID;
        if (id) upsertNode(id, sessionInfoPatch(s));
        break;
      }
      case "session.idle": {
        const id = event.properties?.sessionID ?? event.sessionID;
        // Don't clobber lastEvent (e.g. "tool:glob") — idle only changes status,
        // it's not itself interesting information about what the session did.
        if (id) upsertNode(id, { status: "idle" });
        break;
      }
      case "session.error": {
        const id = event.properties?.sessionID ?? event.sessionID;
        if (id) upsertNode(id, { status: "error", lastEvent: "error" });
        break;
      }
      // The primary agent's self-planned task list (TodoWrite-equivalent).
      // Rendered as small satellite nodes hanging off the session node.
      case "todo.updated": {
        const id = event.properties?.sessionID ?? event.sessionID;
        const todos = event.properties?.todos ?? [];
        if (id) upsertNode(id, { todos });
        break;
      }
      // Track files the agent has written/edited. If the event carries a
      // sessionID we attribute it to that node; otherwise (the SDK's own
      // type says sessionID isn't guaranteed here) it's a project-wide
      // fallback, since we still know a file changed, just not by whom.
      case "file.edited": {
        const file = event.properties?.file;
        const id = event.properties?.sessionID ?? event.sessionID;
        if (!file) break;
        if (id && nodes.has(id)) {
          const existing = nodes.get(id);
          const files = [...new Set([...(existing.files || []), file])];
          upsertNode(id, { files });
        } else {
          globalFilesEdited.add(file);
          broadcastGraph();
        }
        break;
      }
      case "session.deleted": {
        const id = event.properties?.sessionID ?? event.sessionID;
        if (id && nodes.has(id)) {
          upsertNode(id, { status: "finished", lastEvent: "deleted" });
        }
        break;
      }
      // Tool activity flashes the node as "running". We also keep a running
      // transcript of text/tool parts per session (keyed by part id, so a
      // part being streamed in just updates in place) — this feeds the
      // click-to-inspect detail panel in the UI.
      case "message.part.updated": {
        const id = event.properties?.sessionID ?? event.sessionID;
        const part = event.properties?.part;
        if (!id || !part) break;
        const patch = {};
        if (part.type === "text" || part.type === "tool") {
          const existing = nodes.get(id);
          const parts = { ...(existing?.parts || {}) };
          parts[part.id] = part;
          patch.parts = parts;
        }
        if (part.type === "tool") {
          patch.status = "running";
          patch.lastEvent = `tool:${part.tool ?? "?"}`;
        }
        upsertNode(id, patch);
        break;
      }
      default:
        // Unhandled event type — logged by the blanket console.log above.
        break;
    }
  }
}

await loadExistingSessions();
watchOpenSpecChanges();

watchEvents().catch((err) => {
  console.error("Lost connection to OpenCode event stream:", err.message);
  console.error("Is `opencode serve` running at", OPENCODE_URL, "?");
  process.exit(1);
});

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";
const VIS_PORT = Number(process.env.VIS_PORT || 8787);

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
  };
}

// ---- websocket fan-out -------------------------------------------------
const clients = new Set();

function broadcastGraph() {
  const payload = JSON.stringify({ type: "graph", data: snapshotGraph() });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// ---- static file + websocket http server --------------------------------
const server = createServer(async (req, res) => {
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
        if (id) {
          nodes.delete(id);
          broadcastGraph();
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

watchEvents().catch((err) => {
  console.error("Lost connection to OpenCode event stream:", err.message);
  console.error("Is `opencode serve` running at", OPENCODE_URL, "?");
  process.exit(1);
});

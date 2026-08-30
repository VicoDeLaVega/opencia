## Context

See proposal.md for motivation. The current implementation in `server.mjs` deletes nodes on `session.deleted` (lines 205-212). The client in `public/index.html` defines `STATUS_COLOR` for `running`, `idle`, `error` but not for a finished/terminated state.

## Goals / Non-Goals

**Goals:**
- Keep finished session nodes visible in the graph with a gray appearance
- Preserve all session metadata (title, agent, parentID, todos, files, parts) for finished sessions
- Maintain parent-child link visibility for finished sessions
- No breaking changes to WebSocket protocol or existing status values

**Non-Goals:**
- Add new UI controls to filter/show/hide finished sessions
- Persist finished sessions across visualizer restarts (beyond existing preload logic)
- Distinguish between "completed successfully" vs "cancelled/failed" - both map to "finished"

## Decisions

1. **Status value: `"finished"`** - Reusing a simple, clear term. Alternatives considered: `"terminated"`, `"completed"`, `"done"`. `"finished"` is neutral and matches the French UI terminology ("terminé" for completed todos).

2. **Gray color: `#cfcbc2`** - Matches the existing `TODO_COLOR.pending` and connection dot "disconnected" color, providing visual consistency. It's a muted pastel gray that reads as "inactive" without being harsh.

3. **No pulse animation** - The `.running` CSS class (which triggers pulse) is applied when `status === "running" || status === "in_progress"`. Adding `"finished"` to this condition would be incorrect. The node should appear static.

4. **Server-side only change for status** - The client already handles unknown statuses gracefully (falls back to `#5b8cff` blue). By adding `"finished"` to `STATUS_COLOR`, we get the correct color without client logic changes beyond the color map.

5. **Preserve all node data** - The `upsertNode` function merges patches with existing data. By sending `{ status: "finished" }` as a patch, all other fields (title, agent, parentID, todos, files, parts, updatedAt) are preserved automatically.

## Risks / Trade-offs

- **[Risk] Graph clutter over time** → Mitigation: The existing `MAX_PRELOAD_SESSIONS` limit on startup helps. Long-running visualizers could accumulate many finished nodes. Could add a "clear finished" button later if needed.
- **[Risk] Force layout instability** → Mitigation: Finished nodes keep their position (preserved by `prevPositions` in render). They participate in charge/link forces but without active status changes, they should settle quickly.
- **[Trade-off] No distinction between success/failure** → Both map to `"finished"`. The `lastEvent` field (e.g., "error") and detail panel still show the actual outcome.

## Migration Plan

1. Update `server.mjs` `session.deleted` handler to upsert with `status: "finished"` instead of `nodes.delete()`
2. Add `"finished": "#cfcbc2"` to `STATUS_COLOR` in `public/index.html`
3. Verify rendering: finished nodes appear gray, no pulse, links intact, detail panel works
4. No deployment coordination needed - backward compatible (old clients just show blue for unknown status)

## Open Questions

None - the approach is straightforward and low-risk.
## Why

Currently, when a session is deleted (via the `session.deleted` event from OpenCode), the visualizer completely removes the node from the graph. This makes it impossible to see the history of completed/terminated sessions and their relationships to other sessions. Users lose context about what work was done.

## What Changes

- **Server (server.mjs)**: Modify the `session.deleted` event handler to update the node's status to `"finished"` instead of deleting it from the nodes Map
- **Client (public/index.html)**: Add a new `"finished"` status color (gray) to `STATUS_COLOR` and ensure the rendering logic handles this status correctly (gray fill, no pulse animation)

## Capabilities

### Modified Capabilities
- `session-graph`: The session graph visualization behavior changes - finished sessions remain visible with a distinct gray appearance instead of being removed

## Impact

- **server.mjs**: Lines 205-212 (`session.deleted` case in event handler)
- **public/index.html**: Lines 71-75 (`STATUS_COLOR` object), line 219 (running class logic), line 223 (fill color logic)
- No API changes, no breaking changes to existing functionality
- WebSocket message format unchanged - only the node status value changes
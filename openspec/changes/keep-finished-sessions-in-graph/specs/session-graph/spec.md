## MODIFIED Requirements

### Requirement: Session nodes persist after deletion event
When a `session.deleted` event is received from OpenCode, the visualizer SHALL retain the session node in the graph with a status of `"finished"` instead of removing it entirely.

#### Scenario: Session deleted event received
- **WHEN** the server receives a `session.deleted` event for a session ID that exists in the nodes Map
- **THEN** the node's status is updated to `"finished"` and the graph is broadcast to clients
- **THEN** the node remains in the nodes Map with all its existing properties (title, agent, parentID, todos, files, parts, etc.) preserved

#### Scenario: Session deleted event for unknown session
- **WHEN** the server receives a `session.deleted` event for a session ID not in the nodes Map
- **THEN** no action is taken (no node is created, no error)

### Requirement: Finished sessions render with gray appearance
The client SHALL render session nodes with status `"finished"` using a distinct gray color and without the running pulse animation.

#### Scenario: Finished session node rendered
- **WHEN** a node with `status === "finished"` is rendered
- **THEN** its fill color is a muted gray (e.g., `#cfcbc2`)
- **THEN** it does not have the `.running` CSS class (no pulse animation)
- **THEN** its label and sub-text remain readable

#### Scenario: Finished session with subagent children
- **WHEN** a finished session has child subagent nodes
- **THEN** the parent-child links remain visible
- **THEN** the finished parent node stays in the force layout
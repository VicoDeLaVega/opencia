## 1. Server-side changes

- [x] 1.1 Modify session.deleted handler in server.mjs to upsert status "finished" instead of deleting | depends: none | difficulty: easy | verify: node remains in nodes Map with status "finished" after session.deleted event
- [x] 1.2 Verify broadcastGraph is called after status update | depends: 1.1 | difficulty: easy | verify: console.log shows graph broadcast, client receives update

## 2. Client-side changes

- [x] 2.1 Add "finished" status color to STATUS_COLOR object in public/index.html | depends: none | difficulty: easy | verify: STATUS_COLOR.finished === "#cfcbc2"
- [x] 2.2 Verify finished nodes render gray without pulse animation | depends: 2.1 | difficulty: easy | verify: manual test - finished session appears gray, static, with links intact

## 3. Integration verification

- [x] 3.1 Test full flow: start session, let it complete, verify it stays in graph grayed out | depends: 1.2, 2.2 | difficulty: medium | verify: session node visible with gray fill, clickable detail panel shows correct info
- [x] 3.2 Test subagent sessions: parent finishes, child finishes - both stay visible | depends: 3.1 | difficulty: medium | verify: parent-child links visible, both nodes gray
- [x] 3.3 Test preload: restart visualizer with existing finished sessions | depends: 3.1 | difficulty: easy | verify: preloaded sessions with status "finished" render correctly
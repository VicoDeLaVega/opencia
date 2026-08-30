# Proposal: Add Dark Mode to Visualizer

## Why
The current OpenCode Agent Visualizer (public/index.html) uses a light color scheme with warm beige/cream backgrounds. Users working in dark environments or preferring dark themes lack a dark mode option, causing eye strain and inconsistency with modern development tooling.

## What Changes
- Add a dark mode color scheme to the visualizer
- Add a toggle button in the HUD to switch between light and dark modes
- Persist user preference in localStorage
- Automatically detect system preference (prefers-color-scheme) on first visit
- Update all CSS variables/colors for both themes (background, text, nodes, links, detail panel, buttons, etc.)

## Capabilities
### New Capabilities
- **dark-mode**: Visual theme switching capability for the visualizer

### Modified Capabilities
- None (this is a new UI capability, not modifying existing behavior)

## Impact
- **Files affected**: `public/index.html` (single file containing HTML, CSS, and JavaScript)
- **No API changes** - purely client-side visual enhancement
- **No breaking changes** - existing light mode remains default
- **Dependencies**: None (vanilla CSS/JS, no new libraries)
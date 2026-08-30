# Design: Dark Mode for Visualizer

## Context
The visualizer is a single-file HTML application (public/index.html) containing HTML, CSS (in `<style>`), and vanilla JavaScript. It uses D3.js for force-directed graph visualization. Current colors are hardcoded in CSS and JavaScript constants.

See proposal.md - Why for motivation.

## Goals / Non-Goals
**Goals:**
- Add dark mode with complete color palette
- Toggle button in HUD with persistence
- System preference detection
- Smooth CSS transitions
- WCAG AA compliance

**Non-Goals:**
- Multiple theme variants (only light/dark)
- Theme customization UI
- Server-side theme handling
- Changes to graph layout or data logic

## Decisions

### 1. CSS Custom Properties (Variables) for Theming
**Decision:** Use CSS custom properties (`--color-bg`, `--color-text`, etc.) defined on `:root` with `[data-theme="dark"]` selector.

**Rationale:**
- Single source of truth for colors
- Easy to switch via `document.documentElement.dataset.theme = 'dark'`
- Native browser support, no build step needed
- Allows smooth transitions with `transition: background-color 0.2s, color 0.2s`

**Alternative considered:** JavaScript object swapping - rejected because it requires touching every element and doesn't transition smoothly.

### 2. Color Palette Design
**Light theme (existing, refined):**
- `--bg: #faf7f2` (warm cream)
- `--bg-elevated: #fdfbf7` (detail panel)
- `--text: #5c5a68` (primary)
- `--text-muted: #9a95a3` (secondary)
- `--border: #ddd7ca`
- `--button-bg: #f0ece2`
- `--button-hover: #e6e2d8`
- `--button-border: #ddd7ca`
- `--link-stroke: #ddd7ca`
- `--node-stroke: #faf7f2`

**Dark theme (new):**
- `--bg: #1a1a2e` (deep blue-black)
- `--bg-elevated: #22223a` (detail panel)
- `--text: #e8e8f0` (near-white)
- `--text-muted: #a0a0b8` (muted lavender)
- `--border: #3a3a5a`
- `--button-bg: #2a2a4a`
- `--button-hover: #333355`
- `--button-border: #4a4a6a`
- `--link-stroke: #3a3a5a`
- `--node-stroke: #1a1a2e`

**Node/Status colors (both themes):**
- Keep existing STATUS_COLOR and TODO_COLOR in JS but ensure they work on both backgrounds
- Dark mode adjustments: slightly brighter saturation for visibility on dark bg
- Running: `#8fd9b6` (pastel green) - works on both
- Idle: `#a8c5f0` (pastel blue) - works on both
- Error: `#f2a6a6` (pastel coral) - works on both
- Todo pending: `#cfcbc2` → dark: `#6a6a8a` (muted purple-grey)
- Todo completed: `#e6e2d8` → dark: `#4a4a5a` (dark grey)

### 3. Theme Toggle Implementation
**Location:** Add button in `#hud` after existing buttons
**Button HTML:** `<button id="themeToggle" title="Basculer le mode sombre">☀️/🌙</button>`
**Label logic:** Show ☀️ in dark mode (switch to light), 🌙 in light mode (switch to dark)
**Persistence:** `localStorage.setItem('theme', 'dark'|'light')`
**Initialization order:**
1. Check localStorage
2. If none, check `window.matchMedia('(prefers-color-scheme: dark)').matches`
3. Apply theme to `document.documentElement.dataset.theme`
4. Update button label

### 4. Transitions
**CSS:** Add to `:root` and affected elements:
```css
:root, .node rect.core, .link, #detail, #hud button, #detail .part {
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, fill 0.2s ease, stroke 0.2s ease;
}
```
**SVG elements:** D3 sets `fill`/`stroke` via `.attr()` - these need CSS transitions on the elements themselves.

### 5. JavaScript Integration
**New constants:**
```js
const THEME_COLORS = {
  light: { /* light palette */ },
  dark: { /* dark palette */ }
};
```
**Theme application function:**
```js
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  updateThemeButton(theme);
  // Force D3 to re-render with new colors
  render(lastRawNodes);
}
```
**Re-render on theme change:** Call `render(lastRawNodes)` to update node/link colors from updated CSS variables.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| D3 SVG attributes don't transition via CSS | Use CSS `fill`/`stroke` on classes instead of `.attr()` where possible, or accept instant SVG color change with CSS transition on container |
| Flash of wrong theme on load | Inline script in `<head>` to set theme before paint |
| Contrast issues on node labels | Test both themes; adjust text colors if needed |
| localStorage unavailable (private browsing) | Wrap in try/catch, fall back to system preference |

## Migration Plan
1. Add CSS custom properties to `:root` and `[data-theme="dark"]`
2. Replace hardcoded colors in CSS with variables
3. Add theme toggle button to HUD HTML
4. Add theme initialization and toggle logic in JS
5. Update STATUS_COLOR/TODO_COLOR for dark mode visibility
6. Add CSS transitions
7. Test both themes, verify contrast
8. Deploy (single file change)

## Open Questions
- None - all decisions resolved
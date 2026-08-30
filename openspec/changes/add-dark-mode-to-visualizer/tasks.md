## 1. CSS Variables & Theme Definitions

- [ ] 1.1 Define CSS custom properties for light theme on `:root` in `<style>` block and verify all existing colors reference variables
- [ ] 1.2 Add `[data-theme="dark"]` selector with complete dark theme color palette and verify no hardcoded colors remain in CSS
- [ ] 1.3 Add CSS transitions for smooth theme switching on `:root`, `.node rect.core`, `.link`, `#detail`, `#hud button`, `#detail .part` and verify transition works

## 2. Theme Toggle UI

- [ ] 2.1 Add theme toggle button to `#hud` in HTML with id `themeToggle` and appropriate title attribute and verify button appears in HUD
- [ ] 2.2 Style theme toggle button using CSS variables (consistent with `#vizToggle`/`#filesToggle`) and verify visual consistency in both themes

## 3. Theme Logic (JavaScript)

- [ ] 3.1 Add theme initialization function that checks localStorage → prefers-color-scheme → defaults to light, applies to `documentElement.dataset.theme`, and verify correct initial theme on first load and reload
- [ ] 3.2 Add `applyTheme(theme)` function that updates dataset, localStorage, button label/icon, and triggers re-render, and verify theme persists across reloads
- [ ] 3.3 Add click handler for `#themeToggle` that calls `applyTheme` with opposite theme and verify toggle switches themes correctly
- [ ] 3.4 Update `STATUS_COLOR` and `TODO_COLOR` constants with dark-mode-adjusted values for todo pending/completed, and verify node colors are distinguishable in both themes

## 4. Integration & Verification

- [ ] 4.1 Ensure `render()` re-reads colors from CSS variables (or updated JS constants) so nodes/links update on theme change, and verify graph colors update instantly on toggle
- [ ] 4.2 Test WCAG AA contrast ratios in both themes using browser dev tools or contrast checker, and verify all text/UI meets 4.5:1 (normal) / 3:1 (large) ratios
- [ ] 4.3 Test full user flow: first visit (system pref), toggle, reload (persistence), toggle again, and verify all scenarios work correctly
- [ ] 4.4 Test in private/incognito mode (localStorage unavailable) and verify graceful fallback to system preference
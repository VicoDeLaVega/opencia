## Purpose

Provides a dark color theme for the OpenCode Agent Visualizer, allowing users to switch between light and dark modes to reduce eye strain and match their preferred development environment.

## ADDED Requirements

### Requirement: Theme toggle control
The visualizer SHALL provide a toggle button in the HUD to switch between light and dark modes.

#### Scenario: User clicks theme toggle
- **WHEN** user clicks the theme toggle button in the HUD
- **THEN** the visualizer switches to the opposite theme (light ↔ dark)
- **THEN** the button label updates to reflect the current theme

#### Scenario: Toggle persists across sessions
- **WHEN** user switches theme and reloads the page
- **THEN** the previously selected theme is restored from localStorage

### Requirement: System preference detection
The visualizer SHALL automatically detect the user's system color scheme preference on first visit.

#### Scenario: First visit respects prefers-color-scheme
- **WHEN** user visits the visualizer for the first time (no localStorage preference)
- **THEN** the initial theme matches the system's `prefers-color-scheme` media query
- **THEN** if system preference is dark, dark mode is applied; otherwise light mode

### Requirement: Complete dark mode color palette
The visualizer SHALL define a complete dark mode color palette covering all visual elements.

#### Scenario: All elements render correctly in dark mode
- **WHEN** dark mode is active
- **THEN** background uses a dark neutral color (e.g., #1a1a2e)
- **THEN** primary text uses a light color (e.g., #e8e8f0)
- **THEN** secondary/muted text uses a medium-light color (e.g., #a0a0b8)
- **THEN** node colors (running, idle, error) remain distinguishable on dark background
- **THEN** todo status colors remain distinguishable on dark background
- **THEN** link strokes use a subtle dark-border color (e.g., #3a3a5a)
- **THEN** detail panel uses a dark background with subtle border
- **THEN** buttons use dark backgrounds with light text and subtle borders
- **THEN** hover states remain visible and distinct
- **THEN** connection status dot colors remain visible

### Requirement: Smooth theme transition
The visualizer SHALL transition smoothly between themes without jarring flashes.

#### Scenario: Theme switch animates colors
- **WHEN** user toggles theme
- **THEN** color changes transition over ~200ms
- **THEN** no white flash occurs during transition

### Requirement: Accessibility compliance
The visualizer SHALL maintain WCAG AA contrast ratios in both themes.

#### Scenario: Contrast ratios meet AA standard
- **WHEN** either theme is active
- **THEN** text/background contrast ratio ≥ 4.5:1 for normal text
- **THEN** text/background contrast ratio ≥ 3:1 for large text
- **THEN** UI element borders/controls have ≥ 3:1 contrast
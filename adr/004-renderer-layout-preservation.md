# ADR 004: Layout-Preserving DOM Patching

**Status**: Accepted
**Date**: 2026-07-12

## Context

The app uses a persistent layout (sidebar + header) with dynamic view containers. Naive `innerHTML` replacement on `#app` destroys:
- Sidebar active state
- Header user avatar/name
- Focus/selection in inputs
- Event listeners on layout elements
- CSS transitions

Previous approach: string detection `html.includes("sidebar")` — brittle, breaks on minification, whitespace changes.

## Decision

**Two-tier rendering**:

1. **Layout Pages** (dashboard, employees, profile, attendance, timeoff, payroll):
   - Wrap root in `<div data-layout="main">`
   - Renderer parses new HTML, extracts `.sidebar`, `.top-header`, `.view-container`
   - Updates only changed parts: active link, header title/avatar, view container content
   - Preserves DOM nodes for layout chrome

2. **Auth Pages** (login, signup):
   - Full `innerHTML` replacement (no layout chrome)

**Focus Restoration**:
- Before swap: compute **unique CSS selector** for `document.activeElement` within `.view-container`
- After swap: `querySelector(selector)?.focus()`, restore `selectionStart/End`

**Error Boundary**:
- `try/catch` around patch logic
- On error: render fallback UI with retry button

## Consequences

**Positive**:
- Sidebar/header never flicker
- Form inputs retain focus/cursor during nav
- CSS transitions on `.view-container` work (`.animate-fade`)
- Layout chrome event listeners persist

**Negative**:
- Selector generation imperfect for dynamic lists (mitigation: max depth 5, prefer `#id` > `.class:nth-of-type()`)
- `templateParser.innerHTML` parsing sanitizes scripts (intentional)
- Auth pages lose scroll position (acceptable)

## Implementation Notes

```javascript
// Detection
const isLayoutPage = rootContent?.matches?.("[data-layout]") ||
                     (rootContent?.querySelector?.(".sidebar") && 
                      rootContent?.querySelector?.(".main-wrapper"));

// Selector generation
function getUniqueSelector(el, root) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  // ... class + nth-of-type fallback
}
```

## Future

- Migrate to **View Transitions API** (`document.startViewTransition()`) for cross-document animations
- Consider **Morphdom** or **Idiomorph** for finer-grained diffing

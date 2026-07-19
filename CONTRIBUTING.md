# Contributing

## Code Review Process

1. Every PR requires at least one approval from a maintainer.
2. All tests must pass: `npm test && npm run test:e2e`.
3. Lint and format checks must pass: `npm run lint && npm run format:check`.
4. PRs should be scoped to a single concern. Split large changes.

## Commit Guidelines

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.
- Each commit should compile and pass tests independently.
- Describe *why* a change was made, not just *what* changed.

## Testing

- Write tests alongside new features. See `tests/` for patterns.
- Use Vitest for unit/integration tests, Playwright for E2E.
- Run `npm run test:coverage` before opening a PR.

## Architecture

- `backend/` — Node server code (engine, routes, store)
- `src/` — Browser client code (views, renderer, store, sync engine)
- Keep modules focused. If a file exceeds 400 lines, consider splitting.
- Prefer `app-context.js` over `window.*` for shared state.

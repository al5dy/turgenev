# Playwright CLI workspace

This directory documents browser-test conventions for coding agents. Runtime traces, screenshots and authentication state must go under ignored paths and must never be committed.

Recommended agent workflow:

1. Use a disposable WordPress instance with Turgenev activated.
2. Read credentials from environment variables only.
3. Never put `TURGENEV_API_KEY` into screenshots, traces, test source or storage-state files.
4. Prefer semantic locators (`getByRole`, `getByLabel`) over brittle CSS selectors.
5. Capture trace/screenshot only on failure.
6. Run `npm run test:e2e` for deterministic UI checks.

See `tests/e2e/` and `playwright.config.mjs`.

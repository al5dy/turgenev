# Codex working notes

Read `AGENTS.md` before editing. For non-trivial changes, inspect `docs/architecture.md`, `API.md` and the affected tests first.

The primary engineering goal is not maximum abstraction. It is predictable production behavior at the WordPress/provider boundary with code that is easy to review, test and maintain.

When changing API behavior:

- update `API.md`;
- add/adjust deterministic provider-response fixtures in `tests/php/run.php`;
- keep secrets entirely server-side;
- ensure failure paths restore the browser UI from its busy state;
- ensure provider-controlled strings are rendered as text, not HTML.

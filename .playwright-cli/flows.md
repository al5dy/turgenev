# Manual browser flows

## Settings

- Open Settings → Turgenev.
- Confirm the saved key is represented only by a mask.
- Save with an empty password field and confirm the existing key remains.
- Enter an invalid replacement key and confirm the old key remains.
- Use the explicit remove checkbox to clear the key.

## Gutenberg

- Confirm Turgenev sidebar registration.
- Analyze non-empty content and verify busy state always clears.
- Verify an API error appears as text and does not break the editor.
- Verify no request from the browser goes directly to `turgenev.ashmanov.com`.

## Classic Editor

- Test Visual mode and Text mode.
- Test with TinyMCE unavailable: textarea fallback must work.
- Verify repeated clicks are disabled while a request is active.

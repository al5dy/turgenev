# Security policy

## Reporting

Please use GitHub private vulnerability reporting for the repository when available. Do not open a public issue containing an API key, authentication material, private WordPress content or an exploitable proof of concept against a live site.

## Security model

- The Turgenev provider API key is server-side only.
- Browser API actions require an authenticated WordPress session and a valid nonce.
- `risk`/`highlights` additionally require a scalar positive `post_id` for an existing post and `current_user_can( 'edit_post', $post_id )`; a generic `edit_posts` grant is never accepted on its own.
- `balance` requires `edit_post` on the post when a post ID is present, or `manage_options` when it is absent (the Settings screen).
- Server-side rate limiting bounds both per-post/per-user bursts and total requests per user across all posts, before any outbound provider request.
- Provider response text is rendered as text, not trusted HTML.
- Remote HTTP/JSON failures do not become successful analyses.
- Real credentials must never be committed to source control or fixtures.

## Supported versions

Security fixes target the current 2.x release line. Version 1.x should be upgraded because it exposes the provider key to browser JavaScript by design.

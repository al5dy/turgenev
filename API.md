# Turgenev API integration

This document describes the API contract used by the WordPress plugin and records the legacy operations that are required for compatibility.

## Endpoint

`https://turgenev.ashmanov.com/`

The plugin uses HTTPS `POST` requests with form fields and expects JSON responses. The service also supports URL-based checks; historical API documentation showed `GET` examples for that use case.

## Authentication

Every API request contains:

| Parameter | Type | Description |
| --- | --- | --- |
| `key` | string | API key generated in the Turgenev account. |
| `api` | string | Operation to execute. |

The WordPress plugin stores the key in the `turgenev` option and sends it only from PHP through the WordPress HTTP API. It is never localized into JavaScript.

## Analysis operations

Known analysis values for `api`:

- `risk` — overall risk; returns aggregate risk and per-section details.
- `frequency` — repetition/frequency analysis.
- `style` — stylistic analysis.
- `keywords` — keyword/query analysis.
- `formality` — formality/wateriness analysis.
- `readability` — readability analysis.

### Content parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `text` | string | one of `text`/`url` | Text to analyze. When `text` is supplied, URL analysis is not used. |
| `url` | URL | one of `text`/`url` | Public page URL to analyze. |
| `tbclass` | string | no | CSS selector used to isolate content during URL analysis, for example `.content`. Historical text contained a `tblclass` typo; request examples use `tbclass`. |
| `more` | `0`/`1` | no | With `1`, requests extended per-criterion data. |

The WordPress editor integration currently uses `api=risk`, `more=1` and `text=<editor content>`.

### Example request body

```text
api=risk
key=<secret>
more=1
text=Example text
```

### Example risk response

```json
{
  "link": "mb3e956f85afb36ff1848c4d65edaca85",
  "risk": "22",
  "level": "критический",
  "details": [
    { "link": "db3e956f85afb36ff1848c4d65edaca85", "block": "frequency", "sum": "3" },
    { "link": "sb3e956f85afb36ff1848c4d65edaca85", "block": "style", "sum": "8" }
  ]
}
```

With `more=1`, detail entries may additionally contain `params`, for example:

```json
{
  "link": "sb3e956f85afb36ff1848c4d65edaca85",
  "style": "6",
  "params": [
    { "value": "0.18", "score": "3", "name": "Плотность стилистических проблем" }
  ]
}
```

## Balance operation

`api=balance` is a working legacy operation used by Turgenev plugin versions before 2.0.0 even though it was missing from the supplied API documentation.

Request:

```text
api=balance
key=<secret>
```

Expected response shape:

```json
{
  "balance": "123.45"
}
```

Turgenev 2.0.0 uses this operation to:

1. validate a newly entered key before storing it;
2. display the current account balance;
3. avoid performing a paid `risk` analysis just to validate settings.

If the provider changes or removes this legacy operation, key validation and the balance display will fail safely and the previously saved key will remain unchanged.

## Errors

Provider-level failures can be returned as JSON even with an HTTP 2xx response:

```json
{
  "error": "Некорректный ключ к API"
}
```

The integration treats all of the following as failures:

- WordPress HTTP transport error;
- non-2xx HTTP status;
- empty response;
- malformed JSON;
- non-object/non-array JSON;
- top-level `error` field;
- missing/non-numeric `balance` for `api=balance`.

## Report links

Responses can contain a `link` token. The human-readable report URL is constructed as:

```text
https://turgenev.ashmanov.com/?t=<link-token>
```

The plugin URL-encodes the token and never treats provider-controlled text as HTML.

## WordPress AJAX contract

The browser does **not** call the provider directly. It calls WordPress, which enforces a nonce plus an object-level capability check before ever contacting Turgenev:

```text
POST /wp-admin/admin-ajax.php
action=turgenev_api
nonce=<wordpress-nonce>
operation=balance|risk|highlights|details
post_id=<post ID>       # required for risk/highlights/details; optional for balance
text=<content>          # risk/highlights: the full current document text
report_token=<token>    # highlights/details: the report reference from a prior risk response
section=<section>       # details only: overall|frequency|style|keywords|formality|readability
```

`risk`, `highlights` and `details` require `current_user_can( 'edit_post', $post_id )` for an existing post — a generic `edit_posts` capability is never accepted on its own, and all three are rejected before any outbound request without a valid, positive, existing `post_id`. `balance` requires `edit_post` on the post when `post_id` is present, or `manage_options` when it is absent (the Settings screen). All four operations are also subject to server-side rate limiting (`Support\RateLimiter`): a per-user/post burst limit and a per-user limit across every post, either of which returns HTTP 429 before any request reaches Turgenev.

`details` fetches the provider's read-only report page for one section — the same page `highlights` reads, plus a `coverdict` field selecting which tab renders — and returns a validated `{params, ...}` structure (word/phrase repetition tables for `frequency`, a category legend for `style`/`formality`/`readability`, and a coverage breakdown plus legend for `keywords`; `overall` returns only the combined characteristic table). It is not a documented provider `api` operation like the ones above; it reuses the same anonymous, token-only report form `highlights` already relies on.

The PHP controller adds the saved provider key server-side.

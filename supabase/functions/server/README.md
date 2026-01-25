# Supabase Edge Function — Server

## Overview

- All generation, analysis, notifications, subscription, and usage endpoints are served via this Edge Function.
- Client routing uses `getFunctionUrl()` to call `server/make-server-00a119be/*` under Supabase Functions.
- Upgrades rely strictly on Stripe.

## Access Control & Limits

- Auth required for all endpoints: missing or invalid token returns `401`.
- Free users are allowed to create 1 strategy (lifetime); the server enforces `403` after that.
- Pro users are allowed up to 50 strategies.
- Elite users have unlimited strategy creation.
- Free users have no access to chat, convert, or backtesting preview metrics.

## Validation & Error Handling

- Payload validation occurs before any writes (description minimum length, platform allowed, name length).
- Errors return sanitized JSON via `respondError()` including `correlationId` and optional `redirect`, `limit`, and `used` fields.
- Structured logs are persisted to KV with correlation IDs; slow requests are logged when exceeding `SLOW_REQUEST_MS`.

## Health & Version

- `GET /health` returns `{ ok: true, uptimeMs }` for monitoring.
- `GET /version` returns `{ version, deployedAt, model }` for deploy visibility.

## Environment Variables

See `.env.example` for a complete list. Required for production:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRODUCT_PRO`, `STRIPE_PRODUCT_ELITE`

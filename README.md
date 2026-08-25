# TeleCore AI — Autonomous Telegram Channel Manager

> **Editorial Philosophy:** *"Technology that matters, explained and made useful."*  
> **Channel Niche:** AI + Technology + Automation  
> **Target Runtime & Cost:** Cloudflare Workers (Free Tier, $0 / month)

TeleCore AI is an autonomous, event-driven AI Telegram channel manager built on a Cloudflare Workers-compatible TypeScript foundation. It provides a hardened core architecture designed to scale toward full editorial autonomy while enforcing safety, secret isolation, and reliability.

---

## 🛡 Safety Model & Test Mode

TeleCore AI enforces a strict, fail-closed safety model to guarantee that unreviewed AI content is never autonomously published during development or staging:

- **`TELEGRAM_TEST_MODE=true` (Default)**:
  - **Autonomous publishing is strictly BLOCKED**.
  - `PublisherAgent` execution fails closed and refuses to post.
  - Automated orchestrator pipelines will never send messages to Telegram.
  - **Owner-initiated test publication** via `POST /api/admin/telegram/test-publish` is **allowed**, provided a valid `ADMIN_SECRET` is provided in the `Authorization: Bearer <ADMIN_SECRET>` header.

- **`TELEGRAM_TEST_MODE=false` (Production Live Mode)**:
  - Autonomous publishing is permitted only when `ENVIRONMENT=production`, all credentials are verified, and test mode is explicitly disabled.

---

## 🏗 Core Architecture

The system uses a single unified Cloudflare Worker entry point and event orchestrator with modular subsystems:

```
src/
├── index.ts                 # Cloudflare Worker fetch handler & REST router
├── orchestrator/
│   └── orchestrator.ts      # Event bus & lifecycle coordinator
├── agents/
│   ├── researcher.ts        # Agent: Research AI & tech developments (Phase 1 contract)
│   ├── strategist.ts        # Agent: Editorial angle & format selection (Phase 1 contract)
│   ├── writer.ts            # Agent: Telegram post draft generation (Phase 1 contract)
│   ├── factChecker.ts       # Agent: Factual accuracy & citation auditing (Phase 1 contract)
│   ├── publisher.ts         # Agent: Telegram channel publication adapter (Guarded by Test Mode)
│   ├── analyst.ts           # Agent: Performance metrics & engagement (Phase 1 contract)
│   └── repairAgent.ts       # Agent: Incident diagnosis & self-repair preparation
├── telegram/
│   ├── client.ts            # Telegram Bot API client & comprehensive channel verification
│   └── webhook.ts           # Webhook verification (timing-safe) & update parser
├── ai/
│   └── gemini.ts            # Google Gemini AI service abstraction (@google/genai)
├── health/
│   ├── health.ts            # Low-cost health reporting service (GET /health)
│   └── incidents.ts         # Incident recording & tracking system
├── storage/
│   └── storage.ts           # Pluggable storage abstraction (In-Memory & Cloudflare KV)
├── config/
│   └── config.ts            # Typed configuration & admin authorization enforcement
├── utils/
│   ├── logger.ts            # Structured JSON logging with automated secret redaction
│   ├── security.ts          # Timing-safe string comparison & authorization helpers
│   └── errors.ts            # Typed error classes & safe error formatting
└── types/
    └── index.ts             # Global TypeScript types, events, and interfaces

tests/
├── admin.test.ts            # Admin endpoints, auth checks & parameter validation
├── config.test.ts           # Config validation & public/secret isolation tests
├── health.test.ts           # Low-cost health check & dependency degradation tests
├── incidents.test.ts        # Incident recording & diagnostic tests
├── orchestrator.test.ts     # Event bus & agent pipeline tests
├── safety_testmode.test.ts  # Test mode safety guards & owner test publication tests
├── security.test.ts         # Zero-leak secret & unauthorized access tests
├── telegram.test.ts         # Telegram API client mock tests
└── webhook.test.ts          # Webhook signature validation & parser tests
```

---

## 🔒 Security & Zero-Leak Guarantees

1. **No Hardcoded Credentials**: All tokens (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `ADMIN_SECRET`) are read at runtime via environment bindings.
2. **Aggressive Secret Masking**: The structured logger filters out bot tokens, API keys, passwords, and Bearer tokens before writing output.
3. **Admin Authorization**: All `/api/admin/*` diagnostic and management endpoints enforce `ADMIN_SECRET` authorization via `requireAdminAuth`.
4. **Safe Error Responses**: In HTTP responses, internal stack traces and secrets are masked by `formatSafeErrorResponse`.

---

## ⚙️ Environment Configuration

| Variable | Type | Default | Required in Prod | Description |
|---|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Secret | — | Yes | Telegram Bot API token from [@BotFather](https://t.me/botfather) |
| `TELEGRAM_WEBHOOK_SECRET` | Secret | — | Yes | Secret token for `X-Telegram-Bot-Api-Secret-Token` verification |
| `GEMINI_API_KEY` | Secret | — | Yes | Google Gemini AI API key |
| `TELEGRAM_CHANNEL_ID` | Non-Secret | — | Yes | Channel username (e.g. `@my_channel`) or numeric channel ID |
| `ADMIN_SECRET` | Secret | — | Yes | Bearer secret for protected management endpoints |
| `TELEGRAM_TEST_MODE` | Non-Secret | `"true"` | No | `"true"` blocks autonomous publishing; allows owner test-publish |
| `ENVIRONMENT` | Non-Secret | `"development"` | No | Runtime environment (`development`, `staging`, `production`, `test`) |
| `LOG_LEVEL` | Non-Secret | `"info"` | No | Logging level (`debug`, `info`, `warn`, `error`) |
| `APP_URL` | Non-Secret | — | No | Public HTTPS base URL for webhook routing |

---

## 📡 REST API Reference

### Public Endpoints
- **`GET /health`**: Lightweight structured health report (`healthy`, `degraded`, `unhealthy`), uptime, and dependency status without expensive AI calls.
- **`GET /api/status`**: System metadata, public configuration flags, registered agents, and event bus status.
- **`POST /webhooks/telegram`**: Telegram Bot API webhook receiver. Enforces constant-time `X-Telegram-Bot-Api-Secret-Token` verification.

### Protected Admin Endpoints (Require `Authorization: Bearer <ADMIN_SECRET>`)
- **`GET/POST /api/admin/telegram/verify`**: Comprehensive channel diagnostic (bot identity, channel reachability, admin member permissions, post permissions).
- **`POST /api/admin/telegram/test-publish`**: Owner-initiated publication of a test message to the configured channel. Allowed even when `TELEGRAM_TEST_MODE=true`.
- **`GET /api/admin/telegram/webhook-info`**: Fetches webhook status and pending update count from Telegram API.
- **`POST /api/admin/telegram/setup-webhook`**: Registers a public HTTPS webhook URL with Telegram.
- **`POST /api/admin/telegram/delete-webhook`**: Drops Telegram webhook registration and clears pending updates.
- **`GET /api/admin/incidents`**: Lists recorded system incidents and health alerts.
- **`POST /api/test/event`**: Dispatches a test event through the internal Orchestrator bus.

---

## 🖥 Development Dashboard

A single-page management dashboard is built-in for interactive monitoring and administration during local development:
- **System Telemetry**: Real-time health status, uptime, and zero-leak security indicator.
- **Test Mode Safety Badge**: Visual indicator confirming whether autonomous publishing is blocked.
- **Telegram Channel Verification**: One-click diagnostic for bot identity and channel admin permissions.
- **Controlled Test Publisher**: Authenticated message composer to publish test posts with Markdown/HTML formatting.
- **Webhook Management**: Register, inspect, or delete webhook endpoints.
- **Agent Deck & Pipeline Inspector**: Inspect the 7 foundation agents and simulate orchestrator events.

---

## 🧪 Testing & Verification

Run the comprehensive test suite (all tests mock Telegram API; no real messages sent during tests):
```bash
npm run test
```

Typecheck the codebase:
```bash
npm run typecheck
```

Build production bundle:
```bash
npm run build
```

Start the local development server:
```bash
npm run dev
```

---

## 🚀 Deployment Architecture & Cloudflare Pipeline

### Deployment Pipeline
```
┌─────────────────────────┐
│    GitHub Repository    │  (Version Control - Zero Secrets)
└───────────┬─────────────┘
            │ Git Push / Release
            ▼
┌─────────────────────────┐
│ Cloudflare Worker Build │  (Wrangler / Cloudflare Workers Builds CI/CD)
└───────────┬─────────────┘
            │ Deploys to Edge
            ▼
┌─────────────────────────┐
│    Cloudflare Worker    │  (TeleCore AI Runtime @ Edge)
│       telecore-ai       │  - Reads secrets from Cloudflare runtime bindings
└───────────▲─────────────┘
            │
            │ Webhook / API Calls
            ▼
┌─────────────────────────┐
│    Telegram Webhook     │  (Telegram Bot API & Channel Target)
└─────────────────────────┘
```

### Production Secrets Setup (Zero Secrets in Git)

> **CRITICAL SECURITY RULE:** Never commit secrets to the Git repository or hardcode them in any source file. All production secrets must be configured securely in Cloudflare (via Cloudflare Dashboard or Wrangler CLI):

```bash
# 1. Authenticate with Cloudflare
npx wrangler login

# 2. Configure Production Secrets in Cloudflare
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_SECRET

# 3. Verify Non-Secret Vars in wrangler.jsonc
# - TELEGRAM_CHANNEL_ID (e.g. "@your_channel")
# - TELEGRAM_TEST_MODE (defaults to "true" for safety)
# - ENVIRONMENT ("production")
# - LOG_LEVEL ("info")

# 4. Deploy to Cloudflare Workers
npm run deploy
```

---

## 🗺 Implementation Status & Roadmap

### ✅ Current Foundation Phase:
- Cloudflare Workers TypeScript entrypoint and REST API.
- Telegram Bot API client abstraction with diagnostic verification (`verifyChannelAccess`).
- Owner-initiated test publication (`/api/admin/telegram/test-publish`).
- Timing-safe Telegram webhook receiver (`/webhooks/telegram`).
- Webhook management endpoints (setup, info, delete).
- `TELEGRAM_TEST_MODE` safety model (fail-closed guard for autonomous publishing).
- Admin authorization enforcement (`ADMIN_SECRET`) across all sensitive routes.
- Low-cost `/health` check without expensive AI calls.
- In-memory and Cloudflare KV storage abstraction.
- Incident tracking and diagnostic log manager.
- Zero-leak structured logging with automatic secret redaction.
- Local development dashboard with full Telegram controls.
- 100% passing test coverage across all subsystems.

### ⏳ Future Phases:
1. **Autonomous Research Phase**: Scheduled background crawling, RSS feed ingestion, and Gemini-powered topic curation.
2. **Autonomous Content Generation Phase**: Multi-stage drafting, tone refinement, and fact-checking workflows.
3. **Autonomous Publishing & Scheduling Phase**: Intelligent editorial cadence, queue management, and automated live publication.
4. **Autonomous Channel Analytics Phase**: Message engagement tracking, reaction monitoring, and feedback-driven strategy optimization.
5. **Self-Healing & Auto-Repair Phase**: Automated error signature detection, circuit breakers, and bounded self-healing routines.

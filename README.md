# AI Hub

AI Hub is a production-oriented, multi-tenant platform foundation for building, configuring, sharing, and running AI agents in teams.

The current implementation covers the Phase 1 production foundation: authentication, workspace/IAM boundaries, database schema and migrations, encrypted secrets utilities, cache/storage adapters, Docker deployment targets, health checks, CI, and tests.

## Features

- **Next.js 16 App Router** with React 19 and TypeScript strict mode
- **Better Auth** email/password authentication with Next.js route handlers
- **PostgreSQL + Drizzle ORM** schema and migrations
- **Workspace-first multi-tenancy** with organization, workspace, member, role, and role-binding models
- **GCP-inspired IAM** permission checks with wildcard/manage semantics
- **Audit logging** primitives for security-sensitive actions
- **AES-GCM encryption utilities** for secrets and sensitive message content
- **DragonflyDB / Redis-compatible cache adapter**
- **S3-compatible object storage adapter**
- **Docker targets** for app runner, worker, and migrator
- **Development compose stack** with Postgres, DragonflyDB, and RustFS object storage
- **Production compose stack** suitable for Coolify-style deployments
- **CI workflow** for lint, typecheck, tests, and build

## Tech Stack

- Next.js `16.2.6`
- React `19.2.4`
- TypeScript
- Tailwind CSS v4
- Better Auth
- Drizzle ORM + PostgreSQL + pgvector
- DragonflyDB / Redis
- S3-compatible object storage
- Vitest
- Docker / Docker Compose

## Requirements

- Node.js `>=20.9.0`
- npm
- Docker and Docker Compose for local infrastructure
- PostgreSQL with the `vector` extension when not using the provided compose stack

## Getting Started

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure environment

Copy the example file and adjust values as needed:

```bash
cp .env.example .env.local
```

For local development, the default `.env.example` values are designed to work
with `docker-compose.dev.yml`.

### 3. Build and start local infrastructure

Build the batteries-included OpenSandbox code image once, then start the local
services:

```bash
npm run sandbox:build
docker compose -f docker-compose.dev.yml up -d
```

This starts:

- Postgres with pgvector
- DragonflyDB
- RustFS S3-compatible object storage
- OpenSandbox server for the `run_code_sandbox` tool

The default sandbox image is `ai-hub/code-interpreter:local`. It keeps internet
access enabled and preinstalls common Python/Node libraries for dataframes,
Excel/PowerPoint/PDF handling, charts, file conversion, scraping, OCR, and
audio/video tasks.

### 4. Run migrations

```bash
npm run db:migrate
```

Useful Drizzle commands:

```bash
npm run db:generate
npm run db:push
npm run db:studio
```

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

```bash
npm run dev        # Start Next.js dev server
npm run build      # Build production app
npm run start      # Start production Next.js server
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript checks
npm run test       # Run Vitest in watch/dev mode
npm run test:ci    # Run Vitest once
npm run worker     # Start background worker process
npm run sandbox:build  # Build the OpenSandbox code image
```

## Environment Variables

See `.env.example` for the full list.

Important production requirements:

- Set `APP_ENV=production` in deployed environments. `NODE_ENV` is controlled by Next.js.
- `BETTER_AUTH_SECRET` must be at least 32 characters and not a placeholder.
- `APP_ENCRYPTION_KEY` must be a 64-character hex string and not all zeroes.
- `DRAGONFLY_PASSWORD` and object storage secrets must be strong non-placeholder values.
- Bundled RustFS object storage uses `OBJECT_STORAGE_ACCESS_KEY_ID` and `OBJECT_STORAGE_SECRET_ACCESS_KEY`; set strong non-placeholder values in production.

The app validates environment variables at runtime and rejects insecure production configuration. `next build` may use safe local placeholder values so CI and image builds remain reproducible.

## Project Structure

```txt
src/
  app/                    Next.js pages, layouts, and route handlers
  lib/                    Shared utilities: auth, env, crypto, logger
  modules/                Feature use cases
  server/
    domain/               Entities and domain services
    infrastructure/       DB, cache, storage, worker adapters

test/unit/                Unit tests
scripts/                  Operational scripts
docs/                     Product and implementation plans
.agents/                  Agent skills and project guidance
```

## Architecture

AI Hub follows a modular monolith with clean boundaries:

```txt
UI/API -> Application/Use Cases -> Domain
                       |
                       v
              Infrastructure adapters
```

Route handlers should authenticate, validate input, call use cases/domain services, and format responses. Business rules belong outside route handlers.

## API Routes

Current foundation routes include:

- `GET /api/health` — app and database health check
- `GET /api/workspaces` — list current user's workspaces
- `POST /api/workspaces` — create organization/workspace and assign owner role
- `GET /api/workspace/agents?workspaceId=...` — list agents with IAM check
- `POST /api/workspace/agents` — create agent with IAM check
- `POST /api/workspace/[agentId]/chat` — stream a provider-backed chat response and persist encrypted messages
- `GET/POST /api/workspace/providers` — manage encrypted provider registry records
- `GET/POST /api/workspace/knowledge-bases` — manage workspace RAG sources
- `GET/POST /api/workspace/mcp-servers` — register MCP servers and discovered tools
- `GET /api/workspace/usage` and `GET /api/workspace/audit` — operational visibility
- `/api/auth/[...all]` — Better Auth handler

## Testing and Verification

Run the full local verification set:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

## Docker

Build/run production app target:

```bash
docker build --target runner -t ai-hub:runner .
```

Other targets:

- `runner` — Next.js standalone app
- `worker` — background worker process
- `migrator` — database migrations
- `rustfs` / `rustfs-init` — single-node S3-compatible object storage used by Compose
- `dev` — optional containerized Next.js development server

Production compose mirrors the existing Coolify layout used by the sibling
projects, but this repository deploys as one web app: Postgres + DragonflyDB +
RustFS + SearXNG + one-shot `rustfs-init` + one-shot `migrate`, plus the
standalone app and worker. The default production browser origin is
`https://maiah.shiftify.eco`.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

For Coolify/GitHub Actions, `.coolify/stack.compose.yml` is the deployment-safe
image-based stack and `.github/workflows/coolify.yml` builds/pushes every app,
worker, migrator, SearXNG, and sandbox runner image on each deployment before
patching the `maiah` Coolify service. PRs targeting `main` create isolated
preview environments named `pr-<number>` with public hosts like
`https://maiah-pr-<number>.shiftify.eco`; those previews are protected by
Traefik basic auth and deleted when the PR is closed. Pushes to `main` still
deploy the persistent production environment at `https://maiah.shiftify.eco`.
RustFS runs from the official `rustfs/rustfs` image. OpenSandbox runtime images
are no longer pre-pulled as a deployment-blocking step; the first sandbox run on
a fresh host may be slower, but app deployment is not held by those large image
pulls.

Required Coolify secrets/variables include `COOLIFY_DEPLOY_ENABLED=true`,
`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY`,
`DRAGONFLY_PASSWORD`, `OBJECT_STORAGE_ACCESS_KEY_ID`,
`OBJECT_STORAGE_SECRET_ACCESS_KEY`, and `TRAEFIK_BASIC_AUTH_USERS` for PR
previews. For the bundled RustFS service, use strong non-placeholder S3
credentials. If MAIAH moves to a new Coolify project, set the repository
variable `COOLIFY_PROJECT_UUID` to that project UUID. Production deployments use
Coolify-managed named volumes. To migrate data from an older Coolify service,
copy the old Docker volumes into the new service volumes while MAIAH is stopped,
then deploy again. Override `AI_HUB_PROD_APP_PORT` if the host port must differ
from the safe default `3001` for the local production compose file.

## Phase Roadmap

See [`docs/production-ai-platform-plan.md`](docs/production-ai-platform-plan.md)
for the full plan.

High-level phases:

1. Production foundation
2. Provider layer
3. Agents and chat
4. Tools
5. MCP integration
6. Knowledge / RAG
7. Marketplace
8. Production hardening

## Repository Notes

- `.agents/` is intentionally committed for agent/project guidance.
- `.pi-lens/`, `node_modules/`, `.next/`, `.env.local`, and build artifacts are
  ignored.
- `.env.example` is intentionally tracked.

## License

Private project. All rights reserved.

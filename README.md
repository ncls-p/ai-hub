# Maiah

A multi-tenant platform for building, managing, and running AI agents in teams.

Maiah provides a full stack — from authentication and workspace isolation to agent execution, tool calling, knowledge bases, and marketplace publishing — all behind a single Next.js application.

---

## At a glance

| Layer          | Stack                                                        |
| -------------- | ------------------------------------------------------------ |
| **Framework**  | Next.js 16 (App Router) + React 19 + TypeScript              |
| **Auth & IAM** | Better Auth + custom workspace roles and permission bindings |
| **Database**   | PostgreSQL + pgvector + Drizzle ORM                          |
| **Cache**      | DragonflyDB / Redis                                          |
| **Storage**    | S3-compatible (RustFS)                                       |
| **AI**         | AI SDK 7 — `streamText`, tool calling, OPA policy gates      |
| **Sandbox**    | Custom sandbox runner with governed web egress               |
| **MCP**        | Model Context Protocol client and server registry            |
| **Search**     | SearXNG-backed web search tool                               |
| **Client**     | Responsive installable PWA with native App Router manifest   |

---

## Project structure

```
src/
  app/                        Next.js routes, layouts, and API handlers
    [locale]/
      auth/                   Login, signup, password reset
      (workspace)/            Multi-tenant workspace shell
        agents/               Agent creator, list, chat interface
        chat/                 Conversational UI
        providers/            AI provider registry (encrypted keys)
        knowledge/            RAG knowledge bases
        mcp/                  MCP server registration and tool discovery
        tools/                Custom tool definitions
        marketplace/          Agent publishing and GitHub sync
        settings/             Workspace configuration, members, roles
        admin/                Platform-level admin
        audit/                Security audit logs
        usage/                Token usage and quotas
        scheduled-tasks/      Recurring agent jobs
        code-workspace/       Remote code execution environments
        custom-tools/         User-defined tools
        skills/               Agent skill marketplace
        api-keys/             API key management
        setup/                First-run workspace onboarding
  lib/                        Shared utilities (env, crypto, logger)
  modules/                    Feature-layer use cases
  server/
    domain/
      entities/               Domain models (IAM, etc.)
      services/               Audit logging, authorization checks
    infrastructure/
      db/                     Drizzle schema, migrations, queries
      cache/                  Redis/DragonflyDB adapter
      storage/                S3 adapter
      providers/              AI provider wiring
      worker/                 Background job processor
      ai-sdk/                 AI SDK integration helpers

test/                         Unit and E2E tests (Vitest + Playwright)
scripts/                      Operational scripts (migration, sandbox build)
docs/                         Architecture and product plans
.agents/                      Agent skills and project guidance
```

---

## Getting started

### Prerequisites

- **Node.js** 22.22.2+ (22.x), 24.15.0+ (24.x), or 26+
- **npm** (project manager: `npm@11.18.0`)
- **Docker** + **Docker Compose** (for Postgres, DragonflyDB, RustFS, SearXNG, sandbox runner)

### Quick start

```bash
# 1. Install dependencies
npm ci

# 2. Configure environment
cp .env.example .env.local

# 3. Build the sandbox image (one-time)
npm run sandbox:build

# 4. Start local infrastructure
docker compose -f docker-compose.dev.yml up -d

# 5. Run migrations
npm run db:migrate

# 6. Start the dev server
npm run dev
```

The app is available at [http://localhost:3000](http://localhost:3000).

The dev compose stack starts:

| Service               | Port                                              | Purpose                      |
| --------------------- | ------------------------------------------------- | ---------------------------- |
| PostgreSQL + pgvector | 15432                                             | Primary database             |
| DragonflyDB           | 6379                                              | Cache layer                  |
| RustFS                | 13900                                             | S3-compatible object storage |
| Sandbox runner        | Unix socket (`.data/sandbox-runner/sandbox.sock`) | Isolated code execution      |
| SearXNG               | 18088                                             | Web search                   |

### Useful commands

```bash
npm run dev              # Dev server (auto-runs migrations first)
npm run build            # Production build
npm run start            # Production server
npm run worker           # Background job processor
npm run lint             # ESLint
npm run typecheck        # TypeScript check
npm run test             # Vitest (watch mode)
npm run test:ci          # Vitest (single run)
npm run test:e2e         # Playwright E2E tests
npm run test:coverage    # Vitest with coverage
npm run db:generate      # Generate Drizzle migration files
npm run db:push          # Push schema changes directly (dev only)
npm run db:studio        # Drizzle GUI
npm run openapi:check    # Verify every API route is present in OpenAPI
npm run sandbox:build    # Build the sandbox runner Docker image
npm run analyze          # Next.js bundle analyzer
npm run format           # Prettier
```

## Environment variables

See `.env.example` for the full reference. Key categories:

### Required for production

| Variable             | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `APP_ENV`            | Set to `production` in deployed environments         |
| `BETTER_AUTH_SECRET` | ≥ 32-char random string (`openssl rand -hex 32`)     |
| `APP_ENCRYPTION_KEY` | 64-char hex string for AES-GCM encryption of secrets |
| `DATABASE_URL`       | PostgreSQL connection string                         |
| `DRAGONFLY_URL`      | Redis/DragonflyDB connection string                  |
| `OBJECT_STORAGE_*`   | S3-compatible storage credentials and endpoint       |

### Optional features

| Variable                                        | Description                                               |
| ----------------------------------------------- | --------------------------------------------------------- |
| `GITHUB_APP_*`                                  | GitHub App credentials for agent publishing               |
| `SEARXNG_URL`                                   | SearXNG endpoint for web search tool                      |
| `SANDBOX_RUNNER_SOCKET`                         | Unix socket path for code execution sandbox               |
| `SANDBOX_PYTHON_COMMAND`                        | Optional Python executable used by a local sandbox runner |
| `AI_HUB_TOOL_POLICY_OPA_URL`                    | OPA endpoint for tool approval policies                   |
| `WORKSPACE_MONTHLY_TOKEN_LIMIT`                 | Per-workspace monthly token quota                         |
| `ALLOW_PERSONAL_WORKSPACES`                     | Set to `false` to disable personal workspaces             |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | OpenTelemetry service naming and resource metadata        |

> **Security note:** The app validates environment variables at startup and rejects insecure production configuration. `next build` may use placeholder values so CI builds remain reproducible.

---

## Architecture

Maiah follows a **modular monolith** pattern with clean separation:

```
┌──────────────────────────────────────────────────────────┐
│  Next.js App (RSC pages + API route handlers)            │
├──────────────────────────────────────────────────────────┤
│  Modules (use cases — business logic per feature)        │
├──────────────────────────────────────────────────────────┤
│  Domain (entities, authorization, audit)                 │
├──────────────────────────────────────────────────────────┤
│  Infrastructure (DB, cache, storage, worker, AI SDK)      │
└──────────────────────────────────────────────────────────┘
```

Route handlers authenticate, validate input, delegate to use cases or domain services, and format responses. Business rules live in `modules/` and `server/domain/` — never in route handlers.

For the full ownership map, persistence model, critical request flows, security invariants, test strategy, and extension checklist, see the [codebase guide](docs/architecture/codebase-guide.md).

Assistant visibility and use can be scoped to the creator, project, organization, or a specific team. The permission model and assignment invariants are documented in [assistant access scopes](docs/architecture/assistant-access-scopes.md).

---

## Key features

### Workspaces & IAM

Multi-tenant workspaces with role-based access control inspired by GCP IAM. Each workspace has members, custom roles, and permission bindings with wildcard and `manage` semantics.

### AI Agents

Create, configure, and run AI agents with streaming chat, tool calling, and policy-gated tool approvals via OPA.

Agents can also be created as orchestrators. Orchestrators use immutable, version-pinned specialist bindings and durable run trees with permission checks, cancellation, idempotency, encrypted payloads, redacted traces, quota reservations, and explicit depth/step/token/time limits. See [the orchestrator run model](docs/architecture/orchestrator-run-model.md).

### Tools & MCP

- **Custom tools** — user-defined functions agents can call
- **MCP servers** — register external Model Context Protocol servers and auto-discover their tools
- **Tool connections** — per-user or workspace credentials/settings for connector-backed tools such as ServiceNow
- **Web search** — SearXNG-backed search tool
- **Code sandbox** — Docker-isolated execution for Python/Node workloads

### Knowledge Bases

Upload documents to workspace knowledge bases and enable RAG (Retrieval-Augmented Generation) with pgvector embeddings.

### Provider Management

Register OpenAI-compatible and Anthropic-compatible providers with encrypted API key storage using AES-GCM. OpenAI connections support selectable `auto`, generic, llama.cpp, vLLM, and Open WebUI compatibility profiles alongside Responses and Chat Completions protocols.

### Scheduled Tasks

Define recurring agent jobs that run on a schedule via the background worker.

### Low-code workflows

Build, version, publish, and execute visual workflows directly inside Maiah. The
editor is powered by React Flow, while Maiah stores its own versioned JSON DSL
and compiles published definitions to Flowcraft at runtime. Durable run jobs use
BullMQ on DragonflyDB; run and step history remains in PostgreSQL.

The no-code catalog contains 20 ready-to-use nodes: API input, field set/pick/
remove/rename, templates, JSON parsing and serialization, text transforms,
calculations, list filtering/sorting/slicing, conditions, delays, terminal
steps, current dates, HTTPS requests, and assistant execution. Custom
JavaScript or Python remains available as an expert escape hatch and always
runs in the existing network-isolated sandbox runner. Drafts may be incomplete,
but a workflow must pass graph validation before it can be published or tested.

The desktop editor uses keyboard-accessible resizable panels. On smaller
screens, the node library and inspector become side sheets; the canvas can also
be switched to a full-screen workspace at any viewport size.

The main execution endpoint is:

```http
POST /api/workspace/workflows/{workflowId}/runs
Authorization: Bearer <workspace-api-token>
Content-Type: application/json

{
  "workspaceId": "<workspace-uuid>",
  "input": { "message": "Hello" },
  "idempotencyKey": "optional-client-key"
}
```

Use the `workflows.execute` API-token scope and poll
`GET /api/workspace/workflow-runs/{runId}?workspaceId=...` for status and step
details. DragonflyDB is started with BullMQ-compatible hashtag locking in both
development and production Compose configurations. BullMQ creates some job keys
inside Lua scripts, so both Compose files also set
`--default_lua_flags=allow-undeclared-keys`; removing that flag causes queue
insertion to fail with `script tried accessing undeclared key`.

### Agent Marketplace

Publish agents to a team marketplace with optional GitHub repository sync.

### Audit & Usage

Per-workspace token usage tracking and security audit logs for sensitive actions.

---

## API routes

The interactive Swagger UI is available at [`/api/docs`](http://localhost:3000/api/docs), and the OpenAPI 3.1 document at [`/api/openapi`](http://localhost:3000/api/openapi). The legacy `/api-docs` URL permanently redirects to `/api/docs`. The specification is generated from every App Router API handler and verified in CI so newly added operations cannot be omitted silently.

Workspace API tokens are created from the API keys screen with explicit scopes. Their effective access is always the intersection of the selected token scopes, the token workspace, and the owner's current workspace permissions. Revoking a user's permission therefore revokes it for their existing tokens immediately. Session-only and public operations are identified directly in Swagger.

Maiah can also be used as an OpenAI-compatible model proxy with `baseURL = https://<deployment>/api/v1`. It exposes the enabled workspace models through Models, Chat Completions and Responses, with OpenAI-shaped errors and streaming. See [OpenAI-compatible proxy](docs/openai-compatible-proxy.md) for SDK examples, scopes and the compatibility matrix.

The Anthropic-compatible Messages API, multi-currency usage analytics, and organization branding are documented in [API compatibility and usage analytics](docs/architecture/api-compatibility-and-usage.md).

Assistant configuration exposes provider-supported generation controls (temperature, top-p, top-k, penalties, seed, retries, stop sequences and output limits), searchable capability catalogs, and per-tool approval/block rules. Conversation memory can automatically create a visible summary after an assistant-defined token threshold. Chat users may temporarily add workspace-visible tools, MCP tools, skills, and knowledge sources to one conversation; server-side visibility and approval checks still apply.

Workflow definitions persist a user-editable default JSON input. The visual test panel and workflow agent can both update it, and full-screen editing is rendered at the document root so it is not constrained by page animation containers.

| Method       | Path                                         | Description                                                            |
| ------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| `GET`        | `/api/health`                                | Health check (app + database)                                          |
| `GET`        | `/api/workspaces`                            | List current user's workspaces                                         |
| `POST`       | `/api/workspaces`                            | Create workspace with owner role                                       |
| `GET`        | `/api/workspace/agents`                      | List agents (IAM-gated)                                                |
| `POST`       | `/api/workspace/agents`                      | Create agent                                                           |
| `GET/PUT`    | `/api/workspace/agents/:agentId/delegations` | Read or replace versioned orchestration policy and specialist bindings |
| `GET/POST`   | `/api/workspace/agents/:agentId/runs`        | List, dry-run, or execute durable agent runs                           |
| `GET/DELETE` | `/api/workspace/agents/:agentId/runs/:runId` | Inspect a safe run tree or request cancellation                        |
| `POST`       | `/api/workspace/[agentId]/chat`              | Stream chat (encrypted messages)                                       |
| `GET/POST`   | `/api/workspace/providers`                   | Manage provider registry                                               |
| `GET/POST`   | `/api/workspace/knowledge-bases`             | Manage RAG knowledge bases                                             |
| `GET/POST`   | `/api/workspace/mcp-servers`                 | Register MCP servers                                                   |
| `GET/POST`   | `/api/workspace/tool-connectors`             | Manage connector templates for tools/MCP servers                       |
| `GET/POST`   | `/api/workspace/tool-connections`            | Manage per-user/workspace tool credentials                             |
| `PUT`        | `/api/workspace/user-tool-settings`          | Save per-user per-tool overrides                                       |
| `GET`        | `/api/workspace/usage`                       | Token usage metrics                                                    |
| `GET`        | `/api/workspace/audit`                       | Audit log entries                                                      |
| `*`          | `/api/auth/[...all]`                         | Better Auth handler                                                    |

The complete UX and release scenario inventory lives in [the user workflow test matrix](docs/ux/user-workflow-test-matrix.md). Repository agents should use [the UX workflow audit skill](.agents/skills/ux-workflow-audit/SKILL.md) for future end-to-end interface changes.

---

## Deployment

### Docker images

The `Dockerfile` is multi-stage and produces several targets:

| Target     | Description                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `runner`   | Next.js standalone production app (runs as non-root `nextjs` user). Auto-runs migrations on startup |
| `worker`   | Background job processor. Runs migrations then starts the worker loop on `:3001`                    |
| `migrator` | One-shot migration runner (standalone, no dev deps)                                                 |
| `dev`      | Containerized dev server                                                                            |
| `searxng`  | Custom SearXNG image with engine filtering                                                          |

The ServiceNow MCP gateway has its own Dockerfile under `services/servicenow-mcp-gateway`.

Build a single target:

```bash
docker build --target runner -t ai-hub-app:latest .
docker build --target worker -t ai-hub-worker:latest .
docker build --target migrator -t ai-hub-migrator:latest .
docker build -t maiah-servicenow-mcp-gateway services/servicenow-mcp-gateway
```

### Docker Compose — local production

Spin up the full stack locally with production-grade configuration:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Services started:

| Service                    | Image                             | Port (host → container)                   |
| -------------------------- | --------------------------------- | ----------------------------------------- |
| **app**                    | `runner` target                   | `3001:3000`                               |
| **worker**                 | `worker` target                   | internal (`:3001`)                        |
| **migrate**                | `migrator` target                 | one-shot (runs before app)                |
| **postgres**               | `pgvector/pgvector:pg16`          | internal (`:5432`)                        |
| **dragonflydb**            | `dragonfly`                       | internal (`:6379`)                        |
| **rustfs**                 | `rustfs/rustfs`                   | internal (`:9000`)                        |
| **rustfs-init**            | `aws-cli`                         | one-shot (creates S3 bucket)              |
| **searxng**                | `searxng` target                  | internal (`:8080`)                        |
| **sandbox-runner**         | `sandbox-runner` target           | Unix socket (`/run/sandbox/sandbox.sock`) |
| **servicenow-mcp-gateway** | `services/servicenow-mcp-gateway` | internal (`:8080`)                        |

Startup order: `postgres` + `rustfs` + `dragonflydb` → `rustfs-init` + `searxng` + `sandbox-runner` + `servicenow-mcp-gateway` → `migrate` → `app` + `worker`.

All long-running services have health checks. The `app` and `worker` containers won't start until their dependencies are healthy.

### Resource limits

Production compose sets soft and hard resource limits per service:

| Service                    | CPU limit | Memory limit | CPU reservation | Memory reservation |
| -------------------------- | --------- | ------------ | --------------- | ------------------ |
| **app**                    | 2.0       | 2G           | 0.25            | 512M               |
| **worker**                 | 1.0       | 1G           | 0.25            | 256M               |
| **postgres**               | 1.0       | 1G           | 0.25            | 256M               |
| **dragonflydb**            | 1.0       | 1G           | 0.25            | 256M               |
| **rustfs**                 | 1.0       | 1G           | 0.25            | 256M               |
| **sandbox-runner**         | 1.0       | 2G           | 0.10            | 512M               |
| **servicenow-mcp-gateway** | 0.5       | 512M         | 0.10            | 128M               |

### Docker volumes

Production compose uses named volumes for persistent data:

| Volume                  | Service                       | Purpose              |
| ----------------------- | ----------------------------- | -------------------- |
| `postgres-prod-data`    | postgres                      | Database files       |
| `dragonfly-prod-data`   | dragonflydb                   | Cache persistence    |
| `rustfs-prod-data`      | rustfs                        | Object storage files |
| `sandbox-runner-socket` | app / worker / sandbox-runner | Shared Unix socket   |

When migrating between Coolify projects, stop the old service, copy volumes to the new ones, then redeploy.

### Coolify CI/CD

The production deployment pipeline is driven by GitHub Actions (`.github/workflows/coolify.yml`) and deploys to a [Coolify](https://coolify.io) server.

#### Pipeline flow

```
prepare → validate → plan_images → build → deploy → cleanup
         (lint, typecheck, tests, build) (app, worker,
                                          migrator, searxng, sandbox,
                                          ServiceNow gateway)
```

1. **prepare** — determines deployment target (production or PR preview), computes image tags
2. **validate** — runs `lockfile:check`, `lint`, `typecheck`, `test:ci`, and `build`
3. **plan_images** — decides which Docker images to build (every deploy builds all images, pinned to the commit SHA)
4. **build** — parallel Docker Buildx jobs push images to GitHub Container Registry (`ghcr.io`)
5. **deploy** — patches the Coolify service with the new compose stack, env vars, and image references, then triggers a force deploy
6. **cleanup** — on PR close, deletes the preview service and its environment

The application image receives the commit SHA as `NEXT_DEPLOYMENT_ID`. Next.js
uses it to identify one rollout, version static assets, and detect incompatible
React Server Component payloads during rolling deployments. This prevents stale
clients from repeatedly crossing deployment versions during navigation.

#### Environments

| Trigger              | Environment   | URL                                      | Auth               |
| -------------------- | ------------- | ---------------------------------------- | ------------------ |
| **Push to `main`**   | `production`  | `https://maiah.shiftify.eco`             | None               |
| **PR opened/synced** | `pr-<number>` | `https://maiah-pr-<number>.shiftify.eco` | Traefik basic auth |
| **PR closed**        | —             | (deleted)                                | —                  |

PR previews are isolated — each gets its own Coolify environment and service. They are auto-deleted when the PR is closed. Fork PRs skip deployment entirely.

#### Required secrets & variables

GitHub repository **secrets**:

| Secret                             | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `COOLIFY_TOKEN`                    | Coolify API token                                    |
| `POSTGRES_PASSWORD`                | Database password (≥ 16 chars)                       |
| `BETTER_AUTH_SECRET`               | Auth secret (≥ 32 chars)                             |
| `APP_ENCRYPTION_KEY`               | AES-GCM encryption key (64-char hex)                 |
| `APP_ENCRYPTION_KEY_ID`            | Encryption key identifier                            |
| `DRAGONFLY_PASSWORD`               | DragonflyDB password (≥ 16 chars)                    |
| `OBJECT_STORAGE_ACCESS_KEY_ID`     | S3 access key                                        |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | S3 secret key (≥ 16 chars)                           |
| `SEARXNG_SECRET`                   | SearXNG secret (≥ 32 chars)                          |
| `MCP_GATEWAY_SHARED_SECRET`        | Shared Maiah↔MCP gateway context secret (≥ 32 chars) |
| `TRAEFIK_BASIC_AUTH_USERS`         | PR preview auth (format: `user:hashed_password`)     |

GitHub repository **variables**:

| Variable                           | Default                    | Purpose                                          |
| ---------------------------------- | -------------------------- | ------------------------------------------------ |
| `COOLIFY_DEPLOY_ENABLED`           | `true`                     | Master switch — disable to skip deploys          |
| `COOLIFY_PROJECT_UUID`             | `w2chgobcwbe3j1j9lj7m8dke` | Coolify project ID                               |
| `COOLIFY_SERVER_UUID`              | `o2dnvmz0zrjz0frynoq6bnfj` | Coolify server ID                                |
| `COOLIFY_ENVIRONMENT_NAME`         | `production`               | Default environment name                         |
| `OBJECT_STORAGE_BUCKET`            | `ai-hub`                   | S3 bucket name                                   |
| `CODE_WORKSPACE_STORAGE_PREFIX`    | `code-workspaces`          | S3 prefix for code workspaces                    |
| `SERVICENOW_ALLOWED_HOST_SUFFIXES` | `service-now.com`          | Allowed ServiceNow host suffixes for the gateway |
| `SERVICENOW_GATEWAY_RESOLVE_HOSTS` | `true`                     | Resolve and block private ServiceNow host IPs    |
| `ALLOW_PERSONAL_WORKSPACES`        | `true`                     | Allow personal workspace creation                |
| `WORKSPACE_MONTHLY_TOKEN_LIMIT`    | —                          | Token quota per workspace                        |
| `OTEL_SERVICE_NAME`                | `maiah`                    | Stable OpenTelemetry service name                |
| `OTEL_RESOURCE_ATTRIBUTES`         | derived                    | Standard OpenTelemetry resource attributes       |
| `OBSERVABILITY_OWNER`              | `deodis`                   | Owner metadata for the deployment                |

#### Coolify stack

`.coolify/stack.compose.yml` is the image-based compose file used by the deploy step. It references pre-built images from GHCR via env vars:

```yaml
AI_HUB_APP_IMAGE: ghcr.io/.../ai-hub-app:<tag>
AI_HUB_WORKER_IMAGE: ghcr.io/.../ai-hub-worker:<tag>
AI_HUB_MIGRATOR_IMAGE: ghcr.io/.../ai-hub-migrator:<tag>
AI_HUB_SEARXNG_IMAGE: ghcr.io/.../ai-hub-searxng:<tag>
AI_HUB_SANDBOX_IMAGE: ghcr.io/.../ai-hub-sandbox:<tag>
```

For PR previews, the deploy step merges in an additional compose overlay that adds Traefik basic auth labels to the `app` container.

#### OpenTelemetry service metadata

The production compose files set a stable application-side service identity:

```env
OTEL_SERVICE_NAME=maiah
OTEL_RESOURCE_ATTRIBUTES=service.namespace=deodis,deployment.environment=production,service.version=<image-tag>
```

The GitHub deploy workflow publishes `OTEL_RESOURCE_ATTRIBUTES` directly. It derives `OTEL_SERVICE_VERSION` from the deployed image tag and `OTEL_DEPLOYMENT_ENVIRONMENT` from the Coolify environment (`production` or `pr-<number>`). You can inspect the effective metadata in a running container with:

```bash
docker exec -it <container_name> printenv | grep -E "^OTEL_"
```

### Standalone deployment

The `runner` target produces a Next.js standalone output (`.next/standalone/`). You can deploy it without Docker Compose:

```bash
# Build the image
docker build --target runner -t ai-hub-app:latest .

# Run with external Postgres, DragonflyDB, and S3
docker run -d \
  --name ai-hub-app \
  -p 3000:3000 \
  -e APP_ENV=production \
  -e BETTER_AUTH_SECRET=... \
  -e BETTER_AUTH_URL=https://your-domain \
  -e BETTER_AUTH_TRUSTED_ORIGINS=https://your-domain \
  -e DATABASE_URL=postgresql://... \
  -e APP_ENCRYPTION_KEY=... \
  -e DRAGONFLY_URL=redis://... \
  -e OBJECT_STORAGE_ENDPOINT=https://... \
  ai-hub-app:latest
```

The standalone container auto-runs migrations on startup via `scripts/migrate-standalone.mjs`.

### Worker deployment

The worker runs as a separate container alongside the app:

```bash
docker run -d \
  --name ai-hub-worker \
  --network ai-hub-app-network \
  -e APP_ENV=production \
  -e BETTER_AUTH_SECRET=... \
  -e DATABASE_URL=... \
  -e DRAGONFLY_URL=... \
  ai-hub-worker:latest
```

The worker exposes its own health check on `:3001/health`.

---

## Testing

```bash
npm run test:ci      # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
npm run test:coverage # Coverage report
```

Full verification suite:

```bash
npm run typecheck && npm run lint && npm run test:ci && npm run build
```

---

## License

Private project. All rights reserved.

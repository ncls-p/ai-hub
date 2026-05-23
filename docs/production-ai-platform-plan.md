# Production AI Platform Plan

## 1. Product Vision

Build a production-grade, multi-tenant AI platform for teams to create, configure, share, run, and monetize AI agents.

The platform provides:

- Chat interface with streaming responses
- Configurable agents with versioned runtime settings
- Multi-provider and multi-model support
- OpenAI-compatible API support as a first-class provider type
- Dragonfly LLM support as a first-class provider type
- Better Auth based authentication
- Workspace members with GCP-inspired IAM roles and permissions
- MCP server integration
- Built-in and MCP-backed tools
- Knowledge bases / RAG
- Marketplace for agents, prompts, tool packs, MCP presets, and workflows
- Usage tracking, quotas, audit logs, and production observability

This is not a throwaway MVP. The first implementation should already have production boundaries: authentication, authorization, encrypted secrets, auditable actions, migration strategy, tests, and deployable infrastructure.

---

## 2. Recommended Stack

### Application

- **Next.js 16** with App Router
- **React 19**
- **TypeScript** strict mode
- **Server Components** by default
- **Route Handlers** for streaming chat and API endpoints
- **Server Actions** for simple mutations where appropriate

### UI

- **shadcn/ui**
- **Tailwind CSS v4**
- **Streamdown** for streaming markdown rendering
- `@streamdown/code` for code highlighting
- Optional later: Mermaid/math plugins

### Auth

- **Better Auth**
- `better-auth/minimal`
- `better-auth/adapters/drizzle`
- `better-auth/next-js`
- Better Auth admin plugin

### Database

- **PostgreSQL**
- **Drizzle ORM**
- **pgvector** for embeddings/RAG

### AI Runtime

- **AI SDK v6**
- `@ai-sdk/react`
- `@ai-sdk/openai-compatible`
- Custom provider adapters for unsupported quirks

### Providers

First-class provider types:

- `openai-compatible`
- `dragonfly`
- `vercel-ai-gateway`

Later provider types:

- `anthropic`
- `google`
- `mistral`
- `groq`
- `openrouter`
- `ollama`
- `bedrock`
- `azure-openai`

### Cache / Rate Limits / Locks

- **DragonflyDB** or Redis-compatible backend
- Use for rate limits, provider health cache, short-lived locks, stream/session dedupe, and ephemeral runtime state

### Storage

- S3-compatible object storage
- SaaS: R2 or S3
- Self-hosted: Garage

### Jobs

Initial:

- In-process for trivial operations
- Route handlers for simple chat streaming

Production phase:

- Worker process
- BullMQ, Inngest, Trigger.dev, or Temporal depending on deployment target

Use jobs for:

- Document ingestion
- Embedding generation
- MCP tool sync
- Provider model sync
- Long-running tool executions
- Marketplace moderation checks

### Observability

- Structured logs
- Request IDs
- Audit events
- Sentry for application errors
- Langfuse or OpenTelemetry-compatible LLM traces
- Usage/cost metrics in Postgres

---

## 3. Architectural Style

Use a modular monolith with clean boundaries.

```txt
src/
  app/                    Next.js pages, layouts, route handlers
  components/             shadcn/ui and application UI components
  modules/                feature modules
  server/
    domain/               entities, value objects, domain services, ports
    application/          use cases and orchestration
    infrastructure/       db, providers, MCP, storage, cache adapters
    composition/          dependency wiring
  lib/                    env, logger, crypto, utils
```

Dependency rule:

```txt
UI/API -> Application -> Domain
              |
              v
       Infrastructure adapters
```

Route handlers should not directly own business rules. They should authenticate, parse input, call an application service, and format the response.

---

## 4. Multi-Tenant Resource Model

Security boundary: **workspace**.

Resource hierarchy inspired by GCP:

```txt
Organization
  └── Workspace
        ├── Members
        ├── Agents
        ├── Agent Versions
        ├── Conversations
        ├── Providers
        ├── Models
        ├── MCP Servers
        ├── Tools
        ├── Knowledge Bases
        ├── Marketplace Installs
        ├── Usage Events
        └── Audit Logs
```

All workspace-owned records must include `workspace_id` unless they are globally public marketplace records.

Every query accessing workspace-owned data must verify membership and permission.

---

## 5. Better Auth Plan

Better Auth owns identity/session tables:

```txt
user
session
account
verification
```

Use Better Auth for:

- Email/password login
- OAuth later
- Session handling
- Admin bootstrap
- User ban/disable support
- Cookie integration

Product authorization is owned by platform IAM tables, not by a single `user.role` field.

Recommended Better Auth configuration pattern:

```ts
betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    camelCase: true,
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [admin(), nextCookies()],
})
```

Production requirements:

- Auth rate limits
- Production rejects insecure default secrets
- Admin bootstrap policy
- Login/signup allowlist policy optional
- Audit sign-in/sign-out/security events

---

## 6. GCP-Inspired IAM

### Core Model

```txt
Principal + Role + Resource + Optional Condition = Access
```

Principals:

```txt
user
group
service_account
api_key
```

Resources:

```txt
organization
workspace
agent
provider
mcp_server
knowledge_base
marketplace_item
```

Role types:

```txt
system role      built in, cannot edit
custom role      organization/workspace-defined permission bundle
temporary role   role binding with expires_at
service role     intended for API keys/automation
```

Access checks should use permissions, not hardcoded role checks:

```ts
await authorization.requirePermission({
  principal,
  permission: "agents.update",
  resource: agent,
})
```

Never implement this pattern:

```ts
if (user.role === "admin") { ... }
```

### Built-in Organization Roles

#### `organization.owner`

Full organization control.

Permissions:

```txt
organization.*
workspaces.*
members.*
roles.*
billing.*
security.*
audit.*
marketplace.*
```

#### `organization.admin`

Manage workspaces and members, but not billing/secrets by default.

```txt
organization.get
workspaces.create
workspaces.update
workspaces.delete
members.manage
roles.manage
audit.view
```

#### `organization.securityAdmin`

Security-focused role.

```txt
members.view
roles.manage
apiKeys.manage
secrets.rotate
audit.view
audit.export
providers.viewMetadata
mcpServers.viewMetadata
```

#### `organization.billingAdmin`

```txt
billing.view
billing.manage
usage.view
invoices.view
plans.manage
```

### Built-in Workspace Roles

#### `workspace.owner`

Full workspace control.

```txt
workspace.*
members.*
roles.*
providers.*
agents.*
tools.*
mcpServers.*
knowledgeBases.*
conversations.*
usage.*
audit.*
marketplace.*
```

#### `workspace.admin`

Manage workspace except destructive ownership/billing actions.

```txt
workspaces.get
workspaces.update
members.invite
members.remove
providers.manage
agents.manage
tools.manage
mcpServers.manage
knowledgeBases.manage
usage.view
audit.view
marketplaceItems.install
```

#### `workspace.aiAdmin`

Manages AI runtime configuration.

```txt
providers.manage
models.manage
agents.manage
tools.manage
mcpServers.manage
knowledgeBases.manage
usage.view
```

#### `workspace.developer`

Builds agents/tools/knowledge but cannot manage members or billing.

```txt
agents.create
agents.update
agentVersions.create
agents.test
tools.configure
mcpServers.get
knowledgeBases.manage
conversations.create
conversations.viewOwn
marketplaceItems.install
```

#### `workspace.member`

Normal user.

```txt
agents.list
agents.get
agents.chat
conversations.create
conversations.viewOwn
knowledgeBases.viewAllowed
marketplaceItems.view
```

#### `workspace.viewer`

Read-only workspace user.

```txt
workspaces.get
agents.list
agents.get
conversations.viewShared
knowledgeBases.viewAllowed
usage.viewLimited
```

#### `workspace.auditor`

Compliance/read-only logs.

```txt
auditLogs.view
auditLogs.export
usage.view
members.view
providers.viewMetadata
agents.view
```

### Agent-Specific Roles

#### `agent.owner`

```txt
agents.*
agentVersions.*
agentPermissions.manage
agents.publish
agents.delete
```

#### `agent.developer`

```txt
agents.get
agents.update
agentVersions.create
agents.test
agentTools.configure
agentKnowledge.configure
```

#### `agent.user`

```txt
agents.get
agents.chat
conversations.create
conversations.viewOwn
```

#### `agent.viewer`

```txt
agents.get
conversations.viewShared
```

### Provider Roles

#### `provider.admin`

```txt
providers.create
providers.update
providers.delete
providers.test
providers.rotateSecret
providerModels.sync
```

#### `provider.user`

```txt
providers.use
models.use
```

#### `provider.viewer`

```txt
providers.viewMetadata
models.view
```

### MCP Roles

#### `mcp.admin`

```txt
mcpServers.create
mcpServers.update
mcpServers.delete
mcpServers.connect
mcpServers.discoverTools
mcpServers.rotateSecret
```

#### `mcp.toolApprover`

```txt
toolInvocations.approve
toolInvocations.reject
```

#### `mcp.viewer`

```txt
mcpServers.get
mcpTools.list
mcpServers.viewHealth
```

### Marketplace Roles

#### `marketplace.viewer`

```txt
marketplaceItems.view
marketplaceItems.search
```

#### `marketplace.installer`

```txt
marketplaceItems.install
marketplaceInstalls.update
marketplaceInstalls.uninstall
```

#### `marketplace.publisher`

```txt
marketplaceItems.create
marketplaceItems.update
marketplaceItems.requestPublish
marketplaceItems.archive
```

#### `marketplace.reviewer`

```txt
marketplaceReviews.create
marketplaceItems.approve
marketplaceItems.reject
marketplaceItems.suspend
```

#### `marketplace.admin`

```txt
marketplace.*
```

---

## 7. IAM Schema

```txt
organizations
  id
  name
  slug
  created_at
  updated_at

workspaces
  id
  organization_id
  name
  slug
  created_by_user_id
  created_at
  updated_at
  archived_at

workspace_members
  id
  workspace_id
  user_id
  status                  active | suspended | removed
  created_at
  updated_at

workspace_invitations
  id
  workspace_id
  email
  invited_by_user_id
  role_ids_json
  token_hash
  expires_at
  accepted_at
  revoked_at
  created_at

roles
  id
  scope_type              system | organization | workspace
  owner_resource_type     organization | workspace | null
  owner_resource_id
  name
  display_name
  description
  permissions_json
  is_system
  created_by_user_id
  created_at
  updated_at

role_bindings
  id
  principal_type          user | group | service_account | api_key
  principal_id
  role_id
  resource_type           organization | workspace | agent | provider | mcp_server | knowledge_base | marketplace_item
  resource_id
  condition_json
  expires_at
  created_by_user_id
  created_at
```

Authorization engine requirements:

- Resolve direct bindings
- Resolve inherited bindings from organization -> workspace -> child resource
- Respect `expires_at`
- Evaluate optional conditions
- Cache permission decisions briefly in DragonflyDB/Redis
- Always emit audit event for sensitive operations

---

## 8. Provider System

### Supported Provider Types

#### `openai-compatible`

Generic first-class provider for any OpenAI-compatible API.

Use AI SDK:

```ts
createOpenAICompatible({
  name,
  apiKey,
  baseURL,
  headers,
  queryParams,
  includeUsage: true,
})
```

Features:

- Workspace BYOK
- Custom base URL
- Custom headers
- Query params
- Model registry
- Connection test
- Capability overrides

#### `dragonfly`

First-class provider, not treated as generic only.

Use AltScribe-inspired behavior:

- API key sent as `X-API-KEY`
- Normalize endpoint to `/api/v1/chat/completions`
- Use request payload with:
  - `messages`
  - `model`
  - `promptSystem`
  - `stream`
  - `save: false`
  - `max_tokens`
- Parse OpenAI-style SSE chunks
- Tolerate custom response shapes
- Extract text from nested response/message/output fields
- Provide explicit tests for streaming and non-streaming responses

#### `vercel-ai-gateway`

Useful default for simple onboarding.

Support model IDs like:

```txt
openai/...
anthropic/...
google/...
```

Still store it as a provider so permissions, usage, and quotas work uniformly.

### Provider Schema

```txt
ai_providers
  id
  workspace_id
  kind                    openai-compatible | dragonfly | vercel-ai-gateway | native
  name
  base_url
  auth_type               bearer | x-api-key | custom-header | gateway
  encrypted_api_key
  encrypted_headers_json
  query_params_json
  enabled
  health_status
  last_checked_at
  created_by_user_id
  created_at
  updated_at
  archived_at

ai_models
  id
  provider_id
  model_id
  display_name
  capabilities_json       text, vision, tools, reasoning, embeddings, audio
  context_window
  max_output_tokens
  input_token_cost
  output_token_cost
  enabled
  created_at
  updated_at
```

### Provider Adapter Interface

```ts
export interface ProviderAdapter {
  kind: ProviderKind
  validateConnection(config: ProviderRuntimeConfig): Promise<ProviderHealth>
  listModels?(config: ProviderRuntimeConfig): Promise<ModelDescriptor[]>
  createChatModel(config: ProviderRuntimeConfig, modelId: string): LanguageModel
  stream?(options: ProviderStreamOptions): Promise<ProviderStreamResult>
  generate?(options: ProviderGenerateOptions): Promise<ProviderGenerateResult>
}
```

---

## 9. Agent System

Agents are versioned runtime configurations.

### Schema

```txt
agents
  id
  workspace_id
  name
  slug
  description
  visibility              private | workspace | organization | public
  source_type             custom | marketplace_install | fork
  marketplace_item_id
  marketplace_version_id
  forked_from_agent_id
  created_by_user_id
  active_version_id
  created_at
  updated_at
  archived_at

agent_versions
  id
  agent_id
  version_number
  name
  system_prompt
  provider_id
  model_id
  temperature
  top_p
  max_output_tokens
  tool_choice
  response_format_json
  memory_policy_json
  guardrails_json
  approval_policy_json
  created_by_user_id
  created_at
```

Important rule:

```txt
Conversation references agent_version_id, not only agent_id.
```

This makes old conversations reproducible when an agent changes.

### Agent Builder Features

- Prompt editor
- Model/provider picker
- Tool picker
- MCP tool picker
- Knowledge base picker
- Guardrails editor
- Approval policy editor
- Test panel
- Version history
- Publish to marketplace
- Fork/install metadata

---

## 10. Chat / Conversations

### Schema

```txt
conversations
  id
  workspace_id
  agent_id
  agent_version_id
  user_id
  title
  status                  active | archived | deleted
  parent_conversation_id
  branch_from_message_id
  created_at
  updated_at
  archived_at

messages
  id
  conversation_id
  role                    user | assistant | system | tool
  status                  pending | streaming | completed | failed | cancelled
  token_input
  token_output
  cost_usd
  model_id
  provider_id
  created_at
  completed_at

message_parts
  id
  message_id
  type                    text | file | tool-call | tool-result | reasoning | error | citation
  content_encrypted
  metadata_json
  sort_order
  created_at
```

Features:

- Streaming responses
- Message persistence
- Retry assistant response
- Branch conversation from any message
- Attachments
- Reasoning visibility setting
- Tool invocation rendering
- Token/cost accounting

---

## 11. Tool System

Unified tool registry for built-in and MCP tools.

### Tool Definition

```ts
export interface ToolDefinition {
  id: string
  source: "builtin" | "mcp"
  name: string
  description: string
  inputSchema: z.ZodSchema
  riskLevel: "safe" | "moderate" | "dangerous" | "critical"
  requiredPermissions: string[]
  execute(ctx: ToolExecutionContext, input: unknown): Promise<unknown>
}
```

### Built-in Tool Categories

```txt
web.search
web.fetch
http.request
files.read
files.write
code.execute
db.query
github.search
github.issue.create
image.generate
memory.write
memory.search
knowledge.search
```

### Invocation Schema

```txt
tool_invocations
  id
  workspace_id
  conversation_id
  message_id
  tool_source              builtin | mcp
  tool_id
  tool_name
  risk_level
  input_json_encrypted
  output_json_encrypted
  status                   pending_approval | running | completed | failed | rejected
  latency_ms
  error_message
  approved_by_user_id
  created_at
  completed_at
```

All tool calls must be logged.

Dangerous and critical tools require approval unless policy explicitly allows them.

---

## 12. MCP System

MCP servers are workspace-scoped and permissioned.

### Schema

```txt
mcp_servers
  id
  workspace_id
  name
  transport                stdio | sse | streamable-http
  command
  args_json
  url
  encrypted_headers_json
  encrypted_env_json
  enabled
  health_status
  last_checked_at
  created_by_user_id
  created_at
  updated_at
  archived_at

mcp_tools
  id
  mcp_server_id
  name
  description
  input_schema_json
  output_schema_json
  discovered_at
  enabled

agent_tool_bindings
  id
  agent_version_id
  tool_source              builtin | mcp
  tool_id
  require_approval
  risk_level
  created_at
```

Security rules:

- Workspace owns MCP server
- Agent version allowlists MCP tools
- User must have workspace permission
- Tool risk policy is enforced before execution
- All executions are logged
- Secrets never return to client

---

## 13. Knowledge / RAG

Use Postgres + pgvector initially.

### Schema

```txt
knowledge_bases
  id
  workspace_id
  name
  description
  created_by_user_id
  created_at
  updated_at
  archived_at

documents
  id
  workspace_id
  knowledge_base_id
  title
  source_type              upload | url | text | integration
  object_storage_key
  mime_type
  status                   pending | processing | ready | failed
  error_message
  created_by_user_id
  created_at
  updated_at

document_chunks
  id
  document_id
  chunk_index
  content_encrypted
  token_count
  metadata_json
  created_at

document_embeddings
  id
  chunk_id
  embedding vector
  embedding_model_id
  created_at

agent_knowledge_bindings
  id
  agent_version_id
  knowledge_base_id
  created_at
```

Pipeline:

```txt
upload/url/text -> extract -> chunk -> embed -> index -> searchable by agent
```

Production requirements:

- Background ingestion jobs
- File size limits
- Per-workspace isolation
- Deletion cascade
- Embedding model tracked
- Citations in answers

---

## 14. Marketplace

Marketplace is a core product area.

Marketplace item types:

```txt
agent
prompt_template
tool_pack
mcp_preset
workflow_template
knowledge_template
provider_preset
```

### Schema

```txt
marketplace_items
  id
  publisher_user_id
  publisher_workspace_id
  type
  slug
  name
  description
  visibility              public | private | unlisted | organization
  status                  draft | pending_review | published | rejected | suspended | archived
  latest_version_id
  install_count
  rating_average
  pricing_model           free | one_time | subscription | usage_based
  verified_publisher
  created_at
  updated_at

marketplace_item_versions
  id
  item_id
  version
  manifest_json
  changelog
  compatibility_json
  requested_permissions_json
  security_review_status
  created_by_user_id
  created_at

marketplace_installs
  id
  workspace_id
  item_id
  version_id
  installed_by_user_id
  installed_resource_type
  installed_resource_id
  created_at

marketplace_reviews
  id
  item_id
  version_id
  reviewer_user_id
  status                  approved | rejected | changes_requested
  notes
  created_at

marketplace_ratings
  id
  item_id
  user_id
  rating
  review
  created_at

marketplace_reports
  id
  item_id
  reporter_user_id
  reason
  status
  created_at
```

### Marketplace Rules

- Installing marketplace content creates a local workspace copy
- Marketplace updates do not mutate installed resources automatically
- Users can fork/customize installed agents
- Dangerous tool/MCP capabilities require admin approval
- Publish flow requires review/moderation for public listings
- Marketplace manifests declare requested permissions/capabilities

### Example Manifest

```json
{
  "type": "agent",
  "name": "Senior Code Reviewer",
  "description": "Reviews code for bugs, security, and maintainability.",
  "agent": {
    "systemPrompt": "You are a senior software engineer...",
    "recommendedModels": [
      "openai-compatible/gpt-4o",
      "dragonfly/chatgpt-4o-latest"
    ],
    "tools": ["github.read", "files.read"],
    "mcpRequirements": []
  },
  "permissions": {
    "tools": ["files.read"],
    "riskLevel": "moderate"
  }
}
```

---

## 15. Secrets and Encryption

Encrypt at rest:

- Provider API keys
- Provider custom headers
- MCP headers/env
- Workspace API keys
- Tool inputs/outputs when sensitive
- Message content if configured
- Extracted document content if configured

Environment:

```txt
APP_ENCRYPTION_KEY
APP_ENCRYPTION_KEY_ID
```

Encrypted record pattern:

```txt
encrypted_value
encryption_key_id
```

Production requirements:

- Reject insecure defaults in production
- Key ID stored with encrypted data
- Rotation path planned
- Never return raw secrets after creation
- Redact secrets in logs/errors

---

## 16. Rate Limits, Quotas, Usage

Use DragonflyDB/Redis-compatible backend for fast counters.

Rate-limit dimensions:

```txt
user
workspace
provider
model
agent
tool
IP/auth endpoint
```

Usage schema:

```txt
usage_events
  id
  workspace_id
  user_id
  provider_id
  model_id
  agent_id
  conversation_id
  operation                chat | tool | embedding | ingestion | mcp
  input_tokens
  output_tokens
  cost_usd
  latency_ms
  status
  metadata_json
  created_at
```

Quota examples:

```txt
workspace monthly token limit
user daily message limit
provider-specific limit
concurrent run limit
tool execution limit
MCP call limit
marketplace install limit
```

---

## 17. Audit Logs

Audit sensitive actions:

- Auth events
- Workspace/member changes
- Role binding changes
- Provider create/update/delete/secret rotation
- Agent publish/version changes
- Tool execution approvals
- MCP server changes
- Marketplace publish/review/install
- Billing/usage changes

Schema:

```txt
audit_events
  id
  organization_id
  workspace_id
  actor_principal_type
  actor_principal_id
  action
  resource_type
  resource_id
  outcome                 success | denied | failed
  ip_address
  user_agent
  metadata_json
  created_at
```

---

## 18. Docker Compose and Coolify Deployment

Deployment target: **Coolify-managed Docker Compose**.

The repository must include two compose files:

```txt
docker-compose.dev.yml
docker-compose.prod.yml
```

Coolify will deploy the production stack by uploading/pointing to `docker-compose.prod.yml`. The compose files are therefore first-class deployment artifacts, not local-only helpers.

### 18.1 Development Compose

File:

```txt
docker-compose.dev.yml
```

Purpose:

- Fast local development
- Hot reload
- Local Postgres
- Local DragonflyDB
- Local Garage/S3-compatible storage
- Optional local worker
- Safe development defaults

Development services:

```txt
app-dev
worker-dev
postgres
dragonflydb
garage
garage-init
```

Development behavior:

- Bind mount source code into app container or run app locally against compose services
- Expose Postgres on local port
- Expose DragonflyDB on local port
- Expose Garage/S3 API locally
- Use non-production generated secrets only for local dev
- Run migrations automatically or via explicit `npm run db:setup`
- Enable verbose logs
- Use smaller resource limits

Development compose should support this flow:

```bash
docker compose -f docker-compose.dev.yml up -d postgres dragonflydb garage garage-init
npm run db:setup
npm run dev
```

Optionally also support full containerized dev:

```bash
docker compose -f docker-compose.dev.yml up app-dev worker-dev
```

### 18.2 Production Compose

File:

```txt
docker-compose.prod.yml
```

Purpose:

- Coolify deployment
- Production app runtime
- Production worker runtime
- Database migration job
- Managed healthchecks
- Persistent volumes
- No insecure defaults

Production services:

```txt
app
worker
migrate
postgres
dragonflydb
garage
garage-init
```

Production requirements:

- `app` uses Next standalone build
- `worker` uses the same image with a worker command
- `migrate` runs database migrations before app/worker start
- `postgres` has persistent named volume
- `dragonflydb` has persistent named volume if configured for persistence
- `garage` has persistent named volumes for metadata and data
- `garage-init` creates bucket and keys when self-hosting storage
- All production secrets must come from Coolify environment variables
- No production fallback for `BETTER_AUTH_SECRET`
- No production fallback for `APP_ENCRYPTION_KEY`
- No production fallback for database password
- No production fallback for object storage secret
- App healthcheck calls `/api/health`
- Worker healthcheck calls a worker health command or endpoint
- Postgres healthcheck uses `pg_isready`
- DragonflyDB healthcheck uses `redis-cli PING` or equivalent
- Garage healthcheck verifies node health
- Graceful shutdown is handled by app and worker
- Backups are documented

Coolify deployment assumptions:

- Coolify injects environment variables from its UI/secrets manager
- Coolify controls domain and HTTPS routing
- The compose file exposes only the app HTTP port publicly
- Postgres, DragonflyDB, and Garage should stay internal unless explicitly needed
- Healthchecks should be compatible with Coolify service health detection
- `restart: unless-stopped` for long-running services
- `restart: "no"` for one-shot init/migration services

Production compose should support this flow:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 18.3 Required Production Environment Variables

Minimum production env values managed in Coolify:

```txt
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://your-domain.example
BETTER_AUTH_TRUSTED_ORIGINS=https://your-domain.example
DATABASE_URL=postgres://...
POSTGRES_DB=...
POSTGRES_USER=...
POSTGRES_PASSWORD=...
APP_ENCRYPTION_KEY=...
APP_ENCRYPTION_KEY_ID=default
DRAGONFLY_PASSWORD=...
OBJECT_STORAGE_ENDPOINT=http://garage:3900
OBJECT_STORAGE_REGION=garage
OBJECT_STORAGE_BUCKET=...
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
OBJECT_STORAGE_FORCE_PATH_STYLE=true
```

Provider keys should generally be stored per workspace in the database, encrypted with `APP_ENCRYPTION_KEY`. Global bootstrap provider keys are optional and should be disabled by default.

### 18.4 Dockerfile Requirements

Use a multi-stage Dockerfile with at least these targets:

```txt
deps
builder
migrator
runner
worker
garage
```

The `runner` target should:

- Run as non-root user
- Serve `.next/standalone/server.js`
- Include required static assets
- Include required migration/runtime scripts only when needed
- Avoid dev dependencies

The `migrator` target should:

- Include migration scripts
- Run Drizzle migrations
- Run idempotent data backfills
- Exit successfully when no migration is needed

The `worker` target should:

- Use the production build
- Run the background worker command
- Share env validation with the app

### 18.5 External Managed Service Option

The compose files should also allow replacing internal services with managed services by setting environment variables and disabling services if needed.

Possible managed replacements:

```txt
Postgres -> Neon / Supabase / RDS
DragonflyDB -> Dragonfly Cloud / Redis / Upstash
Garage -> R2 / S3
Worker -> separate Coolify service using same image
```

Even if managed services are used later, `docker-compose.prod.yml` remains the canonical Coolify deployment blueprint.

---

## 19. Testing Strategy

Use:

- Vitest unit tests
- Vitest integration tests with Postgres
- Playwright E2E tests
- Provider adapter contract tests
- MCP fake server tests
- Authorization tests
- Marketplace install/publish tests

Critical tests:

```txt
unauthorized user cannot access workspace data
role bindings inherit correctly
expired role bindings deny access
custom roles work
agent conversations reference stable agent versions
provider secrets are encrypted and never returned
OpenAI-compatible provider sends headers/query params correctly
Dragonfly adapter parses non-streaming and streaming responses
Dragonfly adapter uses X-API-KEY
MCP tools are only available when allowlisted
Dangerous tools require approval
Marketplace install creates local copy
Marketplace update does not mutate installed agent automatically
rate limits reject excessive requests
audit events are emitted for sensitive actions
```

CI gates:

```txt
lint
typecheck
unit tests
integration tests
build
selected Playwright smoke tests
```

---

## 20. Implementation Phases

### Phase 1: Production Foundation

Deliver:

- Next.js app scaffold
- Better Auth setup
- Drizzle schema and migrations
- Organization/workspace/member model
- IAM roles/permissions/role bindings
- Env validation with Zod
- Encryption utility
- DragonflyDB/Redis cache adapter
- `docker-compose.dev.yml` with Postgres + DragonflyDB + Garage
- `docker-compose.prod.yml` for Coolify with app + worker + migrate + Postgres + DragonflyDB + Garage
- Multi-stage Dockerfile targets for runner, worker, and migrator
- Health endpoint
- CI scripts

Acceptance criteria:

- User can sign up/sign in
- User can create workspace
- Workspace owner role is assigned
- Permission checks are enforced in at least one protected route
- Production build rejects missing/insecure secrets

### Phase 2: Provider Layer

Deliver:

- Provider CRUD UI/API
- Encrypted API keys
- OpenAI-compatible adapter
- Dragonfly adapter
- Vercel AI Gateway adapter
- Provider connection test
- Model registry and manual model creation
- Provider/model permissions

Acceptance criteria:

- Workspace admin can add provider
- Secrets are encrypted
- Provider test call works
- Dragonfly streaming works with custom parser
- Non-admin cannot view or mutate provider secrets

### Phase 3: Agents and Chat

Deliver:

- Agent CRUD
- Agent versioning
- Agent builder UI
- Provider/model assignment
- Streaming chat route
- Streamdown chat UI
- Conversation/message persistence
- Usage tracking

Acceptance criteria:

- User can create an agent
- User can chat with agent
- Messages stream and persist
- Agent config update creates new version
- Old conversation remains linked to original agent version

### Phase 4: Tools

Deliver:

- Built-in tool registry
- Tool bindings per agent version
- Tool invocation logging
- Tool risk levels
- Approval flow for dangerous tools
- Tool result UI rendering

Acceptance criteria:

- Agent can use safe built-in tool
- Dangerous tool pauses for approval
- Tool input/output is logged securely
- User without permission cannot execute restricted tool

### Phase 5: MCP

Deliver:

- MCP server registry
- MCP connection test
- Tool discovery
- MCP tool allowlist per agent
- MCP execution through unified tool layer
- MCP health monitoring

Acceptance criteria:

- Admin can add MCP server
- Tools are discovered and displayed
- Agent can execute allowlisted MCP tool
- Non-allowlisted MCP tool is unavailable
- All MCP executions are audited

### Phase 6: Knowledge / RAG

Deliver:

- Knowledge base CRUD
- File upload
- Text extraction
- Chunking
- Embeddings with pgvector
- Agent knowledge binding
- Citation rendering

Acceptance criteria:

- User can upload document
- Document is indexed asynchronously
- Agent can retrieve relevant chunks
- Response can cite source chunks

### Phase 7: Marketplace

Deliver:

- Marketplace item schema
- Publish agent as marketplace draft
- Review/publish flow
- Install marketplace item into workspace
- Fork/customize installed agent
- Permission/capability prompt

Acceptance criteria:

- Publisher can submit agent
- Reviewer can approve it
- Workspace admin can install it
- Installed agent is a local copy
- Marketplace updates do not mutate installed copy

### Phase 8: Production Hardening

Deliver:

- Quotas
- Billing-ready usage records
- Audit log UI
- Langfuse/Sentry/OpenTelemetry integration
- Admin dashboard
- Backup/restore docs
- Security review checklist
- Deployment docs

Acceptance criteria:

- Admin can inspect usage/audit logs
- Quotas are enforced
- Errors are observable
- Deployment is documented
- Backup/restore path exists

---

## 21. Key Product Navigation

Workspace app areas:

```txt
Chat
Agents
Marketplace
Tools
MCP Servers
Knowledge
Providers
Members
Roles & Permissions
Usage
Audit Logs
Settings
Billing
```

Global admin areas:

```txt
Users
Organizations
Marketplace Moderation
System Providers
System Health
Usage Analytics
Feature Flags
```

---

## 22. Non-Negotiable Design Decisions

1. Workspaces are the security boundary.
2. Roles are permission bundles, not hardcoded authorization logic.
3. All access checks use `requirePermission`.
4. Agents are versioned.
5. Conversations reference agent versions.
6. Providers and MCP secrets are encrypted.
7. OpenAI-compatible APIs are first-class.
8. Dragonfly is first-class because it has provider-specific behavior.
9. Tools have risk levels and approval policies.
10. MCP tools are scoped and allowlisted.
11. Marketplace installs create local copies.
12. Every sensitive action is audited.
13. Production rejects insecure defaults.
14. Tests cover authorization, providers, tools, MCP, and marketplace flows.

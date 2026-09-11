# Organization distribution, personal chats and usage admission

Resources retain their owning project. Organization visibility makes supported
resources discoverable in every project of that organization. Platform admins
can distribute resources to explicit recipient organizations from Access.
Distribution grants read/use permissions only; provider credentials and editing
rights stay with the source. Sharing one model exposes provider metadata, but
never grants access to other models. Sharing a provider explicitly grants use
of its models. Assistant dependency grants are tracked by root so revoking one
share does not remove another root's grant. Reapply distribution after changing
an assistant's dependencies to distribute the new dependencies.

Recipient organization membership is checked on every access. Revocation takes
effect without waiting for a permission cache. API tokens retain their project
and permission ceilings. Existing same-project delegation constraints remain.

Authenticated users see their own and explicitly shared conversations regardless
of the selected project. Conversation ownership still controls mutations;
changing projects does not grant access to another user's history. Historical
project, assistant and version identifiers no longer cascade-delete personal
conversations. Continuing a conversation still requires current assistant access.
New conversations remember their authorized billing project separately from the
assistant's owning project. History can be read after that access is revoked.

Organizations can be created with no project. The organization directory lists
empty organizations and permits adding the first project later. Platform admins
can add an existing user without granting a project role. Team and project
assignments remain independently managed in Access.

Usage limits target a user, team or organization, optionally a provider/model,
for a UTC day or month. Matching rules are cumulative. Zero blocks use; empty
fields are unlimited. Counters start when a rule is created; they do not backfill
historical usage. Editing a cap preserves consumption; changing scope or period
requires a new rule. Each provider call, including tool-loop steps, reserves a
request, estimated tokens and known cost under ordered PostgreSQL row locks.
Completion settles reported usage once. Ambiguous errors retain the reservation
until the period ends; missing prices fail closed for cost caps. Multimodal
requests reserve the advertised context window; token caps fail closed when
that bound is unavailable. Limits are
admission estimates, not invoice reconciliation. Provider-reported usage remains
authoritative for settlement.

The language-model middleware covers chat, delegated agents, scheduled agent
execution, OpenAI/Anthropic proxy execution, workflow assistant calls, custom-tool
builder calls and chat title/suggestion generation. Administrative connection
tests and non-language-model ingestion/image pipelines have separate existing
controls; these new language-model caps do not yet account for those operations.

Migrations 0060 and 0061 add distribution, limit ledgers and billing context and
remove the historical conversation cascade constraints. They do not copy or
reassign existing resources or conversations.

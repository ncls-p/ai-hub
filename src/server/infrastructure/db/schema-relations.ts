import { relations } from "drizzle-orm";
import * as schema from "./schema-tables";

const {
  accounts,
  agentKnowledgeBindings,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  agentVersions,
  agents,
  aiProviders,
  conversationFolders,
  conversations,
  knowledgeBases,
  mcpServers,
  messageParts,
  messages,
  organizations,
  sessions,
  userAgentPreferences,
  users,
  workspaceMembers,
  workspaces,
} = schema;

// ─── Relations ─────────────────────────────────────────────────────────

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  workspaceMembers: many(workspaceMembers),
  agentPreferences: many(userAgentPreferences),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const workspaceRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [workspaces.createdById],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  agents: many(agents),
  agentPreferences: many(userAgentPreferences),
  conversationFolders: many(conversationFolders),
  providers: many(aiProviders),
  mcpServers: many(mcpServers),
  knowledgeBases: many(knowledgeBases),
  skills: many(agentSkills),
}));

export const agentRelations = relations(agents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [agents.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [agents.createdById],
    references: [users.id],
  }),
  activeVersion: one(agentVersions, {
    fields: [agents.activeVersionId],
    references: [agentVersions.id],
  }),
  versions: many(agentVersions),
  userPreferences: many(userAgentPreferences),
}));

export const userAgentPreferenceRelations = relations(
  userAgentPreferences,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [userAgentPreferences.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [userAgentPreferences.userId],
      references: [users.id],
    }),
    defaultAgent: one(agents, {
      fields: [userAgentPreferences.defaultAgentId],
      references: [agents.id],
    }),
  }),
);

export const agentVersionRelations = relations(
  agentVersions,
  ({ one, many }) => ({
    agent: one(agents, {
      fields: [agentVersions.agentId],
      references: [agents.id],
    }),
    creator: one(users, {
      fields: [agentVersions.createdById],
      references: [users.id],
    }),
    toolBindings: many(agentToolBindings),
    knowledgeBindings: many(agentKnowledgeBindings),
    skillBindings: many(agentSkillBindings),
  }),
);

export const conversationFolderRelations = relations(
  conversationFolders,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [conversationFolders.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [conversationFolders.userId],
      references: [users.id],
    }),
    conversations: many(conversations),
  }),
);

export const conversationRelations = relations(
  conversations,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [conversations.workspaceId],
      references: [workspaces.id],
    }),
    agent: one(agents, {
      fields: [conversations.agentId],
      references: [agents.id],
    }),
    agentVersion: one(agentVersions, {
      fields: [conversations.agentVersionId],
      references: [agentVersions.id],
    }),
    user: one(users, {
      fields: [conversations.userId],
      references: [users.id],
    }),
    folder: one(conversationFolders, {
      fields: [conversations.folderId],
      references: [conversationFolders.id],
    }),
    messages: many(messages),
  }),
);

export const messageRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  parts: many(messageParts),
}));

export const agentSkillRelations = relations(agentSkills, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [agentSkills.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [agentSkills.createdById],
    references: [users.id],
  }),
  bindings: many(agentSkillBindings),
}));

export const agentSkillBindingRelations = relations(
  agentSkillBindings,
  ({ one }) => ({
    agentVersion: one(agentVersions, {
      fields: [agentSkillBindings.agentVersionId],
      references: [agentVersions.id],
    }),
    skill: one(agentSkills, {
      fields: [agentSkillBindings.skillId],
      references: [agentSkills.id],
    }),
  }),
);

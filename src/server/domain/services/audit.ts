import { db } from "@/server/infrastructure/db";
import { auditEvents } from "@/server/infrastructure/db/schema";
import { logHandledError } from "@/lib/logger";

export interface AuditEventInput {
  organizationId?: string;
  workspaceId?: string;
  actorPrincipalType?: string;
  actorPrincipalId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  outcome: "success" | "denied" | "failed";
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export const audit = {
  async emit(event: AuditEventInput): Promise<void> {
    try {
      await db.insert(auditEvents).values({
        organizationId: event.organizationId || null,
        workspaceId: event.workspaceId || null,
        actorPrincipalType: event.actorPrincipalType || null,
        actorPrincipalId: event.actorPrincipalId || null,
        action: event.action,
        resourceType: event.resourceType || null,
        resourceId: event.resourceId || null,
        outcome: event.outcome,
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent || null,
        metadataJson: event.metadata || null,
      });
    } catch (error) {
      logHandledError("Failed to write audit event", {
        action: event.action,
        error: (error as Error).message,
      });
      return;
    }
  },
};

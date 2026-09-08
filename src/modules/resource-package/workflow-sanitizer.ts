import { isMarketplaceSecretKey } from "@/modules/marketplace/manifest-sanitizer";
import { sanitizePortableConnection } from "@/modules/marketplace/portable-connection";
import {
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/modules/workflows/contracts";

const secretReference = /__WORKFLOW_SECRET:[0-9a-f-]+:[a-z][a-z0-9_]*__/gi;

/** Preserve executable structure and non-secret headers without transporting
 * credentials or references to another workflow's encrypted input history. */
export function sanitizeWorkflowDefinition(definition: WorkflowDefinition) {
  let requiresCredentials = false;
  function sanitize(value: unknown): unknown {
    if (typeof value === "string") {
      return value
        .replace(secretReference, () => {
          requiresCredentials = true;
          return "[CONFIGURE_CREDENTIAL]";
        })
        .replace(/https?:\/\/[^\s"'<>]+/g, (url) => {
          const result = sanitizePortableConnection({ url });
          requiresCredentials ||= result.redacted;
          return result.url ?? url;
        });
    }
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) => {
        // Headers can contain useful content types as well as authorization.
        if (key.toLowerCase() !== "headers" && isMarketplaceSecretKey(key)) {
          requiresCredentials = true;
          return [];
        }
        return [[key, sanitize(child)]];
      }),
    );
  }
  return {
    definition: workflowDefinitionSchema.parse(sanitize(definition)),
    requiresCredentials,
  };
}

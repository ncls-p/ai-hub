import {
  sanitizeManifestJsonSchema,
  isManifestJsonSchemaKey,
} from "./manifest-json-schema";
import { sanitizePortableConnection } from "./portable-connection";
import type { MarketplaceManifest } from "./manifest-types";

const BLOCKED_MANIFEST_KEYS = new Set([
  "encryptedcredentialrefs",
  "encryptedheadersjson",
  "encryptedenvjson",
  "encryptedpayload",
  "secretsincluded",
  "credentialrefs",
  "credentialvalues",
  "headers",
  "headersjson",
  "env",
  "envjson",
]);

const SECRET_KEY_PATTERN =
  /(?:^|[_-])(api[_-]?key|access[_-]?key|private[_-]?key|secret|token|password|authorization|cookie)(?:$|[_-])/i;

function normalizedKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isMarketplaceSecretKey(key: string) {
  const normalized = normalizedKey(key);
  return (
    BLOCKED_MANIFEST_KEYS.has(normalized) ||
    SECRET_KEY_PATTERN.test(key) ||
    /(apikey|accesskey|privatekey|clientsecret|secret|accesstoken|refreshtoken|authtoken|token|password|authorization|cookie)$/i.test(
      normalized,
    )
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isMarketplaceSecretKey(key)) continue;
    sanitized[key] = isManifestJsonSchemaKey(key)
      ? sanitizeManifestJsonSchema(child)
      : sanitizeValue(child);
  }
  if (typeof sanitized.transport === "string") {
    const connection = sanitizePortableConnection({
      url: typeof sanitized.url === "string" ? sanitized.url : undefined,
      args:
        Array.isArray(sanitized.args) &&
        sanitized.args.every((arg) => typeof arg === "string")
          ? sanitized.args
          : undefined,
    });
    if (connection.url !== undefined) sanitized.url = connection.url;
    if (connection.args !== undefined) sanitized.args = connection.args;
    if (connection.redacted) sanitized.requiresCredentials = true;
  }
  if (typeof sanitized.n8nWorkflowUrl === "string") {
    const connection = sanitizePortableConnection({
      url: sanitized.n8nWorkflowUrl,
    });
    sanitized.n8nWorkflowUrl = connection.url;
    if (connection.redacted) sanitized.requiresCredentials = true;
  }
  return sanitized;
}

/**
 * Marketplace packages are portable configuration only. Credential values,
 * including encrypted values, must never cross a workspace boundary.
 */
export function sanitizeMarketplaceManifest(
  manifest: unknown,
): MarketplaceManifest {
  return sanitizeValue(manifest) as MarketplaceManifest;
}

export function containsMarketplaceSecretMaterial(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some(containsMarketplaceSecretMaterial);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value).some(
    ([key, child]) =>
      isMarketplaceSecretKey(key) ||
      (isManifestJsonSchemaKey(key)
        ? JSON.stringify(child) !==
          JSON.stringify(sanitizeManifestJsonSchema(child))
        : containsMarketplaceSecretMaterial(child)),
  );
}

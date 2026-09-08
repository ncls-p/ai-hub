import { isMarketplaceSecretKey } from "./manifest-sanitizer";

const SAMPLE_KEYS = new Set([
  "default",
  "const",
  "enum",
  "example",
  "examples",
]);
const SCHEMA_MAPS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);

/** Keep schema property names (e.g. password), but never carry their sample credentials. */
export function sanitizeManifestJsonSchema(
  value: unknown,
  sensitive = false,
): unknown {
  if (Array.isArray(value))
    return value.map((child) => sanitizeManifestJsonSchema(child, sensitive));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (sensitive && SAMPLE_KEYS.has(key)) continue;
    if (
      SCHEMA_MAPS.has(key) &&
      child &&
      typeof child === "object" &&
      !Array.isArray(child)
    ) {
      result[key] = Object.fromEntries(
        Object.entries(child).map(([name, schema]) => [
          name,
          sanitizeManifestJsonSchema(
            schema,
            sensitive || isMarketplaceSecretKey(name),
          ),
        ]),
      );
    } else result[key] = sanitizeManifestJsonSchema(child, sensitive);
  }
  return result;
}

export function isManifestJsonSchemaKey(key: string) {
  return key === "inputSchema" || key === "outputSchema" || key === "schema";
}

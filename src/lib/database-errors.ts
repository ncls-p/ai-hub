export function isUniqueConstraintError(error: unknown): boolean {
  const visited = new Set<object>();
  let current = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

import { isMarketplaceSecretKey } from "./manifest-sanitizer";

/** Connection secrets may live in URLs and CLI arguments as well as headers. */
export function sanitizePortableConnection(input: {
  url?: string;
  args?: string[];
}): { url: string | undefined; args: string[] | undefined; redacted: boolean } {
  let redacted = false;
  let url = input.url;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) {
        parsed.username = "";
        parsed.password = "";
        redacted = true;
      }
      for (const key of [...parsed.searchParams.keys()]) {
        if (isMarketplaceSecretKey(key)) {
          parsed.searchParams.delete(key);
          redacted = true;
        }
      }
      if (redacted) url = parsed.toString();
    } catch {
      /* Existing invalid endpoints are validated when configured. */
    }
  }
  let redactNext = false;
  const args = input.args?.map((arg) => {
    if (redactNext) {
      redactNext = false;
      redacted = true;
      return "[REDACTED]";
    }
    const match = /^(--?[^=\s]+)(?:=(.*))?$/.exec(arg);
    if (match && isMarketplaceSecretKey(match[1].replace(/^-+/, ""))) {
      redacted = true;
      if (match[2] !== undefined) return `${match[1]}=[REDACTED]`;
      redactNext = true;
      return arg;
    }
    const assignment = /^([^=:\s]+)(\s*[=:]\s*)(.*)$/.exec(arg);
    if (assignment && isMarketplaceSecretKey(assignment[1])) {
      redacted = true;
      return `${assignment[1]}${assignment[2]}[REDACTED]`;
    }
    // Endpoints also appear as positional arguments or --url=<endpoint>.
    const endpoint = arg.match(/^(.*?)(https?:\/\/\S+)$/);
    if (endpoint) {
      const sanitized = sanitizePortableConnection({ url: endpoint[2] });
      if (sanitized.redacted) {
        redacted = true;
        return `${endpoint[1]}${sanitized.url}`;
      }
    }
    return arg;
  });
  return { url, args, redacted };
}

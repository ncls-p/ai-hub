import { marked } from "marked";

/**
 * Convert markdown text to HTML using marked.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return "";
  return marked.parse(markdown, { async: false }) as string;
}

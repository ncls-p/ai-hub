import { describe, expect, it } from "vitest";
import { originalDocumentDisposition } from "@/modules/knowledge/document-metadata";

describe("original document rendering policy", () => {
  it.each(["application/pdf", "image/png", "image/jpeg", "text/plain"])(
    "permits native preview for %s but honors explicit download",
    (mimeType) => {
      expect(originalDocumentDisposition(mimeType, false)).toBe("inline");
      expect(originalDocumentDisposition(mimeType, true)).toBe("attachment");
    },
  );
  it.each([
    "text/html",
    "image/svg+xml",
    "application/javascript",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    null,
  ])("does not execute uploaded %s documents in the app origin", (mimeType) => {
    expect(originalDocumentDisposition(mimeType, false)).toBe("attachment");
  });
});

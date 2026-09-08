import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  getFileBytes: vi.fn(),
  requirePermission: vi.fn(),
  canRead: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
  requireWorkspacePermissionAsync: mocks.requirePermission,
  handleRoute: async (
    request: Request,
    handler: (context: {
      session: { user: { id: string } };
      request: Request;
    }) => Promise<Response>,
    options?: { expectedError?: (error: unknown) => Response | null },
  ) => {
    try {
      return await handler({
        session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
        request,
      });
    } catch (error) {
      return (
        options?.expectedError?.(error) ??
        Response.json({ error: "Internal server error" }, { status: 500 })
      );
    }
  },
}));

vi.mock("@/modules/code-workspace/storage", () => ({
  getCodeWorkspace: mocks.getWorkspace,
  getCodeWorkspaceFileBytes: mocks.getFileBytes,
}));

vi.mock("@/modules/chat/conversation-asset-access", () => ({
  canReadConversationAsset: mocks.canRead,
}));

import { GET } from "@/app/api/workspace/code-projects/[projectId]/preview/[[...path]]/route";

const projectId = "22222222-2222-4222-8222-222222222222";
const previewToken = "33333333-3333-4333-8333-333333333333";
const params = {
  params: Promise.resolve({
    projectId,
    path: [previewToken, "assets", "theme.mp3"],
  }),
};
const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

function request(range?: string) {
  return new NextRequest(
    `http://localhost/api/workspace/code-projects/${projectId}/preview/${previewToken}/assets/theme.mp3`,
    {
      headers: range ? { Range: range } : undefined,
    },
  );
}

async function responseBytes(response: Response) {
  return Array.from(new Uint8Array(await response.arrayBuffer()));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canRead.mockResolvedValue(true);
  mocks.getWorkspace.mockResolvedValue({
    id: projectId,
    workspaceId: "44444444-4444-4444-8444-444444444444",
    createdByUserId: "11111111-1111-4111-8111-111111111111",
    rootFile: "index.html",
    previewToken,
  });
  mocks.getFileBytes.mockResolvedValue({
    summary: { mimeType: "audio/mpeg" },
    bytes,
  });
});

describe("code workspace preview media responses", () => {
  it("serves complete binary assets with media headers", async () => {
    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(await responseBytes(response)).toEqual(Array.from(bytes));
  });

  it("serves explicit, open-ended, and suffix byte ranges", async () => {
    const explicit = await GET(request("bytes=2-5"), params);
    expect(explicit.status).toBe(206);
    expect(explicit.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(explicit.headers.get("content-length")).toBe("4");
    expect(await responseBytes(explicit)).toEqual([2, 3, 4, 5]);

    const openEnded = await GET(request("bytes=7-"), params);
    expect(openEnded.status).toBe(206);
    expect(openEnded.headers.get("content-range")).toBe("bytes 7-9/10");
    expect(await responseBytes(openEnded)).toEqual([7, 8, 9]);

    const suffix = await GET(request("bytes=-3"), params);
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe("bytes 7-9/10");
    expect(await responseBytes(suffix)).toEqual([7, 8, 9]);
  });

  it("rejects unsatisfiable and multipart ranges without returning bytes", async () => {
    for (const range of ["bytes=20-30", "bytes=5-2", "bytes=0-1,4-5"]) {
      const response = await GET(request(range), params);
      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */10");
      expect(response.headers.get("content-length")).toBe("0");
      expect(await responseBytes(response)).toEqual([]);
    }
  });
});

it("rechecks authorization even when a recipient retains the exact preview token", async () => {
  mocks.canRead.mockResolvedValue(false);
  const response = await GET(request(), params);
  expect(response.status).toBe(404);
  expect(mocks.getFileBytes).not.toHaveBeenCalled();
});

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  deleteCodeWorkspaceFile,
  getCodeWorkspace,
  listCodeWorkspaceFiles,
  readCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";

const paramsSchema = z.object({ projectId: z.uuid() });
const writeFileSchema = z.object({
  path: z.string().trim().min(1).max(260),
  content: z.string().max(1_000_000),
});
const deleteFileSchema = z.object({
  path: z.string().trim().min(1).max(260),
});

async function authorizeProject(projectId: string, userId: string) {
  const metadata = await getCodeWorkspace(projectId);
  if (metadata.createdByUserId !== userId) {
    return {
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  const forbidden = await requireWorkspacePermissionAsync(
    userId,
    metadata.workspaceId,
    "agents.chat",
  );
  if (forbidden) {
    return {
      response: forbidden,
    };
  }
  return { metadata };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = paramsSchema.safeParse(await params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const auth = await authorizeProject(
        parsed.data.projectId,
        session.user.id,
      );
      if (auth.response) return auth.response;
      const metadata = auth.metadata;
      if (!metadata) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const { searchParams } = new URL(req.url);
      const filePath = searchParams.get("path");
      if (!filePath) {
        return NextResponse.json(
          await listCodeWorkspaceFiles({
            projectId: metadata.id,
            workspaceId: metadata.workspaceId,
            userId: metadata.createdByUserId,
          }),
        );
      }
      return NextResponse.json(
        await readCodeWorkspaceFile({
          projectId: metadata.id,
          workspaceId: metadata.workspaceId,
          userId: metadata.createdByUserId,
          filePath,
        }),
      );
    },
    {
      logLabel: "Failed to read code workspace file",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/not found|path|binary/i.test(message)) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = writeFileSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const auth = await authorizeProject(
        parsedParams.data.projectId,
        session.user.id,
      );
      if (auth.response) return auth.response;
      const metadata = auth.metadata;
      if (!metadata) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        await writeCodeWorkspaceFile({
          projectId: metadata.id,
          workspaceId: metadata.workspaceId,
          userId: metadata.createdByUserId,
          filePath: parsedBody.data.path,
          content: parsedBody.data.content,
        }),
      );
    },
    {
      logLabel: "Failed to write code workspace file",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/file|path|too large|unsupported|workspace/i.test(message)) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = deleteFileSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const auth = await authorizeProject(
        parsedParams.data.projectId,
        session.user.id,
      );
      if (auth.response) return auth.response;
      const metadata = auth.metadata;
      if (!metadata) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        await deleteCodeWorkspaceFile({
          projectId: metadata.id,
          workspaceId: metadata.workspaceId,
          userId: metadata.createdByUserId,
          filePath: parsedBody.data.path,
        }),
      );
    },
    {
      logLabel: "Failed to delete code workspace file",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/file|path|workspace/i.test(message)) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}

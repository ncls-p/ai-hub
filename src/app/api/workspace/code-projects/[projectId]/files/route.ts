import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  deleteCodeWorkspaceFile,
  getCodeWorkspace,
  listCodeWorkspaceFiles,
  readCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({ projectId: z.uuid() });
const writeFileSchema = z.object({
  path: z.string().trim().min(1).max(260),
  content: z.string().max(1_000_000),
});
const deleteFileSchema = z.object({
  path: z.string().trim().min(1).max(260),
});

async function authorizeProject(projectId: string) {
  const session = await getSession();
  if (!session)
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

  const metadata = await getCodeWorkspace(projectId);
  if (metadata.createdByUserId !== session.user.id) {
    return {
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  const permission = await authorization.requirePermission(
    { principalType: "user", principalId: session.user.id },
    "agents.chat",
    "workspace",
    metadata.workspaceId,
  );
  if (!permission.granted) {
    return {
      response: NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      ),
    };
  }
  return { metadata, session };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const auth = await authorizeProject(parsed.data.projectId);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|path|binary/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logHandledError("Failed to read code workspace file", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    const parsedBody = writeFileSchema.safeParse(await req.json());
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const auth = await authorizeProject(parsedParams.data.projectId);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/file|path|too large|unsupported|workspace/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logHandledError("Failed to write code workspace file", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    const parsedBody = deleteFileSchema.safeParse(await req.json());
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const auth = await authorizeProject(parsedParams.data.projectId);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/file|path|workspace/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logHandledError("Failed to delete code workspace file", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { exportResourcePackage } from "@/modules/resource-package/export";
import { importResourcePackage } from "@/modules/resource-package/import";
import {
  MAX_PACKAGE_BYTES,
  ResourcePackageError,
} from "@/modules/resource-package/schema";

const exportSchema = z.object({
  workspaceId: z.uuid(),
  resourceId: z.uuid(),
  resourceType: z.enum([
    "agent",
    "skill",
    "custom_tool",
    "mcp_server",
    "mcp_tool",
    "marketplace_item",
  ]),
});
const importSchema = z.object({
  workspaceId: z.uuid(),
  preview: z.enum(["true", "false"]).default("false"),
});
function expectedError(error: unknown) {
  if (error instanceof ResourcePackageError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  return null;
}

async function readPackageJson(req: NextRequest) {
  const reader = req.body?.getReader();
  if (!reader) throw new ResourcePackageError("Missing JSON package");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PACKAGE_BYTES) {
        await reader.cancel();
        throw new ResourcePackageError(
          "The resource package exceeds 10 MB",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = exportSchema.safeParse(
        Object.fromEntries(req.nextUrl.searchParams),
      );
      if (!parsed.success)
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const resourcePackage = await exportResourcePackage({
        ...parsed.data,
        userId: session.user.id,
      });
      const filename =
        resourcePackage.manifest.name
          .replace(/[^a-z0-9._-]+/gi, "-")
          .slice(0, 100) || "resource";
      return new Response(JSON.stringify(resourcePackage, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.maiah.json"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
    { logLabel: "Failed to export resource package", expectedError },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = importSchema.safeParse(
        Object.fromEntries(req.nextUrl.searchParams),
      );
      if (!parsed.success)
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const result = await importResourcePackage({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        package: await readPackageJson(req),
        preview: parsed.data.preview === "true",
      });
      return NextResponse.json(result, {
        status: parsed.data.preview === "true" ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      });
    },
    { logLabel: "Failed to import resource package", expectedError },
  );
}

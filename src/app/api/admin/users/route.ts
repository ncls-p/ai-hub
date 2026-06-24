import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
  createAdminManagedUser,
  listAdminUsers,
} from "@/modules/admin/use-cases";
import { ensurePrimaryWorkspaceForUser } from "@/modules/workspace/use-cases";

const createUserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.email(),
  password: z.string().min(8).max(128),
  role: z.enum(["user", "admin"]).default("user"),
});

export async function GET() {
  try {
    const auth = await requireAdminApiSession();
    if (!auth.ok) return auth.response;

    return NextResponse.json({ users: await listAdminUsers() });
  } catch (error) {
    logHandledError("Failed to list users", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApiSession();
    if (!auth.ok) return auth.response;

    const parsed = createUserSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const user = await createAdminManagedUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      role: parsed.data.role,
      headers: req.headers,
    });

    await ensurePrimaryWorkspaceForUser({
      userId: user.id,
      role: parsed.data.role,
      invitedBy: auth.session.user.id,
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    logHandledError("Failed to create user", {}, error as Error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

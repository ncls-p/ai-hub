import { auth } from "@/lib/auth";
import {
  ensureBootstrapAdmin,
  getRegistrationSetting,
} from "@/modules/admin/use-cases";
import { toNextJsHandler } from "better-auth/next-js";

const authHandlers = toNextJsHandler(auth.handler);

export const GET = authHandlers.GET;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ all: string[] }> },
) {
  const route = (await params).all.join("/");

  if (route === "sign-up/email") {
    const settings = await getRegistrationSetting();
    if (!settings.canPublicSignUp) {
      return Response.json(
        {
          message:
            "Registration is closed. Ask an admin to create your account.",
        },
        { status: 403 },
      );
    }
  }

  const response = await authHandlers.POST(req);

  if (route === "sign-up/email" && response.ok) {
    await ensureBootstrapAdmin();
  }

  return response;
}

import { NextRequest, NextResponse } from "next/server";

import { handleRoute } from "@/lib/route-handler";
import {
  isOnboardingComplete,
  markOnboardingComplete,
} from "@/modules/onboarding/use-cases";

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const completed = await isOnboardingComplete(session.user.id);
      return NextResponse.json({ completed });
    },
    { logLabel: "Failed to read onboarding state" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      await markOnboardingComplete(session.user.id);
      return NextResponse.json({ completed: true });
    },
    { logLabel: "Failed to mark onboarding complete" },
  );
}

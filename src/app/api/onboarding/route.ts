import { NextResponse } from "next/server";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  isOnboardingComplete,
  markOnboardingComplete,
} from "@/modules/onboarding/use-cases";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const completed = await isOnboardingComplete(session.user.id);
    return NextResponse.json({ completed });
  } catch (error) {
    logHandledError("Failed to read onboarding state", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await markOnboardingComplete(session.user.id);
    return NextResponse.json({ completed: true });
  } catch (error) {
    logHandledError("Failed to mark onboarding complete", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

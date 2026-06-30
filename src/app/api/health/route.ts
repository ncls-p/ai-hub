import { NextResponse } from "next/server";
import { db } from "@/server/infrastructure/db";

export async function GET() {
  const result: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
  };

  try {
    await db.$client.query("SELECT 1");
    result.database = "connected";
  } catch {
    result.status = "degraded";
    result.database = "disconnected";
  }

  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 503,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
  getOrganizationBranding,
  ORGANIZATION_THEMES,
  updateOrganizationBranding,
} from "@/modules/organization/branding";
import { THEME_TOKEN_KEYS } from "@/modules/organization/themes";
import { ORGANIZATION_HERO_LOCALES } from "@/modules/organization/hero-branding";

const querySchema = z
  .object({
    workspaceId: z.uuid().optional(),
    organizationId: z.uuid().optional(),
  })
  .refine(
    (value) => Boolean(value.workspaceId) !== Boolean(value.organizationId),
  );
const paletteSchema = z.record(
  z.enum(THEME_TOKEN_KEYS),
  z.string().regex(/^#[0-9a-fA-F]{6}$/),
);
const themeConfigSchema = z.strictObject({
  light: paletteSchema,
  dark: paletteSchema,
});
const heroCopySchema = z.strictObject({
  kicker: z.string().trim().min(1).max(80),
  lineOne: z.string().trim().min(1).max(100),
  lineTwoPrefix: z.string().trim().min(1).max(60),
  accent: z.string().trim().min(1).max(60),
  lineTwoSuffix: z.string().trim().min(1).max(100),
});
const heroConfigSchema = z.object(
  Object.fromEntries(
    ORGANIZATION_HERO_LOCALES.map((locale) => [locale, heroCopySchema]),
  ) as Record<
    (typeof ORGANIZATION_HERO_LOCALES)[number],
    typeof heroCopySchema
  >,
);
const updateSchema = z
  .strictObject({
    workspaceId: z.uuid().optional(),
    organizationId: z.uuid().optional(),
    theme: z.enum(ORGANIZATION_THEMES),
    themeConfig: themeConfigSchema.nullable().optional().default(null),
    heroConfig: heroConfigSchema.nullable().optional().default(null),
    logoUrl: z.union([
      z
        .string()
        .max(360_000)
        .regex(/^data:image\/(png|jpeg|webp|gif|avif);base64,/),
      z.null(),
    ]),
  })
  .refine(
    (input) => Boolean(input.workspaceId) !== Boolean(input.organizationId),
    { message: "Select one organization or project" },
  )
  .refine((input) => input.theme !== "custom" || input.themeConfig !== null, {
    message: "A custom theme requires light and dark palettes",
    path: ["themeConfig"],
  });

export async function GET(request: NextRequest) {
  return handleRoute(
    request,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId:
          request.nextUrl.searchParams.get("workspaceId") ?? undefined,
        organizationId:
          request.nextUrl.searchParams.get("organizationId") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      const branding = await getOrganizationBranding({
        ...parsed.data,
        userId: session.user.id,
      });
      return branding
        ? NextResponse.json(branding)
        : NextResponse.json({ error: "Not found" }, { status: 404 });
    },
    { allowApiKey: false, logLabel: "Failed to load organization branding" },
  );
}

export async function PUT(request: NextRequest) {
  return handleRoute(
    request,
    async ({ session }) => {
      const parsed = updateSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const result = await updateOrganizationBranding({
        ...parsed.data,
        userId: session.user.id,
      });
      if (result.status === "forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (result.status === "not_found") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({
        logoUrl: result.organization.logoUrl,
        theme: result.organization.theme,
        themeConfig: result.organization.themeConfigJson,
        heroConfig: result.organization.heroConfigJson,
      });
    },
    { allowApiKey: false, logLabel: "Failed to update organization branding" },
  );
}

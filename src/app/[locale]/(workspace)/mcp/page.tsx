import { redirect } from "@/i18n/navigation";

export default async function McpRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const tab = typeof query.tab === "string" ? query.tab : "mcp";
  redirect({
    href: `/tools?tab=${tab === "mcp" ? "mcp" : "mcp"}`,
    locale,
  });
}

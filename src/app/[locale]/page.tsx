import { redirect } from "@/i18n/navigation";

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/chat", locale });
}

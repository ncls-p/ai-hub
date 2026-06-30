import { redirect } from "next/navigation";

import { defaultLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  redirect(`/${defaultLocale}/chat`);
}

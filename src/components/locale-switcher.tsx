"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { locales, type Locale } from "@/i18n/routing";

export function LocaleSwitcher({ className }: { className?: string }) {
	const t = useTranslations("common");
	const locale = useLocale() as Locale;
	const router = useRouter();
	const pathname = usePathname();

	function onChange(nextLocale: string) {
		router.replace(pathname, { locale: nextLocale as Locale });
	}

	return (
		<Select value={locale} onValueChange={onChange}>
			<SelectTrigger className={className} aria-label={t("language")}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{locales.map((code) => (
					<SelectItem key={code} value={code}>
						{code === "fr" ? t("french") : t("english")}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

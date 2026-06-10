"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({
	className,
	compact = false,
}: {
	className?: string;
	compact?: boolean;
}) {
	const t = useTranslations("common");
	const locale = useLocale() as Locale;
	const router = useRouter();
	const pathname = usePathname();

	function switchLocale(code: Locale) {
		if (code !== locale) {
			router.replace(pathname, { locale: code });
		}
	}

	if (compact) {
		const nextLocale = locales.find((code) => code !== locale) ?? locale;
		return (
			<Button
				type="button"
				variant="outline"
				size="icon"
				className={cn("size-9 shrink-0 rounded-lg font-semibold uppercase", className)}
				aria-label={t("language")}
				title={locale === "fr" ? t("french") : t("english")}
				onClick={() => switchLocale(nextLocale)}
			>
				{locale}
			</Button>
		);
	}

	return (
		<div
			role="group"
			aria-label={t("language")}
			className={cn(
				"relative z-30 flex h-9 w-full overflow-hidden rounded-lg border border-input bg-background/65 shadow-[inset_0_1px_0_0_color-mix(in_oklch,white_38%,transparent)]",
				className,
			)}
		>
			{locales.map((code) => (
				<button
					key={code}
					type="button"
					aria-pressed={locale === code}
					aria-label={code === "fr" ? t("french") : t("english")}
					title={code === "fr" ? t("french") : t("english")}
					className={cn(
						"flex flex-1 items-center justify-center text-xs font-semibold uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
						locale === code
							? "bg-primary text-primary-foreground"
							: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
					)}
					onClick={() => switchLocale(code)}
				>
					{code}
				</button>
			))}
		</div>
	);
}

"use client";

import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/locale-switcher";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export function SettingsLocaleCard() {
	const t = useTranslations("common");
	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("language")}</CardTitle>
				<CardDescription>{t("language")}</CardDescription>
			</CardHeader>
			<CardContent>
				<LocaleSwitcher className="w-full max-w-xs" />
			</CardContent>
		</Card>
	);
}

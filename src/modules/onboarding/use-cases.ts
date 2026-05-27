import { eq } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import { appSettings } from "@/server/infrastructure/db/schema";

function onboardingKey(userId: string) {
	return `onboarding.complete:${userId}`;
}

export async function isOnboardingComplete(userId: string) {
	const [setting] = await db
		.select({ valueJson: appSettings.valueJson })
		.from(appSettings)
		.where(eq(appSettings.key, onboardingKey(userId)))
		.limit(1);

	return (
		setting?.valueJson &&
		typeof setting.valueJson === "object" &&
		setting.valueJson !== null &&
		"completed" in setting.valueJson &&
		setting.valueJson.completed === true
	);
}

export async function markOnboardingComplete(userId: string) {
	await db
		.insert(appSettings)
		.values({
			key: onboardingKey(userId),
			valueJson: { completed: true, completedAt: new Date().toISOString() },
			updatedById: userId,
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: {
				valueJson: { completed: true, completedAt: new Date().toISOString() },
				updatedById: userId,
				updatedAt: new Date(),
			},
		});
}

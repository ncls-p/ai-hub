import { describe, expect, it } from "vitest";
import {
	normalizeTaskInput,
	computeNextRunAt,
} from "@/modules/scheduled-tasks/use-cases";

const TEST_TZ = "UTC";

describe("scheduled-tasks – computeNextRunAt", () => {
	it("computes next run for interval frequency", () => {
		const from = new Date("2025-01-01T12:00:00Z");
		const result = computeNextRunAt({
			frequency: "interval",
			intervalMinutes: 60,
			from,
		});
		expect(result.getTime()).toBe(new Date("2025-01-01T13:00:00Z").getTime());
	});

	it("computes next run for daily frequency – same day if future", () => {
		const from = new Date("2025-01-01T00:00:00Z");
		const result = computeNextRunAt({
			frequency: "daily",
			timeOfDay: "12:00",
			timezone: TEST_TZ,
			from,
		});
		expect(result.getUTCHours()).toBe(12);
		expect(result.getUTCDate()).toBe(1);
	});

	it("computes next run for daily frequency – next day if past", () => {
		const from = new Date("2025-01-01T23:00:00Z");
		const result = computeNextRunAt({
			frequency: "daily",
			timeOfDay: "06:00",
			timezone: TEST_TZ,
			from,
		});
		expect(result.getUTCDate()).toBe(2);
		expect(result.getUTCHours()).toBe(6);
	});

	it("computes next run with no explicit from date", () => {
		const result = computeNextRunAt({
			frequency: "interval",
			intervalMinutes: 30,
		});
		expect(result.getTime()).toBeGreaterThan(Date.now());
	});

	it("throws on invalid time format", () => {
		expect(() =>
			computeNextRunAt({
				frequency: "daily",
				timeOfDay: "25:00",
				timezone: TEST_TZ,
			}),
		).toThrow("timeOfDay is invalid");
	});
});

describe("scheduled-tasks – normalizeTaskInput", () => {
	it("normalizes daily task", () => {
		const result = normalizeTaskInput({
			workspaceId: "ws",
			userId: "u",
			agentId: "a",
			title: "  Daily task  ",
			prompt: "  Do something  ",
			frequency: "daily",
			timeOfDay: "08:00",
		});
		expect(result.title).toBe("Daily task");
		expect(result.prompt).toBe("Do something");
		expect(result.timezone).toBe("UTC");
		expect(result.intervalMinutes).toBeNull();
	});

	it("normalizes interval task", () => {
		const result = normalizeTaskInput({
			workspaceId: "ws",
			userId: "u",
			agentId: "a",
			title: "Interval task",
			prompt: "Do something",
			frequency: "interval",
			intervalMinutes: 30,
		});
		expect(result.intervalMinutes).toBe(30);
		expect(result.timeOfDay).toBeNull();
	});

	it("defaults intervalMinutes to 0 and throws if below 5", () => {
		expect(() =>
			normalizeTaskInput({
				workspaceId: "ws",
				userId: "u",
				agentId: "a",
				title: "Title",
				prompt: "Do",
				frequency: "interval",
			}),
		).toThrow("intervalMinutes must be at least 5");
	});

	it("throws on empty title", () => {
		expect(() =>
			normalizeTaskInput({
				workspaceId: "ws",
				userId: "u",
				agentId: "a",
				title: "  ",
				prompt: "Do",
				frequency: "daily",
				timeOfDay: "08:00",
			}),
		).toThrow("Title is required");
	});

	it("throws on empty prompt", () => {
		expect(() =>
			normalizeTaskInput({
				workspaceId: "ws",
				userId: "u",
				agentId: "a",
				title: "Title",
				prompt: "  ",
				frequency: "daily",
				timeOfDay: "08:00",
			}),
		).toThrow("Prompt is required");
	});

	it("throws on invalid timeOfDay", () => {
		expect(() =>
			normalizeTaskInput({
				workspaceId: "ws",
				userId: "u",
				agentId: "a",
				title: "Title",
				prompt: "Do",
				frequency: "daily",
				timeOfDay: "25:00",
			}),
		).toThrow("timeOfDay is invalid");
	});

	it("throws on timeOfDay with invalid minutes", () => {
		expect(() =>
			normalizeTaskInput({
				workspaceId: "ws",
				userId: "u",
				agentId: "a",
				title: "Title",
				prompt: "Do",
				frequency: "daily",
				timeOfDay: "12:60",
			}),
		).toThrow("timeOfDay is invalid");
	});

	it("accepts explicit timezone", () => {
		const result = normalizeTaskInput({
			workspaceId: "ws",
			userId: "u",
			agentId: "a",
			title: "Title",
			prompt: "Do",
			frequency: "daily",
			timeOfDay: "08:00",
			timezone: "America/New_York",
		});
		expect(result.timezone).toBe("America/New_York");
	});
});

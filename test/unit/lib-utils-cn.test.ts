import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn utility", () => {
	it("merges class strings", () => {
		expect(cn("font-bold", "text-red-500")).toBe("font-bold text-red-500");
	});

	it("resolves conflicts with tailwind-merge", () => {
		expect(cn("text-sm", "text-lg")).toBe("text-lg");
	});

	it("handles arrays", () => {
		expect(cn(["px-4", "py-2"])).toBe("px-4 py-2");
	});

	it("handles conditional classes", () => {
		expect(cn("base", true && "show", false && "hide")).toBe("base show");
	});

	it("handles null/undefined/empty", () => {
		// cn handles falsy values by ignoring them
		expect(cn(null, undefined, "")).toBe("");
	});

	it("handles object notation", () => {
		expect(cn({ active: true, inactive: false })).toBe("active");
	});

	it("handles mixed input – twMerge resolves conflicts", () => {
		// text-sm and text-lg conflict; text-lg wins
		expect(cn("bg-red", ["text-sm", "text-lg"], { bold: true }, null)).toBe(
			"bg-red text-lg bold",
		);
	});

	it("returns empty string for no inputs", () => {
		expect(cn()).toBe("");
	});
});

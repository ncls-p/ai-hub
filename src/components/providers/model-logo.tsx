import Image from "next/image";

import { cn } from "@/lib/utils";

const LOGO_SIZES = {
	sm: 24,
	md: 32,
	lg: 40,
} as const;

function initialsFromLabel(label: string) {
	const words = label
		.trim()
		.split(/[\s/_:-]+/)
		.filter(Boolean);
	if (words.length === 0) return "AI";
	return words
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase())
		.join("");
}

export function ModelLogo({
	logoUrl,
	label,
	size = "md",
	className,
}: {
	logoUrl?: string | null;
	label: string;
	size?: keyof typeof LOGO_SIZES;
	className?: string;
}) {
	const dimension = LOGO_SIZES[size];

	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background text-[0.62rem] font-semibold text-muted-foreground",
				className,
			)}
			style={{ width: dimension, height: dimension }}
		>
			{logoUrl ? (
				<Image
					src={logoUrl}
					alt={`${label} logo`}
					width={dimension}
					height={dimension}
					unoptimized
					className="h-full w-full object-contain p-1"
				/>
			) : (
				<span aria-hidden="true">{initialsFromLabel(label)}</span>
			)}
		</span>
	);
}

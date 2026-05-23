import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface DeodisLogoProps {
	className?: string;
	href?: string;
	priority?: boolean;
}

export function DeodisLogo({
	className,
	href = "/",
	priority = false,
}: DeodisLogoProps) {
	const image = (
		<Image
			src="/deodis-logo.png"
			alt="Deodis"
			width={857}
			height={320}
			priority={priority}
			className={cn("h-8 w-auto sm:h-9", className)}
		/>
	);

	if (!href) {
		return image;
	}

	return (
		<Link href={href} className="inline-flex shrink-0 items-center">
			{image}
		</Link>
	);
}

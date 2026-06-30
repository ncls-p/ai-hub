import Image from "next/image";
import { Link } from "@/i18n/navigation";

import { cn } from "@/lib/utils";

interface DeodisLogoProps {
  className?: string;
  href?: string;
  priority?: boolean;
  label?: string;
}

export function DeodisLogo({
  className,
  href = "/",
  priority = false,
  label = "Deodis home",
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
    <Link
      href={href}
      className="inline-flex shrink-0 items-center"
      aria-label={label}
    >
      {image}
    </Link>
  );
}

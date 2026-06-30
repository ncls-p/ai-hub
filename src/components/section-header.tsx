import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  description,
  className,
  actions,
}: {
  title: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-balance text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-pretty text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

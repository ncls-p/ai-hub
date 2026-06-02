import { InfoIcon, SearchIcon, SlidersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

/* ─── Info Callout ────────────────────────────────────────────────── */

export function InfoCallout({
	title,
	children,
	icon: Icon = InfoIcon,
}: {
	title: string;
	children: React.ReactNode;
	icon?: typeof InfoIcon;
}) {
	return (
		<div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
			<Icon
				className="size-4 shrink-0 mt-0.5 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="flex-1 text-sm">
				<p className="font-medium">{title}</p>
				<p className="mt-1 text-muted-foreground leading-relaxed">{children}</p>
			</div>
		</div>
	);
}

/* ─── Setting Hint (tooltip) ──────────────────────────────────────── */

export function SettingHint({ text }: { text: string }) {
	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger asChild>
					<InfoIcon
						className="size-3.5 text-muted-foreground/50 cursor-help"
						aria-hidden="true"
					/>
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-xs text-xs">
					{text}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

/* ─── Stat Card ───────────────────────────────────────────────────── */

export function StatCard({
	icon: Icon,
	value,
	label,
}: {
	icon: typeof SlidersIcon;
	value: number | string;
	label: string;
}) {
	return (
		<div className="flex flex-col items-center rounded-xl bg-background/60 px-4 py-2.5 text-center shadow-sm">
			<Icon className="size-4 text-muted-foreground" aria-hidden="true" />
			<span className="mt-1 text-lg font-semibold">{value}</span>
			<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
				{label}
			</span>
		</div>
	);
}

/* ─── Toolbar (search + filter) ───────────────────────────────────── */

export function Toolbar({
	searchValue,
	onSearchChange,
	filterValue,
	onFilterChange,
	filterOptions,
	addButton,
}: {
	searchValue: string;
	onSearchChange: (v: string) => void;
	filterValue: string;
	onFilterChange: (v: string) => void;
	filterOptions: Array<{ value: string; label: string }>;
	addButton?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="relative flex-1 max-w-sm">
				<SearchIcon
					className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input
					placeholder="Search…"
					value={searchValue}
					onChange={(e) => onSearchChange(e.target.value)}
					className="pl-9"
				/>
			</div>
			<div className="flex items-center gap-2">
				<Select value={filterValue} onValueChange={onFilterChange}>
					<SelectTrigger className="w-[160px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{filterOptions.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{addButton}
			</div>
		</div>
	);
}

/* ─── Tab Badge ───────────────────────────────────────────────────── */

export function TabBadge({ count }: { count: number }) {
	if (count <= 0) return null;
	return (
		<Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
			{count}
		</Badge>
	);
}

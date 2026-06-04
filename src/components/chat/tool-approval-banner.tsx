"use client";

import { useState } from "react";
import {
	CheckCircle2,
	ChevronDownIcon,
	ChevronRightIcon,
	ShieldAlertIcon,
	XCircle,
} from "lucide-react";

import type { PendingToolApproval } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ToolApprovalBannerProps {
	approval: PendingToolApproval;
	onApprove: () => void;
	onReject: () => void;
}

export function summarizeToolInput(toolName: string, input: unknown) {
	if (!input || typeof input !== "object") {
		return `Run ${toolName}`;
	}

	const record = input as Record<string, unknown>;
	if (typeof record.url === "string") {
		return `Access URL ${record.url}`;
	}
	if (typeof record.query === "string") {
		return `Search for "${record.query}"`;
	}
	if (typeof record.path === "string") {
		return `Access path ${record.path}`;
	}
	if (typeof record.command === "string") {
		return `Run command: ${record.command}`;
	}

	const keys = Object.keys(record);
	if (keys.length === 1) {
		return `${toolName}: ${keys[0]} = ${String(record[keys[0]])}`;
	}

	return `Run ${toolName} with ${keys.length} parameters`;
}

function getRiskLevel(input: unknown): "low" | "medium" | "high" | null {
	if (!input || typeof input !== "object") return null;
	const record = input as Record<string, unknown>;

	// File writes, command execution, network requests are higher risk
	if (record.command || record.path || record.writeFile) return "high";
	if (record.url) return "medium";

	return "low";
}

function RiskIndicator({ level }: { level: string | null }) {
	if (!level || level === "low") return null;

	const config =
		level === "high"
			? {
					label: "High Risk",
					className:
						"bg-destructive/10 text-destructive ring-1 ring-destructive/20",
				}
			: {
					label: "Medium Risk",
					className: "bg-warning/10 text-warning ring-1 ring-warning/20",
				};

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
				config.className,
			)}
		>
			<ShieldAlertIcon className="size-3" aria-hidden="true" />
			{config.label}
		</span>
	);
}

function formatToolDisplayName(toolName: string): string {
	const withoutPrefix = toolName.replace(/^mcp_[0-9a-f_]{36,}_(.+)$/i, "$1");
	return withoutPrefix
		.replace(/__+/g, " ")
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function ToolApprovalBanner({
	approval,
	onApprove,
	onReject,
}: ToolApprovalBannerProps) {
	const [open, setOpen] = useState(false);
	const summary = summarizeToolInput(
		formatToolDisplayName(approval.toolName),
		approval.input,
	);
	const displayName = formatToolDisplayName(approval.toolName);
	const riskLevel = getRiskLevel(approval.input);

	const isHighRisk = riskLevel === "high";
	const isMediumRisk = riskLevel === "medium";

	return (
		<div className="mx-auto w-full max-w-4xl animate-in-up">
			<div
				role="alert"
				className={cn(
					"group relative overflow-hidden rounded-2xl border p-4 text-sm transition-colors",
					isHighRisk
						? "border-destructive/30 bg-destructive/[0.04] hover:border-destructive/40"
						: isMediumRisk
							? "border-warning/30 bg-warning/[0.04] hover:border-warning/40"
							: "border-info/30 bg-info/[0.04] hover:border-info/40",
				)}
			>
				<div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					{/* Left: info */}
					<div className="flex min-w-0 flex-1 items-start gap-3">
						{/* Icon */}
						<div
							className={cn(
								"relative flex size-10 shrink-0 items-center justify-center rounded-xl ring-1",
								isHighRisk
									? "bg-destructive/10 text-destructive ring-destructive/20"
									: isMediumRisk
										? "bg-warning/10 text-warning ring-warning/20"
										: "bg-info/10 text-info ring-info/20",
							)}
						>
							<ShieldAlertIcon className="size-5" aria-hidden="true" />
						</div>

						<div className="min-w-0 flex-1">
							{/* Title row */}
							<div className="flex flex-wrap items-center gap-2">
								<h3 className="font-semibold text-foreground">{displayName}</h3>
								<RiskIndicator level={riskLevel} />
								{!riskLevel || riskLevel === "low" ? (
									<span className="inline-flex items-center rounded-full bg-info/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-info ring-1 ring-info/20">
										Low Risk
									</span>
								) : null}
							</div>

							{/* Summary */}
							<p className="mt-1.5 text-muted-foreground">{summary}</p>

							{/* Expandable details */}
							<Collapsible open={open} onOpenChange={setOpen}>
								<CollapsibleTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="mt-2 h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
									>
										{open ? (
											<ChevronDownIcon
												className="size-3.5 transition-transform"
												aria-hidden="true"
											/>
										) : (
											<ChevronRightIcon
												className="size-3.5 transition-transform"
												aria-hidden="true"
											/>
										)}
										{open ? "Hide details" : "Show input details"}
									</Button>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<div className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
										<pre className="max-h-40 overflow-auto p-3 text-xs leading-relaxed text-muted-foreground">
											{JSON.stringify(approval.input, null, 2)}
										</pre>
									</div>
								</CollapsibleContent>
							</Collapsible>
						</div>
					</div>

					{/* Right: actions */}
					<div className="flex shrink-0 items-start gap-2 sm:self-center">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={onReject}
							className="h-9 gap-1.5 border-destructive/20 bg-destructive/5 px-4 text-xs font-medium text-destructive/80 transition-all duration-200 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive/40 active:scale-95"
						>
							<XCircle className="size-3.5" aria-hidden="true" />
							Reject
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={onApprove}
							className="h-9 gap-1.5 px-4 text-xs font-medium"
						>
							<CheckCircle2 className="size-3.5" aria-hidden="true" />
							Approve
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

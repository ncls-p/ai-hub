"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon, ShieldAlertIcon, XIcon } from "lucide-react";

import type { PendingToolApproval } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

export function ToolApprovalBanner({
	approval,
	onApprove,
	onReject,
}: ToolApprovalBannerProps) {
	const [open, setOpen] = useState(false);
	const summary = summarizeToolInput(approval.toolName, approval.input);

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
			<div className="flex items-start gap-2">
				<ShieldAlertIcon
					className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<p className="font-medium text-foreground">
						Approval required: {approval.toolName}
					</p>
					<p className="mt-1 text-muted-foreground">{summary}</p>
					<Collapsible open={open} onOpenChange={setOpen}>
						<CollapsibleTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="mt-2 h-8 px-2"
							>
								<ChevronDownIcon
									className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
									aria-hidden="true"
								/>
								View details
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<pre className="mt-2 max-h-32 overflow-auto rounded-md bg-background/70 p-2 text-xs text-muted-foreground">
								{JSON.stringify(approval.input, null, 2)}
							</pre>
						</CollapsibleContent>
					</Collapsible>
				</div>
			</div>
			<div className="flex justify-end gap-2">
				<Button type="button" size="sm" variant="outline" onClick={onReject}>
					<XIcon data-icon="inline-start" aria-hidden="true" />
					Reject
				</Button>
				<Button type="button" size="sm" onClick={onApprove}>
					<CheckIcon data-icon="inline-start" aria-hidden="true" />
					Approve
				</Button>
			</div>
		</div>
	);
}

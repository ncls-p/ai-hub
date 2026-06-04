import type { ElementType } from "react";
import { CloudIcon, NetworkIcon, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

import type { HealthColor } from "./types";

export const TRANSPORT_ICONS: Record<string, ElementType> = {
	"streamable-http": CloudIcon,
	sse: NetworkIcon,
	stdio: Wrench,
};

export function transportAccent(transport: string) {
	void transport;
	return {
		bar: "bg-primary",
		bg: "bg-primary/5",
		text: "text-primary",
		ring: "ring-primary/20",
		badge: "bg-primary/10 text-primary",
		iconBg: "bg-primary/10",
	};
}

export function getHealthColor(status: string | null): HealthColor {
	if (!status) return "muted";
	const s = status.toLowerCase();
	if (s === "connected" || s === "healthy" || s === "ok") return "success";
	if (s === "degraded" || s === "warning") return "warning";
	if (s === "error" || s === "disconnected" || s === "failed") {
		return "destructive";
	}
	return "muted";
}

export function healthDotClass(color: HealthColor) {
	const map: Record<HealthColor, string> = {
		success: "bg-success",
		warning: "bg-warning",
		destructive: "bg-destructive",
		muted: "bg-muted-foreground",
	};
	return cn("size-2 shrink-0 rounded-full", map[color]);
}

export function transportLabel(transport: string) {
	switch (transport) {
		case "streamable-http":
			return "Streamable HTTP";
		case "sse":
			return "SSE";
		case "stdio":
			return "Stdio";
		default:
			return transport;
	}
}

export function serverEndpointLabel(server: {
	transport: string;
	url: string | null;
	command: string | null;
	argsJson?: string[] | null;
}) {
	return (
		server.url ||
		(server.command
			? [server.command, ...(server.argsJson ?? [])].filter(Boolean).join(" ")
			: server.transport)
	);
}

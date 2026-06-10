import { Loader2, PlusIcon } from "lucide-react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { emptyForm, type McpServerForm } from "./form";
import { AdvancedSection, AuthSection } from "./form-sections";
import { serverEndpointLabel, transportLabel } from "./transport";
import type { McpServer } from "./types";

type ServerDialogProps = {
	busy: boolean;
	form: McpServerForm;
	setForm: (form: McpServerForm) => void;
};

export function CreateServerDialog({
	open,
	busy,
	form,
	setForm,
	showAdvanced,
	onAdvancedChange,
	onOpenChange,
	onCreate,
}: ServerDialogProps & {
	open: boolean;
	showAdvanced: boolean;
	onAdvancedChange: (open: boolean) => void;
	onOpenChange: (open: boolean) => void;
	onCreate: () => void;
}) {
	function close() {
		onOpenChange(false);
		setForm(emptyForm);
		onAdvancedChange(false);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) close();
			}}
		>
			<DialogContent className="max-h-[calc(100svh-2rem)] max-w-lg overflow-x-hidden overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Add MCP server</DialogTitle>
					<DialogDescription>
						Connect an external MCP server so your agents can use its tools.
					</DialogDescription>
				</DialogHeader>
				<ServerFormFields form={form} setForm={setForm} />
				<AuthSection
					form={form}
					setForm={setForm}
					transport={form.transport}
					prefix="mcp-create"
				/>
				<AdvancedSection
					open={showAdvanced}
					onOpenChange={onAdvancedChange}
					form={form}
					setForm={setForm}
					prefix="mcp-create"
					placeholder="Use these only when the server documentation requires multiple headers or custom environment variables."
				/>
				<DialogFooter>
					<Button variant="outline" onClick={close}>
						Cancel
					</Button>
					<Button disabled={busy || !form.name.trim()} onClick={onCreate}>
						{busy ? (
							<Loader2 className="animate-spin" aria-hidden="true" />
						) : (
							<PlusIcon className="size-4" aria-hidden="true" />
						)}
						Add Server
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ServerFormFields({ form, setForm }: Omit<ServerDialogProps, "busy">) {
	return (
		<div className="grid gap-4">
			<div className="grid gap-2">
				<Label htmlFor="mcp-name">Name</Label>
				<Input
					id="mcp-name"
					autoComplete="off"
					value={form.name}
					onChange={(e) => setForm({ ...form, name: e.target.value })}
					placeholder="Company tools…"
				/>
			</div>
			{form.transport === "stdio" ? (
				<div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
					Local command mode is enabled in Advanced options.
				</div>
			) : (
				<TransportTargetFields form={form} setForm={setForm} prefix="mcp" />
			)}
		</div>
	);
}

function TransportTargetFields({
	form,
	setForm,
	prefix,
}: Omit<ServerDialogProps, "busy"> & { prefix: string }) {
	if (form.transport === "stdio") {
		return (
			<>
				<div className="grid gap-2">
					<Label htmlFor={`${prefix}-command`}>Command</Label>
					<Input
						id={`${prefix}-command`}
						autoComplete="off"
						value={form.command}
						onChange={(e) => setForm({ ...form, command: e.target.value })}
						placeholder="npx…"
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`${prefix}-args`}>Args (one per line)</Label>
					<Textarea
						id={`${prefix}-args`}
						autoComplete="off"
						value={form.args}
						onChange={(e) => setForm({ ...form, args: e.target.value })}
						placeholder={"-y\n@modelcontextprotocol/server-filesystem…"}
					/>
				</div>
			</>
		);
	}

	return (
		<div className="grid gap-2">
			<Label htmlFor={`${prefix}-url`}>Server URL</Label>
			<Input
				id={`${prefix}-url`}
				type="url"
				autoComplete="off"
				value={form.url}
				onChange={(e) => setForm({ ...form, url: e.target.value })}
				placeholder="https://mcp.example.com…"
			/>
		</div>
	);
}

export function EditServerDialog({
	server,
	busy,
	form,
	setForm,
	showAdvanced,
	onAdvancedChange,
	onClose,
	onSave,
}: ServerDialogProps & {
	server: McpServer | null;
	showAdvanced: boolean;
	onAdvancedChange: (open: boolean) => void;
	onClose: () => void;
	onSave: () => void;
}) {
	return (
		<Dialog
			open={Boolean(server)}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-h-[calc(100svh-2rem)] max-w-lg overflow-x-hidden overflow-y-auto">
				<DialogHeader className="min-w-0">
					<DialogTitle>Edit MCP server</DialogTitle>
					<DialogDescription>
						Update the configuration for{" "}
						<span className="font-medium">{server?.name}</span>.
					</DialogDescription>
					{server?.hasHeaders || server?.hasEnv ? (
						<Badge variant="secondary" className="w-fit">
							Credentials configurés (valeurs masquées)
						</Badge>
					) : null}
				</DialogHeader>
				<div className="grid min-w-0 gap-4">
					<div className="grid min-w-0 gap-2">
						<Label htmlFor="mcp-edit-name">Name</Label>
						<Input
							id="mcp-edit-name"
							autoComplete="off"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</div>
					{server ? <ReadonlyTransportSummary server={server} /> : null}
					<TransportTargetFields
						form={form}
						setForm={setForm}
						prefix="mcp-edit"
					/>
					{server ? (
						<AuthSection
							form={form}
							setForm={setForm}
							transport={form.transport}
							prefix="mcp-edit"
						/>
					) : null}
					<AdvancedSection
						open={showAdvanced}
						onOpenChange={onAdvancedChange}
						form={form}
						setForm={setForm}
						prefix="mcp-edit"
						placeholder="Leave these empty to keep the existing secret configuration."
						showConnectionMode={false}
					/>
				</div>
				<DialogFooter className="overflow-hidden">
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button disabled={busy} onClick={onSave}>
						Save changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ReadonlyTransportSummary({ server }: { server: McpServer }) {
	return (
		<div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
			<Badge variant="outline">{transportLabel(server.transport)}</Badge>
			<code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
				{serverEndpointLabel(server)}
			</code>
		</div>
	);
}

export function DeleteServerDialog({
	deleteId,
	onClose,
	onDelete,
}: {
	deleteId: string | null;
	onClose: () => void;
	onDelete: (id: string) => void;
}) {
	return (
		<AlertDialog open={Boolean(deleteId)} onOpenChange={onClose}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove MCP server?</AlertDialogTitle>
					<AlertDialogDescription>
						Agents bound to these tools will lose access. This action cannot be
						undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={() => deleteId && onDelete(deleteId)}>
						Remove
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

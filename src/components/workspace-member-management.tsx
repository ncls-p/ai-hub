"use client";

import { type SyntheticEvent, useCallback, useEffect, useState } from "react";
import { Loader2, UserMinusIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";

type WorkspaceMember = {
	id: string;
	userId: string;
	name: string;
	email: string;
	roleName: string;
	createdAt: string;
};

export function WorkspaceMemberManagement({
	currentUserId,
}: {
	currentUserId: string;
}) {
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [members, setMembers] = useState<WorkspaceMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [inviting, setInviting] = useState(false);
	const [busyUserId, setBusyUserId] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [roleName, setRoleName] = useState<"workspace.member" | "workspace.owner" | "workspace.admin">(
		"workspace.member",
	);

	const loadMembers = useCallback(async () => {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/members?workspaceId=${workspaceId}`,
		);
		if (!res.ok) throw new Error("Unable to load workspace members");
		const data = (await res.json()) as { members: WorkspaceMember[] };
		setMembers(data.members);
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		async function run() {
			try {
				await loadMembers();
			} catch (error) {
				if (!cancelled) {
					toast.error(
						error instanceof Error
							? error.message
							: "Unable to load workspace members",
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [loadMembers, workspaceId]);

	async function updateMemberRole(
		userId: string,
		nextRole: "workspace.member" | "workspace.owner" | "workspace.admin",
	) {
		if (!workspaceId) return;
		setBusyUserId(userId);
		try {
			const res = await fetch(`/api/workspace/members/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, roleName: nextRole }),
			});
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to update role",
				);
			}
			await loadMembers();
			toast.success("Member role updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to update role",
			);
		} finally {
			setBusyUserId(null);
		}
	}

	async function inviteMember(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!workspaceId) return;
		setInviting(true);
		try {
			const res = await fetch("/api/workspace/members", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, email, roleName }),
			});
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to invite member",
				);
			}
			setEmail("");
			await loadMembers();
			toast.success("Member added to workspace");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to invite member",
			);
		} finally {
			setInviting(false);
		}
	}

	async function removeMember(userId: string) {
		if (!workspaceId) return;
		setBusyUserId(userId);
		try {
			const res = await fetch(
				`/api/workspace/members/${userId}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to remove member",
				);
			}
			await loadMembers();
			toast.success("Member removed");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to remove member",
			);
		} finally {
			setBusyUserId(null);
		}
	}

	if (workspaceLoading || !workspaceId) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center py-10">
					<Loader2 className="size-5 animate-spin text-muted-foreground" />
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<UsersIcon className="size-4" aria-hidden="true" />
					Workspace members
				</CardTitle>
				<CardDescription>
					Invite existing accounts to this workspace. They will see the same
					assistants and connections.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<form
					className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
					onSubmit={(event) => void inviteMember(event)}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="invite-email">Email</Label>
						<Input
							id="invite-email"
							type="email"
							placeholder="colleague@company.com"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Role</Label>
						<Select
							value={roleName}
							onValueChange={(value) =>
								setRoleName(value as typeof roleName)
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="workspace.member">Member</SelectItem>
								<SelectItem value="workspace.admin">Admin</SelectItem>
								<SelectItem value="workspace.owner">Owner</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-end">
						<Button type="submit" disabled={inviting}>
							{inviting ? (
								<Loader2 className="animate-spin" />
							) : (
								<>
									<UserPlusIcon data-icon="inline-start" aria-hidden="true" />
									Invite
								</>
							)}
						</Button>
					</div>
				</form>

				{loading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : members.length === 0 ? (
					<p className="text-sm text-muted-foreground">No members yet.</p>
				) : (
					<ul className="divide-y divide-border/70 rounded-xl border border-border/70">
						{members.map((member) => (
							<li
								key={member.id}
								className="flex items-center justify-between gap-3 px-4 py-3"
							>
								<div className="min-w-0">
									<p className="truncate font-medium">{member.name}</p>
									<p className="truncate text-sm text-muted-foreground">
										{member.email}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<Select
										value={member.roleName}
										onValueChange={(value) =>
											void updateMemberRole(
												member.userId,
												value as typeof roleName,
											)
										}
										disabled={busyUserId === member.userId}
									>
										<SelectTrigger className="h-8 w-28">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="workspace.member">Member</SelectItem>
											<SelectItem value="workspace.admin">Admin</SelectItem>
											<SelectItem value="workspace.owner">Owner</SelectItem>
										</SelectContent>
									</Select>
									{member.userId !== currentUserId ? (
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											disabled={busyUserId === member.userId}
											onClick={() => void removeMember(member.userId)}
											aria-label={`Remove ${member.name}`}
										>
											{busyUserId === member.userId ? (
												<Loader2 className="size-4 animate-spin" />
											) : (
												<UserMinusIcon className="size-4" />
											)}
										</Button>
									) : null}
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

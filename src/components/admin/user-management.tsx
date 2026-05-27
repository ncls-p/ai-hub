"use client";

import { type SyntheticEvent, useMemo, useState } from "react";
import { ShieldCheckIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldContent,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspace } from "@/hooks/use-workspace";

type ManagedUser = {
	id: string;
	name: string;
	email: string;
	role: string;
	banned: boolean;
	banReason: string | null;
	createdAt: string;
};

const emptyForm = {
	name: "",
	email: "",
	password: "",
	role: "user" as "user" | "admin",
	addToWorkspace: true,
};

export function UserManagement({
	initialUsers,
	currentUserId,
}: {
	initialUsers: ManagedUser[];
	currentUserId: string;
}) {
	const { workspaceId } = useWorkspace();
	const [users, setUsers] = useState(initialUsers);
	const [form, setForm] = useState(emptyForm);
	const [creating, setCreating] = useState(false);
	const [busyUserId, setBusyUserId] = useState<string | null>(null);

	const activeAdmins = useMemo(
		() => users.filter((user) => user.role === "admin" && !user.banned).length,
		[users],
	);

	async function refreshUsers() {
		const res = await fetch("/api/admin/users");
		if (!res.ok) throw new Error("Unable to refresh users");
		const data = (await res.json()) as { users: ManagedUser[] };
		setUsers(data.users);
	}

	async function createUser(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		setCreating(true);
		try {
			const res = await fetch("/api/admin/users", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...form,
					workspaceId: form.addToWorkspace ? workspaceId : undefined,
				}),
			});
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to create user",
				);
			}
			setForm(emptyForm);
			await refreshUsers();
			toast.success("User created");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to create user",
			);
		} finally {
			setCreating(false);
		}
	}

	async function updateUser(
		userId: string,
		payload: { role?: "user" | "admin"; banned?: boolean },
	) {
		setBusyUserId(userId);
		try {
			const res = await fetch(`/api/admin/users/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to update user",
				);
			}
			await refreshUsers();
			toast.success("User updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to update user",
			);
		} finally {
			setBusyUserId(null);
		}
	}

	return (
		<div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<UserPlusIcon aria-hidden="true" />
						Create account
					</CardTitle>
					<CardDescription>
						Give a teammate access without opening registration.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={createUser}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="new-user-name">Name</FieldLabel>
								<FieldContent>
									<Input
										id="new-user-name"
										required
										value={form.name}
										onChange={(event) =>
											setForm({ ...form, name: event.target.value })
										}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="new-user-email">Email</FieldLabel>
								<FieldContent>
									<Input
										id="new-user-email"
										type="email"
										required
										value={form.email}
										onChange={(event) =>
											setForm({ ...form, email: event.target.value })
										}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="new-user-password">
									Temporary password
								</FieldLabel>
								<FieldContent>
									<Input
										id="new-user-password"
										type="password"
										minLength={8}
										required
										value={form.password}
										onChange={(event) =>
											setForm({ ...form, password: event.target.value })
										}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="new-user-role">Role</FieldLabel>
								<FieldContent>
									<Select
										value={form.role}
										onValueChange={(value) =>
											setForm({
												...form,
												role: value as "user" | "admin",
											})
										}
									>
										<SelectTrigger id="new-user-role" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="user">User</SelectItem>
											<SelectItem value="admin">Admin</SelectItem>
										</SelectContent>
									</Select>
								</FieldContent>
							</Field>
							<Field>
								<div className="flex items-center gap-2">
									<Checkbox
										id="new-user-workspace"
										checked={form.addToWorkspace}
										onCheckedChange={(checked) =>
											setForm({
												...form,
												addToWorkspace: checked === true,
											})
										}
									/>
									<label
										htmlFor="new-user-workspace"
										className="text-sm leading-none"
									>
										Add to current workspace
									</label>
								</div>
							</Field>
							<Button type="submit" disabled={creating}>
								{creating ? (
									<Spinner data-icon="inline-start" />
								) : (
									<UserPlusIcon data-icon="inline-start" aria-hidden="true" />
								)}
								Create user
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<UsersIcon aria-hidden="true" />
						Users
					</CardTitle>
					<CardDescription>
						{users.length} users · {activeAdmins} active admins
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{users.map((user) => {
						const isCurrentUser = user.id === currentUserId;
						return (
							<div
								key={user.id}
								className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="truncate font-medium">{user.name}</p>
										<Badge
											variant={user.role === "admin" ? "secondary" : "outline"}
										>
											{user.role === "admin" ? "Admin" : "User"}
										</Badge>
										{user.banned ? (
											<Badge variant="destructive">Suspended</Badge>
										) : null}
										{isCurrentUser ? (
											<Badge variant="outline">You</Badge>
										) : null}
									</div>
									<p className="truncate text-sm text-muted-foreground">
										{user.email}
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={busyUserId === user.id}
										onClick={() =>
											updateUser(user.id, {
												role: user.role === "admin" ? "user" : "admin",
											})
										}
									>
										<ShieldCheckIcon
											data-icon="inline-start"
											aria-hidden="true"
										/>
										{user.role === "admin" ? "Make user" : "Make admin"}
									</Button>
									<Button
										type="button"
										size="sm"
										variant={user.banned ? "outline" : "destructive"}
										disabled={busyUserId === user.id}
										onClick={() =>
											updateUser(user.id, { banned: !user.banned })
										}
									>
										{busyUserId === user.id ? (
											<Spinner data-icon="inline-start" />
										) : null}
										{user.banned ? "Restore" : "Suspend"}
									</Button>
								</div>
							</div>
						);
					})}
				</CardContent>
			</Card>
		</div>
	);
}

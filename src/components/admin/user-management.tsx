"use client";

import type { ElementType } from "react";
import { type SyntheticEvent, useMemo, useState } from "react";
import {
  BanIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const ADMIN_ROLE = "admin";
type ManagedUserRole = "user" | typeof ADMIN_ROLE;

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
  role: "user" as ManagedUserRole,
};

function initialsFromName(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  accent,
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  color: string;
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/35">
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1 opacity-60 transition-opacity duration-300 group-hover:opacity-100",
          accent,
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {value}
          </span>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
            color,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function UserManagement({
  initialUsers,
  currentUserId,
}: {
  initialUsers: ManagedUser[];
  currentUserId: string;
}) {
  const t = useTranslations("admin.platform");
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const activeAdmins = users.filter(
      (user) => user.role === ADMIN_ROLE && !user.banned,
    ).length;
    const suspended = users.filter((user) => user.banned).length;
    return { total: users.length, activeAdmins, suspended };
  }, [users]);

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
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            "Unable to create user",
        );
      }
      setForm(emptyForm);
      await refreshUsers();
      toast.success(t("userCreated"));
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
    payload: { role?: ManagedUserRole; banned?: boolean },
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
      toast.success(t("userUpdated"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update user",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 animate-in-up stagger-1">
        <StatCard
          label={t("statTotal")}
          value={stats.total}
          icon={UsersIcon}
          color="bg-primary/10 text-primary"
          accent="bg-primary"
        />
        <StatCard
          label={t("statAdmins")}
          value={stats.activeAdmins}
          icon={ShieldCheckIcon}
          color="bg-success/10 text-success"
          accent="bg-success"
        />
        <StatCard
          label={t("statSuspended")}
          value={stats.suspended}
          icon={BanIcon}
          color="bg-destructive/10 text-destructive"
          accent="bg-destructive"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <section className="overflow-hidden rounded-2xl border bg-card p-0 animate-in-fade stagger-2">
          <div className="border-b px-5 py-5">
            <div className="flex items-center gap-2 text-primary">
              <UserPlusIcon className="size-4" aria-hidden="true" />
              <h3 className="text-sm font-semibold uppercase tracking-wider">
                {t("createTitle")}
              </h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("createDescription")}
            </p>
          </div>
          <div className="p-5">
            <form onSubmit={createUser}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="new-user-name">{t("name")}</FieldLabel>
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
                  <FieldLabel htmlFor="new-user-email">{t("email")}</FieldLabel>
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
                    {t("password")}
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
                  <FieldLabel htmlFor="new-user-role">{t("role")}</FieldLabel>
                  <FieldContent>
                    <Select
                      value={form.role}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          role: value as ManagedUserRole,
                        })
                      }
                    >
                      <SelectTrigger id="new-user-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">{t("roleUser")}</SelectItem>
                        <SelectItem value={ADMIN_ROLE}>
                          {t("roleAdmin")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
                <Button type="submit" disabled={creating} className="w-full">
                  {creating ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {t("createButton")}
                </Button>
              </FieldGroup>
            </form>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 animate-in-fade stagger-3">
          <div className="mb-5 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <UsersIcon className="size-4 text-primary" aria-hidden="true" />
              <h3 className="text-base font-semibold">{t("listTitle")}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("listDescription", {
                total: stats.total,
                admins: stats.activeAdmins,
              })}
            </p>
          </div>

          <div className="flex max-h-[36rem] flex-col gap-2 overflow-y-auto pr-1">
            {users.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              return (
                <article
                  key={user.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 p-4 transition-colors hover:border-primary/25 hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-background",
                        user.banned
                          ? "bg-muted text-muted-foreground"
                          : isCurrentUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-primary/10 text-primary",
                      )}
                    >
                      {initialsFromName(user.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{user.name}</p>
                        <Badge
                          variant={
                            user.role === ADMIN_ROLE ? "default" : "outline"
                          }
                          className="rounded-md capitalize"
                        >
                          {user.role === ADMIN_ROLE
                            ? t("roleAdmin")
                            : t("roleUser")}
                        </Badge>
                        {user.banned ? (
                          <Badge variant="destructive" className="rounded-md">
                            {t("suspended")}
                          </Badge>
                        ) : null}
                        {isCurrentUser ? (
                          <Badge variant="outline" className="rounded-md">
                            {t("you")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 sm:pl-0 pl-14">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyUserId === user.id}
                      onClick={() =>
                        updateUser(user.id, {
                          role: user.role === ADMIN_ROLE ? "user" : ADMIN_ROLE,
                        })
                      }
                    >
                      <ShieldCheckIcon
                        data-icon="inline-start"
                        aria-hidden="true"
                      />
                      {user.role === ADMIN_ROLE
                        ? t("makeUser")
                        : t("makeAdmin")}
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
                      {user.banned ? t("restore") : t("suspend")}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

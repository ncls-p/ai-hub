"use client";

import { personHasProjectAccess } from "@/modules/iam/filter-access-people";
import { useAccessSnapshot } from "./use-access-snapshot";
import { AccessProjectSelector } from "./access-project-selector";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { buildAccessPeople } from "@/modules/iam/access-view-model";
import { AccessConsoleView } from "./access-console.access-console.view";
import { PlatformAccessUser } from "./access-console.access-member";
import {
  AccessConsoleSkeleton,
  INITIAL_ACCOUNT_FORM,
  INITIAL_ORGANIZATION_FORM,
  INITIAL_PROJECT_FORM,
  INITIAL_ROLE_FORM,
  INITIAL_TEAM_FORM,
  InitialError,
  MutationPayload,
  builtInRoleKey,
} from "./access-console.resource-transfer-preview";
import { useAccessMemberTransfer } from "./access-console.use-member-transfer";

export function useAccessConsoleController({
  platformUsers,
  currentUserId,
}: {
  platformUsers?: PlatformAccessUser[];
  currentUserId?: string;
}) {
  const t = useTranslations("access");
  const roleLabel = (name: string, fallback: string) => {
    const key = builtInRoleKey(name);
    return key ? t(`builtInRoles.${key}`) : fallback;
  };
  const {
    workspaceId,
    setWorkspaceId,
    refresh: refreshWorkspaces,
  } = useWorkspace();
  const { snapshot, loading, refreshError, load } =
    useAccessSnapshot(workspaceId);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [organizationForm, setOrganizationForm] = useState(
    INITIAL_ORGANIZATION_FORM,
  );
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(INITIAL_PROJECT_FORM);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamForm, setTeamForm] = useState(INITIAL_TEAM_FORM);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState(INITIAL_ROLE_FORM);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [bulkAssignmentIds, setBulkAssignmentIds] = useState<string[]>([]);
  const [assignment, setAssignment] = useState({
    principalType: "user" as "user" | "group",
    principalId: "",
    roleId: "",
    scopeType: "workspace" as "organization" | "workspace",
  });
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleTeamId, setPeopleTeamId] = useState("all");
  const [peopleProjectOnly, setPeopleProjectOnly] = useState(false);
  const [teamQuery, setTeamQuery] = useState("");
  const [roleQuery, setRoleQuery] = useState("");
  const [permissionQuery, setPermissionQuery] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(25);
  const [visibleTeamCount, setVisibleTeamCount] = useState(20);
  const [visibleRoleCount, setVisibleRoleCount] = useState(25);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleEditorReadOnly, setRoleEditorReadOnly] = useState(false);
  const [accountMode, setAccountMode] = useState<"existing" | "create">(
    "existing",
  );
  const [accountForm, setAccountForm] = useState(INITIAL_ACCOUNT_FORM);
  const [platformAccounts, setPlatformAccounts] = useState(platformUsers ?? []);
  const [busyPlatformUserId, setBusyPlatformUserId] = useState<string | null>(
    null,
  );

  async function mutate(
    key: string,
    payload: MutationPayload,
    successMessage: string,
    options?: { close?: () => void; nextWorkspaceId?: string },
  ) {
    if (pendingAction || refreshError) return false;
    setPendingAction(key);
    try {
      const result = await fetchJson<{ project?: { id: string } }>(
        "/api/workspace/iam",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      toast.success(successMessage);
      options?.close?.();
      await refreshWorkspaces();
      const nextWorkspaceId = options?.nextWorkspaceId ?? result.project?.id;
      if (nextWorkspaceId) {
        setWorkspaceId(nextWorkspaceId);
      } else {
        await load({ preserveData: true });
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mutationError"));
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  const {
    memberTransferOpen,
    setMemberTransferOpen,
    memberTransferDestinations,
    memberTransferLoading,
    memberTransferQuery,
    setMemberTransferQuery,
    memberTransferTargetId,
    setMemberTransferTargetId,
    memberTransferRoleId,
    setMemberTransferRoleId,
    memberTransferMode,
    setMemberTransferMode,
    memberTransferPreview,
    setMemberTransferPreview,
    openMemberTransfer,
    previewSelectedMemberTransfer,
    confirmSelectedMemberTransfer,
  } = useAccessMemberTransfer({
    workspaceId,
    selectedPeople,
    setSelectedPeople,
    setPendingAction,
    load,
    refreshWorkspaces,
  });

  const activeMembers = useMemo(
    () =>
      snapshot?.members.filter((member) => member.status === "active") ?? [],
    [snapshot],
  );
  const scopedRoles = useMemo(
    () =>
      snapshot?.roles.filter(
        (role) =>
          role.scopeType === assignment.scopeType &&
          (assignment.scopeType !== "workspace" ||
            role.permissions.includes("workspaces.get")) &&
          snapshot.assignableRoleIds.includes(role.id),
      ) ?? [],
    [assignment.scopeType, snapshot],
  );
  const principalOptions =
    assignment.principalType === "user"
      ? activeMembers.filter((member) =>
          snapshot?.subordinateIds[assignment.scopeType].includes(
            member.userId,
          ),
        )
      : (snapshot?.teams ?? []).filter((team) =>
          team.members.every((member) =>
            snapshot?.subordinateIds[assignment.scopeType].includes(
              member.userId,
            ),
          ),
        );
  const selectedAssignmentRole = snapshot?.roles.find(
    (role) => role.id === assignment.roleId,
  );

  async function refreshPlatformAccounts() {
    if (!platformUsers) return;
    const result = await fetchJson<{ users: PlatformAccessUser[] }>(
      "/api/admin/users",
    );
    setPlatformAccounts(result.users);
  }

  async function updatePlatformAccount(
    userId: string,
    payload: { role?: "user" | "admin"; banned?: boolean },
  ) {
    setBusyPlatformUserId(userId);
    try {
      await fetchJson(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refreshPlatformAccounts();
      toast.success(t("accountUpdated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("mutationError"));
    } finally {
      setBusyPlatformUserId(null);
    }
  }

  const snapshotIsCurrent = snapshot?.activeProject.id === workspaceId;
  if (!snapshotIsCurrent && (loading || !refreshError)) {
    return <AccessConsoleSkeleton />;
  }
  if (!snapshot || !snapshotIsCurrent) {
    return (
      <div className="flex flex-col gap-5">
        <AccessProjectSelector />
        <InitialError
          message={refreshError ?? t("loadError")}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const {
    canManageProjectAccess,
    canManageOrganizationAccess,
    canCreateProjects,
    canManageProjectLifecycle,
    canManageOrganizationLifecycle,
    canManageMembers,
    canManageTeams,
  } = snapshot.capabilities;
  const canManageAnything =
    snapshot.actions.workspace["roles.create"] ||
    snapshot.actions.organization["roles.create"] ||
    snapshot.canManageAccess ||
    canCreateProjects ||
    canManageProjectLifecycle ||
    canManageOrganizationLifecycle ||
    canManageMembers ||
    canManageTeams;
  const canCustomizeViewedRole =
    snapshot.actions[roleForm.scopeType]["roles.create"];
  const canDelegateViewedRole =
    !editingRoleId || snapshot.assignableRoleIds.includes(editingRoleId);
  const grantablePermissionSet = new Set(
    snapshot.grantablePermissions[roleForm.scopeType],
  );
  const accessPeople = buildAccessPeople({
    members: activeMembers,
    accounts: platformAccounts.filter((account) =>
      activeMembers.some((member) => member.userId === account.id),
    ),
    assignments: snapshot.assignments,
    teams: snapshot.teams,
  });
  const selectedTeamId = snapshot.teams.some((team) => team.id === peopleTeamId)
    ? peopleTeamId
    : "all";
  const normalizedPeopleQuery = peopleQuery.trim().toLocaleLowerCase();
  const people = accessPeople.filter((person) => {
    if (
      selectedTeamId !== "all" &&
      !person.teams.some((team) => team.id === selectedTeamId)
    )
      return false;
    if (peopleProjectOnly && !personHasProjectAccess(person, snapshot))
      return false;
    if (!normalizedPeopleQuery) return true;
    return [
      person.name,
      person.email,
      person.platformRole,
      ...person.assignments.flatMap((access) => [
        roleLabel(access.roleKey, access.roleName),
        access.scope,
      ]),
      ...person.teams.map((team) => team.name),
    ].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedPeopleQuery),
    );
  });
  const visiblePeople = people.slice(0, visiblePeopleCount);
  const selectedVisiblePeople = visiblePeople.filter(
    (person) =>
      person.memberStatus === "active" &&
      snapshot.subordinateIds.workspace.includes(person.userId) &&
      snapshot.actions.workspace["roles.assign"],
  );
  const allVisiblePeopleSelected =
    selectedVisiblePeople.length > 0 &&
    selectedVisiblePeople.every((person) =>
      selectedPeople.includes(person.userId),
    );
  const selectedMemberTransferDestination = memberTransferDestinations.find(
    (destination) => destination.workspaceId === memberTransferTargetId,
  );
  const filteredMemberTransferDestinations = memberTransferDestinations.filter(
    (destination) =>
      [
        destination.organizationName,
        destination.workspaceName,
        ...destination.roles.flatMap((role) => [role.displayName, role.name]),
      ].some((value) =>
        value
          .toLocaleLowerCase()
          .includes(memberTransferQuery.trim().toLocaleLowerCase()),
      ),
  );

  const normalizedTeamQuery = teamQuery.trim().toLocaleLowerCase();
  const filteredTeams = snapshot.teams.filter((team) =>
    [team.name, team.description, ...team.members.map((member) => member.name)]
      .filter(Boolean)
      .some((value) =>
        value?.toLocaleLowerCase().includes(normalizedTeamQuery),
      ),
  );
  const normalizedRoleQuery = roleQuery.trim().toLocaleLowerCase();
  const filteredRoles = snapshot.roles
    .filter((role) => role.scopeType !== "system")
    .filter((role) =>
      [
        roleLabel(role.name, role.displayName),
        role.description,
        role.scopeType,
        ...role.permissions,
      ]
        .filter(Boolean)
        .some((value) =>
          value?.toLocaleLowerCase().includes(normalizedRoleQuery),
        ),
    );
  return {
    kind: "ready",
    accountForm,
    accountMode,
    activeMembers,
    allVisiblePeopleSelected,
    assignment,
    assignmentOpen,
    bulkAssignmentIds,
    busyPlatformUserId,
    canCreateProjects,
    canCustomizeViewedRole,
    canDelegateViewedRole,
    canManageAnything,
    canManageMembers,
    canManageOrganizationAccess,
    canManageOrganizationLifecycle,
    canManageProjectAccess,
    canManageProjectLifecycle,
    canManageTeams,
    confirmSelectedMemberTransfer,
    currentUserId,
    editingRoleId,
    filteredMemberTransferDestinations,
    filteredRoles,
    filteredTeams,
    grantablePermissionSet,
    load,
    memberEmail,
    memberOpen,
    memberTransferDestinations,
    memberTransferLoading,
    memberTransferMode,
    memberTransferOpen,
    memberTransferPreview,
    memberTransferQuery,
    memberTransferRoleId,
    memberTransferTargetId,
    mutate,
    openMemberTransfer,
    organizationForm,
    organizationOpen,
    pendingAction,
    people,
    peopleQuery,
    peopleTeamId: selectedTeamId,
    peopleProjectOnly,
    setPeopleTeamId,
    setPeopleProjectOnly,
    totalPeopleCount: accessPeople.length,
    permissionQuery,
    platformUsers,
    previewSelectedMemberTransfer,
    principalOptions,
    projectForm,
    projectOpen,
    refreshError,
    refreshPlatformAccounts,
    refreshWorkspaces,
    roleEditorReadOnly,
    roleForm,
    roleLabel,
    roleOpen,
    roleQuery,
    scopedRoles,
    selectedAssignmentRole,
    selectedMemberTransferDestination,
    selectedPeople,
    selectedVisiblePeople,
    setAccountForm,
    setAccountMode,
    setAssignment,
    setAssignmentOpen,
    setBulkAssignmentIds,
    setEditingRoleId,
    setMemberEmail,
    setMemberOpen,
    setMemberTransferMode,
    setMemberTransferOpen,
    setMemberTransferPreview,
    setMemberTransferQuery,
    setMemberTransferRoleId,
    setMemberTransferTargetId,
    setOrganizationForm,
    setOrganizationOpen,
    setPendingAction,
    setPeopleQuery,
    setPermissionQuery,
    setProjectForm,
    setProjectOpen,
    setRoleEditorReadOnly,
    setRoleForm,
    setRoleOpen,
    setRoleQuery,
    setSelectedPeople,
    setTeamForm,
    setTeamOpen,
    setTeamQuery,
    setVisiblePeopleCount,
    setVisibleRoleCount,
    setVisibleTeamCount,
    setWorkspaceId,
    snapshot,
    t,
    teamForm,
    teamOpen,
    teamQuery,
    updatePlatformAccount,
    visiblePeople,
    visibleRoleCount,
    visibleTeamCount,
    workspaceId,
  } as const;
}

export function AccessConsole(
  ...args: Parameters<typeof useAccessConsoleController>
) {
  const model = useAccessConsoleController(...args);
  if (!("kind" in model)) return model;
  return <AccessConsoleView model={model} />;
}

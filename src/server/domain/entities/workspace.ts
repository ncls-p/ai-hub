export interface Organization {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Workspace {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
}

export interface WorkspaceMember {
    id: string;
    workspaceId: string;
    userId: string;
    status: "active" | "suspended" | "removed";
    createdAt: Date;
    updatedAt: Date;
}

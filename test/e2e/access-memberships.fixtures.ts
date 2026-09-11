import { test as base, expect, type Cookie } from "@playwright/test";

type Cleanup = {
  workspaceId: string;
  organizationName: string;
  cookies: Cookie[];
};
export const test = base.extend<{
  cleanupOrganization: (input: Cleanup) => void;
}>({
  cleanupOrganization: async ({ playwright, baseURL }, provide) => {
    const entries: Cleanup[] = [];
    await provide((input) => entries.push(input));
    for (const entry of entries) {
      const request = await playwright.request.newContext({
        baseURL,
        storageState: { cookies: entry.cookies, origins: [] },
      });
      try {
        const response = await request.post("/api/workspace/iam", {
          data: {
            action: "deleteOrganization",
            workspaceId: entry.workspaceId,
            confirmationName: entry.organizationName,
          },
        });
        expect(response.ok(), await response.text()).toBe(true);
      } finally {
        await request.dispose();
      }
    }
  },
});

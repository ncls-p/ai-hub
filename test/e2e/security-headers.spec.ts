import { expect, test } from "@playwright/test";

for (const path of ["/en/auth/signin", "/fr/auth/signup", "/api/workspaces"]) {
  test(`protects response headers on ${path}`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(path.startsWith("/api/") ? 401 : 200);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers()["x-powered-by"]).toBeUndefined();
  });
}

test("rejects unauthenticated writes without creating a workspace", async ({
  request,
}) => {
  const response = await request.patch("/api/workspaces", {
    data: { workspaceId: "00000000-0000-4000-8000-000000000000" },
  });
  expect(response.status()).toBe(401);
});

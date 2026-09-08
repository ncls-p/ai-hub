import type { ShareableResource } from "./resource-share-dialog.share-step";

export async function downloadResourcePackage(
  resource: ShareableResource,
  workspaceId: string,
  failureMessage: string,
) {
  const params = new URLSearchParams({
    workspaceId,
    resourceType: resource.kind,
    resourceId: resource.id,
  });
  const response = await fetch(`/api/workspace/resource-packages?${params}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || failureMessage);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resource.name.replace(/[^a-z0-9._-]+/gi, "-") || "resource"}.maiah.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

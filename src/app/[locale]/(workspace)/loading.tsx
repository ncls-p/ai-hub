import { PageLoading } from "@/components/page-loading";

export default function WorkspaceLoading() {
  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-8 sm:px-6">
      <PageLoading label="Loading page" className="w-full" />
    </div>
  );
}

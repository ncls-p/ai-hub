import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  codeWorkspaceArtifact,
  createCodeWorkspaceFromFiles,
  createCodeWorkspaceFromZip,
} from "@/modules/code-workspace/storage";

const uploadSchema = z.object({
  workspaceId: z.uuid(),
});

const maxUploadRequestBytes = 55 * 1024 * 1024;
const maxDirectWorkspaceBytes = 50 * 1024 * 1024;
const maxDirectFileBytes = 1_000_000;
const maxDirectFiles = 500;
const directCodeFilePattern = /\.(?:html?|css|[cm]?js)$/i;

function uploadPrompt(input: {
  projectId: string;
  title: string;
  rootFile: string | null;
  files: Array<{ path: string; binary: boolean; size: number }>;
  source: "zip" | "files";
}) {
  const fileList = input.files
    .slice(0, 80)
    .map(
      (file) =>
        `- ${file.path}${file.binary ? " (asset)" : ""} — ${file.size} bytes`,
    )
    .join("\n");
  const uploadDescription =
    input.source === "zip"
      ? "un projet de code compressé"
      : "des fichiers HTML/CSS/JS";
  return [
    `J'ai uploadé ${uploadDescription}. Tout doit rester dans ce chat.`,
    `Code workspace ID: ${input.projectId}`,
    `Nom: ${input.title}`,
    `Fichier de preview: ${input.rootFile ?? "aucun fichier HTML détecté"}`,
    "Fichiers:",
    fileList,
    "",
    "Utilise les tools code_workspace_* disponibles pour lire/modifier les fichiers. Après modification, renvoie le workspace mis à jour avec preview et téléchargement ZIP. Si les tools code_workspace_* ne sont pas disponibles, dis-moi de les activer sur cet assistant.",
  ].join("\n");
}

function uploadedFilePath(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  return relativePath?.trim() || file.name;
}

function isDirectCodeFile(file: File) {
  return directCodeFilePattern.test(uploadedFilePath(file));
}

function directUploadTitle(files: File[]) {
  const preferredFile =
    files.find((file) => /\.html?$/i.test(uploadedFilePath(file))) ?? files[0];
  const baseName = uploadedFilePath(preferredFile)
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .trim();
  if (files.length === 1) return baseName?.slice(0, 120) || "Code workspace";
  return `${baseName?.slice(0, 100) || "Code"} workspace`;
}

function getUploadedFiles(formData: FormData) {
  return [formData.get("file"), ...formData.getAll("files")].filter(
    (value): value is File => value instanceof File,
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const contentLength = Number(req.headers.get("content-length") ?? "0");
      if (contentLength > maxUploadRequestBytes) {
        return NextResponse.json(
          { error: "Upload request is too large." },
          { status: 413 },
        );
      }

      const formData = await req.formData();
      const parsed = uploadSchema.safeParse({
        workspaceId: formData.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;

      const uploadedFiles = getUploadedFiles(formData);
      if (uploadedFiles.length === 0) {
        return NextResponse.json(
          { error: "Upload a ZIP file or HTML/CSS/JS files." },
          { status: 400 },
        );
      }

      const zipFiles = uploadedFiles.filter((file) =>
        file.name.toLowerCase().endsWith(".zip"),
      );
      if (zipFiles.length > 0) {
        if (zipFiles.length !== 1 || uploadedFiles.length !== 1) {
          return NextResponse.json(
            {
              error:
                "Upload one ZIP file or direct HTML/CSS/JS files, not both.",
            },
            { status: 400 },
          );
        }
        const uploadedFile = zipFiles[0];
        if (uploadedFile.size > 20 * 1024 * 1024) {
          return NextResponse.json(
            { error: "ZIP file is too large. Maximum size is 20 MB." },
            { status: 400 },
          );
        }

        const metadata = await createCodeWorkspaceFromZip({
          workspaceId: parsed.data.workspaceId,
          userId: session.user.id,
          fileName: uploadedFile.name,
          buffer: new Uint8Array(await uploadedFile.arrayBuffer()),
        });
        const artifact = codeWorkspaceArtifact(
          metadata,
          "Uploaded ZIP workspace.",
        );

        return NextResponse.json({
          artifact,
          prompt: uploadPrompt({
            projectId: metadata.id,
            title: metadata.title,
            rootFile: metadata.rootFile,
            files: metadata.files,
            source: "zip",
          }),
        });
      }

      if (uploadedFiles.length > maxDirectFiles) {
        return NextResponse.json(
          { error: `Too many files. Maximum is ${maxDirectFiles}.` },
          { status: 400 },
        );
      }
      const unsupportedFile = uploadedFiles.find(
        (file) => !isDirectCodeFile(file),
      );
      if (unsupportedFile) {
        return NextResponse.json(
          { error: "Only .zip, .html, .css, and .js uploads are supported." },
          { status: 400 },
        );
      }
      if (
        !uploadedFiles.some((file) => /\.html?$/i.test(uploadedFilePath(file)))
      ) {
        return NextResponse.json(
          { error: "Upload at least one HTML file, usually index.html." },
          { status: 400 },
        );
      }
      const totalDirectBytes = uploadedFiles.reduce(
        (total, file) => total + file.size,
        0,
      );
      if (totalDirectBytes > maxDirectWorkspaceBytes) {
        return NextResponse.json(
          {
            error: "Code workspace files are too large. Maximum size is 50 MB.",
          },
          { status: 400 },
        );
      }
      const oversizedFile = uploadedFiles.find(
        (file) => file.size > maxDirectFileBytes,
      );
      if (oversizedFile) {
        return NextResponse.json(
          {
            error: `Text file is too large: ${uploadedFilePath(oversizedFile)}`,
          },
          { status: 400 },
        );
      }

      const artifact = await createCodeWorkspaceFromFiles({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        title: directUploadTitle(uploadedFiles),
        files: await Promise.all(
          uploadedFiles.map(async (file) => ({
            path: uploadedFilePath(file),
            content: await file.text(),
          })),
        ),
      });

      return NextResponse.json({
        artifact,
        prompt: uploadPrompt({
          projectId: artifact.projectId,
          title: artifact.title,
          rootFile: artifact.rootFile,
          files: artifact.files,
          source: "files",
        }),
      });
    },
    {
      logLabel: "Failed to upload code workspace",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (
          /zip|file|path|too large|unsupported|symlink|workspace/i.test(message)
        ) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}

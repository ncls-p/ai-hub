# Resource sharing and portable JSON

Resources can be shared as live project access, as an installable marketplace item, or as a downloadable JSON package. Chat links grant access to the conversation and its referenced files. These mechanisms have different lifetimes:

| Mechanism | Recipient receives | Revocation |
| --- | --- | --- |
| Direct resource share | Access to the original resource and the dependencies of a shared agent | Removing that share removes its grants; other independent shares remain effective, including after cloning a project |
| Named chat share | Read access to the conversation, uploaded attachments and code projects | Access is checked again for each download, extracted-text read and code preview |
| Public chat link | Text; downloadable files only when the owner explicitly enables them | Disabling the link or file option, archiving, or expiry blocks subsequent requests |
| Marketplace / JSON import | Independent copies in the recipient's project | Removing access to the source does not delete previously installed copies |

A recipient can keep files already downloaded. A permitted conversation fork also keeps its own references; revoking the original conversation share does not revoke the fork.

## JSON workflow

Choose **Share → Export JSON** on an agent, skill, custom tool or MCP resource. In the marketplace, choose **Import JSON**, select the file and review its resource list and configuration requirements before importing.

The envelope is versioned:

```json
{
  "format": "maiah.resource",
  "schemaVersion": 1,
  "manifest": {
    "type": "skill",
    "name": "Review checklist",
    "skill": {
      "markdownFiles": [{ "path": "SKILL.md", "content": "# Review\nCheck the acceptance criteria." }]
    }
  }
}
```

Agent packages include skill files, custom tool definitions, MCP configuration and tools, and recursively bundled specialist agents at their pinned versions. Import allocates new resource IDs and recreates the bindings in one transaction. A failed import rolls back every resource created by that import. Existing resources with the same name are preserved.

Provider connections, model access, knowledge-base documents and permissions are not transferred. Model and knowledge-base references are shown in the preview; they can resolve only to resources the importing user may access in the destination project. Configure unresolved references after import. MCP connections start disabled and custom tools start as drafts.

Configured credentials, encrypted credential values, secret headers/environment values, credential URL parameters and recognized secret CLI arguments are removed. Credential field definitions are retained so recipients can configure their own connection. Text written manually into prompts, skill files or arbitrary non-secret fields remains part of the resource: review this content before sharing it.

Export requires the project's publishing permission and access to every included source resource. Import requires installation permission plus the relevant agent, skill/tool and MCP creation/configuration permissions, including API-key scope restrictions. JSON packages cannot grant permissions. Unsupported versions, invalid paths, duplicate or missing dependency references, unknown built-in tools, oversized packages (10 MiB), excessive nesting and graphs larger than 256 resources are rejected.

## Conversation files

Authenticated recipients receive read-only access to files referenced by a conversation they can currently access. Upload ownership is checked separately for writes and deletion. Possessing an asset ID or a code-preview token alone grants no access. Public file URLs are scoped to one active public conversation and never expose unreferenced files or private storage metadata.

Existing public links continue to share text only. The owner can enable **Include uploaded files** in the sharing dialog. Public downloads are served as attachments with private, non-cacheable responses; public links do not grant editing or agent execution rights.

## Knowledge documents and pasted text

New knowledge uploads retain the original bytes for all accepted formats, including chunked uploads. The document list exposes upload, preview, download, rename and delete actions. PDF, raster images and text files can be previewed from their original bytes; other formats offer the original download. Existing documents whose originals were never stored can still expose their extracted text. Renaming changes the display title without reindexing or altering the original file. Readers cannot rename or delete documents.

Long pasted text can be edited while attached or moved back into the message. Editing creates a replacement upload only after a successful save. Failed saves preserve the draft, and failed initial uploads restore the pasted text to the message. Restoring text preserves any message text already entered.

## Regression coverage

The sharing integration suites use PostgreSQL and the real permission engine to verify dependency graphs, independent grant revocation, cross-project boundaries, API-key scopes, pinned versions and transaction rollback. Browser tests use authenticated users, real uploads and object storage to compare downloaded bytes, exercise public and named sharing, revoke access, import/export files, preview and rename documents, and recover pasted-text edits after upload failure and page reload. The existing coverage thresholds remain unchanged.

The code workspace tool pack includes `code_workspace_delete_file`. The model receives an explicit instruction to use an exact workspace-relative path for obsolete files. The existing ownership checks also apply to model-triggered deletion; the live artifact, file list and ZIP reflect the updated workspace.

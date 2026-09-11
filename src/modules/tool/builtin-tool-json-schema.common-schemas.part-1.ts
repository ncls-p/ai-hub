export const commonSchemasPart1 = {
  calculator: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Arithmetic expression" },
    },
    required: ["expression"],
  },
  current_time: {
    type: "object",
    properties: { timezone: { type: "string", default: "UTC" } },
    required: [],
  },
  http_fetch: {
    type: "object",
    properties: {
      url: { type: "string", format: "uri" },
      method: { type: "string", enum: ["GET", "HEAD"], default: "GET" },
    },
    required: ["url"],
  },
  web_search: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query. The tool automatically appends today's date to keep results current.",
      },
      limit: { type: "number", default: 5, minimum: 1, maximum: 10 },
      language: {
        type: "string",
        description: "Optional language code, for example en or fr.",
      },
    },
    required: ["query"],
  },
  render_html_artifact: {
    type: "object",
    properties: {
      title: { type: "string", default: "Interactive preview" },
      html: {
        type: "string",
        description: "HTML fragment or full HTML document for the preview.",
      },
      css: { type: "string", default: "" },
      js: { type: "string", default: "" },
      height: { type: "number", default: 420, minimum: 160, maximum: 900 },
    },
    required: ["html"],
  },
  generate_image: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Detailed description of the image to generate.",
      },
      size: {
        type: "string",
        description:
          "Optional size such as 1024x1024. Omit it to use the administrator default.",
        pattern: "^\\d{2,5}x\\d{2,5}$",
      },
    },
    required: ["prompt"],
  },
  run_code_sandbox: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["python", "node", "bash"],
        description: "Runtime to use for this execution.",
      },
      code: {
        type: "string",
        description:
          "Python, Node.js, or Bash code to run. Print values you want in stdout.",
      },
      showToUser: {
        type: "boolean",
        default: false,
        description:
          "Set true only when showing the sandbox result, logs, or generated files directly in chat helps the user. Leave false for internal checks and intermediate work so the completed execution stays in the collapsed tool trace. Code is shown live while being written.",
      },
      stdin: {
        type: "string",
        description: "Optional standard input passed to the program.",
      },
      files: {
        type: "array",
        maxItems: 25,
        description:
          "Optional text files to make available before execution. Each run is wiped after completion.",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path." },
            content: { type: "string", description: "Text file content." },
          },
          required: ["path", "content"],
        },
        default: [],
      },
      attachments: {
        type: "array",
        maxItems: 8,
        description:
          "Uploaded chat attachment IDs to expose in the sandbox. Use IDs shown in the conversation context when analyzing uploaded documents or images. Readable documents get an embedding-free .document directory with README.md, manifest.json, and page/section Markdown chunks unless includeExtractedText is false.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            path: {
              type: "string",
              description:
                "Optional relative path inside the sandbox, for example attachments/report.pdf.",
            },
            includeExtractedText: {
              type: "boolean",
              default: true,
              description:
                "Also add a navigable Markdown document explorer beside the requested path when available.",
            },
          },
          required: ["id"],
        },
        default: [],
      },
      timeoutMs: {
        type: "number",
        default: 15000,
        minimum: 250,
        maximum: 120000,
        description: "Maximum execution time in milliseconds.",
      },
    },
    required: ["language", "code"],
  },
  code_workspace_create_project: {
    type: "object",
    properties: {
      title: { type: "string", default: "Code workspace" },
      rootFile: {
        type: "string",
        description: "HTML entry file, for example index.html.",
      },
      files: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Workspace-relative file path.",
            },
            content: {
              type: "string",
              description:
                "Optional initial content. Prefer omitting this and filling files with code_workspace_write_file.",
            },
          },
          required: ["path"],
        },
      },
    },
    required: ["files"],
  },
  code_workspace_list_files: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
    },
    required: ["projectId"],
  },
  code_workspace_read_file: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      path: { type: "string", description: "Workspace-relative file path." },
    },
    required: ["projectId", "path"],
  },
};

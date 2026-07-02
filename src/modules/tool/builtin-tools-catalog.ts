/** Client-safe builtin tool metadata (no env or server-only imports). */

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

const MEDIUM_RISK_LEVEL = "medium";

export type BuiltInToolSummary = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  riskLevel: ToolRiskLevel;
  category: string;
};

export const BUILTIN_TOOL_SUMMARIES: BuiltInToolSummary[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "calculator",
    displayName: "Calculator",
    description: "Evaluate arithmetic expressions safely.",
    riskLevel: "low",
    category: "Think",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "current_time",
    displayName: "Current time",
    description: "Return the current date and time for any timezone.",
    riskLevel: "low",
    category: "Time",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "http_fetch",
    displayName: "HTTP fetch",
    description: "Fetch a remote URL after approval.",
    riskLevel: "high",
    category: "Web",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "web_search",
    displayName: "Web search",
    description: "Search the web with today’s date automatically included.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Web",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    name: "render_html_artifact",
    displayName: "HTML artifact",
    description: "Render interactive HTML/CSS/JS previews in chat.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Create",
  },
  {
    id: "00000000-0000-4000-8000-000000000037",
    name: "run_code_sandbox",
    displayName: "Code sandbox",
    description:
      "Run Python, Node.js, or Bash in a wiped sandbox with broad data/science/document libraries.",
    riskLevel: "high",
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000034",
    name: "code_workspace_create_project",
    displayName: "Create code workspace",
    description: "Start a live HTML/CSS/JS workspace from generated files.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000029",
    name: "code_workspace_list_files",
    displayName: "Code workspace files",
    description: "List uploaded code files and show the live chat workspace.",
    riskLevel: "low",
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000030",
    name: "code_workspace_read_file",
    displayName: "Read code file",
    description: "Read a text file from an uploaded code workspace.",
    riskLevel: "low",
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000031",
    name: "code_workspace_write_file",
    displayName: "Write code file",
    description: "Create or replace a text file in an uploaded code workspace.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000032",
    name: "code_workspace_replace_text",
    displayName: "Patch code file",
    description: "Patch a code workspace file by replacing exact text.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000033",
    name: "code_workspace_delete_file",
    displayName: "Delete code file",
    description: "Delete a file from an uploaded code workspace.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000035",
    name: "github_get_publish_status",
    displayName: "GitHub status",
    description: "List the current user's connected GitHub repositories.",
    riskLevel: "low",
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000036",
    name: "github_publish_code_workspace",
    displayName: "Publish to GitHub",
    description:
      "Publish a code workspace to a user-selected repo and branch via PR or direct push.",
    riskLevel: "critical",
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000017",
    name: "create_slide_deck",
    displayName: "Slide deck",
    description:
      "Create interactive presentations with click reveals and PDF print/export styling.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Create",
  },
  {
    id: "00000000-0000-4000-8000-000000000018",
    name: "create_business_document",
    displayName: "Business document",
    description:
      "Create printable briefs, reports, proposals, policies, SOPs, and memos.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000019",
    name: "create_spreadsheet",
    displayName: "Spreadsheet",
    description:
      "Create a clean printable table with insights and CSV export text.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Data",
  },
  {
    id: "00000000-0000-4000-8000-000000000020",
    name: "create_meeting_brief",
    displayName: "Meeting brief",
    description:
      "Turn meeting context into an agenda, decisions, and action-item brief.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000021",
    name: "create_action_plan",
    displayName: "Action plan",
    description:
      "Create a phased project plan with owners, deadlines, and risks.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000022",
    name: "create_decision_matrix",
    displayName: "Decision matrix",
    description:
      "Compare options with weighted criteria and a clear recommendation.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000023",
    name: "create_email_pack",
    displayName: "Email pack",
    description:
      "Draft polished business emails, follow-ups, announcements, and outreach variants.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Write",
  },
  {
    id: "00000000-0000-4000-8000-000000000024",
    name: "create_project_status_report",
    displayName: "Project status report",
    description:
      "Create executive-ready updates with status, metrics, blockers, decisions, and next actions.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000025",
    name: "create_risk_register",
    displayName: "Risk register",
    description:
      "Create a structured risk register with impact, owners, mitigations, and contingencies.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000026",
    name: "create_raci_matrix",
    displayName: "RACI matrix",
    description:
      "Create a responsibility matrix for responsible, accountable, consulted, and informed roles.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000027",
    name: "create_customer_account_plan",
    displayName: "Customer account plan",
    description:
      "Create a strategic account plan with stakeholders, opportunities, risks, and next actions.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000028",
    name: "create_competitive_battlecard",
    displayName: "Competitive battlecard",
    description:
      "Create a sales battlecard with positioning, win themes, landmines, objections, and questions.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    name: "random_number",
    displayName: "Random number",
    description: "Generate one or more random numbers in a range.",
    riskLevel: "low",
    category: "Think",
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    name: "uuid_generator",
    displayName: "UUID generator",
    description: "Generate UUIDs for IDs, examples, and test data.",
    riskLevel: "low",
    category: "Create",
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    name: "date_math",
    displayName: "Date math",
    description: "Add, subtract, or compare dates.",
    riskLevel: "low",
    category: "Time",
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    name: "json_tool",
    displayName: "JSON helper",
    description: "Validate, format, minify, or inspect JSON.",
    riskLevel: "low",
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000010",
    name: "text_stats",
    displayName: "Text stats",
    description: "Count words, characters, lines, and reading time.",
    riskLevel: "low",
    category: "Write",
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    name: "base64_tool",
    displayName: "Base64",
    description: "Encode or decode Base64 text.",
    riskLevel: "low",
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    name: "hash_text",
    displayName: "Hash text",
    description: "Create SHA-256, SHA-1, or MD5 hashes.",
    riskLevel: "low",
    category: "Code",
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    name: "unit_converter",
    displayName: "Unit converter",
    description: "Convert length, weight, data, and temperature units.",
    riskLevel: "low",
    category: "Think",
  },
  {
    id: "00000000-0000-4000-8000-000000000014",
    name: "slugify_text",
    displayName: "Slugify text",
    description: "Turn text into clean URL/file slugs.",
    riskLevel: "low",
    category: "Write",
  },
  {
    id: "00000000-0000-4000-8000-000000000015",
    name: "color_converter",
    displayName: "Color converter",
    description: "Convert hex colors to RGB and HSL.",
    riskLevel: "low",
    category: "Design",
  },
  {
    id: "00000000-0000-4000-8000-000000000016",
    name: "markdown_table",
    displayName: "Markdown table",
    description: "Create a clean Markdown table from columns and rows.",
    riskLevel: "low",
    category: "Write",
  },
];

export function listBuiltInToolSummaries(): BuiltInToolSummary[] {
  return BUILTIN_TOOL_SUMMARIES;
}

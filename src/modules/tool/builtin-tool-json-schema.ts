const fallbackSchema = { type: "object", properties: {}, required: [] };
const TITLE_FIELD = "title";

const commonSchemas: Record<string, unknown> = {
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
				description: "HTML fragment for the isolated preview.",
			},
			css: { type: "string", default: "" },
			js: { type: "string", default: "" },
			height: { type: "number", default: 420, minimum: 160, maximum: 900 },
		},
		required: ["html"],
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
					"Uploaded chat attachment IDs to copy into the sandbox as files. Use IDs shown in the conversation context when analyzing uploaded documents or images. Readable documents also get a .extracted.txt sidecar unless includeExtractedText is false.",
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
								"Also add extracted text as <path>.extracted.txt when available.",
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
	code_workspace_write_file: {
		type: "object",
		properties: {
			projectId: { type: "string", format: "uuid" },
			path: { type: "string", description: "Workspace-relative file path." },
			content: { type: "string", description: "Full text content to write." },
		},
		required: ["projectId", "path", "content"],
	},
	code_workspace_replace_text: {
		type: "object",
		properties: {
			projectId: { type: "string", format: "uuid" },
			path: { type: "string", description: "Workspace-relative file path." },
			oldText: { type: "string", description: "Exact text to replace." },
			newText: { type: "string", description: "Replacement text." },
			replaceAll: { type: "boolean", default: false },
		},
		required: ["projectId", "path", "oldText", "newText"],
	},
	code_workspace_delete_file: {
		type: "object",
		properties: {
			projectId: { type: "string", format: "uuid" },
			path: { type: "string", description: "Workspace-relative file path." },
		},
		required: ["projectId", "path"],
	},
	github_get_publish_status: {
		type: "object",
		properties: {},
		required: [],
	},
	github_publish_code_workspace: {
		type: "object",
		properties: {
			projectId: {
				type: "string",
				format: "uuid",
				description: "Code workspace id to publish.",
			},
			repositoryId: {
				type: "string",
				format: "uuid",
				description:
					"User-scoped GitHub repository id returned by github_get_publish_status.",
			},
			mode: {
				type: "string",
				enum: ["pull_request", "direct_push"],
				description:
					"Use pull_request unless the user explicitly asks for direct push.",
			},
			targetBranch: {
				type: "string",
				description:
					"Target branch chosen by the user, including main if requested.",
			},
			sourceBranch: {
				type: "string",
				description: "Optional new branch name for pull_request mode.",
			},
			targetDirectory: {
				type: "string",
				description: "Optional repository subdirectory to write files into.",
			},
			commitMessage: { type: "string" },
			pullRequestTitle: { type: "string" },
			pullRequestBody: { type: "string" },
			confirmDirectPush: {
				type: "boolean",
				description:
					"Must be true only after the user explicitly confirmed direct push.",
				default: false,
			},
		},
		required: [
			"projectId",
			"repositoryId",
			"mode",
			"targetBranch",
			"commitMessage",
		],
	},
	create_slide_deck: {
		type: "object",
		properties: {
			title: { type: "string", description: "Presentation title." },
			subtitle: { type: "string" },
			theme: {
				type: "string",
				enum: ["minimal", "deodis", "midnight", "warm"],
				default: "deodis",
			},
			accentColor: { type: "string", default: "#25adc5" },
			aspectRatio: { type: "string", enum: ["16:9", "4:3"], default: "16:9" },
			animation: {
				type: "string",
				enum: ["rise", "fade", "none"],
				default: "rise",
			},
			height: { type: "number", default: 560, minimum: 360, maximum: 900 },
			showPrintButton: { type: "boolean", default: true },
			slides: {
				type: "array",
				minItems: 1,
				maxItems: 30,
				items: {
					type: "object",
					properties: {
						layout: {
							type: "string",
							enum: [
								TITLE_FIELD,
								"section",
								"bullets",
								"two_column",
								"quote",
								"closing",
							],
							default: "bullets",
						},
						kicker: { type: "string" },
						title: { type: "string" },
						body: { type: "string" },
						bullets: { type: "array", items: { type: "string" }, default: [] },
						secondaryTitle: { type: "string" },
						secondaryBullets: {
							type: "array",
							items: { type: "string" },
							default: [],
						},
						quote: { type: "string" },
						attribution: { type: "string" },
						metricValue: { type: "string" },
						metricLabel: { type: "string" },
						imageUrl: { type: "string", format: "uri" },
						imageAlt: { type: "string" },
						footer: { type: "string" },
						notes: { type: "string" },
					},
					required: [TITLE_FIELD],
				},
			},
		},
		required: [TITLE_FIELD, "slides"],
	},
	create_business_document: {
		type: "object",
		properties: {
			title: { type: "string" },
			documentType: {
				type: "string",
				enum: ["brief", "memo", "report", "proposal", "policy", "sop"],
			},
			audience: { type: "string" },
			executiveSummary: { type: "string" },
			sections: { type: "array", items: { type: "object" } },
			nextSteps: { type: "array", items: { type: "string" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "sections"],
	},
	create_spreadsheet: {
		type: "object",
		properties: {
			title: { type: "string" },
			summary: { type: "string" },
			columns: { type: "array", items: { type: "string" } },
			rows: {
				type: "array",
				items: { type: "array", items: { type: "string" } },
			},
			insights: { type: "array", items: { type: "string" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "columns", "rows"],
	},
	create_meeting_brief: {
		type: "object",
		properties: {
			title: { type: "string" },
			date: { type: "string" },
			attendees: { type: "array", items: { type: "string" } },
			objective: { type: "string" },
			agenda: { type: "array", items: { type: "string" } },
			decisions: { type: "array", items: { type: "string" } },
			actionItems: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD],
	},
	create_action_plan: {
		type: "object",
		properties: {
			title: { type: "string" },
			objective: { type: "string" },
			phases: { type: "array", items: { type: "object" } },
			actionItems: { type: "array", items: { type: "object" } },
			risks: { type: "array", items: { type: "string" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "phases"],
	},
	create_decision_matrix: {
		type: "object",
		properties: {
			title: { type: "string" },
			context: { type: "string" },
			criteria: { type: "array", items: { type: "object" } },
			options: { type: "array", items: { type: "object" } },
			recommendation: { type: "string" },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "criteria", "options"],
	},
	create_email_pack: {
		type: "object",
		properties: {
			title: { type: "string" },
			goal: { type: "string" },
			audience: { type: "string" },
			tone: {
				type: "string",
				enum: ["direct", "friendly", "executive", "sales", "support"],
			},
			emails: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "emails"],
	},
	create_project_status_report: {
		type: "object",
		properties: {
			title: { type: "string" },
			reportingPeriod: { type: "string" },
			overallStatus: {
				type: "string",
				enum: ["green", "yellow", "red", "blocked"],
				default: "green",
			},
			executiveSummary: { type: "string" },
			metrics: { type: "array", items: { type: "object" } },
			milestones: { type: "array", items: { type: "object" } },
			blockers: { type: "array", items: { type: "string" } },
			decisionsNeeded: { type: "array", items: { type: "string" } },
			nextSteps: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD],
	},
	create_risk_register: {
		type: "object",
		properties: {
			title: { type: "string" },
			context: { type: "string" },
			risks: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "risks"],
	},
	create_raci_matrix: {
		type: "object",
		properties: {
			title: { type: "string" },
			context: { type: "string" },
			roles: { type: "array", items: { type: "string" } },
			activities: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "roles", "activities"],
	},
	create_customer_account_plan: {
		type: "object",
		properties: {
			title: { type: "string" },
			accountName: { type: "string" },
			objective: { type: "string" },
			stakeholders: { type: "array", items: { type: "object" } },
			opportunities: { type: "array", items: { type: "object" } },
			risks: { type: "array", items: { type: "string" } },
			nextActions: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "accountName"],
	},
	create_competitive_battlecard: {
		type: "object",
		properties: {
			title: { type: "string" },
			competitor: { type: "string" },
			positioning: { type: "string" },
			winThemes: { type: "array", items: { type: "string" } },
			strengths: { type: "array", items: { type: "string" } },
			weaknesses: { type: "array", items: { type: "string" } },
			landmines: { type: "array", items: { type: "string" } },
			objectionHandling: { type: "array", items: { type: "object" } },
			discoveryQuestions: { type: "array", items: { type: "string" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "competitor"],
	},
	random_number: {
		type: "object",
		properties: {
			min: { type: "number", default: 0 },
			max: { type: "number", default: 100 },
			count: { type: "number", default: 1, minimum: 1, maximum: 100 },
			integer: { type: "boolean", default: true },
		},
		required: [],
	},
	uuid_generator: {
		type: "object",
		properties: {
			count: { type: "number", default: 1, minimum: 1, maximum: 50 },
		},
		required: [],
	},
	date_math: {
		type: "object",
		properties: {
			operation: { type: "string", enum: ["add", "subtract", "difference"] },
			date: { type: "string", description: "Start date, e.g. 2026-06-08" },
			endDate: { type: "string", description: "End date for difference" },
			amount: { type: "number", default: 0 },
			unit: {
				type: "string",
				enum: ["days", "weeks", "months", "years"],
				default: "days",
			},
		},
		required: ["operation", "date"],
	},
	json_tool: {
		type: "object",
		properties: {
			action: {
				type: "string",
				enum: ["validate", "format", "minify", "inspect"],
				default: "format",
			},
			json: { type: "string" },
		},
		required: ["json"],
	},
	text_stats: {
		type: "object",
		properties: {
			text: { type: "string" },
			wordsPerMinute: { type: "number", default: 200 },
		},
		required: ["text"],
	},
	base64_tool: {
		type: "object",
		properties: {
			action: { type: "string", enum: ["encode", "decode"] },
			value: { type: "string" },
		},
		required: ["action", "value"],
	},
	hash_text: {
		type: "object",
		properties: {
			text: { type: "string" },
			algorithm: {
				type: "string",
				enum: ["sha256", "sha1", "md5"],
				default: "sha256",
			},
		},
		required: ["text"],
	},
	unit_converter: {
		type: "object",
		properties: {
			value: { type: "number" },
			from: { type: "string" },
			to: { type: "string" },
		},
		required: ["value", "from", "to"],
	},
	slugify_text: {
		type: "object",
		properties: {
			text: { type: "string" },
			separator: { type: "string", enum: ["-", "_"], default: "-" },
		},
		required: ["text"],
	},
	color_converter: {
		type: "object",
		properties: {
			hex: { type: "string", description: "6-digit hex color, e.g. #0ea5e9" },
		},
		required: ["hex"],
	},
	markdown_table: {
		type: "object",
		properties: {
			columns: { type: "array", items: { type: "string" } },
			rows: {
				type: "array",
				items: { type: "array", items: { type: "string" } },
			},
		},
		required: ["columns", "rows"],
	},
};

export function builtInToolInputSchemaJson(toolName: string) {
	return commonSchemas[toolName] ?? fallbackSchema;
}

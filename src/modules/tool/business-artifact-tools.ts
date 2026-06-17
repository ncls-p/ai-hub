import { z } from "zod";

const shortText = z.string().trim().min(1).max(220);
const optionalText = z.string().trim().max(1_500).optional();
const artifactHeight = z.number().int().min(360).max(900).default(620);

const actionItemSchema = z.object({
	task: shortText,
	owner: z.string().trim().max(120).optional(),
	dueDate: z.string().trim().max(80).optional(),
	status: z.string().trim().max(80).optional(),
	priority: z.enum(["low", "medium", "high"]).optional(),
});

export const businessDocumentInputSchema = z.object({
	title: shortText,
	documentType: z
		.enum(["brief", "memo", "report", "proposal", "policy", "sop"])
		.default("brief"),
	audience: z.string().trim().max(160).optional(),
	executiveSummary: optionalText,
	sections: z
		.array(
			z.object({
				heading: shortText,
				content: optionalText,
				bullets: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
			}),
		)
		.min(1)
		.max(12),
	nextSteps: z.array(z.string().trim().min(1).max(280)).max(8).default([]),
	height: artifactHeight,
});

export const spreadsheetInputSchema = z.object({
	title: shortText,
	summary: optionalText,
	columns: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
	rows: z.array(z.array(z.string().max(500)).max(12)).max(100),
	insights: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
	height: artifactHeight,
});

export const meetingBriefInputSchema = z.object({
	title: shortText,
	date: z.string().trim().max(80).optional(),
	attendees: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
	objective: optionalText,
	agenda: z.array(z.string().trim().min(1).max(240)).max(12).default([]),
	decisions: z.array(z.string().trim().min(1).max(280)).max(12).default([]),
	actionItems: z.array(actionItemSchema).max(20).default([]),
	height: artifactHeight,
});

export const actionPlanInputSchema = z.object({
	title: shortText,
	objective: optionalText,
	phases: z
		.array(
			z.object({
				name: shortText,
				timeframe: z.string().trim().max(120).optional(),
				outcome: optionalText,
				tasks: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
			}),
		)
		.min(1)
		.max(8),
	actionItems: z.array(actionItemSchema).max(30).default([]),
	risks: z.array(z.string().trim().min(1).max(260)).max(10).default([]),
	height: artifactHeight,
});

export const decisionMatrixInputSchema = z.object({
	title: shortText,
	context: optionalText,
	criteria: z
		.array(
			z.object({
				name: shortText,
				weight: z.number().min(0).max(10).default(1),
			}),
		)
		.min(1)
		.max(8),
	options: z
		.array(
			z.object({
				name: shortText,
				description: z.string().trim().max(320).optional(),
				scores: z.array(z.number().min(0).max(5)).max(8).default([]),
				notes: z.string().trim().max(500).optional(),
			}),
		)
		.min(2)
		.max(8),
	recommendation: optionalText,
	height: artifactHeight,
});

export const emailPackInputSchema = z.object({
	title: shortText,
	goal: optionalText,
	audience: z.string().trim().max(180).optional(),
	tone: z
		.enum(["direct", "friendly", "executive", "sales", "support"])
		.default("friendly"),
	emails: z
		.array(
			z.object({
				label: z.string().trim().max(100).default("Email"),
				subject: shortText,
				body: z.string().trim().min(1).max(4_000),
				cta: z.string().trim().max(220).optional(),
			}),
		)
		.min(1)
		.max(6),
	height: artifactHeight,
});

function escapeHtml(value: string | undefined) {
	return (value ?? "").replace(/[&<>'"]/g, (char) => {
		if (char === "&") return "&amp;";
		if (char === "<") return "&lt;";
		if (char === ">") return "&gt;";
		if (char === "'") return "&#39;";
		return "&quot;";
	});
}

function renderList(items: string[], className = "artifact-list") {
	if (items.length === 0) return "";
	return `<ul class="${className}">${items
		.map((item) => `<li>${escapeHtml(item)}</li>`)
		.join("")}</ul>`;
}

function renderPrintToolbar(label = "Print / PDF") {
	return `<div class="artifact-toolbar"><button type="button" data-print>${label}</button></div>`;
}

function createArtifact(
	title: string,
	body: string,
	height: number,
	artifactType: string,
) {
	return {
		kind: "html_artifact" as const,
		title,
		html: `${renderPrintToolbar()}<main class="artifact-page" data-artifact-type="${artifactType}">${body}</main>`,
		css: createBusinessArtifactCss(),
		js: createBusinessArtifactJs(),
		height,
		artifactType,
	};
}

function documentTypeLabel(
	type: z.infer<typeof businessDocumentInputSchema>["documentType"],
) {
	const labels = {
		brief: "Brief",
		memo: "Memo",
		report: "Report",
		proposal: "Proposal",
		policy: "Policy",
		sop: "SOP",
	};
	return labels[type];
}

export function createBusinessDocumentArtifact(
	input: z.infer<typeof businessDocumentInputSchema>,
) {
	const body = `<header class="artifact-hero">
		<p class="artifact-kicker">${documentTypeLabel(input.documentType)}${input.audience ? ` · ${escapeHtml(input.audience)}` : ""}</p>
		<h1>${escapeHtml(input.title)}</h1>
		${input.executiveSummary ? `<p class="artifact-summary">${escapeHtml(input.executiveSummary)}</p>` : ""}
	</header>
	<section class="artifact-sections">
		${input.sections
			.map(
				(section) => `<article class="artifact-section">
					<h2>${escapeHtml(section.heading)}</h2>
					${section.content ? `<p>${escapeHtml(section.content)}</p>` : ""}
					${renderList(section.bullets)}
				</article>`,
			)
			.join("")}
	</section>
	${input.nextSteps.length ? `<section class="artifact-card"><h2>Next steps</h2>${renderList(input.nextSteps)}</section>` : ""}`;
	return createArtifact(input.title, body, input.height, "business_document");
}

function csvEscape(value: string) {
	return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(columns: string[], rows: string[][]) {
	return [columns, ...rows]
		.map((row) =>
			columns.map((_, index) => csvEscape(row[index] ?? "")).join(","),
		)
		.join("\n");
}

export function createSpreadsheetArtifact(
	input: z.infer<typeof spreadsheetInputSchema>,
) {
	const normalizedRows = input.rows.map((row) =>
		input.columns.map((_, index) => row[index] ?? ""),
	);
	const tableRows = normalizedRows
		.map(
			(row) =>
				`<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
		)
		.join("");
	const body = `<header class="artifact-hero compact">
		<p class="artifact-kicker">Spreadsheet</p>
		<h1>${escapeHtml(input.title)}</h1>
		${input.summary ? `<p class="artifact-summary">${escapeHtml(input.summary)}</p>` : ""}
	</header>
	<div class="table-wrap"><table><thead><tr>${input.columns
		.map((column) => `<th>${escapeHtml(column)}</th>`)
		.join("")}</tr></thead><tbody>${tableRows}</tbody></table></div>
	${renderList(input.insights, "artifact-list insights")}
	<details class="artifact-card"><summary>CSV export</summary><textarea readonly>${escapeHtml(toCsv(input.columns, normalizedRows))}</textarea></details>`;
	return createArtifact(input.title, body, input.height, "spreadsheet");
}

function renderActionRows(items: z.infer<typeof actionItemSchema>[]) {
	if (items.length === 0) return "";
	return `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${items
		.map(
			(item) =>
				`<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.owner ?? "—")}</td><td>${escapeHtml(item.dueDate ?? "—")}</td><td>${escapeHtml(item.status ?? item.priority ?? "—")}</td></tr>`,
		)
		.join("")}</tbody></table></div>`;
}

export function createMeetingBriefArtifact(
	input: z.infer<typeof meetingBriefInputSchema>,
) {
	const body = `<header class="artifact-hero compact">
		<p class="artifact-kicker">Meeting brief${input.date ? ` · ${escapeHtml(input.date)}` : ""}</p>
		<h1>${escapeHtml(input.title)}</h1>
		${input.objective ? `<p class="artifact-summary">${escapeHtml(input.objective)}</p>` : ""}
	</header>
	<div class="artifact-grid two">
		<section class="artifact-card"><h2>Agenda</h2>${renderList(input.agenda)}</section>
		<section class="artifact-card"><h2>Decisions</h2>${renderList(input.decisions)}</section>
	</div>
	<section class="artifact-card"><h2>Action items</h2>${renderActionRows(input.actionItems)}</section>
	${input.attendees.length ? `<p class="artifact-meta">Attendees: ${escapeHtml(input.attendees.join(", "))}</p>` : ""}`;
	return createArtifact(input.title, body, input.height, "meeting_brief");
}

export function createActionPlanArtifact(
	input: z.infer<typeof actionPlanInputSchema>,
) {
	const phases = input.phases
		.map(
			(phase, index) => `<article class="timeline-item">
				<span>${index + 1}</span>
				<div><h2>${escapeHtml(phase.name)}</h2>${phase.timeframe ? `<p class="artifact-meta">${escapeHtml(phase.timeframe)}</p>` : ""}${phase.outcome ? `<p>${escapeHtml(phase.outcome)}</p>` : ""}${renderList(phase.tasks)}</div>
			</article>`,
		)
		.join("");
	const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Action plan</p><h1>${escapeHtml(input.title)}</h1>${input.objective ? `<p class="artifact-summary">${escapeHtml(input.objective)}</p>` : ""}</header>
	<section class="timeline">${phases}</section>
	<section class="artifact-card"><h2>Owners and deadlines</h2>${renderActionRows(input.actionItems)}</section>
	${input.risks.length ? `<section class="artifact-card"><h2>Risks to watch</h2>${renderList(input.risks)}</section>` : ""}`;
	return createArtifact(input.title, body, input.height, "action_plan");
}

export function createDecisionMatrixArtifact(
	input: z.infer<typeof decisionMatrixInputSchema>,
) {
	const totalWeight =
		input.criteria.reduce((sum, item) => sum + item.weight, 0) || 1;
	const scoredOptions = input.options
		.map((option) => {
			const score = input.criteria.reduce(
				(sum, criterion, index) =>
					sum + (option.scores[index] ?? 0) * criterion.weight,
				0,
			);
			return { ...option, total: score / totalWeight };
		})
		.sort((a, b) => b.total - a.total);
	const header = `<th>Option</th>${input.criteria
		.map(
			(criterion) =>
				`<th>${escapeHtml(criterion.name)}<small>×${criterion.weight}</small></th>`,
		)
		.join("")}<th>Total</th>`;
	const rows = scoredOptions
		.map(
			(option) =>
				`<tr><td><strong>${escapeHtml(option.name)}</strong>${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}</td>${input.criteria
					.map((_, index) => `<td>${option.scores[index] ?? "—"}</td>`)
					.join("")}<td><strong>${option.total.toFixed(1)}</strong></td></tr>`,
		)
		.join("");
	const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Decision matrix</p><h1>${escapeHtml(input.title)}</h1>${input.context ? `<p class="artifact-summary">${escapeHtml(input.context)}</p>` : ""}</header>
	<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>
	<section class="artifact-card"><h2>Recommendation</h2><p>${escapeHtml(input.recommendation ?? scoredOptions[0]?.name ?? "Review the highest-scoring option.")}</p></section>`;
	return createArtifact(input.title, body, input.height, "decision_matrix");
}

export function createEmailPackArtifact(
	input: z.infer<typeof emailPackInputSchema>,
) {
	const emails = input.emails
		.map(
			(email) =>
				`<article class="artifact-section email-card"><p class="artifact-kicker">${escapeHtml(email.label)} · ${escapeHtml(input.tone)}</p><h2>${escapeHtml(email.subject)}</h2><pre>${escapeHtml(email.body)}</pre>${email.cta ? `<p class="artifact-meta">CTA: ${escapeHtml(email.cta)}</p>` : ""}</article>`,
		)
		.join("");
	const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Email pack${input.audience ? ` · ${escapeHtml(input.audience)}` : ""}</p><h1>${escapeHtml(input.title)}</h1>${input.goal ? `<p class="artifact-summary">${escapeHtml(input.goal)}</p>` : ""}</header>${emails}`;
	return createArtifact(input.title, body, input.height, "email_pack");
}

function createBusinessArtifactCss() {
	return `:root { color-scheme: light; --accent: #25adc5; --ink: #111827; --muted: #667085; --line: #e5e7eb; --soft: #f8fafc; }
body { margin: 0; background: #f4f5f7; color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.artifact-toolbar { position: sticky; top: 0; z-index: 3; display: flex; justify-content: flex-end; gap: 8px; padding: 10px; background: rgba(244,245,247,.92); border-bottom: 1px solid var(--line); backdrop-filter: blur(8px); }
.artifact-toolbar button { border: 1px solid var(--line); border-radius: 999px; background: #fff; padding: 7px 12px; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.artifact-page { max-width: 980px; margin: 0 auto; padding: 42px; background: #fff; min-height: 100%; }
.artifact-hero { border-bottom: 1px solid var(--line); padding-bottom: 26px; margin-bottom: 26px; }
.artifact-hero.compact { padding-bottom: 20px; margin-bottom: 20px; }
.artifact-kicker { margin: 0 0 10px; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(32px, 5vw, 56px); line-height: .96; letter-spacing: -.055em; }
h2 { margin: 0 0 10px; font-size: 18px; letter-spacing: -.02em; }
p { color: var(--muted); line-height: 1.58; }
.artifact-summary { max-width: 780px; font-size: 18px; color: #344054; }
.artifact-sections, .artifact-grid { display: grid; gap: 16px; }
.artifact-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.artifact-section, .artifact-card { border: 1px solid var(--line); border-radius: 18px; background: var(--soft); padding: 18px; margin-bottom: 16px; }
.artifact-list { margin: 0; padding-left: 18px; color: #344054; }
.artifact-list li { margin: 7px 0; line-height: 1.45; }
.insights { margin-top: 16px; }
.artifact-meta { color: var(--muted); font-size: 13px; }
.table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 16px; background: #fff; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { border-bottom: 1px solid var(--line); padding: 11px 12px; text-align: left; vertical-align: top; }
th { background: var(--soft); color: #475467; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
td small, th small { display: block; margin-top: 4px; color: var(--muted); font-weight: 500; text-transform: none; letter-spacing: 0; }
textarea { width: 100%; min-height: 140px; margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 12px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.timeline { display: grid; gap: 14px; }
.timeline-item { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 14px; }
.timeline-item > span { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, white); color: var(--accent); font-weight: 800; }
.email-card pre { white-space: pre-wrap; margin: 0; color: #344054; font: inherit; line-height: 1.6; }
@media (max-width: 720px) { .artifact-page { padding: 24px; } .artifact-grid.two { grid-template-columns: 1fr; } }
@media print { @page { size: A4; margin: 14mm; } body { background: #fff; } .artifact-toolbar { display: none; } .artifact-page { padding: 0; max-width: none; } .artifact-section, .artifact-card, .table-wrap { break-inside: avoid; } }`;
}

function createBusinessArtifactJs() {
	return `document.addEventListener('click', (event) => { const button = event.target.closest('[data-print]'); if (button) window.print(); });`;
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const toolUseCasesMock = vi.hoisted(() => ({
	canExecuteRestrictedTool: vi.fn(),
	getCustomBindingContext: vi.fn(),
	getMcpBindingContext: vi.fn(),
	getToolBindingsForVersion: vi.fn(),
	logToolInvocation: vi.fn(),
}));

vi.mock("@/modules/tool/use-cases", () => toolUseCasesMock);

vi.mock("@/server/infrastructure/db", () => ({
	db: {},
}));

vi.mock("@/server/infrastructure/ai-sdk/devtools", () => ({
	registerAiSdkDevTools: vi.fn(),
}));

vi.mock("@/modules/tool/invocation-state", () => ({
	waitForApproval: vi.fn(),
}));

vi.mock("@/modules/tool/opa-approval-policy", () => ({
	evaluateOpaToolApprovalPolicy: vi.fn(async () => null),
}));

type BuildBoundTools =
	typeof import("@/app/api/workspace/[agentId]/chat/route-support")["buildBoundTools"];

type BuiltInToolLookup =
	typeof import("@/modules/tool/builtin-tools")["getBuiltInToolByName"];

async function loadModules() {
	vi.resetModules();
	const [routeSupport, builtinTools] = await Promise.all([
		import("@/app/api/workspace/[agentId]/chat/route-support"),
		import("@/modules/tool/builtin-tools"),
	]);
	return {
		buildBoundTools: routeSupport.buildBoundTools as BuildBoundTools,
		getBuiltInToolByName:
			builtinTools.getBuiltInToolByName as BuiltInToolLookup,
	};
}

function buildInput() {
	return {
		agentVersionId: "version-1",
		workspaceId: "workspace-1",
		conversationId: "conversation-1",
		messageId: "message-1",
		userId: "user-1",
		maxToolCalls: 6,
		hasSkills: false,
	};
}

describe("chat route tool gating", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		toolUseCasesMock.getToolBindingsForVersion.mockResolvedValue([]);
	});

	it("does not auto-enable code workspace tools without explicit bindings", async () => {
		const { buildBoundTools } = await loadModules();

		const { tools } = await buildBoundTools(buildInput());

		expect(Object.keys(tools)).not.toContain("code_workspace_create_project");
		expect(Object.keys(tools)).not.toContain("code_workspace_write_file");
	});

	it("exposes a code workspace tool only when the builtin tool is bound", async () => {
		const { buildBoundTools, getBuiltInToolByName } = await loadModules();
		const createProjectTool = getBuiltInToolByName(
			"code_workspace_create_project",
		);
		expect(createProjectTool).toBeTruthy();
		toolUseCasesMock.getToolBindingsForVersion.mockResolvedValue([
			{
				id: "binding-1",
				agentVersionId: "version-1",
				toolSource: "builtin",
				toolId: createProjectTool?.id,
				requireApproval: false,
				riskLevel: createProjectTool?.riskLevel,
				createdAt: new Date(),
			},
		]);

		const { tools } = await buildBoundTools(buildInput());

		expect(Object.keys(tools)).toContain("code_workspace_create_project");
		expect(Object.keys(tools)).not.toContain("code_workspace_write_file");
	});
});

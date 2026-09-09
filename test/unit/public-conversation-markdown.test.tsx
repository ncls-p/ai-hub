// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicConversation } from "@/app/[locale]/share/[publicShareId]/public-conversation";
import messages from "../../messages/en.json";

function view(id: string) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <PublicConversation publicShareId={id} />
    </NextIntlClientProvider>
  );
}
const payload = {
  conversation: {
    title: "Shared report",
    agentName: "Assistant",
    updatedAt: "2026-09-09",
  },
  messages: [
    {
      id: "message",
      role: "assistant",
      parts: [{ type: "text", content: "## Results\n\n**Verified** content" }],
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public shared conversation", () => {
  it("renders actual markdown headings and emphasis", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    render(view("first"));
    expect(
      await screen.findByRole("heading", { name: "Shared report" }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: "Results" }),
    ).toBeTruthy();
    expect(screen.getByText("Verified").getAttribute("data-streamdown")).toBe(
      "strong",
    );
  });

  it.each([404, 410])("shows unavailable for HTTP %s", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status })),
    );
    render(view("missing"));
    expect(
      await screen.findByText(messages.chat.publicConversation.notFound),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it.each(["server", "network"])(
    "can recover after a %s failure",
    async (kind) => {
      const fetchMock = vi.fn();
      if (kind === "server")
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
      else
        fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
      fetchMock.mockResolvedValueOnce(Response.json(payload));
      vi.stubGlobal("fetch", fetchMock);
      render(view("retry"));
      const retry = await screen.findByRole("button", { name: "Try again" });
      expect(
        screen.queryByText(messages.chat.publicConversation.notFound),
      ).toBeNull();
      fireEvent.click(retry);
      expect(
        await screen.findByRole("heading", { name: "Shared report" }),
      ).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("hides the old conversation immediately when the share changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(payload))
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(view("first"));
    await screen.findByRole("heading", { name: "Shared report" });
    rerender(view("second"));
    expect(screen.queryByRole("heading", { name: "Shared report" })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

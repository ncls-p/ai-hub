// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { ChatImageAttachmentCard } from "@/components/chat/chat-image-attachment-card";
import messages from "../../messages/en.json";

afterEach(cleanup);

describe("chat image attachment card", () => {
  it("renders the attachment and opens and closes its actual preview dialog", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChatImageAttachmentCard
          attachment={{
            kind: "chat_image",
            id: "image-1",
            hash: "image-hash",
            fileName: "diagram.png",
            mimeType: "image/png",
            size: 1024,
            url: "/diagram.png",
          }}
        />
      </NextIntlClientProvider>,
    );
    const image = screen.getByRole("img", { name: "diagram.png" });
    expect(image.getAttribute("src")).toBe("/diagram.png");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    const dialog = await screen.findByRole("dialog", { name: "diagram.png" });
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(
      "/diagram.png",
    );
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

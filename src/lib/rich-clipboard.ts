import DOMPurify from "dompurify";

export async function copyRichHtml(html: string) {
  const cleanHtml = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  const plainText = htmlToPlainText(cleanHtml);

  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([wrapHtmlForClipboard(cleanHtml)], {
          type: "text/html",
        }),
        "text/plain": new Blob([plainText], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  copyRichHtmlFallback(cleanHtml);
}

function wrapHtmlForClipboard(html: string) {
  return `<!doctype html><html><body>${html}</body></html>`;
}

function htmlToPlainText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent?.trim() ?? "";
}

function copyRichHtmlFallback(html: string) {
  const host = document.createElement("div");
  host.contentEditable = "true";
  host.style.position = "fixed";
  host.style.left = "-9999px";
  host.style.top = "0";
  host.style.whiteSpace = "pre-wrap";

  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const child of Array.from(doc.body.childNodes)) {
    host.appendChild(document.importNode(child, true));
  }

  document.body.appendChild(host);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(host);
  selection?.removeAllRanges();
  selection?.addRange(range);

  document.execCommand("copy");
  selection?.removeAllRanges();
  document.body.removeChild(host);
}

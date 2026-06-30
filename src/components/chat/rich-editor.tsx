"use client";

import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TurndownService from "turndown";
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { cn } from "@/lib/utils";

export interface RichEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
];

export function RichEditor({
  value,
  onChange,
  onSave,
  onCancel,
  disabled,
  className,
}: RichEditorProps) {
  const prevValue = useRef(value);
  const initialized = useRef(false);
  const turndown = useMemo(
    () =>
      new TurndownService({
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        headingStyle: "atx",
      }),
    [],
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        class:
          "tiptap-content min-h-[6rem] max-h-64 overflow-y-auto rounded-lg border border-border/50 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = turndown.turndown(editor.getHTML()).trim();
      if (markdown !== prevValue.current) {
        prevValue.current = markdown;
        onChange?.(markdown);
      }
    },
  });

  // Keep editor content in sync only for external value changes.
  useEffect(() => {
    if (!editor) return;
    if (initialized.current && value === prevValue.current) return;

    prevValue.current = value;
    initialized.current = true;
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  const toolbarButtonClass =
    "size-7 rounded-md p-0 text-muted-foreground transition-transform duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.96]";

  return (
    <div className={cn("flex min-w-72 flex-col gap-2", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/40 p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
          aria-label="Bold"
        >
          <BoldIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
          aria-label="Italic"
        >
          <ItalicIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={disabled}
          aria-label="Strikethrough"
        >
          <StrikethroughIcon className="size-3.5" aria-hidden="true" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border/60" />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={disabled}
          aria-label="Inline code"
        >
          <CodeIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={disabled}
          aria-label="Blockquote"
        >
          <QuoteIcon className="size-3.5" aria-hidden="true" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border/60" />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          aria-label="Bullet list"
        >
          <ListIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          aria-label="Ordered list"
        >
          <ListOrderedIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} disabled={disabled} />

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={onCancel}
        >
          Annuler
        </Button>
        <Button type="button" size="sm" disabled={disabled} onClick={onSave}>
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}

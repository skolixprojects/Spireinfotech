"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link2 } from "lucide-react";

function ToolbarBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded p-1.5 transition-colors ${active ? "bg-[#0F766E]/15 text-[#0F766E]" : "text-gray-500 hover:bg-gray-100"}`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  initialHtml,
  onChange,
}: {
  initialHtml: string;
  onChange: (html: string, text: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false, // required for Next SSR (avoid hydration mismatch)
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: initialHtml || "",
    editorProps: {
      attributes: {
        class:
          "min-h-[120px] max-h-[40vh] overflow-y-auto px-3 py-2 text-sm leading-relaxed text-gray-800 focus:outline-none sm:min-h-[160px] [&_a]:text-[#0F766E] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  });

  const setLink = (ed: Editor) => {
    const prev = (ed.getAttributes("link").href as string) || "";
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    if (url.trim() === "") { ed.chain().focus().unsetLink().run(); return; }
    ed.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="rounded-lg border border-gray-300">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-1.5 py-1">
        <ToolbarBtn title="Bold" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></ToolbarBtn>
        <ToolbarBtn title="Italic" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolbarBtn>
        <ToolbarBtn title="Underline" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <ToolbarBtn title="Bullet list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></ToolbarBtn>
        <ToolbarBtn title="Numbered list" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <ToolbarBtn title="Link" active={editor?.isActive("link")} onClick={() => editor && setLink(editor)}><Link2 size={15} /></ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

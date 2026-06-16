"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

// Force any surviving links to open safely. Registered once, client-side.
if (typeof window !== "undefined") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/**
 * Renders an untrusted mail body. body_html is ALWAYS run through
 * DOMPurify before it touches the DOM (scripts, event handlers,
 * javascript: URLs, etc. are stripped); raw body_html is never rendered.
 * Falls back to plain text when there is no HTML.
 */
export function SafeHtml({ html, text }: { html?: string | null; text?: string | null }) {
  const clean = useMemo(() => {
    if (typeof window === "undefined") return null;     // sanitize client-side only
    if (!html || !html.trim()) return null;
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }, [html]);

  if (clean) {
    return (
      <div
        className="text-sm leading-relaxed text-gray-800 break-words [&_a]:text-[#0F766E] [&_a]:underline [&_img]:max-w-full [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }
  return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{text || ""}</div>;
}

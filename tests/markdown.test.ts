import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("Markdown", () => {
  it("renders the supported subset", () => {
    const out = html("## Pillars\n- **Tides** matter\n- `code`\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> quote\n\n1. one\n2. two");
    expect(out).toContain("<h3");
    expect(out).toContain("<strong>Tides</strong>");
    expect(out).toContain("<table");
    expect(out).toContain("<blockquote");
    expect(out).toContain("<ol");
  });
  it("never renders raw HTML or script links", () => {
    const out = html('<script>alert(1)</script>\n\n[click](javascript:alert(1))\n\n<img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain('href="javascript');
    expect(out).toContain("&lt;script&gt;");
  });
  it("embeds only allow-listed boards", () => {
    expect(html("https://www.figma.com/design/AbC/Harbour")).toContain('<iframe src="https://www.figma.com/embed?embed_host=guildhall');
    expect(html("https://evil.example/board")).not.toContain("<iframe");
    expect(html("[site](https://example.com)")).toContain('href="https://example.com"');
  });
});

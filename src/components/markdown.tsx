import { embedUrl } from "@/lib/gdd";

/**
 * A small, safe markdown renderer for GDD pages: headings, lists, tables, quotes, code, bold,
 * italic and http(s) links. A Figma or Miro link alone on a line becomes an embed. No raw HTML
 * is ever rendered; everything goes through React text nodes.
 */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|_[^_]+_|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push(/^https?:\/\//.test(href) ? <a key={key} href={href} target="_blank" rel="noreferrer nofollow" className="link">{label}</a> : label);
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) {
      const cls = ["", "font-display text-2xl font-bold", "font-display text-lg font-semibold pt-3", "font-semibold pt-2"][h[1].length];
      blocks.push(h[1].length === 1 ? <h2 key={k} className={cls}>{inline(h[2], k)}</h2> : h[1].length === 2 ? <h3 key={k} className={cls}>{inline(h[2], k)}</h3> : <h4 key={k} className={cls}>{inline(h[2], k)}</h4>);
      i++;
      continue;
    }
    const embed = embedUrl(line.trim());
    if (embed && /^\S+$/.test(line.trim())) {
      blocks.push(<iframe key={k} src={embed} className="aspect-video w-full rounded-xl border border-border" allowFullScreen loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups" />);
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k} className="scroll-x">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{head.map((c, j) => <th key={j} className="border-b border-border px-2 py-1.5 text-left font-semibold">{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border-b border-border/60 px-2 py-1.5">{inline(c, `${k}r${ri}${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^(- |\* |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(- |\* |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\* |\d+\. )/, ""));
      const cls = ordered ? "list-decimal space-y-1 pl-6" : "list-disc space-y-1 pl-6";
      const lis = items.map((it, j) => <li key={j}>{inline(it, `${k}l${j}`)}</li>);
      blocks.push(ordered ? <ol key={k} className={cls}>{lis}</ol> : <ul key={k} className={cls}>{lis}</ul>);
      continue;
    }
    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) quote.push(lines[i++].slice(2));
      blocks.push(<blockquote key={k} className="border-l-4 border-accent/60 pl-4 italic text-fg-muted">{inline(quote.join(" "), k)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |\||- |\* |\d+\. |> )/.test(lines[i]) && !(embedUrl(lines[i].trim()) && /^\S+$/.test(lines[i].trim()))) para.push(lines[i++]);
    blocks.push(<p key={k} className="leading-relaxed">{inline(para.join(" "), k)}</p>);
  }
  return <div className="space-y-3">{blocks}</div>;
}

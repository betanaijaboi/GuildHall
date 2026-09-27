/** Renders the small markdown subset contracts use (headings, bold, list items, italics line). */
export function ContractText({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part.replace(/\s{2}$/, "")}</span>,
    );
  return (
    <div className="space-y-2 font-serif text-[15px] leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h2 key={i} className="font-display text-xl font-bold">{line.slice(2)}</h2>;
        if (line.startsWith("## ")) return <h3 key={i} className="pt-2 font-display font-semibold">{line.slice(3)}</h3>;
        if (/^\d+\. /.test(line)) return <p key={i} className="pl-4">{inline(line)}</p>;
        if (line.startsWith("_") && line.endsWith("_")) return <p key={i} className="pt-2 text-sm italic text-fg-muted">{line.slice(1, -1)}</p>;
        if (!line.trim()) return null;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

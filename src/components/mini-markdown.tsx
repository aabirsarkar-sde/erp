import Link from "next/link";
import { Fragment } from "react";

// Tiny, safe renderer: paragraphs, "- " bullets, **bold**, _italic_, [text](/internal-link)
function inline(text: string, key: string) {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(?<![\w])_([^_\n]+)_(?![\w])/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const href = m[2]!;
      out.push(href.startsWith("/") ? <Link key={`${key}-${i++}`} href={href} className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600">{m[1]}</Link> : <span key={`${key}-${i++}`}>{m[1]}</span>);
    } else if (m[3]) out.push(<b key={`${key}-${i++}`} className="font-semibold">{m[3]}</b>);
    else if (m[4]) out.push(<i key={`${key}-${i++}`} className="text-slate-500">{m[4]}</i>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*([-*•]|\d+\.)\s+/;

export function MiniMarkdown({ text }: { text: string }) {
  // group consecutive lines into paragraphs and bullet lists
  const groups: { list: boolean; lines: string[] }[] = [];
  for (const line of text.trim().split("\n")) {
    if (!line.trim()) { groups.push({ list: false, lines: [] }); continue; }
    const list = BULLET.test(line);
    const g = groups[groups.length - 1];
    if (g && g.list === list && g.lines.length) g.lines.push(line);
    else groups.push({ list, lines: [line] });
  }
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {groups.filter((g) => g.lines.length).map((g, gi) =>
        g.list ? (
          <ul key={gi} className="list-disc space-y-0.5 pl-5">{g.lines.map((l, li) => <li key={li}>{inline(l.replace(BULLET, ""), `${gi}-${li}`)}</li>)}</ul>
        ) : (
          <p key={gi}>{g.lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `${gi}-${li}`)}</Fragment>)}</p>
        ),
      )}
    </div>
  );
}

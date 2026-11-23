/**
 * A translated sentence with markup inside it. The translation keeps the
 * sentence whole — so the link can move to wherever the language puts it —
 * and the code supplies what the tags and placeholders become.
 *
 *   // en: "Read the <docs>docs</docs> or ask {name}."
 *   rich(t.chat.help, {
 *     docs: (text) => <a href={DOCS}>{text}</a>,
 *     name: <b>{owner}</b>,
 *   })
 *
 * Tags don't nest. A tag or placeholder with no part is left as plain text,
 * so a missing part shows up on screen rather than silently vanishing.
 */
import { Fragment, type ReactNode } from "react";

type Part = ReactNode | ((inner: string) => ReactNode);

const TOKEN = /<(\w+)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;

export function rich(template: string, parts: Record<string, Part>): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of template.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(template.slice(last, at));
    const [whole, tag, inner, name] = m;
    const key = (tag ?? name)!;
    const part = parts[key];
    let node: ReactNode;
    if (part === undefined) node = tag ? inner : whole;
    else if (typeof part === "function") node = (part as (s: string) => ReactNode)(inner ?? "");
    else node = part;
    out.push(<Fragment key={i++}>{node}</Fragment>);
    last = at + whole.length;
  }
  if (last < template.length) out.push(template.slice(last));
  return <>{out}</>;
}

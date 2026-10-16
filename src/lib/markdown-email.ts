// Minimal, safe Markdown → email HTML (headings, bold, italics, links, images, lists, paragraphs).
// All text is escaped first; only http(s) URLs are allowed for links/images.

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(u: string) {
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
}

function inline(s: string) {
  let out = esc(s);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) => {
    const u = safeUrl(url);
    return u ? `<img src="${u}" alt="${alt}" style="max-width:100%;border-radius:8px" />` : "";
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    const u = safeUrl(url);
    return u ? `<a href="${u}">${text}</a>` : text;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return out;
}

export function markdownToEmailHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: string[] | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join("<br />")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`);
    list = null;
  };
  for (const line of lines) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      html.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
    } else if (li) {
      flushPara();
      (list ??= []).push(li[1]!);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return html.join("\n");
}

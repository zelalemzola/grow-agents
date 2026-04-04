/**
 * Prepares section HTML for the in-app rich-text editor: removes inline colors
 * that are too light to read on a light "paper" editing surface. Dark text and
 * accent colors are preserved. Does not run on the server.
 */

const NAMED_COLORS: Record<string, string> = {
  white: "#ffffff",
  snow: "#fffafa",
  ivory: "#fffff0",
  ghostwhite: "#f8f8ff",
  whitesmoke: "#f5f5f5",
  seashell: "#fff5ee",
  linen: "#faf0e6",
  floralwhite: "#fffaf0",
  oldlace: "#fdf5e6",
  mintcream: "#f5fffa",
  azure: "#f0ffff",
  honeydew: "#f0fff0",
  aliceblue: "#f0f8ff",
  lavenderblush: "#fff0f5",
  mistyrose: "#ffe4e1",
  beige: "#f5f5dc",
  lightyellow: "#ffffe0",
  lightcyan: "#e0ffff",
  gainsboro: "#dcdcdc",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  silver: "#c0c0c0",
  black: "#000000",
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const x = clamp01(c / 255);
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 || !/^[0-9a-f]+$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function parseRgbLike(value: string): { r: number; g: number; b: number; a?: number } | null {
  const s = value.trim();
  const m =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
      s,
    );
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    const a = m[4] !== undefined ? Number(m[4]) : 1;
    if ([r, g, b].some((x) => Number.isNaN(x))) return null;
    return { r, g, b, a: Number.isNaN(a) ? 1 : a };
  }
  return null;
}

function colorStringIsTooLightForPaper(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "inherit" || v === "currentcolor" || v === "transparent") return false;

  const named = NAMED_COLORS[v];
  if (named) {
    const rgb = parseHex(named);
    if (rgb) return relativeLuminance(rgb.r, rgb.g, rgb.b) > 0.55;
  }

  if (v.startsWith("#")) {
    const rgb = parseHex(v);
    if (rgb) return relativeLuminance(rgb.r, rgb.g, rgb.b) > 0.55;
    return false;
  }

  const rgb = parseRgbLike(v);
  if (rgb) {
    if (rgb.a !== undefined && rgb.a < 0.35) return false;
    return relativeLuminance(rgb.r, rgb.g, rgb.b) > 0.55;
  }

  return false;
}

function stripLightColorFromStyle(style: string): string | null {
  const parts = style
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const kept = parts.filter((p) => {
    const cm = /^\s*color\s*:\s*(.+)$/i.exec(p);
    if (!cm) return true;
    return !colorStringIsTooLightForPaper(cm[1]!.trim());
  });
  const next = kept.join("; ");
  return next.length ? next : null;
}

function walkEditorTree(node: Node): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === "font") {
    const c = el.getAttribute("color");
    if (c && colorStringIsTooLightForPaper(c)) el.removeAttribute("color");
  }

  const st = el.getAttribute("style");
  if (st) {
    const next = stripLightColorFromStyle(st);
    if (next) el.setAttribute("style", next);
    else el.removeAttribute("style");
  }

  for (const c of Array.from(el.childNodes)) walkEditorTree(c);
}

export function prepareSectionHtmlForEditor(html: string): string {
  if (typeof window === "undefined" || !html.trim()) return html;
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="section-editor-root">${html}</div>`,
      "text/html",
    );
    const root = doc.getElementById("section-editor-root");
    if (!root) return html;
    for (const c of Array.from(root.childNodes)) walkEditorTree(c);
    return root.innerHTML;
  } catch {
    return html;
  }
}

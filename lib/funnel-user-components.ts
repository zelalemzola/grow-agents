/**
 * User-inserted inline components (heading, paragraph, link, image, divider).
 * Base classes in CSS; layout/colors/shadows often applied via inline styles from user picks.
 */

export const FUNNEL_USER_COMPONENTS_CSS_MARKER = "/* funnel-user-components */";

const DEFAULT_STYLES = `${FUNNEL_USER_COMPONENTS_CSS_MARKER}
.funnel-user-component {
  margin-left: 0;
  margin-right: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.funnel-user-heading-wrap .funnel-user-heading {
  margin: 0;
  line-height: 1.2;
}
.funnel-user-p {
  margin: 0;
  line-height: 1.65;
}
.funnel-user-link {
  text-decoration: underline;
  font-weight: 500;
}
.funnel-user-image-wrap .funnel-user-media {
  width: 100%;
  max-width: 100%;
  height: auto;
  display: block;
}
`;

export type UserComponentKind = "heading" | "paragraph" | "link" | "image" | "divider";

export type SpacingToken = "none" | "xs" | "sm" | "md" | "lg" | "xl";
export type RadiusToken = "none" | "sm" | "md" | "lg" | "full";
export type ShadowToken = "none" | "sm" | "md" | "lg" | "xl";

export type UserComponentStyle = {
  padding: SpacingToken;
  marginY: SpacingToken;
  borderRadius: RadiusToken;
  shadow: ShadowToken;
  /** Text / foreground (hex or empty = inherit theme) */
  textColor: string;
  /** Block background (hex or empty = transparent) */
  backgroundColor: string;
  /** Border around block (hex or empty = no border color) */
  borderColor: string;
  borderWidth: "none" | "thin" | "medium";
  /** Divider line only */
  dividerColor: string;
};

export type UserComponentFields = {
  headingText: string;
  headingLevel: "h2" | "h3" | "h4";
  headingFontSize: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  headingFontWeight: "normal" | "medium" | "semibold" | "bold";
  paragraphText: string;
  paragraphFontSize: "sm" | "md" | "lg" | "base";
  linkText: string;
  linkHref: string;
  linkNewTab: boolean;
  linkUnderline: boolean;
  imageSrc: string;
  imageAlt: string;
  style: UserComponentStyle;
};

const PADDING_MAP: Record<SpacingToken, string> = {
  none: "0",
  xs: "0.375rem",
  sm: "0.625rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
};

const MARGIN_Y_MAP: Record<SpacingToken, string> = {
  none: "0",
  xs: "0.375rem",
  sm: "0.75rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
};

const RADIUS_MAP: Record<RadiusToken, string> = {
  none: "0",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  full: "9999px",
};

const SHADOW_MAP: Record<ShadowToken, string> = {
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,0.06)",
  md: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.06)",
  lg: "0 10px 15px -3px rgba(0,0,0,0.12), 0 4px 6px -4px rgba(0,0,0,0.06)",
  xl: "0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.08)",
};

const HEADING_SIZE_REM: Record<UserComponentFields["headingFontSize"], string> = {
  sm: "1.125rem",
  md: "1.25rem",
  lg: "1.5rem",
  xl: "1.875rem",
  "2xl": "2rem",
  "3xl": "2.25rem",
};

const PARAGRAPH_SIZE_REM: Record<UserComponentFields["paragraphFontSize"], string> = {
  sm: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
  base: "1rem",
};

const FONT_WEIGHT_MAP = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export function defaultUserComponentStyle(): UserComponentStyle {
  return {
    padding: "md",
    marginY: "sm",
    borderRadius: "md",
    shadow: "sm",
    textColor: "",
    backgroundColor: "",
    borderColor: "",
    borderWidth: "none",
    dividerColor: "",
  };
}

export function defaultUserComponentFields(): UserComponentFields {
  return {
    headingText: "New heading",
    headingLevel: "h2",
    headingFontSize: "xl",
    headingFontWeight: "bold",
    paragraphText: "Add your paragraph text here.",
    paragraphFontSize: "base",
    linkText: "Learn more",
    linkHref: "https://",
    linkNewTab: true,
    linkUnderline: true,
    imageSrc: "",
    imageAlt: "",
    style: defaultUserComponentStyle(),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Safe for style attribute (hex colors only from color inputs). */
function escapeStyleValue(s: string): string {
  return s.replace(/[<>"']/g, "");
}

export function sanitizeHexColor(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t)) return t;
  return null;
}

function buildBoxStyle(
  style: UserComponentStyle,
  opts?: { omitTextColor?: boolean },
): string {
  const parts: string[] = [];
  parts.push(`padding: ${PADDING_MAP[style.padding]}`);
  const my = MARGIN_Y_MAP[style.marginY];
  parts.push(`margin-top: ${my}`, `margin-bottom: ${my}`);
  parts.push(`border-radius: ${RADIUS_MAP[style.borderRadius]}`);
  parts.push(`box-shadow: ${SHADOW_MAP[style.shadow]}`);
  const bg = sanitizeHexColor(style.backgroundColor);
  if (bg) parts.push(`background-color: ${escapeStyleValue(bg)}`);
  if (!opts?.omitTextColor) {
    const fg = sanitizeHexColor(style.textColor);
    if (fg) parts.push(`color: ${escapeStyleValue(fg)}`);
  }
  const bc = sanitizeHexColor(style.borderColor);
  if (style.borderWidth !== "none" && bc) {
    const w = style.borderWidth === "thin" ? "1px" : "2px";
    parts.push(`border: ${w} solid ${escapeStyleValue(bc)}`);
  }
  return parts.join("; ");
}

/**
 * Appends default component styles once (idempotent via marker).
 */
export function ensureUserComponentCss(css: string): string {
  const trimmed = (css ?? "").trim();
  if (trimmed.includes(FUNNEL_USER_COMPONENTS_CSS_MARKER)) {
    return trimmed;
  }
  if (!trimmed) {
    return DEFAULT_STYLES.trim();
  }
  return `${trimmed}\n\n${DEFAULT_STYLES.trim()}`;
}

export function buildUserComponentHtml(
  kind: UserComponentKind,
  fields: UserComponentFields,
  domId: string,
): string {
  const idAttr = escapeHtml(domId);
  const box =
    kind === "link"
      ? buildBoxStyle(fields.style, { omitTextColor: true })
      : buildBoxStyle(fields.style);
  const wrapStyle = box ? ` style="${escapeHtml(box)}"` : "";

  switch (kind) {
    case "heading": {
      const tag = fields.headingLevel;
      const text = escapeHtml(fields.headingText.trim() || "Heading");
      const fs = HEADING_SIZE_REM[fields.headingFontSize];
      const fw = FONT_WEIGHT_MAP[fields.headingFontWeight];
      const hStyle = `font-size: ${fs}; font-weight: ${fw}; margin: 0; line-height: 1.2`;
      return `<div class="funnel-user-component funnel-user-heading-wrap" id="${idAttr}"${wrapStyle}><${tag} class="funnel-user-heading" style="${escapeHtml(hStyle)}">${text}</${tag}></div>`;
    }
    case "paragraph": {
      const raw = fields.paragraphText.trim() || "Paragraph";
      const inner = escapeHtml(raw).replace(/\n/g, "<br />");
      const fs = PARAGRAPH_SIZE_REM[fields.paragraphFontSize];
      const pStyle = `font-size: ${fs}; margin: 0; line-height: 1.65`;
      return `<div class="funnel-user-component" id="${idAttr}"${wrapStyle}><p class="funnel-user-p" style="${escapeHtml(pStyle)}">${inner}</p></div>`;
    }
    case "link": {
      const t = escapeHtml(fields.linkText.trim() || "Link");
      let href = fields.linkHref.trim() || "#";
      if (!/^https?:\/\//i.test(href) && href !== "#") {
        href = `https://${href}`;
      }
      const hrefAttr = escapeHtml(href);
      const target = fields.linkNewTab ? ' target="_blank" rel="noopener noreferrer"' : "";
      const fg = sanitizeHexColor(fields.style.textColor);
      const deco = fields.linkUnderline ? "underline" : "none";
      const aParts = [`font-weight: 500`, `text-decoration: ${deco}`];
      if (fg) aParts.push(`color: ${escapeStyleValue(fg)}`);
      else aParts.push(`color: #2563eb`);
      const aStyle = escapeHtml(aParts.join("; "));
      return `<div class="funnel-user-component" id="${idAttr}"${wrapStyle}><a href="${hrefAttr}" class="funnel-user-link" style="${aStyle}"${target}>${t}</a></div>`;
    }
    case "image": {
      const src = fields.imageSrc.trim();
      const alt = escapeHtml(fields.imageAlt.trim());
      const srcAttr = escapeHtml(src);
      const r = RADIUS_MAP[fields.style.borderRadius];
      const sh = SHADOW_MAP[fields.style.shadow];
      const imgStyle = escapeHtml(
        `width:100%;max-width:100%;height:auto;display:block;border-radius:${r};box-shadow:${sh}`,
      );
      if (!src) {
        return `<div class="funnel-user-component funnel-user-image-wrap" id="${idAttr}"${wrapStyle}><p class="funnel-user-p" style="font-size:0.875rem;opacity:0.8">Add an image URL below and insert again.</p></div>`;
      }
      return `<div class="funnel-user-component funnel-user-image-wrap" id="${idAttr}"${wrapStyle}><img src="${srcAttr}" alt="${alt}" class="funnel-user-media" loading="lazy" style="${imgStyle}" /></div>`;
    }
    case "divider": {
      const line =
        sanitizeHexColor(fields.style.dividerColor) ||
        sanitizeHexColor(fields.style.textColor) ||
        "rgba(0,0,0,0.12)";
      const hrStyle = escapeHtml(
        `border: none; border-top: 2px solid ${line}; margin: 0; width: 100%`,
      );
      const wrapOnlyMargin = [
        `margin-top: ${MARGIN_Y_MAP[fields.style.marginY]}`,
        `margin-bottom: ${MARGIN_Y_MAP[fields.style.marginY]}`,
        `padding: ${PADDING_MAP[fields.style.padding]}`,
        `border-radius: ${RADIUS_MAP[fields.style.borderRadius]}`,
        `box-shadow: ${SHADOW_MAP[fields.style.shadow]}`,
      ];
      const bg = sanitizeHexColor(fields.style.backgroundColor);
      if (bg) wrapOnlyMargin.push(`background-color: ${escapeStyleValue(bg)}`);
      const wattr = ` style="${escapeHtml(wrapOnlyMargin.join("; "))}"`;
      return `<div class="funnel-user-component" id="${idAttr}"${wattr}><hr style="${hrStyle}" class="funnel-user-divider" /></div>`;
    }
    default:
      return `<div class="funnel-user-component" id="${idAttr}"${wrapStyle}></div>`;
  }
}

export function validateUserComponent(
  kind: UserComponentKind,
  fields: UserComponentFields,
): string | null {
  switch (kind) {
    case "heading":
      return fields.headingText.trim() ? null : "Enter heading text.";
    case "paragraph":
      return fields.paragraphText.trim() ? null : "Enter paragraph text.";
    case "link":
      if (!fields.linkText.trim()) return "Enter link text.";
      if (!fields.linkHref.trim() || fields.linkHref.trim() === "https://")
        return "Enter a valid URL.";
      return null;
    case "image":
      if (!fields.imageSrc.trim())
        return "Enter an image URL or upload an image file.";
      return null;
    case "divider":
      return null;
    default:
      return "Unknown component.";
  }
}

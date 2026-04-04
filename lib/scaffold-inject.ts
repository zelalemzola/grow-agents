const DEFAULT_STYLES_LINK = '<link rel="stylesheet" href="styles.css" />';

/**
 * Merges LLM-generated inner HTML into a template scaffold.
 * - Replaces `{{content}}` or `{{sections}}` when present.
 * - Otherwise, if the scaffold is a full document with `<body>...</body>`, injects inner HTML inside the body.
 * - Otherwise appends inner HTML after the scaffold (templates should prefer `{{content}}` or a full `<body>` document).
 */
export function injectGeneratedContentIntoScaffold(
  scaffold: string,
  innerHtml: string,
  opts?: { stylesLink?: string },
): string {
  let s = scaffold.trim();
  const stylesLink = opts?.stylesLink ?? DEFAULT_STYLES_LINK;
  if (s.includes("{{styles}}")) {
    s = s.replace(/\{\{styles\}\}/g, stylesLink);
  }
  const hasContentPlaceholder =
    s.includes("{{content}}") || s.includes("{{sections}}");
  if (hasContentPlaceholder) {
    const placeholder = s.includes("{{content}}") ? "{{content}}" : "{{sections}}";
    return s.replace(
      new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
      innerHtml,
    );
  }
  const bodyOpen = /<body[^>]*>/i.exec(s);
  const bodyClose = /<\/body\s*>/i.exec(s);
  if (
    bodyOpen &&
    bodyClose &&
    bodyClose.index! > bodyOpen.index + bodyOpen[0].length
  ) {
    const start = bodyOpen.index + bodyOpen[0].length;
    const end = bodyClose.index!;
    return s.slice(0, start) + "\n" + innerHtml + "\n" + s.slice(end);
  }
  return `${s}\n${innerHtml}`;
}

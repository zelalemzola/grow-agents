/**
 * System and user prompts for landing page translation.
 * Ensures human-like, natural translation with cultural adaptation.
 */

const TRANSLATION_SYSTEM_PROMPT = `You are an expert translator specializing in landing pages and marketing copy. Your translations sound natural and human, as if written by a native speaker—never robotic or machine-like.

CRITICAL RULES:
1. PRESERVE EXACT HTML STRUCTURE: Do not modify any HTML tags, attributes, structure, class names, IDs, or layout. Only translate text content inside tags. The output must be valid HTML that renders identically in structure.
2. TRANSLATE ONLY TEXT: Leave all HTML markup, URLs, src attributes, and code unchanged. Only change the human-readable text between tags.
3. CULTURAL ADAPTATION:
   - When translating TO English: Replace German/European names with culturally appropriate American names (preserve gender). Example: "Hans" → "John", "Maria" → "Mary".
   - When translating TO German: Use AUTHENTIC, TRADITIONAL German names suitable for people aged 50+. Default to classic names that were common in Germany 50+ years ago:
     • Men: Hans, Klaus, Wolfgang, Günther, Helmut, Dieter, Werner, Horst, Friedrich, Gerhard, etc.
     • Women: Maria, Helga, Ingrid, Gisela, Brigitte, Renate, Ursula, Margot, Elisabeth, Monika, etc.
     Do NOT use modern or international names (e.g. Kevin, Jason, Chantalle) for adult characters. Be consistent—always choose names that sound genuinely German for the 50+ demographic.
   - NATIONALITIES/PROFESSIONS: Adapt references. "An American doctor" → "Ein deutscher Arzt" when translating to German. "Ein deutscher Experte" → "An American expert" when translating to English.
4. TONE & INTENSITY: Preserve the EXACT meaning and marketing "hype" of the original. Do NOT soften, downplay, or reduce exaggeration. Match superlatives with superlatives. Keep urgency, emotional intensity, and persuasive language intact. Germans respond to strong marketing copy—translate enthusiastically.
5. DATE FORMAT: When translating TO German, use German date format DD.MM.YYYY (e.g. 1.1.2026, 15.3.2026). Do NOT spell out month names (no "Januar", "1. Januar") or use US formats (MM/DD/YYYY).
6. PRODUCT & MEDICINE NAMES: Localize product names, brand names, and medicine names into what they are actually called in the target language/country. Use the proper local term (e.g. German product name in Germany, not just German spelling of the English name). Be consistent—use the same localized term throughout the entire document.
7. OUTPUT: Return ONLY the translated HTML. No explanations, no markdown code fences, no preamble. Raw HTML only.`;

export function buildTranslationPrompt(
  html: string,
  fromLang: string,
  toLang: string,
  chunkContext?: { index: number; total: number },
): string {
  const fromLabel = fromLang === "en" ? "English" : "German";
  const toLabel = toLang === "en" ? "English" : "German";

  const chunkNote =
    chunkContext && chunkContext.total > 1
      ? `\n\nNOTE: This is HTML fragment ${chunkContext.index + 1} of ${chunkContext.total}. Output ONLY the translated fragment—it will be concatenated with others. No wrappers, no explanations.`
      : "";

  return `Translate the following HTML from ${fromLabel} to ${toLabel}. Preserve all HTML structure exactly. Only translate text content. Apply cultural adaptation for names, dates, products, and nationalities as described in your instructions.${chunkNote}

HTML to translate:
${html}`;
}

/** Prompt when translating only the inner HTML of <body> (head and scripts were stripped). */
export function buildBodyOnlyTranslationPrompt(
  bodyInnerHtml: string,
  fromLang: string,
  toLang: string,
  chunkContext?: { index: number; total: number },
): string {
  const fromLabel = fromLang === "en" ? "English" : "German";
  const toLabel = toLang === "en" ? "English" : "German";

  const chunkNote =
    chunkContext && chunkContext.total > 1
      ? ` This is fragment ${chunkContext.index + 1} of ${chunkContext.total}. Output ONLY this fragment—it will be concatenated with others.`
      : "";

  return `Translate the following HTML from ${fromLabel} to ${toLabel}. This is the INNER HTML of a <body> tag only (the rest of the document is unchanged). Preserve all HTML structure. Do NOT add <!DOCTYPE>, <html>, <head>, or <body> tags. Preserve any comment placeholders exactly as-is (e.g. <!--SCRIPT_PLACEHOLDER_0-->). Only translate human-readable text.${chunkNote}

Body inner HTML to translate:
${bodyInnerHtml}`;
}

export function buildEditPrompt(
  html: string,
  editComments: string,
  fromLang: string,
  toLang: string,
): string {
  const toLabel = toLang === "en" ? "English" : "German";

  return `You have translated HTML in ${toLabel}. The user has provided edit comments that reference specific lines. Parse the comments for line references (e.g. "Line 15:", "L42:", "line 7:") and apply ONLY those edits. Do not change anything else.

EDIT COMMENTS (may reference line numbers):
${editComments}

CURRENT TRANSLATED HTML:
${html}

Apply the requested edits to the referenced lines/sections only. Preserve all HTML structure. Return ONLY the modified HTML—no explanations.`;
}

export { TRANSLATION_SYSTEM_PROMPT };

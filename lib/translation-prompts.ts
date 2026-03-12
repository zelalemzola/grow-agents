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
   - When translating TO German: Replace American names with German equivalents (preserve gender). Example: "John" → "Hans", "Sarah" → "Sandra".
   - NATIONALITIES/PROFESSIONS: Adapt references. "An American doctor" → "Ein deutscher Arzt" when translating to German. "Ein deutscher Experte" → "An American expert" when translating to English.
4. TONE: Match the original tone (formal, casual, urgent, etc.) in the target language. Use idioms and expressions natural to the target locale.
5. OUTPUT: Return ONLY the translated HTML. No explanations, no markdown code fences, no preamble. Raw HTML only.`;

export function buildTranslationPrompt(
  html: string,
  fromLang: string,
  toLang: string,
): string {
  const fromLabel = fromLang === "en" ? "English" : "German";
  const toLabel = toLang === "en" ? "English" : "German";

  return `Translate the following HTML from ${fromLabel} to ${toLabel}. Preserve all HTML structure exactly. Only translate text content. Apply cultural adaptation for names and nationalities as described in your instructions.

HTML to translate:
${html}`;
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

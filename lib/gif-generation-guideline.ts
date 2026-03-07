/**
 * GIF mechanism animation guidelines — used as system/rule when generating GIFs.
 * Source: gif_generation_guideline.md
 */

import { readFileSync } from "fs";
import path from "path";

let cached: string | null = null;

export function getGifGenerationGuideline(): string {
  if (cached) return cached;
  try {
    cached = readFileSync(
      path.join(process.cwd(), "gif_generation_guideline.md"),
      "utf-8",
    );
    return cached;
  } catch {
    return FALLBACK_GIF_GUIDELINE;
  }
}

/** Fallback if file is missing (e.g. in tests or different cwd) */
const FALLBACK_GIF_GUIDELINE = `
# GIF Mechanism Animation Guidelines

A mechanism GIF must visually explain the exact idea of the text section where it appears — a visual version of the paragraph beside it.

Core rules:
- Derive GIF from section meaning only; do not use overall narrative or product concept.
- Match the written explanation with extremely high accuracy; no invented anatomy or pathways.
- Use balanced framing: not too zoomed in or out.
- The text around the [gif] placeholder is the primary source of truth.
- One GIF = one idea; do not combine unrelated processes.

Workflow: Extract the single mechanism → convert to cause → effect sequence → verify alignment with text → generate.
The GIF must be section-specific, precise, and tightly aligned with the written copy.
`.trim();

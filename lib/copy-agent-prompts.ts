/**
 * Copy Chief Agent prompts — Layered system for direct-response conversion copy.
 * Based on COPY AGENT product brief (copy.md).
 *
 * Layer 1: Global System Prompt
 * Layer 2: Page Type Prompt (per copy type)
 * Layer 3: Guidelines (per copy type)
 * Layer 4: Example Database (injected from knowledge base or minimal examples)
 */

export const COPY_AGENT_GLOBAL_SYSTEM_PROMPT = `You are a Direct Response Copywriter and CRO Specialist.

Your mission is to produce high-converting marketing copy by combining:
1. Customer research (reviews, testimonials, surveys, objections, interviews)
2. Product information (description, mechanism, benefits, proof)
3. Direct-response frameworks and persuasion techniques

The output must feel specific, believable, emotionally relevant, and highly persuasive. Use real customer language and address real objections.`;

export type CopyType =
  | "advertorial"
  | "offer"
  | "upsell"
  | "listicle"
  | "thankYou";

export const COPY_TYPE_PAGE_PROMPTS: Record<
  CopyType,
  { purpose: string; focus: string[]; structure: string[] }
> = {
  advertorial: {
    purpose:
      "Warm up traffic and introduce the problem. Create curiosity and emotional connection.",
    focus: [
      "curiosity",
      "storytelling",
      "emotional connection",
      "education",
      "mechanism discovery",
    ],
    structure: [
      "problem discovery",
      "expert authority",
      "mechanism explanation",
      "discovery narrative",
      "transition to solution",
    ],
  },
  offer: {
    purpose: "Convert readers into buyers. Strong benefits, proof, and urgency.",
    focus: [
      "benefits",
      "proof",
      "mechanism clarity",
      "objections",
      "urgency",
    ],
    structure: [
      "headline",
      "hero section",
      "problem agitation",
      "mechanism explanation",
      "product introduction",
      "proof",
      "testimonials",
      "guarantees",
      "CTA blocks",
    ],
  },
  upsell: {
    purpose: "Increase average order value. Quick persuasion with strong offer framing.",
    focus: ["quick persuasion", "simplicity", "strong offer framing"],
    structure: [
      "reminder of previous purchase",
      "introduction of additional benefit",
      "urgency",
      "fast decision CTA",
    ],
  },
  listicle: {
    purpose: "Generate curiosity and engagement. Discovery and comparison.",
    focus: ["curiosity", "discovery", "comparison"],
    structure: [
      "headline",
      "numbered list",
      "product explanations",
      "comparison sections",
      "recommendation",
    ],
  },
  thankYou: {
    purpose: "Strengthen trust and increase engagement. Reassurance and next steps.",
    focus: ["reassurance", "onboarding", "next steps", "cross-sell opportunities"],
    structure: [
      "confirmation",
      "expectation setting",
      "product usage instructions",
      "support access",
      "cross-sell",
    ],
  },
};

export const COPY_TYPE_GUIDELINES: Record<CopyType, string[]> = {
  advertorial: [
    "Use editorial tone — avoid obvious sales language",
    "Create curiosity gaps to keep readers engaged",
    "Use discovery narrative — reader learns alongside the story",
    "Transition naturally to the solution without hard selling",
  ],
  offer: [
    "Lead with clarity — benefits must be obvious",
    "Stack proof (testimonials, data, guarantees)",
    "Address objections before they arise",
    "Use urgency sparingly and authentically",
  ],
  upsell: [
    "Fast persuasion — assume reader already bought",
    "Minimal friction — one clear CTA",
    "Frame the add-on as natural complement",
  ],
  listicle: [
    "Numbered format for scannability",
    "Each point adds value and curiosity",
    "Comparison builds credibility",
    "Clear recommendation at the end",
  ],
  thankYou: [
    "Reassure immediately — confirm the purchase",
    "Set clear expectations for delivery/next steps",
    "Provide usage instructions if relevant",
    "Cross-sell only if it fits naturally",
  ],
};

export function buildLayeredSystemPrompt(
  copyType: CopyType,
  examplesText?: string,
): string {
  const page = COPY_TYPE_PAGE_PROMPTS[copyType];
  const guidelines = COPY_TYPE_GUIDELINES[copyType];
  const typeLabel =
    copyType === "thankYou"
      ? "Thank You Page"
      : copyType.charAt(0).toUpperCase() + copyType.slice(1);

  let prompt = `${COPY_AGENT_GLOBAL_SYSTEM_PROMPT}

---
LAYER 2 — PAGE TYPE: ${typeLabel}
---

Purpose: ${page.purpose}

Focus areas: ${page.focus.join(", ")}

Expected structure: ${page.structure.join(" → ")}

---
LAYER 3 — GUIDELINES
---

${guidelines.map((g) => `- ${g}`).join("\n")}`;

  if (examplesText?.trim()) {
    prompt += `

---
LAYER 4 — EXAMPLE REFERENCE
---

${examplesText}`;
  }

  return prompt;
}

export function buildUserPrompt(
  customerResearch: string,
  productInformation: string,
): string {
  return `CUSTOMER RESEARCH:
${customerResearch}

---
PRODUCT INFORMATION:
${productInformation}

---
Generate high-converting copy using the customer research and product information above. Apply real customer language, address real objections, and follow the structure and guidelines for this copy type.`;
}

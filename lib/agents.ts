import { AgentCard } from "@/lib/types";

export const AGENTS: AgentCard[] = [
  {
    slug: "copy-injection",
    title: "Copy Injection + Image Injection",
    description:
      "Generate and edit complete funnel pages with mapped copy blocks, matching structure, and section-specific images.",
    status: "live",
  },
  {
    slug: "translation",
    title: "Landing Page Translation",
    description:
      "Translate existing landing pages into target languages while preserving layout and page structure. Human-like quality with cultural adaptation.",
    status: "live",
  },
  {
    slug: "policy-changes",
    title: "Policy Change Adapter",
    description:
      "Detect risky claims and rewrite only non-compliant copy while preserving conversion flow.",
    status: "coming-soon",
  },
  {
    slug: "new-funnel",
    title: "New Funnel Implementation",
    description:
      "CRO Agent: optimize copy with customer research, replicate proven funnel structures, and apply conversion patterns to improve funnel performance.",
    status: "live",
  },
  {
    slug: "copy-chief",
    title: "Copy Chief",
    description:
      "Generate brand-aligned high-conversion copy variants under strict style and compliance constraints.",
    status: "coming-soon",
  },
  {
    slug: "ad-image-generation",
    title: "Ad Image Generation",
    description:
      "Generate up to 5 ad-ready images at once from separate prompts, with optional product reference and per-image regeneration from comments.",
    status: "live",
  },
];

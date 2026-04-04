import { z } from "zod";

/** Per-section chunk audit (one LLM call per chunk). */
export const funnelChunkAuditSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(["fixable", "advisory"]),
      message: z.string(),
      /** Use empty string when there is nothing to add (must be present for API schema). */
      detail: z.string(),
    }),
  ),
  sectionSummary: z.string(),
});

/** Final merged report after all chunks + optional CSS context. */
export const funnelFinalAuditSchema = z.object({
  qualitativeLabel: z.string(),
  qualitativeStatus: z.enum(["good_to_go", "needs_work", "blocked"]),
  overallScore: z.number().min(0).max(100),
  fixableFindings: z.number().int().min(0),
  advisoryFindings: z.number().int().min(0),
  contextConfidence: z.enum(["high", "medium", "low"]),
  summaryParagraphs: z.array(z.string()),
  contextUnderstanding: z.object({
    pageType: z.string(),
    primaryGoal: z.string(),
    languageMarket: z.string(),
    toneKeywords: z.array(z.string()),
  }),
});

export type FunnelChunkAudit = z.infer<typeof funnelChunkAuditSchema>;
export type FunnelFinalAudit = z.infer<typeof funnelFinalAuditSchema>;

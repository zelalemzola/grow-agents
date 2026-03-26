export const POLICY_CHANGES_SYSTEM_PROMPT = `You are a surgical compliance editor for direct-response landing pages and advertorials.

Your job is to update only policy-violating copy in HTML while preserving conversion performance.

Non-negotiable rules:
1) Keep HTML structure unchanged (no new wrappers, no deleted sections, no reordered sections, no CSS changes).
2) Edit only text that violates the provided policy instructions.
3) Keep compliant text untouched.
4) Preserve angle, intent, flow, and persuasion where policy allows.
5) Do not add new claims, invented disclaimers, or unsupported statements.
6) If deletion is unavoidable, remove the smallest possible amount of text.
7) In testimonials/headlines/proof sections, keep emotional authenticity while fixing only violating fragments.
8) Return complete HTML for the provided chunk and a precise change log.

Change log requirements:
- Include only real edits.
- Each edit must have: section, before, after, reason, and mapped policyInstruction.
- "reason" must clearly tie to a concrete policy instruction.
`;

export function buildPolicyChangesChunkPrompt(args: {
  chunkHtml: string;
  chunkIndex: number;
  chunkCount: number;
  policyInstructions: string;
  strictMode?: boolean;
  retryReason?: string;
}): string {
  const {
    chunkHtml,
    chunkIndex,
    chunkCount,
    policyInstructions,
    strictMode = false,
    retryReason,
  } = args;
  const strictModeBlock = strictMode
    ? `STRICT MODE (minimal wording drift):
- Keep as many original words as possible.
- Prefer micro-edits at claim phrase level over sentence rewrites.
- Do NOT paraphrase compliant neighboring text for style.
- If two compliant rewrites are possible, choose the one closest to original wording.
`
    : "";
  const retryBlock = retryReason
    ? `
RETRY CONTEXT:
Previous attempt failed validation: ${retryReason}
Fix that issue and return a valid response.`
    : "";
  return `POLICY INSTRUCTIONS (strict requirements):
${policyInstructions}

HTML CHUNK ${chunkIndex + 1} OF ${chunkCount}:
${chunkHtml}

Task:
- Scan this entire chunk for policy violations using the instructions above.
- Apply minimal targeted edits only where violations exist.
- Keep all compliant copy unchanged.
- Preserve exact HTML structure and formatting.
- Return the edited chunk HTML and a change log for this chunk only.
${strictModeBlock}${retryBlock}
`;
}

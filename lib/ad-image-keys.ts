/**
 * Storage keys for ad-image projects: "{prompt}-{variant}" with prompt 1–5, variant 1–5.
 * Legacy keys "1".."5" mean prompt n, variant 1.
 */

export const AD_IMAGE_ASPECT_RATIOS = ["3:4", "16:9", "1:1"] as const;
export type AdImageAspectRatio = (typeof AD_IMAGE_ASPECT_RATIOS)[number];

export function parseAdImageKey(key: string): {
  prompt: number;
  variant: number;
} | null {
  const trimmed = key.trim();
  const hyphen = trimmed.match(/^(\d+)-(\d+)$/);
  if (hyphen) {
    const prompt = Number(hyphen[1]);
    const variant = Number(hyphen[2]);
    if (
      prompt >= 1 &&
      prompt <= 5 &&
      variant >= 1 &&
      variant <= 5
    ) {
      return { prompt, variant };
    }
    return null;
  }
  const single = trimmed.match(/^(\d)$/);
  if (single) {
    const prompt = Number(single[1]);
    if (prompt >= 1 && prompt <= 5) return { prompt, variant: 1 };
  }
  return null;
}

export function formatAdImageKey(prompt: number, variant: number): string {
  return `${prompt}-${variant}`;
}

/** Remove legacy + new-style keys that belong to this prompt (1–5). */
export function stripKeysForPrompt(
  images: Record<string, string>,
  promptNum: number,
): Record<string, string> {
  const next: Record<string, string> = { ...images };
  for (const k of Object.keys(next)) {
    const p = parseAdImageKey(k);
    if (p && p.prompt === promptNum) delete next[k];
  }
  return next;
}

/** Remove every key that looks like an ad-image slot (legacy "1".."5" or "p-v"). */
export function stripAllAdImageSlotKeys(
  images: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...images };
  for (const k of Object.keys(next)) {
    if (parseAdImageKey(k)) delete next[k];
  }
  return next;
}

export function listAdImageKeysSorted(
  images: Record<string, string> | null | undefined,
): string[] {
  const keys = Object.keys(images ?? {}).filter((k) => parseAdImageKey(k));
  return keys.sort((a, b) => {
    const pa = parseAdImageKey(a)!;
    const pb = parseAdImageKey(b)!;
    if (pa.prompt !== pb.prompt) return pa.prompt - pb.prompt;
    return pa.variant - pb.variant;
  });
}

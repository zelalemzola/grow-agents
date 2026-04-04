"use client";

import { useMemo, useState } from "react";
import {
  ClipboardList,
  Copy,
  FileSearch,
  Loader2,
  Undo2,
  Redo2,
  Wand2,
  X,
  ChevronRight,
  Eye,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FunnelChunkAudit, FunnelFinalAudit } from "@/lib/funnel-audit-schema";
import { extractSectionOuterHtmlById } from "@/lib/funnel-audit-chunks";
import { createPreviewSrcDoc } from "@/lib/funnel-preview";
import { cn } from "@/lib/utils";

type ChunkMeta = {
  sectionId: string;
  findingsCount: number;
  sectionSummary: string;
};

export type AuditChunkRow = {
  sectionId: string;
  audit: FunnelChunkAudit;
};

type ScoreKind =
  | "qualitative"
  | "overall"
  | "fixable"
  | "advisory"
  | "confidence";

function findingKey(sectionId: string, index: number) {
  return `${sectionId}::${index}`;
}

/** HTML slice for iframe preview: one section, or full document for `_page`. */
function sliceHtmlForSectionPreview(fullHtml: string, sectionId: string): string {
  if (sectionId === "_page") {
    return fullHtml;
  }
  const outer = extractSectionOuterHtmlById(fullHtml, sectionId);
  return outer ?? fullHtml;
}

function sectionPreviewHeading(
  sectionId: string,
  chunkMeta: ChunkMeta[] | null,
): { title: string; subtitle: string | null } {
  if (sectionId === "_page") {
    return { title: "Full page", subtitle: null };
  }
  const meta = chunkMeta?.find((c) => c.sectionId === sectionId);
  const summary = meta?.sectionSummary?.trim();
  if (summary) {
    return { title: summary, subtitle: sectionId };
  }
  return { title: "Section preview", subtitle: sectionId };
}

export function FunnelAuditModal({
  open,
  onOpenChange,
  loading,
  error,
  final,
  chunkMeta,
  chunkAudits,
  sectionCount,
  funnelName,
  locale,
  market,
  generatedAt,
  onRunAudit,
  htmlDraft,
  previewCss,
  previewImages,
  funnelObjective,
  onApplyHtml,
  onAuditUndo,
  onAuditRedo,
  canAuditUndo,
  canAuditRedo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  final: FunnelFinalAudit | null;
  chunkMeta: ChunkMeta[] | null;
  chunkAudits: AuditChunkRow[] | null;
  sectionCount: number;
  funnelName: string;
  locale: string;
  market: string;
  generatedAt: Date | null;
  onRunAudit: () => void;
  htmlDraft: string;
  /** Funnel CSS used to render preview iframes (same as editor preview). */
  previewCss: string;
  /** Image URLs keyed by section id for preview iframes. */
  previewImages: Record<string, string>;
  funnelObjective: string;
  onApplyHtml: (next: string) => void;
  onAuditUndo: () => void;
  onAuditRedo: () => void;
  canAuditUndo: boolean;
  canAuditRedo: boolean;
}) {
  const [scoreDetail, setScoreDetail] = useState<ScoreKind | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedFindingKeys, setSelectedFindingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [applyProgress, setApplyProgress] = useState<{
    current: number;
    total: number;
    sectionId: string;
  } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  /** Proposed HTML after preview pipeline; confirm writes to the funnel. */
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  /** Sections included in the last preview (order matches apply pipeline). */
  const [previewSectionIds, setPreviewSectionIds] = useState<string[] | null>(null);

  const flattenedFindings = useMemo(() => {
    if (!chunkAudits?.length) return [];
    const rows: {
      key: string;
      sectionId: string;
      index: number;
      severity: "fixable" | "advisory";
      message: string;
      detail: string;
    }[] = [];
    for (const row of chunkAudits) {
      row.audit.findings.forEach((f, i) => {
        rows.push({
          key: findingKey(row.sectionId, i),
          sectionId: row.sectionId,
          index: i,
          severity: f.severity,
          message: f.message,
          detail: f.detail,
        });
      });
    }
    return rows;
  }, [chunkAudits]);

  const fixableList = useMemo(
    () => flattenedFindings.filter((f) => f.severity === "fixable"),
    [flattenedFindings],
  );
  const advisoryList = useMemo(
    () => flattenedFindings.filter((f) => f.severity === "advisory"),
    [flattenedFindings],
  );

  const sectionVisualPreviews = useMemo(() => {
    if (!previewHtml || !previewSectionIds?.length) return [];
    return previewSectionIds.map((sectionId) => {
      const beforeHtml = sliceHtmlForSectionPreview(htmlDraft, sectionId);
      const afterHtml = sliceHtmlForSectionPreview(previewHtml, sectionId);
      return {
        sectionId,
        heading: sectionPreviewHeading(sectionId, chunkMeta),
        beforeSrc: createPreviewSrcDoc(beforeHtml, previewCss, previewImages),
        afterSrc: createPreviewSrcDoc(afterHtml, previewCss, previewImages),
      };
    });
  }, [
    previewHtml,
    previewSectionIds,
    htmlDraft,
    previewCss,
    previewImages,
    chunkMeta,
  ]);

  const copyReport = () => {
    if (!final) return;
    const lines: string[] = [
      `Funnel audit${funnelName ? `: ${funnelName}` : ""}`,
      generatedAt ? `Generated: ${generatedAt.toLocaleString()}` : "",
      "",
      `Status: ${final.qualitativeLabel} (${final.qualitativeStatus})`,
      `Overall score: ${final.overallScore}`,
      `Fixable: ${final.fixableFindings} | Advisory: ${final.advisoryFindings}`,
      `Context confidence: ${final.contextConfidence}`,
      "",
      "--- Summary ---",
      ...final.summaryParagraphs.map((p) => p),
      "",
      "--- Context ---",
      `Page type: ${final.contextUnderstanding.pageType}`,
      `Primary goal: ${final.contextUnderstanding.primaryGoal}`,
      `Language / market: ${final.contextUnderstanding.languageMarket}`,
      `Tone: ${final.contextUnderstanding.toneKeywords.join(", ")}`,
    ].filter(Boolean);
    void navigator.clipboard.writeText(lines.join("\n"));
  };

  const statusColor =
    final?.qualitativeStatus === "good_to_go"
      ? "text-emerald-600 dark:text-emerald-400"
      : final?.qualitativeStatus === "needs_work"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const hasReport = Boolean(final && !loading);

  const toggleFinding = (key: string) => {
    setSelectedFindingKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllFindings = () => {
    setSelectedFindingKeys(new Set(flattenedFindings.map((f) => f.key)));
  };

  const clearSelection = () => setSelectedFindingKeys(new Set());

  function buildGroupsFromSelection():
    | { sectionId: string; findings: { message: string; detail: string; severity: "fixable" | "advisory" }[] }[]
    | null {
    if (selectedFindingKeys.size === 0) return null;
    const selected = flattenedFindings.filter((f) =>
      selectedFindingKeys.has(f.key),
    );
    const bySection = new Map<
      string,
      { message: string; detail: string; severity: "fixable" | "advisory" }[]
    >();
    for (const f of selected) {
      if (!bySection.has(f.sectionId)) bySection.set(f.sectionId, []);
      bySection.get(f.sectionId)!.push({
        message: f.message,
        detail: f.detail,
        severity: f.severity,
      });
    }
    return [...bySection.entries()].map(([sectionId, findings]) => ({
      sectionId,
      findings,
    }));
  }

  /** Generates proposed HTML on the server; user must confirm before it hits the funnel. */
  const runPreview = async () => {
    const groups = buildGroupsFromSelection();
    if (!groups?.length) return;
    setApplyError(null);
    setPreviewHtml(null);
    setPreviewSectionIds(null);
    let acc = htmlDraft;
    const total = groups.length;
    try {
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]!;
        setApplyProgress({
          current: i + 1,
          total,
          sectionId: g.sectionId,
        });
        const res = await fetch("/api/agents/copy-injection/apply-audit-fixes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            html: acc,
            objective: funnelObjective,
            groups: [g],
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setApplyError(data?.error ?? "Preview generation failed.");
          setApplyProgress(null);
          return;
        }
        acc = data.html as string;
      }
      setPreviewHtml(acc);
      setPreviewSectionIds(groups.map((g) => g.sectionId));
      setApplyProgress(null);
    } catch (e) {
      setApplyError(String(e));
      setApplyProgress(null);
    }
  };

  const confirmApplyPreview = () => {
    if (!previewHtml) return;
    onApplyHtml(previewHtml);
    setApplyOpen(false);
    setPreviewHtml(null);
    setPreviewSectionIds(null);
    setSelectedFindingKeys(new Set());
    setApplyError(null);
  };

  const discardPreview = () => {
    setPreviewHtml(null);
    setPreviewSectionIds(null);
    setApplyError(null);
  };

  const handleApplyDialogOpenChange = (o: boolean) => {
    setApplyOpen(o);
    if (!o) {
      setPreviewHtml(null);
      setPreviewSectionIds(null);
      setApplyError(null);
      setApplyProgress(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "max-h-[min(92vh,920px)] overflow-y-auto border-border/80 bg-card p-0 gap-0",
            hasReport
              ? "w-[min(96vw,56rem)] max-w-[min(96vw,56rem)] sm:max-w-4xl lg:max-w-[56rem]"
              : "max-w-2xl",
          )}
        >
          <DialogHeader
            className={cn(
              "border-b border-border/60 bg-gradient-to-br from-sky-500/10 via-transparent to-transparent text-left",
              hasReport ? "p-5 sm:p-6 lg:px-10" : "p-5",
            )}
          >
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileSearch className="size-5 text-sky-600 dark:text-sky-400" />
              Audit funnel
            </DialogTitle>
            <p className="text-left text-sm text-muted-foreground">
              Context-first review of language, credibility, trust, and conversion
              signals. Sections are audited in full—nothing is truncated.
            </p>
            {generatedAt && final ? (
              <p className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-left text-xs text-muted-foreground">
                Showing saved audit. Generated {generatedAt.toLocaleString()}
                {sectionCount > 0 ? ` · ${sectionCount} section(s) analyzed` : ""}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              {funnelName ? (
                <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  {funnelName}
                </span>
              ) : null}
              {locale ? (
                <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  {locale}
                </span>
              ) : null}
              {market ? (
                <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  {market}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <p className="text-xs text-muted-foreground">
                Section-by-section review, then unified report
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!final}
                  onClick={copyReport}
                >
                  <Copy className="size-3.5" />
                  Copy report
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!hasReport || !flattenedFindings.length}
                  onClick={() => {
                    setApplyOpen(true);
                    setApplyError(null);
                    setPreviewHtml(null);
                  }}
                >
                  <Wand2 className="size-3.5" />
                  Apply comments
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!canAuditUndo}
                  onClick={onAuditUndo}
                  title="Undo last applied audit edits"
                >
                  <Undo2 className="size-3.5" />
                  Undo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!canAuditRedo}
                  onClick={onAuditRedo}
                  title="Redo audit edits"
                >
                  <Redo2 className="size-3.5" />
                  Redo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading}
                  onClick={onRunAudit}
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileSearch className="size-3.5" />
                  )}
                  Run audit
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div
            className={cn(
              "space-y-4",
              hasReport ? "p-5 sm:p-6 sm:pb-8 lg:px-10 lg:pt-2 space-y-6" : "p-5",
            )}
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 py-12">
                <Loader2 className="size-10 animate-spin text-sky-600" />
                <p className="text-center text-sm text-muted-foreground">
                  Auditing each section on the server… Large pages can take several
                  minutes.
                </p>
              </div>
            ) : null}

            {error && !loading ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {final && !loading ? (
              <>
                <div className="grid gap-3 sm:grid-cols-5">
                  <ScoreCard
                    label="Qualitative"
                    value={final.qualitativeLabel}
                    className={statusColor}
                    onClick={() => setScoreDetail("qualitative")}
                  />
                  <ScoreCard
                    label="Overall"
                    value={String(final.overallScore)}
                    onClick={() => setScoreDetail("overall")}
                  />
                  <ScoreCard
                    label="Fixable"
                    value={String(final.fixableFindings)}
                    onClick={() => setScoreDetail("fixable")}
                  />
                  <ScoreCard
                    label="Advisory"
                    value={String(final.advisoryFindings)}
                    onClick={() => setScoreDetail("advisory")}
                  />
                  <ScoreCard
                    label="Confidence"
                    value={final.contextConfidence}
                    onClick={() => setScoreDetail("confidence")}
                  />
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/15 p-5 sm:p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <ClipboardList className="size-4 text-muted-foreground" />
                    <span className="text-base font-semibold">Summary</span>
                  </div>
                  <div className="max-w-none space-y-4 text-base leading-relaxed text-foreground">
                    {final.summaryParagraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
                  <p className="mb-4 text-base font-semibold">Context understanding</p>
                  <dl className="grid gap-4 text-base sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Page type
                      </dt>
                      <dd className="mt-1 leading-relaxed">
                        {final.contextUnderstanding.pageType}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Primary goal
                      </dt>
                      <dd className="mt-1 leading-relaxed">
                        {final.contextUnderstanding.primaryGoal}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Language and market
                      </dt>
                      <dd className="mt-1 leading-relaxed">
                        {final.contextUnderstanding.languageMarket}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Tone
                      </dt>
                      <dd className="mt-1 leading-relaxed">
                        {final.contextUnderstanding.toneKeywords.join(", ")}
                      </dd>
                    </div>
                  </dl>
                </div>

                {chunkMeta && chunkMeta.length > 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-5 sm:p-6">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Per-section notes
                    </p>
                    <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                      {chunkMeta.map((c) => (
                        <li key={c.sectionId}>
                          <span className="font-mono text-foreground">
                            {c.sectionId}
                          </span>{" "}
                          ({c.findingsCount} finding(s)) — {c.sectionSummary}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}

            {!loading && !final && !error ? (
              <p className="text-center text-sm text-muted-foreground">
                Run an audit to see scores and a full report. Your funnel HTML and
                CSS are sent in full to the audit service.
              </p>
            ) : null}
          </div>

          <DialogFooter
            className={cn(
              "border-t border-border/60 py-4 sm:justify-end",
              hasReport ? "px-5 sm:px-10" : "px-5",
            )}
          >
            <Button
              type="button"
              variant="outline"
              onClick={onRunAudit}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <FileSearch className="mr-2 size-4" />
              )}
              Rerun audit
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="mr-2 size-4" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scoreDetail !== null} onOpenChange={(o) => !o && setScoreDetail(null)}>
        <DialogContent className="max-h-[min(85vh,720px)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left">
              {scoreDetail === "qualitative" && "Qualitative verdict"}
              {scoreDetail === "overall" && "Overall score"}
              {scoreDetail === "fixable" && "Fixable findings"}
              {scoreDetail === "advisory" && "Advisory findings"}
              {scoreDetail === "confidence" && "Context confidence"}
            </DialogTitle>
          </DialogHeader>
          {final && scoreDetail ? (
            <ScoreDetailBody
              kind={scoreDetail}
              final={final}
              fixableList={fixableList}
              advisoryList={advisoryList}
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScoreDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyOpen} onOpenChange={handleApplyDialogOpenChange}>
        <DialogContent
          className={cn(
            "max-h-[min(92vh,900px)] overflow-y-auto",
            previewHtml
              ? "w-[min(96vw,72rem)] max-w-[min(96vw,72rem)] sm:max-w-5xl lg:max-w-[72rem]"
              : "max-w-lg",
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="size-5 text-sky-600" />
              Apply audit comments
            </DialogTitle>
            <p className="text-left text-sm text-muted-foreground">
              {previewHtml
                ? "Compare how each section looks before and after. Nothing is saved until you confirm."
                : "Select findings, then preview the updated sections. Confirm only if they look right—your funnel is updated in one step."}
            </p>
          </DialogHeader>

          {applyProgress ? (
            <div className="space-y-3 rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-transparent p-4">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>
                  Generating preview — section {applyProgress.current} /{" "}
                  {applyProgress.total}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {applyProgress.sectionId}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500 ease-out"
                  style={{
                    width: `${(applyProgress.current / applyProgress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Updates are applied one section at a time. You will see a visual
                comparison when this finishes.
              </p>
            </div>
          ) : null}

          {applyError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {applyError}
            </div>
          ) : null}

          {previewHtml && !applyProgress ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                <span>
                  Preview ready — scroll each pair to compare current vs updated. Uses
                  your funnel styles and images.
                </span>
              </div>
              <div className="space-y-6">
                {sectionVisualPreviews.map(
                  ({ sectionId, heading, beforeSrc, afterSrc }) => (
                    <div
                      key={sectionId}
                      className="rounded-xl border border-border/60 bg-muted/10 p-3 shadow-sm"
                    >
                      <div className="mb-3 border-b border-border/50 pb-2">
                        <p className="text-sm font-semibold leading-snug">
                          {heading.title}
                        </p>
                        {heading.subtitle ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {heading.subtitle}
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="min-w-0 space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Current
                          </p>
                          <iframe
                            title={`Current — ${sectionId}`}
                            srcDoc={beforeSrc}
                            className="h-[min(42vh,380px)] w-full rounded-lg border border-border/60 bg-white dark:bg-zinc-950"
                            sandbox="allow-same-origin allow-scripts"
                          />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            After update
                          </p>
                          <iframe
                            title={`After — ${sectionId}`}
                            srcDoc={afterSrc}
                            className="h-[min(42vh,380px)] w-full rounded-lg border border-emerald-500/25 bg-white ring-1 ring-emerald-500/20 dark:bg-zinc-950"
                            sandbox="allow-same-origin allow-scripts"
                          />
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {!applyProgress && (
            <div
              className={cn(
                "space-y-3",
                previewHtml && "pointer-events-none opacity-60",
              )}
            >
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={selectAllFindings}
                  disabled={Boolean(previewHtml)}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  disabled={Boolean(previewHtml)}
                >
                  Clear
                </Button>
                {previewHtml ? (
                  <span className="self-center text-xs text-muted-foreground">
                    Discard preview below to change selection
                  </span>
                ) : null}
              </div>
              <div className="max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pr-1">
                {flattenedFindings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No findings in this audit. Run audit again after changes.
                  </p>
                ) : (
                  flattenedFindings.map((f) => (
                    <label
                      key={f.key}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition hover:bg-muted/40",
                        selectedFindingKeys.has(f.key) &&
                          "border-sky-500/50 bg-sky-500/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 rounded border-input"
                        checked={selectedFindingKeys.has(f.key)}
                        onChange={() => toggleFinding(f.key)}
                        disabled={Boolean(previewHtml)}
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <span
                          className={cn(
                            "mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                            f.severity === "fixable"
                              ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                              : "bg-sky-500/15 text-sky-900 dark:text-sky-100",
                          )}
                        >
                          {f.severity}
                        </span>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {f.sectionId}
                        </p>
                        <p className="mt-1 font-medium leading-snug">{f.message}</p>
                        {f.detail ? (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {f.detail}
                          </p>
                        ) : null}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            {previewHtml && !applyProgress ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={discardPreview}
                  disabled={Boolean(applyProgress)}
                >
                  Discard preview
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleApplyDialogOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={confirmApplyPreview}
                >
                  <CheckCircle2 className="size-4" />
                  Confirm apply to funnel
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleApplyDialogOpenChange(false)}
                  disabled={Boolean(applyProgress)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    selectedFindingKeys.size === 0 || Boolean(applyProgress)
                  }
                  className="gap-2"
                  onClick={() => void runPreview()}
                >
                  {applyProgress ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                  Preview changes
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScoreDetailBody({
  kind,
  final,
  fixableList,
  advisoryList,
}: {
  kind: ScoreKind;
  final: FunnelFinalAudit;
  fixableList: {
    sectionId: string;
    message: string;
    detail: string;
  }[];
  advisoryList: {
    sectionId: string;
    message: string;
    detail: string;
  }[];
}) {
  if (kind === "qualitative") {
    return (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          This label summarizes the model’s overall judgment of whether the page is
          ready to ship from a copy and trust perspective, given your objective.
        </p>
        <p>
          <span className="font-semibold">Current:</span> {final.qualitativeLabel} (
          {final.qualitativeStatus.replace(/_/g, " ")})
        </p>
        <p className="text-muted-foreground">
          It is derived from the merged audit (all sections), not from a single rule.
        </p>
      </div>
    );
  }
  if (kind === "overall") {
    return (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          A 0–100 style score aggregating clarity, persuasion, alignment with the
          stated objective, and absence of major conversion blockers—based on the
          full chunked audit.
        </p>
        <p>
          <span className="font-semibold">Score:</span> {final.overallScore}
        </p>
        {final.summaryParagraphs[0] ? (
          <p className="text-muted-foreground">{final.summaryParagraphs[0]}</p>
        ) : null}
      </div>
    );
  }
  if (kind === "confidence") {
    return (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          How well the model believes it understood the page type, goal, and locale
          from the HTML/CSS and your context—not a measure of funnel quality itself.
        </p>
        <p>
          <span className="font-semibold">Level:</span> {final.contextConfidence}
        </p>
      </div>
    );
  }
  const list = kind === "fixable" ? fixableList : advisoryList;
  const title =
    kind === "fixable"
      ? "Issues the model treats as worth fixing before shipping (wording, clarity, trust, compliance tone)."
      : "Suggestions and lower-urgency improvements that could lift conversion or polish.";

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">{title}</p>
      <p className="text-sm">
        <span className="font-semibold">Count:</span> {list.length}
      </p>
      <ul className="space-y-4 border-t border-border/60 pt-3">
        {list.length === 0 ? (
          <li className="text-sm text-muted-foreground">None in this category.</li>
        ) : (
          list.map((item, i) => (
            <li
              key={`${item.sectionId}-${i}`}
              className="rounded-lg border border-border/50 bg-muted/15 p-3 text-sm"
            >
              <p className="font-mono text-[11px] text-muted-foreground">
                {item.sectionId}
              </p>
              <p className="mt-1 font-medium leading-snug">{item.message}</p>
              {item.detail ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {item.detail}
                </p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  className,
  onClick,
}: {
  label: string;
  value: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border/60 bg-background px-3 py-3 text-center shadow-sm transition hover:border-sky-400/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-sm font-semibold tabular-nums sm:text-base",
          className,
        )}
      >
        {value}
      </p>
      <p className="mt-1 flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
        Details <ChevronRight className="size-3" />
      </p>
    </button>
  );
}

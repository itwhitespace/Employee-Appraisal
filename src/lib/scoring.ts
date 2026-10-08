import {
  ALL_SECTIONS,
  NINE_BOX_LABELS,
  NINE_BOX_THRESHOLDS,
  PERFORMANCE_BANDS,
  PROMOTION_READINESS,
  WEIGHTED_SECTIONS,
} from "./constants";
import type {
  Evaluation,
  FormTemplate,
  ItemScore,
  Question,
  Rater,
  SectionKey,
  WeightedSectionKey,
  Weights,
} from "./types";

/** Template questions plus the employee's own KPIs appended to section A. */
export function getSectionQuestions(
  template: FormTemplate,
  evaluation: Pick<Evaluation, "personalKpis">,
): Record<SectionKey, Question[]> {
  return {
    ...template.sections,
    A: [...template.sections.A, ...evaluation.personalKpis],
  };
}

/** Mean of the rated items only; null when nothing has been rated yet. */
export function sectionAverage(
  questions: Question[],
  scores: Record<string, ItemScore>,
  rater: Rater,
): number | null {
  const values = questions
    .map((q) => scores[q.id]?.[rater])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Performance Score = sum(section average x weight).
 * Returns null until every weighted section has a score, so a half-filled
 * form never shows an understated total.
 */
export function weightedScore(
  averages: Record<WeightedSectionKey, number | null>,
  weights: Weights,
): number | null {
  let total = 0;
  for (const key of WEIGHTED_SECTIONS) {
    const avg = averages[key];
    if (avg === null) return null;
    total += avg * (weights[key] / 100);
  }
  return total;
}

export interface SectionSummary {
  self: number | null;
  supervisor: number | null;
  total: number;
  ratedSelf: number;
  ratedSupervisor: number;
}

export interface ScoreSummary {
  sections: Record<SectionKey, SectionSummary>;
  performance: Record<Rater, number | null>;
  potential: Record<Rater, number | null>;
  /** Score cells still empty across A-F, per rater. */
  missing: Record<Rater, number>;
}

export function summarize(template: FormTemplate, evaluation: Evaluation): ScoreSummary {
  const questions = getSectionQuestions(template, evaluation);
  const sections = {} as Record<SectionKey, SectionSummary>;
  const missing: Record<Rater, number> = { self: 0, supervisor: 0 };

  for (const key of ALL_SECTIONS) {
    const list = questions[key];
    const rated = (rater: Rater) =>
      list.filter((q) => typeof evaluation.scores[q.id]?.[rater] === "number").length;
    const summary: SectionSummary = {
      self: sectionAverage(list, evaluation.scores, "self"),
      supervisor: sectionAverage(list, evaluation.scores, "supervisor"),
      total: list.length,
      ratedSelf: rated("self"),
      ratedSupervisor: rated("supervisor"),
    };
    sections[key] = summary;
    missing.self += list.length - summary.ratedSelf;
    missing.supervisor += list.length - summary.ratedSupervisor;
  }

  const averagesFor = (rater: Rater) =>
    Object.fromEntries(WEIGHTED_SECTIONS.map((k) => [k, sections[k][rater]])) as Record<
      WeightedSectionKey,
      number | null
    >;

  return {
    sections,
    performance: {
      self: weightedScore(averagesFor("self"), template.weights),
      supervisor: weightedScore(averagesFor("supervisor"), template.weights),
    },
    potential: { self: sections.F.self, supervisor: sections.F.supervisor },
    missing,
  };
}

export type Band = 0 | 1 | 2;

/** Bands are decided on the value as displayed (2 decimals) so labels match what users see. */
const asShown = (score: number) => Math.round(score * 100) / 100;

export function scoreBand(score: number): Band {
  const shown = asShown(score);
  if (shown < NINE_BOX_THRESHOLDS.medium) return 0;
  if (shown < NINE_BOX_THRESHOLDS.high) return 1;
  return 2;
}

export interface NineBoxPosition {
  performanceBand: Band;
  potentialBand: Band;
  label: string;
}

export function nineBoxPosition(
  performance: number | null,
  potential: number | null,
): NineBoxPosition | null {
  if (performance === null || potential === null) return null;
  const performanceBand = scoreBand(performance);
  const potentialBand = scoreBand(potential);
  return {
    performanceBand,
    potentialBand,
    label: NINE_BOX_LABELS[potentialBand][performanceBand],
  };
}

export function performanceBand(performance: number | null): string | null {
  if (performance === null) return null;
  const shown = asShown(performance);
  return PERFORMANCE_BANDS.find((band) => shown >= band.min)?.label ?? null;
}

/** Preliminary promotion readiness, derived from the 9-Box position. */
export function promotionReadiness(position: NineBoxPosition | null): string | null {
  if (!position) return null;
  const { performanceBand: perf, potentialBand: pot } = position;
  if (perf === 2 && pot === 2) return PROMOTION_READINESS.ready;
  if (perf >= 1 && pot >= 1 && perf + pot >= 3) return PROMOTION_READINESS.soon;
  return PROMOTION_READINESS.develop;
}

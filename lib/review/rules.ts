// Pure S9 analyst-review rules: explicit decisions, mandatory reject reasons,
// golden-label eligibility, and the deterministic content-level review plan.
// No database or provider access here; persistence lives in runtime/hypothesis repositories.
import {
  FEATURE_REVIEW_DECISIONS,
  HYPOTHESIS_REVIEW_DECISIONS,
  REVIEW_REASONS,
  type FeatureReviewDecision,
  type FeatureReviewState,
  type HypothesisReviewDecision,
  type ReviewReason,
} from '../domain/types.ts';

export const REVIEW_RULE_VERSION = 'review-v1';

export class ReviewValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ReviewValidationError';
  }
}

export class ReviewNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = 'ReviewNotFoundError';
  }
}

export function isFeatureReviewDecision(value: unknown): value is FeatureReviewDecision {
  return typeof value === 'string' && (FEATURE_REVIEW_DECISIONS as readonly string[]).includes(value);
}

export function isHypothesisReviewDecision(value: unknown): value is HypothesisReviewDecision {
  return typeof value === 'string' && (HYPOTHESIS_REVIEW_DECISIONS as readonly string[]).includes(value);
}

export function isReviewReason(value: unknown): value is ReviewReason {
  return typeof value === 'string' && (REVIEW_REASONS as readonly string[]).includes(value);
}

/** Reviewed state a decision produces. Unreviewed is never produced by a decision. */
export function featureReviewStateFor(decision: FeatureReviewDecision): FeatureReviewState {
  if (decision === 'CONFIRM') return 'CONFIRMED';
  if (decision === 'CORRECT') return 'CORRECTED';
  return 'REJECTED';
}

/**
 * Golden labels are analyst-approved ground truth, so a rejection can never be one.
 * Keeping this rule pure and shared prevents label drift between API and fixture validation.
 */
export function goldenLabelAllowed(decision: FeatureReviewDecision | HypothesisReviewDecision): boolean {
  return decision === 'CONFIRM' || decision === 'CORRECT' || decision === 'APPROVE' || decision === 'EDIT';
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new ReviewValidationError(`${field} is required`);
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalReason(value: unknown, field: string): ReviewReason | null {
  if (value === undefined || value === null) return null;
  if (!isReviewReason(value)) throw new ReviewValidationError(`${field} must be one of ${REVIEW_REASONS.join('|')}`);
  return value;
}

function optionalGoldenLabel(value: unknown, decision: FeatureReviewDecision | HypothesisReviewDecision): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') throw new ReviewValidationError('goldenLabel must be boolean');
  if (value && !goldenLabelAllowed(decision)) throw new ReviewValidationError(`goldenLabel is not allowed for ${decision}`);
  return value;
}

export type FeatureReviewInput = {
  decision: FeatureReviewDecision;
  reviewer: string;
  reasonCode: ReviewReason | null;
  value: string | null;
  note: string | null;
  goldenLabel: boolean;
};

/** Per-feature review input: CORRECT needs a corrected value, REJECT needs a reason. */
export function validateFeatureReviewInput(input: Record<string, unknown>): FeatureReviewInput {
  const decision = input.decision;
  if (!isFeatureReviewDecision(decision)) throw new ReviewValidationError(`decision must be one of ${FEATURE_REVIEW_DECISIONS.join('|')}`);
  const reviewer = requiredText(input.reviewer, 'reviewer');
  const reasonCode = optionalReason(input.reasonCode, 'reasonCode');
  const value = optionalText(input.value);
  if (decision === 'CORRECT' && value === null) throw new ReviewValidationError('corrected value is required for CORRECT');
  if (decision === 'REJECT' && reasonCode === null) throw new ReviewValidationError('reasonCode is required for REJECT');
  return { decision, reviewer, reasonCode, value, note: optionalText(input.note), goldenLabel: optionalGoldenLabel(input.goldenLabel, decision) };
}

export type HypothesisReviewInput = {
  decision: HypothesisReviewDecision;
  reviewer: string;
  reasonCode: ReviewReason | null;
  note: string | null;
  editedStatement: string | null;
  goldenLabel: boolean;
};

/**
 * Hypothesis rows are append-only, so an edited statement is carried on the review
 * record itself; EDIT without a statement is meaningless and therefore rejected.
 */
export function validateHypothesisReviewInput(input: Record<string, unknown>): HypothesisReviewInput {
  const decision = input.decision;
  if (!isHypothesisReviewDecision(decision)) throw new ReviewValidationError(`decision must be one of ${HYPOTHESIS_REVIEW_DECISIONS.join('|')}`);
  const reviewer = requiredText(input.reviewer, 'reviewer');
  const reasonCode = optionalReason(input.reasonCode, 'reasonCode');
  const editedStatement = optionalText(input.editedStatement);
  if (decision === 'EDIT' && editedStatement === null) throw new ReviewValidationError('editedStatement is required for EDIT');
  if (decision === 'REJECT' && reasonCode === null) throw new ReviewValidationError('reasonCode is required for REJECT');
  return { decision, reviewer, reasonCode, note: optionalText(input.note), editedStatement, goldenLabel: optionalGoldenLabel(input.goldenLabel, decision) };
}

export type ReviewableFeature = { id: string; aiValue: string; reviewState: string };
export type PlannedFeatureReview = { contentFeatureId: string; decision: FeatureReviewDecision; value: string | null; reasonCode: ReviewReason | null };

export type ContentReviewInput = {
  decision: FeatureReviewDecision;
  reviewer: string;
  reasonCode: ReviewReason | null;
  note: string | null;
  goldenLabel: boolean;
  corrections: Array<{ contentFeatureId: string; value: string; reasonCode: ReviewReason | null }>;
};

/**
 * Content-level request shape: Confirm All / Correct fields / Reject All.
 * Correct fields carries per-feature corrections; the untouched unreviewed fields are confirmed.
 */
export function validateContentReviewInput(input: Record<string, unknown>): ContentReviewInput {
  const decision = input.decision;
  if (!isFeatureReviewDecision(decision)) throw new ReviewValidationError(`decision must be one of ${FEATURE_REVIEW_DECISIONS.join('|')}`);
  const reviewer = requiredText(input.reviewer, 'reviewer');
  const reasonCode = optionalReason(input.reasonCode, 'reasonCode');
  if (decision === 'REJECT' && reasonCode === null) throw new ReviewValidationError('reasonCode is required for REJECT');
  const rawCorrections = input.corrections;
  if (rawCorrections !== undefined && !Array.isArray(rawCorrections)) throw new ReviewValidationError('corrections must be an array');
  const corrections = (rawCorrections ?? []).map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new ReviewValidationError(`corrections[${index}] must be an object`);
    const correction = entry as Record<string, unknown>;
    return {
      contentFeatureId: requiredText(correction.contentFeatureId, `corrections[${index}].contentFeatureId`),
      value: requiredText(correction.value, `corrections[${index}].value`),
      reasonCode: optionalReason(correction.reasonCode, `corrections[${index}].reasonCode`),
    };
  });
  if (decision === 'CORRECT' && corrections.length === 0) throw new ReviewValidationError('CORRECT requires at least one corrected field');
  if (decision !== 'CORRECT' && corrections.length > 0) throw new ReviewValidationError(`corrections are only accepted for CORRECT, not ${decision}`);
  const seen = new Set<string>();
  for (const correction of corrections) {
    if (seen.has(correction.contentFeatureId)) throw new ReviewValidationError(`duplicate correction for content feature ${correction.contentFeatureId}`);
    seen.add(correction.contentFeatureId);
  }
  return { decision, reviewer, reasonCode, note: optionalText(input.note), goldenLabel: optionalGoldenLabel(input.goldenLabel, decision), corrections };
}

/**
 * Deterministic plan for one content's features. Only UNREVIEWED features are touched:
 * an existing decision is never overwritten, so review history stays append-only and
 * the AI original is carried through untouched for persistence to preserve.
 */
export function planContentReview(features: readonly ReviewableFeature[], input: ContentReviewInput): PlannedFeatureReview[] {
  const unreviewed = features.filter((feature) => feature.reviewState === 'UNREVIEWED');
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  const corrected = new Map<string, { value: string; reasonCode: ReviewReason | null }>();
  for (const correction of input.corrections) {
    const feature = byId.get(correction.contentFeatureId);
    if (!feature) throw new ReviewNotFoundError(`content feature ${correction.contentFeatureId} is not part of this content`);
    if (feature.reviewState !== 'UNREVIEWED') throw new ReviewValidationError(`content feature ${correction.contentFeatureId} is already ${feature.reviewState} and cannot be corrected again`);
    corrected.set(correction.contentFeatureId, { value: correction.value, reasonCode: correction.reasonCode });
  }
  if (input.decision === 'CORRECT') {
    return unreviewed.map((feature) => {
      const correction = corrected.get(feature.id);
      return correction
        ? { contentFeatureId: feature.id, decision: 'CORRECT' as const, value: correction.value, reasonCode: correction.reasonCode ?? input.reasonCode }
        : { contentFeatureId: feature.id, decision: 'CONFIRM' as const, value: feature.aiValue, reasonCode: null };
    });
  }
  return unreviewed.map((feature) => ({
    contentFeatureId: feature.id,
    decision: input.decision,
    value: input.decision === 'CONFIRM' ? feature.aiValue : null,
    reasonCode: input.decision === 'REJECT' ? input.reasonCode : null,
  }));
}

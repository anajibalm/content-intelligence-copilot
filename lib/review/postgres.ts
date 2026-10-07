import { Pool, type PoolClient } from 'pg';
import type { FeatureReviewDecision, HypothesisReviewDecision, ReviewReason } from '../domain/types.ts';
import {
  ReviewNotFoundError,
  ReviewValidationError,
  featureReviewStateFor,
  planContentReview,
  validateContentReviewInput,
  validateFeatureReviewInput,
  validateHypothesisReviewInput,
  type ContentReviewInput,
  type FeatureReviewInput,
} from './rules.ts';

export interface ReviewRepositoryConfig {
  connectionString: string;
  workspaceId: string;
}

export interface FeatureReviewRecord {
  id: string;
  contentFeatureId: string;
  extractionRunId: string;
  fieldName: string;
  decision: FeatureReviewDecision;
  reasonCode: ReviewReason | null;
  reviewedValue: string | null;
  goldenLabel: boolean;
  reviewer: string;
  note: string | null;
  createdAt: string;
}

export interface FeatureCorrectionRecord {
  id: string;
  contentFeatureId: string;
  extractionRunId: string;
  fieldName: string;
  originalAiValue: string;
  correctedValue: string;
  reasonCode: ReviewReason;
  reviewer: string;
  note: string | null;
  createdAt: string;
}

export interface ContentReviewDecision {
  contentFeatureId: string;
  fieldName: string;
  extractionRunId: string;
  decision: FeatureReviewDecision;
  aiValue: string;
  reviewedValue: string | null;
  reviewState: string;
  goldenLabel: boolean;
}

export interface ContentReviewResult {
  contentId: string;
  decisions: ContentReviewDecision[];
}

export interface ContentReviewHistory {
  contentId: string;
  reviews: FeatureReviewRecord[];
  corrections: FeatureCorrectionRecord[];
}

export interface HypothesisReviewRecord {
  id: string;
  hypothesisId: string;
  decision: HypothesisReviewDecision;
  reasonCode: ReviewReason | null;
  editedStatement: string | null;
  reviewedStatement: string;
  goldenLabel: boolean;
  reviewer: string;
  note: string | null;
  createdAt: string;
}

export interface ReviewRepository {
  reviewContent(contentId: string, input: Record<string, unknown>): Promise<ContentReviewResult>;
  contentHistory(contentId: string): Promise<ContentReviewHistory>;
  reviewFeature(contentFeatureId: string, input: Record<string, unknown>): Promise<ContentReviewDecision>;
  reviewHypothesis(input: Record<string, unknown>): Promise<HypothesisReviewRecord>;
  hypothesisHistory(hypothesisId: string): Promise<HypothesisReviewRecord[]>;
  close(): Promise<void>;
}

type FeatureRow = {
  id: string;
  field_name: string;
  ai_value: string;
  reviewed_value: string | null;
  review_state: string;
  extraction_run_id: string;
};
type FeatureReviewRow = {
  id: string;
  content_feature_id: string;
  extraction_run_id: string;
  field_name: string;
  decision: FeatureReviewDecision;
  reason_code: ReviewReason | null;
  reviewed_value: string | null;
  golden_label: boolean;
  reviewer: string;
  note: string | null;
  created_at: string;
};
type FeatureCorrectionRow = {
  id: string;
  content_feature_id: string;
  extraction_run_id: string;
  field_name: string;
  original_ai_value: string;
  corrected_value: string;
  reason_code: ReviewReason;
  reviewer: string;
  note: string | null;
  created_at: string;
};

type HypothesisReviewRow = {
  id: string;
  hypothesis_id: string;
  decision: HypothesisReviewDecision;
  reason_code: ReviewReason | null;
  edited_statement: string | null;
  reviewed_statement: string;
  golden_label: boolean;
  reviewer: string;
  note: string | null;
  created_at: string;
};
const FEATURE_COLUMNS = 'id, field_name, ai_value, reviewed_value, review_state, extraction_run_id';

export function reviewConfigFromEnv(): ReviewRepositoryConfig {
  const connectionString = process.env.CIC_DATABASE_URL ?? process.env.DATABASE_URL;
  const workspaceId = process.env.CIC_WORKSPACE_ID;
  if (!connectionString || !workspaceId) throw new Error('CIC_DATABASE_URL and CIC_WORKSPACE_ID are required for review');
  return { connectionString, workspaceId };
}

function featureReviewRecord(row: FeatureReviewRow): FeatureReviewRecord {
  return {
    id: row.id,
    contentFeatureId: row.content_feature_id,
    extractionRunId: row.extraction_run_id,
    fieldName: row.field_name,
    decision: row.decision,
    reasonCode: row.reason_code,
    reviewedValue: row.reviewed_value,
    goldenLabel: row.golden_label,
    reviewer: row.reviewer,
    note: row.note,
    createdAt: row.created_at,
  };
}

function featureCorrectionRecord(row: FeatureCorrectionRow): FeatureCorrectionRecord {
  return {
    id: row.id,
    contentFeatureId: row.content_feature_id,
    extractionRunId: row.extraction_run_id,
    fieldName: row.field_name,
    originalAiValue: row.original_ai_value,
    correctedValue: row.corrected_value,
    reasonCode: row.reason_code,
    reviewer: row.reviewer,
    note: row.note,
    createdAt: row.created_at,
  };
}

function hypothesisReviewRecord(row: HypothesisReviewRow): HypothesisReviewRecord {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    decision: row.decision,
    reasonCode: row.reason_code,
    editedStatement: row.edited_statement,
    reviewedStatement: row.reviewed_statement,
    goldenLabel: row.golden_label,
    reviewer: row.reviewer,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function createReviewRepository(config: ReviewRepositoryConfig): ReviewRepository {
  const pool = new Pool({ connectionString: config.connectionString, max: 2 });

  /**
   * One feature decision: append feature_review, copy the AI original into a
   * feature_correction when correcting, then make reviewed_value canonical.
   * ai_value itself is never written here, so the AI original survives every review.
   */
  async function applyFeatureReview(
    client: PoolClient,
    feature: FeatureRow,
    input: FeatureReviewInput,
  ): Promise<ContentReviewDecision> {
    const reviewedValue = input.decision === 'CONFIRM' ? feature.ai_value : input.decision === 'CORRECT' ? input.value : null;
    const reasonCode = input.reasonCode;
    if (input.decision === 'CORRECT') {
      await client.query(
        `INSERT INTO feature_correction (workspace_id, content_feature_id, extraction_run_id, original_ai_value, corrected_value, reason_code, note, reviewer)
         VALUES ($1, $2, $3, $4, $5, $6::review_reason, $7, $8)`,
        [config.workspaceId, feature.id, feature.extraction_run_id, feature.ai_value, reviewedValue, reasonCode ?? 'OTHER', input.note, input.reviewer],
      );
    }
    await client.query(
      `INSERT INTO feature_review (workspace_id, content_feature_id, extraction_run_id, decision, reason_code, reviewed_value, golden_label, reviewer, note)
       VALUES ($1, $2, $3, $4::feature_review_decision, $5::review_reason, $6, $7, $8, $9)`,
      [config.workspaceId, feature.id, feature.extraction_run_id, input.decision, reasonCode, reviewedValue, input.goldenLabel, input.reviewer, input.note],
    );
    const reviewState = featureReviewStateFor(input.decision);
    await client.query(
      `UPDATE content_feature SET reviewed_value = $1, review_state = $2::feature_review_state, updated_at = now()
       WHERE workspace_id = $3 AND id = $4`,
      [reviewedValue, reviewState, config.workspaceId, feature.id],
    );
    return { contentFeatureId: feature.id, fieldName: feature.field_name, extractionRunId: feature.extraction_run_id, decision: input.decision, aiValue: feature.ai_value, reviewedValue, reviewState, goldenLabel: input.goldenLabel };
  }

  async function contentFeatures(client: PoolClient, contentId: string, extractionRunId: string): Promise<FeatureRow[]> {
    const rows = await client.query<FeatureRow>(
      `SELECT ${FEATURE_COLUMNS} FROM content_feature
       WHERE workspace_id = $1 AND content_id = $2 AND extraction_run_id = $3 ORDER BY field_name FOR UPDATE`,
      [config.workspaceId, contentId, extractionRunId],
    );
    return rows.rows;
  }

  /**
   * Content-level review (plan S9: Confirm All / Correct fields / Reject All).
   * One transaction for the whole content so a partial review is never persisted.
   */
  async function reviewContent(contentId: string, rawInput: Record<string, unknown>): Promise<ContentReviewResult> {
    const input: ContentReviewInput = validateContentReviewInput(rawInput);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const content = await client.query<{ id: string }>('SELECT id FROM content WHERE workspace_id = $1 AND id = $2 FOR UPDATE', [config.workspaceId, contentId]);
      if (!content.rows[0]) throw new ReviewNotFoundError('content not found in workspace');
      const extractionRun = await client.query<{ id: string }>(
        'SELECT id FROM extraction_run WHERE workspace_id = $1 AND content_id = $2 AND id = $3 FOR UPDATE',
        [config.workspaceId, contentId, input.extractionRunId],
      );
      if (!extractionRun.rows[0]) throw new ReviewNotFoundError('extraction run not found for content');
      const features = await contentFeatures(client, contentId, input.extractionRunId);
      const plan = planContentReview(
        features.map((row) => ({ id: row.id, aiValue: row.ai_value, reviewedValue: row.reviewed_value, reviewState: row.review_state })),
        input,
      );
      if (plan.length === 0) throw new ReviewValidationError('extraction run has no extracted features to review');
      const byId = new Map(features.map((row) => [row.id, row]));
      const decisions: ContentReviewDecision[] = [];
      for (const entry of plan) {
        const feature = byId.get(entry.contentFeatureId);
        if (!feature) throw new ReviewNotFoundError(`content feature ${entry.contentFeatureId} is not part of this content`);
        decisions.push(await applyFeatureReview(client, feature, {
          decision: entry.decision,
          value: entry.value,
          reasonCode: entry.reasonCode,
          note: input.note,
          reviewer: input.reviewer,
          goldenLabel: input.goldenLabel && entry.decision === 'CORRECT',
        }));
      }
      await client.query('COMMIT');
      return { contentId, decisions };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Single-feature review appends a new event and updates current projection. */
  async function reviewFeature(contentFeatureId: string, rawInput: Record<string, unknown>): Promise<ContentReviewDecision> {
    const input: FeatureReviewInput = validateFeatureReviewInput(rawInput);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<FeatureRow>(`SELECT ${FEATURE_COLUMNS} FROM content_feature WHERE workspace_id = $1 AND id = $2 FOR UPDATE`, [config.workspaceId, contentFeatureId]);
      const feature = found.rows[0];
      if (!feature) throw new ReviewNotFoundError('content feature not found in workspace');
      const decision = await applyFeatureReview(client, feature, input);
      await client.query('COMMIT');
      return decision;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Append-only history for every feature of one content, oldest first. */
  async function contentHistory(contentId: string): Promise<ContentReviewHistory> {
    const content = await pool.query<{ id: string }>('SELECT id FROM content WHERE workspace_id = $1 AND id = $2', [config.workspaceId, contentId]);
    if (!content.rows[0]) throw new ReviewNotFoundError('content not found in workspace');
    const [reviews, corrections] = await Promise.all([
      pool.query<FeatureReviewRow>(
        `SELECT fr.id, fr.content_feature_id, fr.extraction_run_id, cf.field_name, fr.decision, fr.reason_code, fr.reviewed_value, fr.golden_label, fr.reviewer, fr.note, fr.created_at
         FROM feature_review fr JOIN content_feature cf ON cf.id = fr.content_feature_id
         WHERE fr.workspace_id = $1 AND cf.content_id = $2 ORDER BY fr.created_at, fr.id`,
        [config.workspaceId, contentId],
      ),
      pool.query<FeatureCorrectionRow>(
        `SELECT fc.id, fc.content_feature_id, fc.extraction_run_id, cf.field_name, fc.original_ai_value, fc.corrected_value, fc.reason_code, fc.reviewer, fc.note, fc.created_at
         FROM feature_correction fc JOIN content_feature cf ON cf.id = fc.content_feature_id
         WHERE fc.workspace_id = $1 AND cf.content_id = $2 ORDER BY fc.created_at, fc.id`,
        [config.workspaceId, contentId],
      ),
    ]);
    return { contentId, reviews: reviews.rows.map(featureReviewRecord), corrections: corrections.rows.map(featureCorrectionRecord) };
  }

  /**
   * Hypothesis review (Approve / Edit / Reject). The hypothesis row and its evidence
   * links are append-only, so only a review row is written; an edited statement is
   * stored on that row and existing evidence links stay untouched.
   */
  async function reviewHypothesis(rawInput: Record<string, unknown>): Promise<HypothesisReviewRecord> {
    const rawId = rawInput.hypothesisId;
    if (typeof rawId !== 'string' || rawId.trim().length === 0) throw new ReviewValidationError('hypothesisId is required');
    const hypothesisId = rawId.trim();
    const input = validateHypothesisReviewInput(rawInput);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const hypothesis = await client.query<{ id: string; statement: string }>('SELECT id, statement FROM hypothesis WHERE workspace_id = $1 AND id = $2 FOR UPDATE', [config.workspaceId, hypothesisId]);
      if (!hypothesis.rows[0]) throw new ReviewNotFoundError('hypothesis not found in workspace');
      const previous = await client.query<{ reviewed_statement: string }>('SELECT reviewed_statement FROM review WHERE workspace_id = $1 AND hypothesis_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1', [config.workspaceId, hypothesisId]);
      const reviewedStatement = input.editedStatement ?? previous.rows[0]?.reviewed_statement ?? hypothesis.rows[0].statement;
      const inserted = await client.query<HypothesisReviewRow>(
        `INSERT INTO review (workspace_id, hypothesis_id, decision, reason_code, edited_statement, reviewed_statement, golden_label, note, reviewer)
         VALUES ($1, $2, $3::hypothesis_review_decision, $4::review_reason, $5, $6, $7, $8, $9)
         RETURNING id, hypothesis_id, decision, reason_code, edited_statement, reviewed_statement, golden_label, reviewer, note, created_at`,
        [config.workspaceId, hypothesisId, input.decision, input.reasonCode, input.editedStatement, reviewedStatement, input.goldenLabel, input.note, input.reviewer],
      );
      await client.query('COMMIT');
      return hypothesisReviewRecord(inserted.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Append-only hypothesis review history, oldest first. */
  async function hypothesisHistory(hypothesisId: string): Promise<HypothesisReviewRecord[]> {
    const hypothesis = await pool.query<{ id: string }>('SELECT id FROM hypothesis WHERE workspace_id = $1 AND id = $2', [config.workspaceId, hypothesisId]);
    if (!hypothesis.rows[0]) throw new ReviewNotFoundError('hypothesis not found in workspace');
    const rows = await pool.query<HypothesisReviewRow>(
      `SELECT id, hypothesis_id, decision, reason_code, edited_statement, reviewed_statement, golden_label, reviewer, note, created_at
       FROM review WHERE workspace_id = $1 AND hypothesis_id = $2 ORDER BY created_at, id`,
      [config.workspaceId, hypothesisId],
    );
    return rows.rows.map(hypothesisReviewRecord);
  }

  return { reviewContent, contentHistory, reviewFeature, reviewHypothesis, hypothesisHistory, close: () => pool.end() };
}

// Canonical S1 domain types.
// Mirrors supabase/migrations/0001_canonical_schema.sql 1:1 (snake_case ↔ camelCase).
// Sources: docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md + docs/source/IMPLEMENTATION_PLAN_v0.1.md.
// Standalone Data Contract missing (docs/decisions/DATA_CONTRACT_STATUS.md):
// unsupported fields stay out. No donor schemas.

// ---------------------------------------------------------------------------
// Vocabularies (frozen MVP contract / implementation plan)
// ---------------------------------------------------------------------------

export const PROCESSING_STAGE_STATES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'UNAVAILABLE',
] as const;
/** Per-stage pipeline state (plan S3). Reused as overall content processing state. */
export type ProcessingState = (typeof PROCESSING_STAGE_STATES)[number];

export const PROCESSING_STAGES = [
  'FFPROBE',
  'AUDIO_EXTRACTION',
  'TRANSCRIPTION',
  'HOOK_FRAMES',
  'REPRESENTATIVE_FRAMES',
  'MULTIMODAL_EXTRACTION',
] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

export const PLATFORMS = ['TIKTOK'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Organic vs Paid lives on metric_snapshot only — never on content (contract §4/§10.3). */
export const DISTRIBUTION_CONTEXTS = ['ORGANIC', 'PAID'] as const;
export type DistributionContext = (typeof DISTRIBUTION_CONTEXTS)[number];

/** Value 0 never automatically means a valid zero (contract §10.4/§10.5). */
export const METRIC_QUALITIES = ['VALID', 'MISSING', 'SUSPECT', 'UNAVAILABLE'] as const;
export type MetricQuality = (typeof METRIC_QUALITIES)[number];

/** Evidence ontology layers — must never be silently collapsed (contract §9). */
export const EVIDENCE_LAYERS = ['OBSERVED', 'DERIVED', 'EXTRACTED', 'INFERRED'] as const;
export type EvidenceLayer = (typeof EVIDENCE_LAYERS)[number];

export const CONFIDENCE_LABELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];

/** Comparison quality vocabulary: deterministic, not LLM prose (contract §12/§13). */
export const COMPARISON_QUALITIES = ['LOW', 'MEDIUM', 'HIGH', 'UNAVAILABLE'] as const;
export type ComparisonQuality = (typeof COMPARISON_QUALITIES)[number];

export const COMPARISON_MODES = ['CONTROLLED', 'PERFORMANCE_CONTRAST', 'MANUAL'] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

export const HYPOTHESIS_STATES = [
  'PROPOSED',
  'ACCEPTED',
  'TESTING',
  'SUPPORTED',
  'CONTRADICTED',
  'INCONCLUSIVE',
  'RETIRED',
] as const;
export type HypothesisState = (typeof HYPOTHESIS_STATES)[number];

export const HYPOTHESIS_LINK_ROLES = ['ORIGIN', 'REPLICATION', 'CONTRADICTION'] as const;
export type HypothesisLinkRole = (typeof HYPOTHESIS_LINK_ROLES)[number];

export const HYPOTHESIS_EVIDENCE_ROLES = ['SUPPORTING', 'CONTRADICTING', 'CONTEXTUAL'] as const;
export type HypothesisEvidenceRole = (typeof HYPOTHESIS_EVIDENCE_ROLES)[number];

export const NEXT_TEST_STATUSES = [
  'PROPOSED',
  'ACCEPTED',
  'RUNNING',
  'COMPLETED',
  'CANCELLED',
] as const;
export type NextTestStatus = (typeof NEXT_TEST_STATUSES)[number];

export const ACQUISITION_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type AcquisitionStatus = (typeof ACQUISITION_STATUSES)[number];

export const EXTRACTION_RUN_STATUSES = ['SUCCEEDED', 'FAILED'] as const;
export type ExtractionRunStatus = (typeof EXTRACTION_RUN_STATUSES)[number];

export const FEATURE_REVIEW_DECISIONS = ['CONFIRM', 'CORRECT', 'REJECT'] as const;
export type FeatureReviewDecision = (typeof FEATURE_REVIEW_DECISIONS)[number];

export const FEATURE_REVIEW_STATES = ['UNREVIEWED', 'CONFIRMED', 'CORRECTED', 'REJECTED'] as const;
export type FeatureReviewState = (typeof FEATURE_REVIEW_STATES)[number];

export const HYPOTHESIS_REVIEW_DECISIONS = ['APPROVE', 'EDIT', 'REJECT'] as const;
export type HypothesisReviewDecision = (typeof HYPOTHESIS_REVIEW_DECISIONS)[number];

export const REVIEW_REASONS = [
  'WRONG_CLASSIFICATION',
  'MISSED_VISUAL_CONTEXT',
  'MISSED_DIALOGUE',
  'WRONG_METRIC_INTERPRETATION',
  'OVERCLAIM',
  'TOO_GENERIC',
  'MISSING_VARIABLE',
  'BAD_DATA',
  'OTHER',
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const FRAME_TYPES = ['HOOK', 'REPRESENTATIVE', 'SCENE'] as const;
export type FrameType = (typeof FRAME_TYPES)[number];

export const METRIC_QUALITY_REASONS = [
  'NOT_ACCESSIBLE',
  'NOT_PROVIDED',
  'SOURCE_ERROR',
  'UNEXPLAINED_ZERO',
  'MANUAL_CHECK_REQUIRED',
] as const;
export type MetricQualityReason = (typeof METRIC_QUALITY_REASONS)[number];

export const CONFIG_APPROVAL_STATES = ['UNCONFIGURED', 'PENDING', 'APPROVED'] as const;
export type ConfigApprovalState = (typeof CONFIG_APPROVAL_STATES)[number];

export const KPI_ASSESSMENT_STATUSES = ['ACHIEVED', 'NOT_ACHIEVED', 'INSUFFICIENT_DATA', 'UNCONFIGURED'] as const;
export type KpiAssessmentStatus = (typeof KPI_ASSESSMENT_STATUSES)[number];

export const COMPARISON_SCOPES = ['PAIR', 'GROUP', 'BATCH'] as const;
export type ComparisonScope = (typeof COMPARISON_SCOPES)[number];

export const TEMPORAL_ANCHOR_REVIEW_STATES = ['UNREVIEWED', 'CONFIRMED', 'REJECTED'] as const;
export type TemporalAnchorReviewState = (typeof TEMPORAL_ANCHOR_REVIEW_STATES)[number];

/** Transcript segmentation (D2 donor adaptation, extended with visual layers later). */
export const TRANSCRIPT_ROLES = [
  'HOOK',
  'SETUP',
  'MAIN_CLAIM',
  'EVIDENCE_EXAMPLES',
  'PAYOFF',
  'CTA',
] as const;
export type TranscriptRole = (typeof TRANSCRIPT_ROLES)[number];

export const NOTE_TARGET_TYPES = ['BATCH', 'CONTENT', 'COMPARISON', 'HYPOTHESIS'] as const;
export type NoteTargetType = (typeof NOTE_TARGET_TYPES)[number];

/** S4 fingerprint v0.1 output vocabulary. Configurable per contract §21; extends via migration. */
export const FINGERPRINT_FIELDS = [
  'topic',
  'format',
  'hook_type',
  'hook_subject',
  'talent_type',
  'talent_familiarity',
  'opening_style',
  'pacing',
  'narrative_structure',
  'emotional_trigger',
  'tension_type',
  'product_placement',
  'cta_type',
] as const;
export type FingerprintField = (typeof FINGERPRINT_FIELDS)[number];

/** Evidence must point back to immutable observations / segments / frames / features (contract §10.8). */
export const EVIDENCE_SOURCE_TYPES = [
  'METRIC_SNAPSHOT',
  'TRANSCRIPT_SEGMENT',
  'VIDEO_FRAME',
  'CONTENT_FEATURE',
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Entity IDs
// ---------------------------------------------------------------------------

export type WorkspaceId = string;
export type BrandId = string;
export type ObjectiveId = string;
export type PillarId = string;
export type BatchId = string;
export type ContentId = string;
export type ContentSourceId = string;
export type AcquisitionRunId = string;
export type ContentProcessingId = string;
export type MetricSnapshotId = string;
export type TranscriptId = string;
export type TranscriptSegmentId = string;
export type VideoFrameId = string;
export type ExtractionRunId = string;
export type ContentFeatureId = string;
export type FeatureReviewId = string;
export type FeatureCorrectionId = string;
export type ComparisonId = string;
export type ComparisonItemId = string;
export type ComparisonSnapshotId = string;
export type EvidenceId = string;
export type EvidenceSourceId = string;
export type HypothesisId = string;
export type HypothesisComparisonId = string;
export type HypothesisEvidenceId = string;
export type ReviewId = string;
export type NextTestId = string;
export type AnalystNoteId = string;

export interface MetricQualityDetail {
  state: MetricQuality;
  reason: MetricQualityReason | null;
}
export type MetricQualityMap = Readonly<Record<string, MetricQualityDetail>>;

/** Brand-specific ranking context; unknown settings stay explicitly unconfigured. */
export interface BrandAnalysisConfig {
  id: string;
  workspaceId: WorkspaceId;
  brandId: BrandId;
  version: number;
  primaryMetric: string | null;
  supportingMetrics: readonly string[];
  rankingRule: Readonly<Record<string, unknown>>;
  fallbackRule: Readonly<Record<string, unknown>>;
  creativePreferences: Readonly<Record<string, unknown>>;
  workingLanguage: string | null;
  futureDeckLanguage: string | null;
  configuredBy: string | null;
  approvalState: ConfigApprovalState;
  unconfiguredReason: string | null;
  createdAt: string;
}

/** Brand KPI target; target values may remain unconfigured until supplied by brand. */
export interface BrandKpiDefinition {
  id: string;
  workspaceId: WorkspaceId;
  brandId: BrandId;
  version: number;
  metricName: string;
  targetValue: number | null;
  unit: string | null;
  comparator: string | null;
  aggregationMethod: string | null;
  assessmentScope: string | null;
  reportingWindow: Readonly<Record<string, unknown>>;
  sourceRequirement: string | null;
  distribution: DistributionContext | null;
  formulaVersion: string | null;
  configuredBy: string | null;
  effectiveFrom: string | null;
  unconfiguredReason: string | null;
  createdAt: string;
}

export interface BatchKpiAssessment {
  id: string;
  workspaceId: WorkspaceId;
  batchId: BatchId;
  kpiDefinitionId: string;
  analysisConfigId: string | null;
  sourceSnapshotIds: readonly MetricSnapshotId[];
  formulaVersion: string | null;
  ruleVersion: string;
  actualValue: number | null;
  status: KpiAssessmentStatus;
  qualityState: MetricQuality;
  assessedAt: string;
  createdAt: string;
}

export interface TemporalEvidenceAnchor {
  id: string;
  workspaceId: WorkspaceId;
  contentId: ContentId;
  videoFrameId: VideoFrameId | null;
  transcriptSegmentId: TranscriptSegmentId | null;
  anchorType: string;
  timestampMs: number;
  reviewState: TemporalAnchorReviewState;
  note: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// JSON column shapes
// ---------------------------------------------------------------------------

/** Raw observed metrics only. Derived values (ER etc.) MUST NOT appear here (contract §10.2). */
export type RawMetrics = Readonly<Record<string, number | null>>;

/** Deterministic derived metric. formula_version is recorded per entry (plan S5). */
export interface DerivedMetricEntry {
  value: number | null;
  formulaVersion: string;
}
export type DerivedMetrics = Readonly<Record<string, DerivedMetricEntry>>;

/** Provider raw response. Acquisition-layer only; never the domain model (contract §10.1). */
export type ProviderRawPayload = Readonly<Record<string, unknown>>;

/** Machine-readable deterministic confidence caps; LLM cannot override (contract §13). */
export interface ConfidenceCap {
  rule: string;
  reason: string;
}

/** Controlled/uncontrolled variable map evaluated by the compare engine (plan S7). */
export type ComparisonVariables = Readonly<Record<string, string | number | boolean | null>>;

/** Raw AI extraction output. AI original; never overwritten (contract §11.3). */
export type ExtractionRawOutput = Readonly<Record<string, unknown>>;

/** Per-stage processing output (ffprobe facts, artifact paths, etc.). */
export type ProcessingOutput = Readonly<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface Workspace {
  id: WorkspaceId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: BrandId;
  workspaceId: WorkspaceId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Human-defined objective. Labels are objective-specific; no Best Overall (contract §8). */
export interface Objective {
  id: ObjectiveId;
  workspaceId: WorkspaceId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pillar {
  id: PillarId;
  workspaceId: WorkspaceId;
  batchId: BatchId;
  name: string;
  primaryObjectiveId: ObjectiveId | null;
  secondaryObjectiveId: ObjectiveId | null;
  createdAt: string;
  updatedAt: string;
}

/** Contract-defined batch. Never invented by date, clustering, or AI grouping (contract §3). */
export interface Batch {
  id: BatchId;
  workspaceId: WorkspaceId;
  brandId: BrandId;
  name: string;
  contractedVideoCount: number | null;
  analysisConfigId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Content row. Canonical identity = platform + external ID (+ permalink).
 * NO distribution field — Organic/Paid lives on MetricSnapshot (contract §4/§10.3).
 * duration/width/height are ffprobe OBSERVED facts, nullable until processing.
 */
export interface Content {
  id: ContentId;
  workspaceId: WorkspaceId;
  brandId: BrandId;
  batchId: BatchId;
  pillarId: PillarId | null;
  platform: Platform;
  externalId: string;
  permalink: string;
  title: string | null;
  /** Overall pipeline state; per-stage detail lives in ContentProcessing. */
  processingState: ProcessingState;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentSource {
  id: ContentSourceId;
  workspaceId: WorkspaceId;
  contentId: ContentId;
  provider: string;
  sourceUrl: string | null;
  externalId: string | null;
  isCanonical: boolean;
  createdAt: string;
}

/**
 * Acquisition attempt history. Provider raw payload stays here (acquisition layer),
 * never becomes the domain model (contract §10.1 / plan S2).
 */
export interface AcquisitionRun {
  id: AcquisitionRunId;
  workspaceId: WorkspaceId;
  contentSourceId: ContentSourceId;
  contentId: ContentId;
  provider: string;
  attemptNumber: number;
  status: AcquisitionStatus;
  errorMessage: string | null;
  latencyMs: number | null;
  costEstimate: number | null;
  rawPayload: ProviderRawPayload;
  /** Transient media path; MP4 deleted after derivatives exist (contract §18). */
  mediaPath: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row per pipeline stage, retryable independently (plan S3). */
export interface ContentProcessing {
  id: ContentProcessingId;
  workspaceId: WorkspaceId;
  contentId: ContentId;
  stage: ProcessingStage;
  state: ProcessingState;
  errorMessage: string | null;
  output: ProcessingOutput;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Performance observation. Distribution (Organic/Paid) and metric quality live HERE.
 * raw_metrics = observed provider counts only; derived_metrics = deterministic + versioned.
 * Never silently share a baseline across Organic and Paid (contract §10.3).
 */
export interface MetricSnapshot {
  id: MetricSnapshotId;
  workspaceId: WorkspaceId;
  contentId: ContentId;
  distribution: DistributionContext;
  capturedAt: string | null;
  contentAgeHours: number | null;
  source: string | null;
  quality: MetricQuality;
  qualityByMetric: MetricQualityMap;
  rawMetrics: RawMetrics;
  derivedMetrics: DerivedMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface Transcript {
  id: TranscriptId;
  workspaceId: WorkspaceId;
  contentId: ContentId;
  contentProcessingId: ContentProcessingId | null;
  engine: string;
  model: string | null;
  language: string | null;
  durationMs: number | null;
  /** Approximate/garbled transcript warning (D2 adaptation). */
  qualityNote: string | null;
  createdAt: string;
}

export interface TranscriptSegment {
  id: TranscriptSegmentId;
  workspaceId: WorkspaceId;
  transcriptId: TranscriptId;
  seq: number;
  startMs: number;
  endMs: number;
  text: string;
  role: TranscriptRole | null;
}

export interface VideoFrame {
  id: VideoFrameId;
  workspaceId: WorkspaceId;
  contentId: ContentId;
  contentProcessingId: ContentProcessingId | null;
  frameType: FrameType;
  timestampMs: number;
  storagePath: string;
  width: number | null;
  height: number | null;
  samplingPolicyVersion: string | null;
  createdAt: string;
}

/**
 * Multimodal extraction run. raw_output = AI original (contract §11.3);
 * model/prompt/schema/input hash versions recorded (plan S4).
 */
export interface ExtractionRun {
  id: ExtractionRunId;
  workspaceId: WorkspaceId;
  contentId: ContentId;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
  rawOutput: ExtractionRawOutput;
  status: ExtractionRunStatus;
  errorMessage: string | null;
  costEstimate: number | null;
  createdAt: string;
}

/**
 * One fingerprint field per extraction run.
 * aiValue is the AI original and is immutable (DB trigger enforces);
 * reviewedValue becomes canonical only after human review (contract §11.1–§11.3).
 */
export interface ContentFeature {
  id: ContentFeatureId;
  workspaceId: WorkspaceId;
  contentId: ContentId;
  extractionRunId: ExtractionRunId;
  fieldName: FingerprintField;
  aiValue: string;
  reviewedValue: string | null;
  reviewState: FeatureReviewState;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureReview {
  id: FeatureReviewId;
  workspaceId: WorkspaceId;
  contentFeatureId: ContentFeatureId;
  extractionRunId: ExtractionRunId;
  decision: FeatureReviewDecision;
  reviewer: string;
  note: string | null;
  createdAt: string;
}

/**
 * Append-only human correction record (DB trigger blocks UPDATE/DELETE).
 * original_ai_value is copied at correction time; AI output is never overwritten.
 */
export interface FeatureCorrection {
  id: FeatureCorrectionId;
  workspaceId: WorkspaceId;
  contentFeatureId: ContentFeatureId;
  extractionRunId: ExtractionRunId;
  originalAiValue: string;
  correctedValue: string;
  reasonCode: ReviewReason;
  note: string | null;
  reviewer: string;
  createdAt: string;
}

/**
 * Controlled comparison record. distribution is explicit — Organic and Paid
 * never silently compared as equivalent. snapshot IDs used are frozen in
 * ComparisonSnapshot (contract §10.7 / §12). label + labelBasis state the
 * objective-aware label and its comparison basis (contract §8).
 */
export interface Comparison {
  id: ComparisonId;
  workspaceId: WorkspaceId;
  batchId: BatchId;
  mode: ComparisonMode;
  scope: ComparisonScope;
  distribution: DistributionContext;
  quality: ComparisonQuality;
  ruleVersion: string;
  controlledVariables: ComparisonVariables;
  uncontrolledVariables: ComparisonVariables;
  label: string | null;
  labelBasis: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ComparisonItem {
  id: ComparisonItemId;
  workspaceId: WorkspaceId;
  comparisonId: ComparisonId;
  contentId: ContentId;
  position: number;
  createdAt: string;
}

/** Freezes the exact metric_snapshot IDs actually used in the comparison (contract §10.7). */
export interface ComparisonSnapshot {
  id: ComparisonSnapshotId;
  workspaceId: WorkspaceId;
  comparisonId: ComparisonId;
  contentId: ContentId;
  metricSnapshotId: MetricSnapshotId;
  createdAt: string;
}

/**
 * Analytical claim with explicit evidence layer. Provenance lives in EvidenceSource;
 * layers must never be silently collapsed (contract §9).
 */
export interface Evidence {
  id: EvidenceId;
  workspaceId: WorkspaceId;
  layer: EvidenceLayer;
  statement: string;
  createdBy: string | null;
  createdAt: string;
}

/** Points back to exactly one immutable source observation per row (contract §10.8). */
export interface EvidenceSource {
  id: EvidenceSourceId;
  workspaceId: WorkspaceId;
  evidenceId: EvidenceId;
  sourceType: EvidenceSourceType;
  metricSnapshotId: MetricSnapshotId | null;
  transcriptSegmentId: TranscriptSegmentId | null;
  videoFrameId: VideoFrameId | null;
  contentFeatureId: ContentFeatureId | null;
  createdAt: string;
}

/**
 * Hypothesis must cite evidence (DB deferred constraint enforces at commit).
 * Unreviewed EXTRACTED evidence caps confidence at LOW; deterministic caps win
 * over LLM output (contract §11.4 / §13).
 */
export interface Hypothesis {
  id: HypothesisId;
  workspaceId: WorkspaceId;
  batchId: BatchId;
  statement: string;
  state: HypothesisState;
  confidence: ConfidenceLabel;
  confidenceCaps: readonly ConfidenceCap[];
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  schemaVersion: string | null;
  inputHash: string | null;
  rawOutput: Record<string, unknown>;
  suggestedNextTest: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One hypothesis may connect to many comparisons across batches (contract §15). */
export interface HypothesisComparison {
  id: HypothesisComparisonId;
  workspaceId: WorkspaceId;
  hypothesisId: HypothesisId;
  comparisonId: ComparisonId;
  role: HypothesisLinkRole;
  createdAt: string;
}

export interface HypothesisEvidence {
  id: HypothesisEvidenceId;
  workspaceId: WorkspaceId;
  hypothesisId: HypothesisId;
  evidenceId: EvidenceId;
  role: HypothesisEvidenceRole;
  createdAt: string;
}

/**
 * Append-only hypothesis review history (DB trigger blocks UPDATE/DELETE).
 * reasonCode is required when decision = 'REJECT' (DB CHECK).
 */
export interface Review {
  id: ReviewId;
  workspaceId: WorkspaceId;
  hypothesisId: HypothesisId;
  decision: HypothesisReviewDecision;
  reasonCode: ReviewReason | null;
  note: string | null;
  reviewer: string;
  createdAt: string;
}

/** Structured Next Test — data, not only recommendation prose (contract §16). */
export interface NextTest {
  id: NextTestId;
  workspaceId: WorkspaceId;
  hypothesisId: HypothesisId;
  variableToTest: string;
  variantA: string;
  variantB: string;
  controls: string;
  targetBatchId: BatchId;
  status: NextTestStatus;
  resultComparisonId: ComparisonId | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * First-class human context. NOT automatically objective evidence (contract §11.6);
 * deliberately no FK from Evidence to AnalystNote.
 */
export interface AnalystNote {
  id: AnalystNoteId;
  workspaceId: WorkspaceId;
  targetType: NoteTargetType;
  body: string;
  batchId: BatchId | null;
  contentId: ContentId | null;
  comparisonId: ComparisonId | null;
  hypothesisId: HypothesisId | null;
  author: string;
  createdAt: string;
}

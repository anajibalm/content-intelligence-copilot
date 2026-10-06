import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AcquisitionAttempt, VideoAcquirer } from '../acquisition/types.ts';
import { normalizeTikTokUrl, runAcquisition } from '../acquisition/index.ts';
import type { ProcessingJob, ProcessingJobStore, ProcessingOutput, ProcessingTools } from '../processing/index.ts';
import { createFileJobStore, processAcquisitionPacket } from '../processing/index.ts';

export type RuntimeContentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface RuntimeContentRecord {
  id: string;
  sourceUrl: string;
  permalink: string;
  externalId: string;
  status: RuntimeContentStatus;
  attempts: AcquisitionAttempt[];
  processingJobId: string | null;
  processing: ProcessingJob | null;
  error: string | null;
  updatedAt: string;
}

export interface RuntimeServiceOptions {
  storePath: string;
  outputRoot: string;
  acquirer: VideoAcquirer;
  processingTools?: ProcessingTools;
}

export interface RuntimeService {
  processUrl(rawUrl: string): Promise<RuntimeContentRecord>;
  list(): RuntimeContentRecord[];
  get(id: string): RuntimeContentRecord | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRuntimeContentRecord(value: unknown): value is RuntimeContentRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.sourceUrl === 'string'
    && typeof value.permalink === 'string'
    && typeof value.externalId === 'string'
    && ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(String(value.status))
    && Array.isArray(value.attempts)
    && (value.processingJobId === null || typeof value.processingJobId === 'string')
    && (value.processing === null || isRecord(value.processing))
    && (value.error === null || typeof value.error === 'string')
    && typeof value.updatedAt === 'string';
}

function readRecords(filePath: string): Record<string, RuntimeContentRecord> {
  if (!existsSync(filePath)) return {};
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!isRecord(parsed)) throw new Error('runtime state must be an object');
  const records: Record<string, RuntimeContentRecord> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!isRuntimeContentRecord(value)) throw new Error(`invalid runtime record: ${id}`);
    records[id] = value;
  }
  return records;
}

function writeRecords(filePath: string, records: Record<string, RuntimeContentRecord>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, filePath);
}

function contentId(externalId: string): string {
  return `content_tiktok_${externalId}`;
}

function processingId(externalId: string, attemptNumber: number): string {
  return `processing_tiktok_${externalId}_${attemptNumber}`;
}

function cloneRecord(record: RuntimeContentRecord): RuntimeContentRecord {
  return JSON.parse(JSON.stringify(record)) as RuntimeContentRecord;
}

export function createRuntimeService(options: RuntimeServiceOptions): RuntimeService {
  const processingStore: ProcessingJobStore = createFileJobStore(options.storePath.replace(/\.json$/, '.processing.json'));
  let records = readRecords(options.storePath);

  const persist = () => writeRecords(options.storePath, records);
  const list = () => Object.values(records).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(cloneRecord);

  return {
    list,
    get(id) {
      const record = records[id];
      return record ? cloneRecord(record) : null;
    },
    async processUrl(rawUrl) {
      const identity = normalizeTikTokUrl(rawUrl);
      const id = contentId(identity.externalId);
      const previous = records[id];
      if (previous?.status === 'COMPLETED' && previous.processing) return cloneRecord(previous);
      const record: RuntimeContentRecord = previous ?? {
        id,
        sourceUrl: rawUrl,
        permalink: identity.permalink,
        externalId: identity.externalId,
        status: 'PENDING',
        attempts: [],
        processingJobId: null,
        processing: null,
        error: null,
        updatedAt: new Date().toISOString(),
      };
      record.status = 'PROCESSING';
      record.error = null;
      record.updatedAt = new Date().toISOString();
      records[id] = record;
      persist();

      const acquisition = await runAcquisition(options.acquirer, identity.permalink, { attemptHistory: { attempts: record.attempts } });
      record.attempts = [...record.attempts, acquisition.attempt];
      if (acquisition.error || !acquisition.packet) {
        record.status = 'FAILED';
        record.error = acquisition.error?.message ?? 'acquisition failed';
        record.updatedAt = new Date().toISOString();
        persist();
        throw new Error(record.error);
      }
      record.processingJobId = processingId(identity.externalId, acquisition.attempt.attemptNumber);
      record.updatedAt = new Date().toISOString();
      persist();

      try {
        const processing = await processAcquisitionPacket(
          acquisition.packet,
          { id: record.processingJobId, workspaceId: 'staging', outputRoot: options.outputRoot },
          { store: processingStore, tools: options.processingTools },
        );
        record.processing = processing;
        record.status = 'COMPLETED';
        record.error = null;
        record.updatedAt = new Date().toISOString();
        persist();
        return cloneRecord(record);
      } catch (error) {
        const processing = processingStore.read(record.processingJobId);
        record.processing = processing;
        record.status = 'FAILED';
        record.error = String((error as Error)?.message ?? error);
        record.updatedAt = new Date().toISOString();
        persist();
        throw Object.assign(new Error(record.error), { record: cloneRecord(record) });
      }
    },
  };
}

export function processingOutput(record: RuntimeContentRecord): ProcessingOutput | null {
  return record.processing?.output ?? null;
}

import { execFile as nodeExecFile } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AcquisitionPacket } from '../acquisition/types.ts';
import { cleanupTemporaryMedia } from '../acquisition/media.ts';

export type ProcessingState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface FfprobeFacts {
  format: { duration?: string; size?: string; [key: string]: unknown };
  streams: Array<{ codec_type?: string; width?: number; height?: number; [key: string]: unknown }>;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  role?: string;
}

export interface FrameArtifact {
  id?: string;
  timestampMs: number;
  storagePath: string;
  width?: number;
  height?: number;
  frameType?: 'HOOK' | 'REPRESENTATIVE' | 'SCENE';
}

export interface TranscriptOutput {
  engine: string;
  model?: string;
  language?: string;
  segments: TranscriptSegment[];
}

export interface ProcessingOutput {
  observed: { ffprobe: FfprobeFacts };
  audio: { storagePath: string; format: 'wav' };
  transcript: TranscriptOutput;
  hookFrames: FrameArtifact[];
  representativeFrames: FrameArtifact[];
  perSecondFrames: FrameArtifact[];
  productEntryAnchors: Array<{ timestampMs: number; sourcePath: string; anchorType: string }>;
}

export interface ProcessingJob {
  id: string;
  workspaceId: string;
  contentId: string;
  sourceUrl: string;
  mediaPath: string;
  outputRoot: string;
  state: ProcessingState;
  error: string | null;
  output: ProcessingOutput | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProcessingTools {
  probe(mediaPath: string): Promise<FfprobeFacts>;
  extractAudio(mediaPath: string, outputPath: string): Promise<void>;
  extractFrames(mediaPath: string, outputDir: string, timestampsMs: readonly number[]): Promise<FrameArtifact[]>;
  extractPerSecondFrames(mediaPath: string, outputDir: string, durationMs: number): Promise<FrameArtifact[]>;
  transcribe(audioPath: string): Promise<TranscriptOutput>;
}

export interface ProcessingJobStore {
  readonly path: string;
  read(id: string): ProcessingJob | null;
  list(): ProcessingJob[];
  write(job: ProcessingJob): void;
}

function assertOrderedSegments(segments: readonly TranscriptSegment[]): void {
  let previousEnd = 0;
  for (const [index, segment] of segments.entries()) {
    if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.startMs < 0 || segment.endMs <= segment.startMs) {
      throw new Error(`invalid transcript segment at index ${index}`);
    }
    if (segment.startMs < previousEnd) throw new Error(`overlapping transcript segment at index ${index}`);
    previousEnd = segment.endMs;
  }
}

function durationMs(probe: FfprobeFacts): number {
  const value = Number(probe.format.duration);
  if (!Number.isFinite(value) || value <= 0) throw new Error('ffprobe returned no positive duration');
  return Math.round(value * 1000);
}

function markType(frames: FrameArtifact[], frameType: FrameArtifact['frameType']): FrameArtifact[] {
  return frames.map((frame) => ({ ...frame, frameType }));
}

function parseStoredJobs(raw: string): Record<string, ProcessingJob> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('processing state must be an object');
  return parsed as Record<string, ProcessingJob>;
}

export function createProcessingJob(input: Omit<ProcessingJob, 'state' | 'error' | 'output' | 'startedAt' | 'completedAt'>): ProcessingJob {
  return { ...input, state: 'PENDING', error: null, output: null, startedAt: null, completedAt: null };
}

export function createFileJobStore(filePath: string): ProcessingJobStore {
  let cache: Record<string, ProcessingJob> = {};
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      cache = parseStoredJobs(readFileSync(filePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  return {
    path: filePath,
    read(id) {
      load();
      return cache[id] ?? null;
    },
    list() {
      load();
      return Object.values(cache).sort((left, right) => left.id.localeCompare(right.id));
    },
    write(job) {
      load();
      cache[job.id] = job;
      mkdirSync(dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporaryPath, filePath);
    },
  };

}
function execFile(file: string, args: readonly string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ stdout: string; stderr: string }>();
  nodeExecFile(file, [...args], { encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      const detail = String(stderr || error.message).trim().slice(-2000);
      reject(new Error(`${file} failed: ${detail}`));
      return;
    }
    resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
  });
  return promise;
}

function parseTranscript(raw: string): TranscriptOutput {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('segments' in parsed) || !Array.isArray(parsed.segments)) {
    throw new Error('transcriber output must contain segments array');
  }
  const transcript = parsed as TranscriptOutput;
  assertOrderedSegments(transcript.segments);
  return transcript;
}

async function readImageDimensions(imagePath: string): Promise<{ width?: number; height?: number }> {
  const result = await execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', imagePath], 30_000);
  const parsed: unknown = JSON.parse(result.stdout);
  if (!parsed || typeof parsed !== 'object' || !('streams' in parsed) || !Array.isArray(parsed.streams)) return {};
  const stream = parsed.streams[0];
  if (!stream || typeof stream !== 'object') return {};
  const width = 'width' in stream && typeof stream.width === 'number' ? stream.width : undefined;
  const height = 'height' in stream && typeof stream.height === 'number' ? stream.height : undefined;
  return { width, height };
}

async function defaultTools(): Promise<ProcessingTools> {
  return {
    async probe(mediaPath) {
      const result = await execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,width,height', '-of', 'json', mediaPath], 30_000);
      const parsed: unknown = JSON.parse(result.stdout);
      if (!parsed || typeof parsed !== 'object' || !('format' in parsed) || !('streams' in parsed) || !parsed.format || !Array.isArray(parsed.streams)) {
        throw new Error('ffprobe returned invalid JSON');
      }
      return parsed as FfprobeFacts;
    },
    async extractAudio(mediaPath, outputPath) {
      await execFile('ffmpeg', ['-y', '-v', 'error', '-i', mediaPath, '-vn', '-ac', '1', '-ar', '16000', outputPath], 120_000);
    },
    async extractFrames(mediaPath, outputDir, timestampsMs) {
      await mkdir(outputDir, { recursive: true });
      const frames: FrameArtifact[] = [];
      for (const timestampMs of timestampsMs) {
        const outputPath = join(outputDir, `frame-${timestampMs}.jpg`);
        await execFile('ffmpeg', ['-y', '-v', 'error', '-ss', String(timestampMs / 1000), '-i', mediaPath, '-frames:v', '1', '-q:v', '2', outputPath], 60_000);
        frames.push({ timestampMs, storagePath: outputPath, ...(await readImageDimensions(outputPath)) });
      }
      return frames;
    },
    async extractPerSecondFrames(mediaPath, outputDir, durationMsValue) {
      await mkdir(outputDir, { recursive: true });
      const outputPattern = join(outputDir, 'frame-%06d.jpg');
      await execFile('ffmpeg', ['-y', '-v', 'error', '-i', mediaPath, '-vf', 'fps=1', '-q:v', '3', outputPattern], 120_000);
      const names = readdirSync(outputDir).filter((name) => name.startsWith('frame-') && name.endsWith('.jpg')).sort();
      return Promise.all(names.map(async (name, index) => ({
        timestampMs: Math.min(index * 1000, Math.max(0, durationMsValue - 1)),
        storagePath: join(outputDir, name),
        ...(await readImageDimensions(join(outputDir, name))),
      })));
    },
    async transcribe(audioPath) {
      const script = process.env.CIC_TRANSCRIBER_SCRIPT;
      if (!script) throw new Error('CIC_TRANSCRIBER_SCRIPT is required for transcript processing');
      const result = await execFile(script, [audioPath], 300_000);
      return parseTranscript(result.stdout);
    },
  };
}

export async function runProcessingJob(input: ProcessingJob, options: { store: ProcessingJobStore; tools?: ProcessingTools }): Promise<ProcessingJob> {
  const existing = options.store.read(input.id);
  if (existing?.state === 'COMPLETED' && existing.output) return existing;
  const job = existing?.state === 'COMPLETED' ? existing : input;
  const tools = options.tools ?? await defaultTools();
  const running: ProcessingJob = { ...job, state: 'RUNNING', error: null, startedAt: new Date().toISOString(), completedAt: null };
  options.store.write(running);
  try {
    const probe = await tools.probe(job.mediaPath);
    const totalDurationMs = durationMs(probe);
    const outputDir = join(job.outputRoot, job.id);
    const audioPath = join(outputDir, 'audio.wav');
    const hookPoints = [0, 1500, 3000].filter((timestamp) => timestamp < totalDurationMs);
    const representativePoints = [...new Set([Math.round(totalDurationMs * 0.25), Math.round(totalDurationMs * 0.5), Math.round(totalDurationMs * 0.75), Math.max(0, totalDurationMs - 200)])]
      .filter((timestamp) => timestamp < totalDurationMs && !hookPoints.includes(timestamp));
    await mkdir(outputDir, { recursive: true });
    await tools.extractAudio(job.mediaPath, audioPath);
    const hookFrames = markType(await tools.extractFrames(job.mediaPath, join(outputDir, 'hook'), hookPoints), 'HOOK');
    const representativeFrames = markType(await tools.extractFrames(job.mediaPath, join(outputDir, 'representative'), representativePoints), 'REPRESENTATIVE');
    const perSecondFrames = markType(await tools.extractPerSecondFrames(job.mediaPath, join(outputDir, 'per-second'), totalDurationMs), 'SCENE');
    const transcript = await tools.transcribe(audioPath);
    const output: ProcessingOutput = {
      observed: { ffprobe: probe },
      audio: { storagePath: audioPath, format: 'wav' },
      transcript,
      hookFrames,
      representativeFrames,
      perSecondFrames,
      productEntryAnchors: [],
    };
    const completed: ProcessingJob = { ...running, state: 'COMPLETED', output, completedAt: new Date().toISOString() };
    options.store.write(completed);
    return completed;
  } catch (error) {
    const failed: ProcessingJob = { ...running, state: 'FAILED', error: String((error as Error)?.message ?? error), completedAt: new Date().toISOString() };
    options.store.write(failed);
    throw Object.assign(new Error(failed.error ?? 'processing failed'), { job: failed });
  } finally {
    await cleanupTemporaryMedia([{ path: job.mediaPath, temporary: true }]);
  }
}

export async function processAcquisitionPacket(packet: AcquisitionPacket, input: { id: string; workspaceId: string; outputRoot: string }, options: { store: ProcessingJobStore; tools?: ProcessingTools }): Promise<ProcessingJob> {
  const existing = options.store.read(input.id);
  if (existing?.state === 'COMPLETED' && existing.output) {
    await cleanupTemporaryMedia([packet.media]);
    return existing;
  }
  const job = createProcessingJob({
    id: input.id,
    workspaceId: input.workspaceId,
    contentId: `content_tiktok_${packet.identity.externalId}`,
    sourceUrl: packet.identity.permalink,
    mediaPath: packet.media.path,
    outputRoot: input.outputRoot,
  });
  return runProcessingJob(job, options);
}

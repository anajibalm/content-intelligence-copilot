// yt-dlp provider adapter (spike route 1: zero-API-cost first).
// execFile is injectable so tests run without the binary or network.
import { execFile as nodeExecFile } from 'node:child_process';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderRawPayload } from '../domain/types.ts';
import type { AcquireInput, AcquireOutcome, VideoAcquirer } from './types.ts';
import { AcquisitionError, classifyProviderFailure } from './types.ts';

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export type ExecFileRunner = (
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<ExecFileResult>;

const MEDIA_EXTENSIONS: Record<string, true> = { '.mp4': true, '.webm': true, '.mkv': true, '.mov': true };

export interface YtDlpAcquirerOptions {
  ytDlpPath?: string;
  tempDirBase?: string;
  timeoutMs?: number;
  maxBuffer?: number;
  execFile?: ExecFileRunner;
}

function defaultRunner(
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
): Promise<ExecFileResult> {
  const { promise, resolve, reject } = Promise.withResolvers<ExecFileResult>();
  nodeExecFile(
    file,
    [...args],
    { encoding: 'utf8', timeout: options.timeout, maxBuffer: options.maxBuffer },
    (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    },
  );
  return promise;
}

export function createYtDlpAcquirer(options: YtDlpAcquirerOptions = {}): VideoAcquirer {
  const ytDlpPath = options.ytDlpPath ?? 'yt-dlp';
  const tempDirBase = options.tempDirBase ?? tmpdir();
  const timeoutMs = options.timeoutMs ?? 180_000;
  const maxBuffer = options.maxBuffer ?? 32 * 1024 * 1024;
  const execFile = options.execFile ?? defaultRunner;

  return {
    provider: 'yt-dlp',
    async acquire(input: AcquireInput): Promise<AcquireOutcome> {
      const dir = await mkdtemp(join(tempDirBase, 'cic-ytdlp-'));
      const template = join(dir, '%(id)s.%(ext)s');
      let stdout: string;
      try {
        const result = await execFile(
          ytDlpPath,
          ['--no-playlist', '--no-warnings', '--print-json', '-o', template, input.url],
          { timeout: timeoutMs, maxBuffer },
        );
        stdout = result.stdout;
      } catch (error) {
        const err = error as NodeJS.ErrnoException & { stderr?: string };
        const detail = (
          typeof err.stderr === 'string' && err.stderr.trim() !== '' ? err.stderr.trim() : err.message
        ).slice(-1000);
        throw classifyProviderFailure('yt-dlp', detail, { code: err.code });
      }

      let info: ProviderRawPayload;
      try {
        const lines = stdout.trim().split('\n');
        // yt-dlp --print-json output is unvalidated external data; stored verbatim by contract §10.1.
        info = JSON.parse(lines[lines.length - 1]) as ProviderRawPayload;
      } catch {
        throw new AcquisitionError('PROVIDER_ERROR', 'yt-dlp: could not parse --print-json output', 'yt-dlp');
      }

      // yt-dlp may choose mp4/webm/mkv/mov — locate the newest media file it wrote.
      let newest: { path: string; bytes: number; mtimeMs: number } | null = null;
      for (const name of await readdir(dir)) {
        const dot = name.lastIndexOf('.');
        if (dot < 0 || !MEDIA_EXTENSIONS[name.slice(dot).toLowerCase()]) continue;
        const full = join(dir, name);
        const stats = await stat(full);
        if (!stats.isFile()) continue;
        if (newest === null || stats.mtimeMs > newest.mtimeMs) {
          newest = { path: full, bytes: stats.size, mtimeMs: stats.mtimeMs };
        }
      }
      if (newest === null) {
        throw new AcquisitionError('MEDIA_NOT_FOUND', 'yt-dlp succeeded but no media file was produced', 'yt-dlp');
      }

      return {
        packet: {
          provider: 'yt-dlp',
          identity: input.identity,
          media: { path: newest.path, bytes: newest.bytes, temporary: true },
          acquiredAt: new Date().toISOString(),
        },
        rawPayload: info,
      };
    },
  };
}

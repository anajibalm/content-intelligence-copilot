// Fixture/fake VideoAcquirer for tests and offline demos. No network.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderRawPayload } from '../domain/types.ts';
import type {
  AcquireInput,
  AcquireOutcome,
  AcquisitionFailureReason,
  VideoAcquirer,
} from './types.ts';
import { AcquisitionError } from './types.ts';

export interface FakeFailureSpec {
  reason: AcquisitionFailureReason;
  message: string;
}

export interface FakeScriptStep {
  failure?: FakeFailureSpec;
  bytes?: number;
  rawPayload?: ProviderRawPayload;
}

export interface FakeAcquirerOptions {
  provider?: string;
  /** Per-call steps; last step repeats. Default: always succeed. */
  script?: readonly FakeScriptStep[];
  bytes?: number;
  rawPayload?: ProviderRawPayload;
  tempDirBase?: string;
}

export interface FakeAcquirer extends VideoAcquirer {
  /** Every acquire input, for assertions (calls made, gating). */
  readonly calls: readonly AcquireInput[];
}

export function createFakeAcquirer(options: FakeAcquirerOptions = {}): FakeAcquirer {
  const provider = options.provider ?? 'fake';
  const script = options.script ?? [];
  const defaultBytes = options.bytes ?? 1024;
  const defaultRaw = options.rawPayload ?? {};
  const tempDirBase = options.tempDirBase ?? tmpdir();
  const calls: AcquireInput[] = [];

  return {
    provider,
    calls,
    async acquire(input: AcquireInput): Promise<AcquireOutcome> {
      calls.push(input);
      const step = script.length > 0 ? script[Math.min(calls.length - 1, script.length - 1)] : undefined;
      if (step?.failure) {
        throw new AcquisitionError(step.failure.reason, step.failure.message, provider);
      }
      const bytes = step?.bytes ?? defaultBytes;
      const rawPayload = { ...defaultRaw, ...(step?.rawPayload ?? {}) };
      const dir = await mkdtemp(join(tempDirBase, 'cic-fake-'));
      const mediaPath = join(dir, `${input.identity.externalId}.mp4`);
      await writeFile(mediaPath, Buffer.alloc(bytes));
      return {
        packet: {
          provider,
          identity: input.identity,
          media: { path: mediaPath, bytes, temporary: true },
          acquiredAt: new Date().toISOString(),
        },
        rawPayload,
      };
    },
  };
}

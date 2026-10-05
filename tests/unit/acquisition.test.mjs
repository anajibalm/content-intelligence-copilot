// Unit tests for the S2 acquisition library (lib/acquisition).
// Node built-in test runner only. Fakes/fixtures — no network, no yt-dlp binary.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ACQUISITION_FAILURE_REASONS,
  AcquisitionError,
  canonicalContentId,
  canonicalIdentityKey,
  cleanupTemporaryMedia,
  createApifyAcquirer,
  createDefaultAcquirer,
  createFailoverAcquirer,
  createFakeAcquirer,
  createLedger,
  createTikHubAcquirer,
  createYtDlpAcquirer,
  emptyHistory,
  isRetryableFailure,
  latestAttempt,
  nextAttemptNumber,
  normalizeTikTokUrl,
  recordAttempt,
  resolveIngestion,
  runAcquisition,
} from '../../lib/acquisition/index.ts';

const CANONICAL_URL = 'https://www.tiktok.com/@barakat.id/video/7420000000000000001';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cic-acq-'));
}

function assertInvalidUrl(fn) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof AcquisitionError, `expected AcquisitionError, got ${err}`);
    assert.equal(err.reasonCode, 'INVALID_URL');
    return true;
  });
}

// --- URL validation + normalization ----------------------------------------

test('valid public TikTok URL variants normalize to one canonical identity', () => {
  const variants = [
    CANONICAL_URL,
    `${CANONICAL_URL}?is_from_webapp=1&sender_device=pc`,
    `${CANONICAL_URL}#comments`,
    'https://tiktok.com/@barakat.id/video/7420000000000000001',
    'https://m.tiktok.com/@barakat.id/video/7420000000000000001',
    'https://www.tiktok.com/@Barakat.ID/video/7420000000000000001/',
  ];
  const expected = {
    platform: 'TIKTOK',
    externalId: '7420000000000000001',
    permalink: CANONICAL_URL,
  };
  let key = null;
  for (const variant of variants) {
    const identity = normalizeTikTokUrl(variant);
    assert.deepEqual(identity, expected);
    assert.match(identity.externalId, /^\d+$/, 'external ID must be numeric');
    const variantKey = canonicalIdentityKey(identity);
    if (key === null) key = variantKey;
    else assert.equal(variantKey, key, `variant must share canonical key: ${variant}`);
  }
});

test('invalid and private-ish URLs are rejected with INVALID_URL', () => {
  const rejected = [
    '',
    '   ',
    'not a url',
    'https://www.tiktok.com/@u/video/12ab', // non-numeric ID
    'http://www.tiktok.com/@u/video/123456', // non-https
    'ftp://www.tiktok.com/@u/video/123456',
    'https://evil.com/@u/video/123456', // wrong host
    'https://www.tiktok.com.evil.com/@u/video/123456', // spoofed host
    'https://vm.tiktok.com/ZMabcdef/', // short link, unresolvable offline
    'https://www.tiktok.com/t/ZMabcdef/', // short link form
    'https://www.tiktok.com/@barakat.id/photo/7420000000000000001', // not a video
    'https://www.tiktok.com/@barakat.id', // profile page
    'https://www.tiktok.com/embed/@u/video/123456', // embed route
    'https://www.tiktok.com/@u/video/123456/live', // non-canonical trailing segment
    'https://www.tiktok.com/live/@u/video/123456',
  ];
  for (const url of rejected) {
    assertInvalidUrl(() => normalizeTikTokUrl(url));
  }
});

// --- Repeat ingestion semantics (pure ledger) ------------------------------

test('repeat ingestion resolves to the same canonical content identity', () => {
  const id1 = normalizeTikTokUrl(`${CANONICAL_URL}?utm_source=share`);
  const id2 = normalizeTikTokUrl(CANONICAL_URL);
  assert.equal(canonicalIdentityKey(id1), canonicalIdentityKey(id2));

  const first = resolveIngestion(createLedger(), id1);
  assert.equal(first.resolution.createdContent, true);
  assert.equal(first.resolution.isRepeat, false);
  assert.equal(first.resolution.contentId, canonicalContentId(id1));

  const second = resolveIngestion(first.ledger, id2);
  assert.equal(second.resolution.isRepeat, true);
  assert.equal(second.resolution.createdContent, false);
  assert.equal(second.resolution.contentId, first.resolution.contentId);
  assert.equal(Object.keys(second.ledger.byKey).length, 1, 'repeat must not duplicate ledger entry');

  // Deterministic across independent ledgers: no DB state required.
  const again = resolveIngestion(createLedger(), id2);
  assert.equal(again.resolution.contentId, first.resolution.contentId);
});

// --- Successful fake acquisition + payload isolation -----------------------

test('fake provider success yields canonical packet; raw payload stays in attempt', async () => {
  const rawPayload = {
    __raw_marker__: 'RAW-SECRET-MARKER',
    itemInfo: { itemStruct: { title: 'provider title' } },
  };
  const fake = createFakeAcquirer({ provider: 'fake', rawPayload, bytes: 2048 });
  const history = emptyHistory();

  const result = await runAcquisition(fake, CANONICAL_URL, {
    attemptHistory: history,
    now: () => Date.parse('2026-10-05T00:00:00.000Z'),
  });

  assert.equal(result.error, null);
  assert.equal(result.packet !== null, true);
  assert.deepEqual(result.identity, normalizeTikTokUrl(CANONICAL_URL));

  const attempt = result.attempt;
  assert.equal(attempt.status, 'SUCCEEDED');
  assert.equal(attempt.attemptNumber, 1);
  assert.equal(attempt.provider, 'fake');
  assert.equal(attempt.failureReason, null);
  assert.equal(typeof attempt.latencyMs, 'number');
  assert.deepEqual(attempt.rawPayload, rawPayload, 'raw payload recorded on attempt');
  assert.equal(attempt.mediaPath, result.packet.media.path);
  assert.equal(attempt.mediaBytes, 2048);

  const packet = result.packet;
  assert.equal(packet.provider, 'fake');
  assert.deepEqual(packet.identity, normalizeTikTokUrl(CANONICAL_URL));
  assert.equal(packet.media.temporary, true, 'media must be marked temporary');
  assert.equal(packet.media.bytes, 2048);
  assert.equal(typeof packet.acquiredAt, 'string');
  assert.ok(fs.existsSync(packet.media.path), 'media file must exist on disk');

  // Payload isolation: no provider raw data reachable from the packet.
  const packetJson = JSON.stringify(packet);
  assert.ok(!packetJson.includes('RAW-SECRET-MARKER'));
  assert.ok(!packetJson.includes('itemInfo'));
  assert.ok(!packetJson.includes('provider title'));

  const cleanup = await cleanupTemporaryMedia([packet.media]);
  assert.deepEqual(cleanup.deleted, [packet.media.path]);
  assert.equal(fs.existsSync(packet.media.path), false);
});

test('invalid URL fails before any provider call and records a failed attempt', async () => {
  const fake = createFakeAcquirer({});
  const result = await runAcquisition(fake, 'https://vm.tiktok.com/ZMabcdef/', {
    attemptHistory: emptyHistory(),
  });
  assert.equal(result.packet, null);
  assert.equal(result.identity, null);
  assert.ok(result.error instanceof AcquisitionError);
  assert.equal(result.error.reasonCode, 'INVALID_URL');
  assert.equal(result.attempt.status, 'FAILED');
  assert.equal(result.attempt.failureReason, 'INVALID_URL');
  assert.equal(fake.calls.length, 0, 'provider must not be invoked for invalid URLs');
});

// --- Provider failure + retry attempt history ------------------------------

test('provider failures record reason-aware retry attempts until success', async () => {
  const fake = createFakeAcquirer({
    provider: 'fake',
    script: [
      { failure: { reason: 'RATE_LIMITED', message: 'HTTP 429 too many requests' } },
      { failure: { reason: 'PROVIDER_ERROR', message: 'yt-dlp exploded' } },
      { bytes: 1024 },
    ],
  });

  let history = emptyHistory();
  const results = [];
  for (let i = 0; i < 3; i++) {
    const result = await runAcquisition(fake, CANONICAL_URL, { attemptHistory: history });
    history = recordAttempt(history, result.attempt);
    results.push(result);
  }

  assert.equal(nextAttemptNumber(history), 4);
  assert.equal(latestAttempt(history).attemptNumber, 3);

  const attempts = history.attempts;
  assert.equal(attempts.length, 3);
  assert.deepEqual(attempts.map((a) => a.attemptNumber), [1, 2, 3]);
  assert.deepEqual(attempts.map((a) => a.status), ['FAILED', 'FAILED', 'SUCCEEDED']);
  assert.equal(attempts[0].failureReason, 'RATE_LIMITED');
  assert.equal(attempts[1].failureReason, 'PROVIDER_ERROR');
  assert.equal(attempts[2].failureReason, null);
  for (const attempt of attempts) {
    assert.equal(typeof attempt.latencyMs, 'number');
    assert.equal(typeof attempt.errorMessage === 'string' || attempt.errorMessage === null, true);
  }

  assert.ok(results[0].error instanceof AcquisitionError);
  assert.equal(results[0].error.reasonCode, 'RATE_LIMITED');
  assert.equal(results[0].error.retryable, true);
  assert.ok(results[1].error instanceof AcquisitionError);
  assert.equal(results[1].error.reasonCode, 'PROVIDER_ERROR');
  assert.equal(results[2].error, null);
  assert.equal(results[2].packet.provider, 'fake');

  assert.equal(isRetryableFailure('RATE_LIMITED'), true);
  assert.equal(isRetryableFailure('NOT_FOUND'), false);
  assert.equal(isRetryableFailure('PRIVATE_OR_REMOVED'), false);
  for (const reason of ACQUISITION_FAILURE_REASONS) {
    assert.equal(typeof isRetryableFailure(reason), 'boolean');
  }

  // Cleanup all temp media created by the successful attempt.
  await cleanupTemporaryMedia([results[2].packet.media]);
});

// --- Temp media cleanup safety ---------------------------------------------

test('cleanup deletes only paths explicitly marked temporary', async () => {
  const dir = tmpDir();
  const marked = path.join(dir, 'marked.mp4');
  const unmarked = path.join(dir, 'keep.mp4');
  const unflagged = path.join(dir, 'unflagged.mp4');
  const missing = path.join(dir, 'never-existed.mp4');
  fs.writeFileSync(marked, 'x');
  fs.writeFileSync(unmarked, 'x');
  fs.writeFileSync(unflagged, 'x');

  const result = await cleanupTemporaryMedia([
    { path: marked, bytes: 1, temporary: true },
    { path: unmarked, bytes: 1, temporary: false },
    { path: unflagged, bytes: 1 }, // no temporary flag at all
    { path: missing, bytes: 0, temporary: true }, // already gone
  ]);

  assert.deepEqual(result.deleted, [marked]);
  assert.ok(result.skipped.includes(unmarked));
  assert.ok(result.skipped.includes(unflagged));
  assert.ok(result.skipped.includes(missing));
  assert.equal(fs.existsSync(marked), false);
  assert.equal(fs.existsSync(unmarked), true, 'unmarked path must never be deleted');
  assert.equal(fs.existsSync(unflagged), true, 'unflagged path must never be deleted');
});

// --- yt-dlp adapter (injected runner — no real binary) ---------------------

test('yt-dlp adapter normalizes output into a packet and isolates raw payload', async () => {
  const dir = tmpDir();
  const execFile = async (file, args) => {
    assert.equal(file, 'yt-dlp');
    assert.ok(args.includes('--no-playlist'));
    assert.ok(args.includes('--print-json'));
    const template = args[args.indexOf('-o') + 1];
    const mediaPath = template.replace('%(id)s', '7420000000000000001').replace('%(ext)s', 'mp4');
    fs.writeFileSync(mediaPath, 'fake-video-bytes');
    return {
      stdout: `${JSON.stringify({ id: '7420000000000000001', title: 't', rawMarker: 'YT-RAW' })}\n`,
      stderr: '',
    };
  };
  const acquirer = createYtDlpAcquirer({ execFile, tempDirBase: dir });
  const identity = normalizeTikTokUrl(CANONICAL_URL);

  const outcome = await acquirer.acquire({ url: identity.permalink, identity });
  assert.equal(outcome.packet.provider, 'yt-dlp');
  assert.deepEqual(outcome.packet.identity, identity);
  assert.equal(outcome.packet.media.temporary, true);
  assert.ok(fs.existsSync(outcome.packet.media.path));
  assert.equal(outcome.rawPayload.rawMarker, 'YT-RAW', 'raw payload lives beside packet');
  assert.ok(!JSON.stringify(outcome.packet).includes('YT-RAW'), 'packet must not carry raw payload');

  // Failure classification.
  const notFound = createYtDlpAcquirer({
    tempDirBase: dir,
    execFile: async () => {
      throw new Error('ERROR: Video not available');
    },
  });
  await assert.rejects(
    () => notFound.acquire({ url: identity.permalink, identity }),
    (err) => err instanceof AcquisitionError && err.reasonCode === 'NOT_FOUND',
  );

  const missingBinary = createYtDlpAcquirer({
    tempDirBase: dir,
    execFile: async () => {
      const err = new Error('spawn yt-dlp ENOENT');
      err.code = 'ENOENT';
      throw err;
    },
  });
  await assert.rejects(
    () => missingBinary.acquire({ url: identity.permalink, identity }),
    (err) => err instanceof AcquisitionError && err.reasonCode === 'YTDLP_NOT_INSTALLED',
  );

  const noMedia = createYtDlpAcquirer({
    tempDirBase: dir,
    execFile: async () => ({ stdout: '{"id":"1"}\n', stderr: '' }),
  });
  await assert.rejects(
    () => noMedia.acquire({ url: identity.permalink, identity }),
    (err) => err instanceof AcquisitionError && err.reasonCode === 'MEDIA_NOT_FOUND',
  );

  await cleanupTemporaryMedia([outcome.packet.media]);
});

// --- Credentialed providers: gating + secret hygiene -----------------------

test('credentialed providers are gated behind credentials', () => {
  const bare = createDefaultAcquirer({});
  assert.deepEqual(bare.providers.map((p) => p.provider), ['yt-dlp']);

  const full = createDefaultAcquirer({
    TIKHUB_API_KEY: 'tikhub-secret-value-123',
    APIFY_TOKEN: 'apify-secret-token-456',
  });
  assert.deepEqual(full.providers.map((p) => p.provider), ['yt-dlp', 'tikhub', 'apify']);
});

test('failover chain tries providers in order and stops at first success', async () => {
  const ytSpy = createFakeAcquirer({
    provider: 'yt-dlp',
    script: [{ failure: { reason: 'PROVIDER_ERROR', message: 'no binary' } }],
  });
  const tikhubSpy = createFakeAcquirer({ provider: 'tikhub' });
  const chain = createFailoverAcquirer([ytSpy, tikhubSpy]);
  const identity = normalizeTikTokUrl(CANONICAL_URL);

  const outcome = await chain.acquire({ url: identity.permalink, identity });
  assert.equal(outcome.packet.provider, 'tikhub');
  assert.equal(ytSpy.calls.length, 1);
  assert.equal(tikhubSpy.calls.length, 1);

  // Without the credentialed provider in the chain, no credential route runs.
  const ytOnly = createFailoverAcquirer([ytSpy]);
  await assert.rejects(() => ytOnly.acquire({ url: identity.permalink, identity }));
  assert.equal(tikhubSpy.calls.length, 1, 'credentialed provider absent from chain must not run');
});

test('TikHub adapter works via injected fetch and never logs secrets', async () => {
  const dir = tmpDir();
  const secret = 'tikhub-secret-value-123';
  const identity = normalizeTikTokUrl(CANONICAL_URL);
  const calls = [];

  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('fetch_post_detail')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { itemInfo: { itemStruct: { video: { playAddr: 'https://cdn.example/vid.mp4' } } } },
        }),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    if (String(url) === 'https://cdn.example/vid.mp4') {
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        arrayBuffer: async () => new TextEncoder().encode('video-bytes').buffer,
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const acquirer = createTikHubAcquirer({ apiKey: secret, fetchImpl, tempDirBase: dir });
  const outcome = await acquirer.acquire({ url: identity.permalink, identity });
  assert.equal(outcome.packet.provider, 'tikhub');
  assert.equal(outcome.packet.media.bytes, 11);
  assert.match(calls[0].init.headers.Authorization, /^Bearer /);
  await cleanupTemporaryMedia([outcome.packet.media]);

  // Rejected credentials: reason-aware error, no secret in message or serialized error.
  const unauthorized = createTikHubAcquirer({
    apiKey: secret,
    tempDirBase: dir,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), text: async () => 'Unauthorized' }),
  });
  await assert.rejects(
    () => unauthorized.acquire({ url: identity.permalink, identity }),
    (err) => {
      assert.ok(err instanceof AcquisitionError);
      assert.ok(!JSON.stringify({ message: err.message, reason: err.reasonCode }).includes(secret));
      return true;
    },
  );
});

test('Apify adapter resolves media rows via injected fetch without token leakage', async () => {
  const dir = tmpDir();
  const secret = 'apify-secret-token-456';
  const identity = normalizeTikTokUrl(CANONICAL_URL);

  const fetchImpl = async (url, init) => {
    if (String(url).includes('run-sync-get-dataset-items')) {
      assert.ok(String(url).includes(`token=${encodeURIComponent(secret)}`));
      assert.equal(init.method, 'POST');
      return {
        ok: true,
        status: 200,
        json: async () => [{ success: true, videoId: identity.externalId, downloadUrl: 'https://cdn.example/apify.mp4' }],
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    if (String(url) === 'https://cdn.example/apify.mp4') {
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        arrayBuffer: async () => new TextEncoder().encode('apify-video').buffer,
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const acquirer = createApifyAcquirer({ token: secret, fetchImpl, tempDirBase: dir });
  const outcome = await acquirer.acquire({ url: identity.permalink, identity });
  assert.equal(outcome.packet.provider, 'apify');
  await cleanupTemporaryMedia([outcome.packet.media]);

  const failing = createApifyAcquirer({
    token: secret,
    tempDirBase: dir,
    fetchImpl: async () => {
      const err = new Error('getaddrinfo ENOTFOUND api.apify.com');
      err.cause = { code: 'ENOTFOUND' };
      throw err;
    },
  });
  await assert.rejects(
    () => failing.acquire({ url: identity.permalink, identity }),
    (err) => {
      assert.ok(err instanceof AcquisitionError);
      assert.equal(err.reasonCode, 'NETWORK_ERROR');
      assert.ok(!err.message.includes(secret), 'network error must not echo token');
      return true;
    },
  );
});

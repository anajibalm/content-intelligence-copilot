import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceArtifactUrl } from '../../lib/workspace/postgres.ts';

test('builds artifact URL only for files inside content storage root', () => {
  assert.equal(
    workspaceArtifactUrl('/tmp/storage', 'content-1', '/tmp/storage/content-1/hook/frame-0.jpg'),
    '/api/processing/assets?contentId=content-1&file=hook%2Fframe-0.jpg',
  );
});

test('rejects artifact paths outside selected content storage root', () => {
  assert.equal(workspaceArtifactUrl('/tmp/storage', 'content-1', '/tmp/storage/content-2/frame.jpg'), null);
  assert.equal(workspaceArtifactUrl('/tmp/storage', 'content-1', '/tmp/storage/content-1/../content-2/frame.jpg'), null);
});

test('keeps missing artifact unavailable instead of treating lexical containment as proof', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { resolveAuthorizedArtifact } = await import('../../lib/runtime/artifacts.ts');
  const root = await mkdtemp(join(tmpdir(), 'cic-s6-review-'));
  const contentId = '11111111-1111-4111-8111-111111111111';
  await mkdir(join(root, contentId), { recursive: true });
  const missing = join(root, contentId, 'missing.jpg');
  assert.equal(workspaceArtifactUrl(root, contentId, missing), '/api/processing/assets?contentId=11111111-1111-4111-8111-111111111111&file=missing.jpg');
  assert.equal(await resolveAuthorizedArtifact(root, contentId, 'missing.jpg', [missing]), null);
  await writeFile(join(root, contentId, 'frame.jpg'), 'frame');
  assert.equal(await resolveAuthorizedArtifact(root, contentId, 'frame.jpg', [join(root, contentId, 'frame.jpg')]) !== null, true);
});

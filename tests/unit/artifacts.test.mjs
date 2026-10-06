import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveAuthorizedArtifact } from '../../lib/runtime/artifacts.ts';

test('artifact authorization rejects invalid IDs, traversal, and symlink escape', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cic-artifacts-'));
  const contentId = '11111111-1111-4111-8111-111111111111';
  const contentRoot = path.join(root, contentId);
  const frame = path.join(contentRoot, 'frame.jpg');
  const outside = path.join(root, 'sentinel.txt');
  fs.mkdirSync(contentRoot, { recursive: true });
  fs.writeFileSync(frame, 'frame');
  fs.writeFileSync(outside, 'sentinel');
  const link = path.join(contentRoot, 'escape.jpg');
  fs.symlinkSync(outside, link);

  assert.equal(await resolveAuthorizedArtifact(root, contentId, 'frame.jpg', [frame]), frame);
  assert.equal(await resolveAuthorizedArtifact(root, '/etc', 'passwd', ['/etc/passwd']), null);
  assert.equal(await resolveAuthorizedArtifact(root, '../sentinel', 'sentinel.txt', [outside]), null);
  assert.equal(await resolveAuthorizedArtifact(root, contentId, '../sentinel.txt', [outside]), null);
  assert.equal(await resolveAuthorizedArtifact(root, contentId, 'escape.jpg', [link]), null);
});

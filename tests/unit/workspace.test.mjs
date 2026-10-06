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

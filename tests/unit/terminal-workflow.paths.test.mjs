import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../../scripts/terminal-workflow.mjs', import.meta.url));
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

test('exact path guard accepts tracked, new, and spaced paths', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cic-workflow-'));
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.invalid']);
  git(cwd, ['config', 'user.name', 'Test']);
  writeFileSync(join(cwd, 'tracked.txt'), 'before\n');
  git(cwd, ['add', 'tracked.txt']);
  git(cwd, ['commit', '-qm', 'init']);
  writeFileSync(join(cwd, 'tracked.txt'), 'after\n');
  writeFileSync(join(cwd, 'new file.txt'), 'new\n');
  const code = `import(${JSON.stringify(helper)}).then(({checkExactPaths}) => console.log(JSON.stringify(checkExactPaths(['tracked.txt', 'new file.txt']))))`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd, encoding: 'utf8' }).trim();
  assert.deepEqual(JSON.parse(output), ['new file.txt', 'tracked.txt']);
});

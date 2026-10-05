import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assertRepoUrl, parseArgs } from '../../scripts/terminal-workflow.mjs';

const helper = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/terminal-workflow.mjs');

function exitsWithFailure(code) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(helper)}).then((mod) => { ${code} })`], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  return result.stderr;
}

test('parseArgs preserves explicit values and boolean dry-run', () => {
  assert.deepEqual(parseArgs(['23', '--dry-run', '--reason', 'dependency pending']), {
    positional: ['23'],
    flags: { 'dry-run': true, reason: 'dependency pending' },
  });
});

test('issue identity accepts only repository URL', () => {
  assert.equal(assertRepoUrl('https://github.com/anajibalm/content-intelligence-copilot/issues/23'), 'https://github.com/anajibalm/content-intelligence-copilot/issues/23');
  assert.match(exitsWithFailure("mod.assertRepoUrl('https://github.com/other/repo/issues/23')"), /must belong/);
});

test('CI guard rejects pending, failed, and empty check sets', () => {
  assert.match(exitsWithFailure('mod.validateChecks([])'), /no checks/);
  assert.match(exitsWithFailure("mod.validateChecks([{ name: 'Build & Test', state: 'PENDING', bucket: 'pending' }])"), /not green/);
  assert.match(exitsWithFailure("mod.validateChecks([{ name: 'Build & Test', state: 'SUCCESS', bucket: 'fail' }])"), /not green/);
});

test('merge guard rejects wrong head and non-master base', () => {
  assert.match(exitsWithFailure("mod.validateMergeGuard({ state: 'OPEN', baseRefName: 'master', headRefOid: 'abc' }, 'def')"), /does not match/);
  assert.match(exitsWithFailure("mod.validateMergeGuard({ state: 'OPEN', baseRefName: 'feature', headRefOid: 'abc' }, 'abc')"), /base is/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { activeDependencies, parseArgs, validateChecks } from '../../scripts/terminal-workflow.mjs';

const helper = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/terminal-workflow.mjs');

function exitsWithFailure(code) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(helper)}).then((mod) => { ${code} })`], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  return result.stderr;
}

test('completed native dependency does not block pick', () => {
  assert.deepEqual(activeDependencies([
    { number: 3, state: 'closed', state_reason: 'completed' },
    { number: 4, state: 'open' },
  ]), [{ number: 4, state: 'open' }]);
});

test('unknown dependency closure fails closed', () => {
  assert.match(exitsWithFailure("mod.activeDependencies([{ number: 3, state: 'closed', state_reason: 'duplicate' }])"), /unverified state/);
});

test('CIC check guard requires exactly Build & Test success', () => {
  assert.doesNotThrow(() => validateChecks([{ name: 'Build & Test', state: 'SUCCESS', bucket: 'pass' }]));
  assert.match(exitsWithFailure("mod.validateChecks([{ name: 'Other', state: 'SUCCESS', bucket: 'pass' }])"), /expected one CIC Build & Test/);
});

test('task delivery requires task-specific body file', () => {
  assert.deepEqual(parseArgs(['23', '--body-file', 'docs/pr-body.md']), {
    positional: ['23'],
    flags: { 'body-file': 'docs/pr-body.md' },
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../../scripts/terminal-workflow.mjs', import.meta.url));
const configPath = fileURLToPath(new URL('../../scripts/github-workflow.config.json', import.meta.url));
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const repository = config.owner + '/' + config.repo;
const issueUrl = 'https://github.com/' + repository + '/issues/4';
const prNumber = 2400004;
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

function fakeGhProgram() {
  const fs = require('node:fs');
  const cp = require('node:child_process');
  let a = process.argv.slice(2);
  if (a[0] === '--repo') {
    if (a[2] === 'api') throw Error('API must use its explicit repository endpoint');
    a = a.slice(2);
  }
  const file = process.env.CIC_FAKE_STATE;
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = s.config;
  const repo = cfg.owner + '/' + cfg.repo;
  const issue = 'https://github.com/' + repo + '/issues/4';
  const save = () => fs.writeFileSync(file, JSON.stringify(s));
  const out = v => process.stdout.write(JSON.stringify(v));
  const currentHead = () => cp.execFileSync(process.env.CIC_REAL_GIT, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const number = v => Number(String(v).split('/').at(-1));
  const readPr = n => {
    if (!s.pr) throw Error('No fake task PR');
    return { ...s.pr, number: n, url: 'https://github.com/' + repo + '/pull/' + n,
      headRefOid: currentHead(), closingIssuesReferences: s.references || [{ number: 4, url: issue }] };
  };
  if (a[0] === 'issue' && a[1] === 'view') {
    const n = number(a[2]);
    const closed = n === 23 || (n === 4 && s.closed);
    return out({ number: n, title: 'Fixture task', state: closed ? 'CLOSED' : 'OPEN',
      stateReason: closed ? 'COMPLETED' : null, url: 'https://github.com/' + repo + '/issues/' + n,
      body: '## Acceptance\nFixture criteria' });
  }
  if (a[0] === 'api' && a[1].includes('/dependencies/blocked_by')) {
    return out([[{ number: 3, state: 'closed', state_reason: 'completed' }]]);
  }
  if (a[0] === 'api' && a[1] === 'graphql') {
    const second = a.includes('cursor=second-page');
    const opts = cfg.tracking_statuses.map((name, i) => ({ id: 'option' + i, name }));
    const item = { id: 'item4', content: { __typename: 'Issue', number: 4, title: 'Fixture', url: issue,
      state: s.closed ? 'CLOSED' : 'OPEN', repository: { nameWithOwner: repo } },
      fieldValues: { nodes: [{ field: { name: 'Status' }, name: 'Todo' },
        { field: { name: cfg.tracking_status_field }, name: s.status }] } };
    const decoy = { ...item, id: 'decoy', content: { ...item.content, repository: { nameWithOwner: 'other/repo' } } };
    return out({ data: { user: { projectV2: { id: cfg.project_id, number: cfg.project_number,
      fields: { nodes: [{ id: 'builtin', name: 'Status', options: [{ id: 'todo', name: 'Todo' }] },
        { id: 'tracking', name: cfg.tracking_status_field, options: opts }] },
      items: { nodes: [second ? item : decoy],
        pageInfo: { hasNextPage: !second, endCursor: second ? null : 'second-page' } } } } } });
  }
  if (a[0] === 'project' && a[1] === 'item-edit') {
    if (a[a.indexOf('--field-id') + 1] !== 'tracking') throw Error('Wrong status field');
    const option = a[a.indexOf('--single-select-option-id') + 1];
    s.status = cfg.tracking_statuses[Number(option.replace('option', ''))];
    s.projectWrites += 1; save(); return out({});
  }
  if (a[0] === 'issue' && a[1] === 'edit') return out({});
  if (a[0] === 'pr' && a[1] === 'view') {
    const n = number(a[2]);
    if (n === cfg.baseline_pr) return out({ state: 'MERGED', baseRefName: cfg.base_branch,
      headRefName: 'baseline', headRefOid: s.baseSha, url: 'https://github.com/' + repo + '/pull/' + n });
    return out(readPr(n));
  }
  if (a[0] === 'pr' && a[1] === 'list') return out(s.pr ? [readPr(s.pr.number)] : []);
  if (a[0] === 'pr' && a[1] === 'create') {
    s.pr = { number: s.prNumber, state: 'OPEN', baseRefName: a[a.indexOf('--base') + 1],
      headRefName: a[a.indexOf('--head') + 1], headRefOid: currentHead(),
      url: 'https://github.com/' + repo + '/pull/' + s.prNumber,
      body: fs.readFileSync(a[a.indexOf('--body-file') + 1], 'utf8') };
    s.prCreates += 1; save(); process.stdout.write(s.pr.url); return;
  }
  if (a[0] === 'pr' && a[1] === 'checks') {
    if (a.includes('--watch')) return;
    return out([{ name: 'Build & Test', state: 'SUCCESS', bucket: 'pass', link: 'https://example.invalid/fixture-ci' }]);
  }
  if (a[0] === 'pr' && a[1] === 'merge') {
    s.mergeWrites += 1; s.closed = true; s.pr.state = 'MERGED';
    s.pr.mergedAt = '2026-10-06T00:00:00Z'; s.pr.mergeCommit = { oid: currentHead() };
    save(); return;
  }
  throw Error('Unexpected fake gh command: ' + JSON.stringify(a));
}

function fakeGitProgram() {
  const cp = require('node:child_process');
  const fs = require('node:fs');
  const s = JSON.parse(fs.readFileSync(process.env.CIC_FAKE_STATE, 'utf8'));
  const a = process.argv.slice(2);
  if ((a[0] === 'ls-remote' || a[0] === 'fetch') && a.includes('origin')) a[a.indexOf('origin')] = s.bare;
  const r = cp.spawnSync(process.env.CIC_REAL_GIT, a, { stdio: 'inherit', env: process.env });
  process.exitCode = r.status === null ? 1 : r.status;
}

function fakeNpmProgram() {
  const fs = require('node:fs');
  const file = process.env.CIC_FAKE_STATE;
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  s.npmCalls.push(process.argv.slice(2));
  fs.writeFileSync(file, JSON.stringify(s));
}

function fixture(t) {
  const outer = mkdtempSync(join(tmpdir(), 'cic-lifecycle-'));
  t.after(() => rmSync(outer, { recursive: true, force: true }));
  const root = join(outer, 'repo'), bin = join(outer, 'bin'), bare = join(outer, 'remote.git');
  const stateFile = join(outer, 'fake-state.json');
  mkdirSync(root); mkdirSync(bin);
  for (const [name, fn] of [['gh', fakeGhProgram], ['git', fakeGitProgram], ['npm', fakeNpmProgram]]) {
    writeFileSync(join(bin, name), '#!/usr/bin/env node\n(' + fn.toString() + ')();\n', { mode: 0o755 });
  }
  const git = (args, cwd = root) => execFileSync(realGit, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-qb', 'master']); git(['init', '-q', '--bare', bare]);
  git(['config', 'user.name', 'CIC Test']); git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'remote.origin.url', 'https://github.com/' + repository + '.git']);
  git(['config', 'remote.origin.pushurl', bare]);
  writeFileSync(join(root, '.gitignore'), config.state_root + '/\n');
  writeFileSync(join(root, 'tracked.txt'), 'baseline\n');
  git(['add', '.']); git(['commit', '-qm', 'fixture baseline']); git(['push', 'origin', 'master']);
  const baseSha = git(['rev-parse', 'HEAD']);
  const initial = { config, bare, baseSha, prNumber, pr: null, references: null,
    status: 'Ready', closed: false, mergeWrites: 0, projectWrites: 0, prCreates: 0, npmCalls: [] };
  writeFileSync(stateFile, JSON.stringify(initial));
  const env = { ...process.env, CIC_WORKFLOW_CONFIG: configPath, CIC_FAKE_STATE: stateFile,
    CIC_REAL_GIT: realGit, PATH: bin + delimiter + process.env.PATH };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key];
  const cli = (command, args, cwd = root) => spawnSync(process.execPath, [helper, command, ...args], { cwd, encoding: 'utf8', env });
  const ok = r => { assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
  const fake = () => JSON.parse(readFileSync(stateFile, 'utf8'));
  const update = data => writeFileSync(stateFile, JSON.stringify({ ...fake(), ...data }));
  const taskStatePath = join(root, config.state_root, '4.json');
  return { outer, root, bare, baseSha, env, git, cli, ok, fake, update, taskStatePath };
}

test('CLI lifecycle delivers nested new files and renames, resumes, and guards merge before writes', t => {
  const f = fixture(t);
  const setup = JSON.parse(f.ok(f.cli('pick', ['4'])).stdout);
  const worktree = setup.worktree;
  assert.equal(setup.baseSha, f.baseSha);
  const newPath = 'lib/media/frame.mjs', renamedPath = 'lib/media/renamed frame.mjs';
  mkdirSync(join(worktree, 'lib', 'media'), { recursive: true });
  writeFileSync(join(worktree, newPath), 'export const fixture = 1;\n');
  const body = join(f.outer, 'pr-body.md');
  writeFileSync(body, '## Problem\nFixture task\n## Verification\nFake checks passed\nCloses #4\n');
  const deliver = paths => f.cli('task-done', ['4', '--paths', paths, '--commit-message', 'test: fixture delivery', '--body-file', body], worktree);
  f.ok(deliver(newPath));
  let state = JSON.parse(readFileSync(f.taskStatePath, 'utf8'));
  const firstHead = f.git(['rev-parse', 'HEAD'], worktree);
  assert.notEqual(firstHead, f.baseSha);
  assert.equal(state.head, firstHead);
  assert.equal(state.baseSha, f.baseSha);
  assert.equal(f.fake().status, 'Review');
  assert.equal(f.git(['--git-dir=' + f.bare, 'rev-parse', 'refs/heads/task/4']), firstHead);
  assert.deepEqual(f.fake().npmCalls.slice(0, 6), [['ci'], ['run', 'lint'], ['run', 'typecheck'], ['test'], ['run', 'validate:fixtures'], ['run', 'build']]);
  f.ok(deliver(newPath));
  assert.equal(f.git(['rev-parse', 'HEAD'], worktree), firstHead);
  assert.equal(f.fake().prCreates, 1);
  f.ok(f.cli('pick', ['4']));
  state = JSON.parse(readFileSync(f.taskStatePath, 'utf8'));
  assert.equal(state.baseSha, f.baseSha);
  assert.equal(state.pr, 'https://github.com/' + repository + '/pull/' + prNumber);
  renameSync(join(worktree, newPath), join(worktree, renamedPath));
  f.ok(deliver(newPath + ',' + renamedPath));
  const head = f.git(['rev-parse', 'HEAD'], worktree);
  assert.notEqual(head, firstHead);
  assert.equal(f.fake().prCreates, 1);
  f.update({ references: [{ number: 4, url: 'https://github.com/other/repo/issues/4' }] });
  const invalid = f.cli('task-merge', ['4', '--pr', String(prNumber), '--approved-head', head], worktree);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /not linked/);
  assert.equal(f.fake().mergeWrites, 0);
  assert.equal(f.fake().status, 'Review');
  assert.equal(existsSync(join(f.root, config.state_root, '.lock')), false);
  f.update({ references: null });
  const wrongPr = f.cli('task-merge', ['4', '--pr', String(prNumber + 1), '--approved-head', head], worktree);
  assert.notEqual(wrongPr.status, 0);
  assert.match(wrongPr.stderr, /recorded task delivery/);
  assert.equal(f.fake().mergeWrites, 0);
  f.ok(f.cli('task-merge', ['4', '--pr', String(prNumber), '--approved-head', head], worktree));
  assert.equal(f.fake().mergeWrites, 1);
  assert.equal(f.fake().status, 'Done');
  f.ok(f.cli('task-merge', ['4', '--pr', String(prNumber), '--approved-head', head], worktree));
  assert.equal(f.fake().mergeWrites, 1);
  f.ok(f.cli('done', ['4', '--pr', String(prNumber)]));
});

test('expected CLI failures release the lock and permit retry', t => {
  const f = fixture(t);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const r = f.cli('pick', ['23', '--dry-run']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /CLOSED, not OPEN/);
    assert.equal(existsSync(join(f.root, config.state_root, '.lock')), false);
  }
  assert.equal(f.fake().projectWrites, 0);
});

test('Done rejects foreign issue URLs before Project mutation', t => {
  const f = fixture(t);
  f.update({ closed: true, references: [{ number: 4, url: 'https://github.com/other/repo/issues/4' }],
    pr: { number: prNumber, state: 'MERGED', baseRefName: config.base_branch, headRefName: 'task/4',
      headRefOid: f.baseSha, mergedAt: '2026-10-06T00:00:00Z', mergeCommit: { oid: f.baseSha },
      body: '## Verification\nFixture evidence' } });
  const r = f.cli('done', ['4', '--pr', String(prNumber)]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not linked/);
  assert.equal(f.fake().projectWrites, 0);
  assert.equal(f.fake().mergeWrites, 0);
});

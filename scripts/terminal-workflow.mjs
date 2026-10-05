#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.CIC_WORKFLOW_CONFIG || join(SCRIPT_DIR, 'github-workflow.config.json');
const CONFIG = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const COMMON_GIT_DIR = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
const MAIN_ROOT = basename(COMMON_GIT_DIR) === '.git' ? dirname(COMMON_GIT_DIR) : ROOT;
const STATE_ROOT = join(MAIN_ROOT, CONFIG.state_root || '.cic-terminal-workflow');
const REPO = `${CONFIG.owner}/${CONFIG.repo}`;
const BASELINE_BRANCH = 'fix/ci-governance-baseline';
const STATUS_OPTIONS = new Set(CONFIG.tracking_statuses);

function die(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function gh(args, options = {}) {
  const scopedArgs = args[0] === 'api' || args[0] === 'project' ? args : ['--repo', REPO, ...args];
  try {
    return execFileSync('gh', scopedArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      env: process.env,
      timeout: options.timeout ?? 120_000,
    }).trim();
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    die(`gh ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function git(args, cwd = ROOT) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    die(`git ${args.join(' ')} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const [key, inline] = token.slice(2).split('=', 2);
    if (inline !== undefined) flags[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
    else flags[key] = true;
  }
  return { positional, flags };
}

function json(value) {
  return JSON.parse(value || '{}');
}

function issueUrl(number) {
  return `https://github.com/${REPO}/issues/${number}`;
}

function assertRepoUrl(url) {
  const expected = `https://github.com/${REPO}/issues/`;
  if (!url.startsWith(expected) || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(url)) {
    die(`issue URL must belong to ${REPO}: ${url}`);
  }
  return url;
}

function resolveIssue(input) {
  const url = /^https:\/\//.test(input) ? assertRepoUrl(input) : issueUrl(Number.parseInt(input, 10));
  if (!/\/\d+$/.test(url)) die(`invalid issue identifier: ${input}`);
  const issue = json(gh(['issue', 'view', url, '--json', 'number,title,state,url,body,labels,milestone']));
  if (issue.url !== url || issue.number === undefined) die(`issue identity mismatch for ${url}`);
  return issue;
}

const PROJECT_QUERY = `query($login:String!,$number:Int!,$cursor:String){user(login:$login){projectV2(number:$number){id,number,fields(first:100){nodes{__typename,... on ProjectV2SingleSelectField{id,name,options{id,name}}}},items(first:100,after:$cursor){nodes{id,content{__typename,... on Issue{number,title,url,state,repository{nameWithOwner}}... on PullRequest{number,title,url,state,repository{nameWithOwner}}}fieldValues(first:50){nodes{__typename,... on ProjectV2ItemFieldSingleSelectValue{name,field{... on ProjectV2SingleSelectField{name}}}}}},pageInfo{hasNextPage,endCursor}}}}}`;

function projectPage(cursor) {
  const args = ['api', 'graphql', '-f', `query=${PROJECT_QUERY}`, '-F', `login=${CONFIG.owner}`, '-F', `number=${CONFIG.project_number}`];
  if (cursor) args.push('-F', `cursor=${cursor}`);
  return json(gh(args));
}

function uniqueById(values) {
  return [...new Map(values.filter((value) => value?.id).map((value) => [value.id, value])).values()];
}

function projectSnapshot() {
  const pages = [];
  let cursor;
  do {
    const page = projectPage(cursor).data?.user?.projectV2;
    if (!page) die('CIC Project not found or inaccessible');
    pages.push(page);
    cursor = page.items.pageInfo.hasNextPage ? page.items.pageInfo.endCursor : undefined;
  } while (cursor);
  const first = pages[0];
  const items = uniqueById(pages.flatMap((page) => page.items.nodes));
  const fields = uniqueById(pages.flatMap((page) => page.fields.nodes));
  const trackingFields = fields.filter((field) => field.name === CONFIG.tracking_status_field);
  if (trackingFields.length !== 1) die(`expected one ${CONFIG.tracking_status_field} field, found ${trackingFields.length}`);
  const trackingField = trackingFields[0];
  const options = new Map(trackingField.options.map((option) => [option.name, option]));
  for (const status of CONFIG.tracking_statuses) if (!options.has(status)) die(`missing Tracking Status option: ${status}`);
  return { project: first, items, trackingField, options };
}

function trackingStatus(item, fieldName = CONFIG.tracking_status_field) {
  const values = item.fieldValues.nodes.filter((value) => value.field?.name === fieldName);
  if (values.length > 1) die(`ambiguous ${fieldName} on project item ${item.id}`);
  return values[0]?.name || null;
}

function issueItems(snapshot) {
  return snapshot.items.filter((item) => item.content?.__typename === 'Issue' && item.content.repository?.nameWithOwner === REPO);
}

function findProjectItem(snapshot, issueNumber) {
  const matches = issueItems(snapshot).filter((item) => item.content.number === issueNumber);
  if (matches.length !== 1) die(`expected one Project issue item for ${REPO}#${issueNumber}, found ${matches.length}`);
  return matches[0];
}

function printItems(items, snapshot) {
  for (const item of items) {
    const content = item.content;
    console.log(`${content.number}\t${trackingStatus(item)}\t${content.state}\t${content.title}\t${content.url}`);
  }
  if (items.length === 0) console.log('No matching CIC issue items.');
  void snapshot;
}

function mutateStatus(issue, status, dryRun = false) {
  if (!STATUS_OPTIONS.has(status)) die(`unsupported CIC status: ${status}`);
  const snapshot = projectSnapshot();
  const item = findProjectItem(snapshot, issue.number);
  const current = trackingStatus(item);
  if (current === status) return { snapshot, item, changed: false };
  const option = snapshot.options.get(status);
  if (dryRun) {
    console.log(`[dry-run] set ${REPO}#${issue.number} Tracking Status ${current || 'unset'} -> ${status}`);
    return { snapshot, item, changed: false };
  }
  gh(['project', 'item-edit', String(CONFIG.project_number), '--owner', CONFIG.owner, '--id', item.id, '--project-id', CONFIG.project_id, '--field-id', snapshot.trackingField.id, '--single-select-option-id', option.id, '--format', 'json']);
  const after = projectSnapshot();
  const updated = findProjectItem(after, issue.number);
  if (trackingStatus(updated) !== status) die(`Project readback failed: ${REPO}#${issue.number} is ${trackingStatus(updated)}`);
  return { snapshot: after, item: updated, changed: true };
}

function updateLabels(issue, add = [], remove = []) {
  const args = ['issue', 'edit', issue.url];
  for (const label of add) args.push('--add-label', label);
  for (const label of remove) args.push('--remove-label', label);
  if (add.length || remove.length) gh(args);
}

function nativeBlockers(issueNumber) {
  let raw;
  try {
    raw = execFileSync('gh', ['--repo', REPO, 'api', `repos/${REPO}/issues/${issueNumber}/dependencies/blocked_by`, '--paginate'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const stderr = error.stderr?.toString().trim() || '';
    if (/not found|must be authenticated|forbidden/i.test(stderr)) die(`cannot verify native issue dependencies: ${stderr}`);
    return [];
  }
  if (!raw) return [];
  const parsed = raw.split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  return parsed.flatMap((value) => Array.isArray(value) ? value : [value]);
}

function assertPickable(issue) {
  if (issue.state !== 'OPEN') die(`issue ${issue.url} is ${issue.state}, not OPEN`);
  if (!/##\s+Acceptance/i.test(issue.body || '')) die(`issue ${issue.url} has no Acceptance section`);
  const blockers = nativeBlockers(issue.number);
  if (blockers.length) die(`issue ${issue.url} has native blockers: ${blockers.map((b) => b.number || b.id || 'unknown').join(', ')}`);
  const snapshot = projectSnapshot();
  const active = issueItems(snapshot).filter((item) => trackingStatus(item) === 'In Progress' && item.content.number !== issue.number);
  if (active.length) die(`another CIC task is In Progress: ${active.map((item) => `#${item.content.number}`).join(', ')}`);
}

function shellSafePath(path) {
  if (!path || path.startsWith('/') || path === '.' || path === '..' || path.includes('..' + '/')) die(`path must be repository-relative: ${path}`);
  return path;
}

function checkExactPaths(paths) {
  const expected = [...new Set(paths.map(shellSafePath))].sort();
  if (!expected.length) die('at least one explicit --path is required');
  const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean).sort();
  if (staged.length) die(`index already has staged paths: ${staged.join(', ')}`);
  const changed = git(['status', '--porcelain=v1']).split('\n').filter(Boolean).map((line) => line.slice(3)).filter(Boolean).sort();
  const outside = changed.filter((path) => !expected.includes(path));
  if (outside.length) die(`working tree changes outside explicit paths: ${outside.join(', ')}`);
  return expected;
}

function validateChecks(checks, prNumber = 'PR') {
  if (!Array.isArray(checks) || checks.length === 0) die(`${prNumber} has no checks; cannot claim CI green`);
  const incomplete = checks.filter((check) => check.bucket !== 'pass');
  if (incomplete.length) die(`${prNumber} checks are not green: ${incomplete.map((check) => `${check.name}:${check.state}/${check.bucket}`).join(', ')}`);
  return checks;
}

function ciChecks(prNumber) {
  return validateChecks(json(gh(['pr', 'checks', String(prNumber), '--json', 'name,state,bucket,link'])), `PR #${prNumber}`);
}

function validateMergeGuard(pr, approvedHead) {
  if (pr.state !== 'OPEN') die(`PR is ${pr.state}`);
  if (pr.baseRefName !== CONFIG.base_branch) die(`PR base is ${pr.baseRefName}, expected ${CONFIG.base_branch}`);
  if (pr.headRefOid !== approvedHead) die(`PR HEAD ${pr.headRefOid} does not match --approved-head ${approvedHead}`);
  return pr;
}

function waitForCi(prNumber) {
  const timeout = Number(process.env.CIC_CI_TIMEOUT_SECONDS || 900) * 1000;
  const result = spawnSync('gh', ['--repo', REPO, 'pr', 'checks', String(prNumber), '--watch', '--interval', '5'], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout });
  if (result.error || result.status !== 0) die(`PR #${prNumber} CI did not finish green`);
  return ciChecks(prNumber);
}

function baseline() {
  const pr = json(gh(['pr', 'view', String(CONFIG.baseline_pr), '--json', 'state,headRefName,headRefOid,baseRefName,url']));
  if (pr.state === 'OPEN') return { ...pr, baseForStack: pr.headRefName };
  if (pr.state === 'MERGED') return { ...pr, baseForStack: CONFIG.base_branch };
  die(`baseline PR #${CONFIG.baseline_pr} is ${pr.state}; cannot choose automation base`);
}

function writeState(issue, data) {
  mkdirSync(STATE_ROOT, { recursive: true });
  writeFileSync(join(STATE_ROOT, `${issue.number}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

function readState(issueNumber) {
  const path = join(STATE_ROOT, `${issueNumber}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function listCommand() {
  const { flags } = parseArgs(process.argv.slice(3));
  const snapshot = projectSnapshot();
  let items = issueItems(snapshot);
  if (flags.status) items = items.filter((item) => trackingStatus(item) === flags.status);
  printItems(items, snapshot);
}

function readyCommand() {
  const snapshot = projectSnapshot();
  printItems(issueItems(snapshot).filter((item) => trackingStatus(item) === 'Ready'), snapshot);
}

function importCommand(args) {
  const { positional, flags } = parseArgs(args);
  const issue = resolveIssue(positional[0]);
  const snapshot = projectSnapshot();
  const existing = issueItems(snapshot).filter((item) => item.content.number === issue.number);
  if (existing.length > 1) die(`duplicate Project items for ${issue.url}`);
  if (existing.length === 1) {
    if (!trackingStatus(existing[0]) && !flags['dry-run']) mutateStatus(issue, 'Ready');
    console.log(`already imported: ${issue.url}`);
    return;
  }
  if (flags['dry-run']) {
    console.log(`[dry-run] import ${issue.url} into Project ${CONFIG.project_number}`);
    return;
  }
  gh(['project', 'item-add', String(CONFIG.project_number), '--owner', CONFIG.owner, '--url', issue.url, '--format', 'json']);
  const after = projectSnapshot();
  findProjectItem(after, issue.number);
  mutateStatus(issue, 'Ready', false);
  console.log(`imported: ${issue.url}`);
}

function pickCommand(args) {
  const { positional, flags } = parseArgs(args);
  const issue = resolveIssue(positional[0]);
  assertPickable(issue);
  const state = readState(issue.number);
  if (state && (state.repo !== REPO || state.issue !== issue.url || state.number !== issue.number)) die(`task state identity mismatch for ${issue.url}`);
  const worktree = state?.worktree || join(dirname(MAIN_ROOT), `${basename(MAIN_ROOT)}-task-${issue.number}`);
  const branch = state?.branch || `task/${issue.number}`;
  if (existsSync(worktree)) {
    const known = git(['-C', worktree, 'rev-parse', '--show-toplevel']);
    if (resolve(known) !== resolve(worktree)) die(`existing task path is not expected worktree: ${worktree}`);
    if (state?.branch && git(['-C', worktree, 'branch', '--show-current']) !== branch) die(`existing task branch does not match state: ${branch}`);
  } else if (!flags['dry-run']) {
    git(['worktree', 'add', '-b', branch, worktree, git(['rev-parse', 'HEAD'])]);
  } else {
    console.log(`[dry-run] create worktree ${worktree} on ${branch}`);
  }
  if (!flags['dry-run']) {
    const baseSha = git(['-C', worktree, 'rev-parse', 'HEAD']);
    writeState(issue, { repo: REPO, issue: issue.url, number: issue.number, branch, worktree, baseSha, stage: 'worktree-created' });
    mutateStatus(issue, 'In Progress');
    writeState(issue, { repo: REPO, issue: issue.url, number: issue.number, branch, worktree, baseSha, stage: 'in-progress' });
    console.log(JSON.stringify({ issue: issue.url, branch, worktree, baseSha, status: 'In Progress' }, null, 2));
  }
}

function reviewCommand(args) {
  const { positional, flags } = parseArgs(args);
  const issue = resolveIssue(positional[0]);
  if (flags['dry-run']) {
    mutateStatus(issue, 'Review', true);
    return;
  }
  updateLabels(issue, ['status:review'], ['status:ready', 'status:blocked']);
  mutateStatus(issue, 'Review');
  console.log(`Review: ${issue.url}`);
}

function blockedCommand(args) {
  const { positional, flags } = parseArgs(args);
  if (!flags.reason) die('blocked requires --reason');
  const issue = resolveIssue(positional[0]);
  if (flags['dry-run']) {
    mutateStatus(issue, 'Blocked', true);
    console.log(`[dry-run] reason: ${flags.reason}`);
    return;
  }
  updateLabels(issue, ['status:blocked'], ['status:ready', 'status:review']);
  mutateStatus(issue, 'Blocked');
  console.log(`Blocked: ${issue.url}\nReason: ${flags.reason}`);
}

function doneCommand(args) {
  const { positional, flags } = parseArgs(args);
  if (!flags.pr) die('done requires --pr <number>');
  const issue = resolveIssue(positional[0]);
  const pr = json(gh(['pr', 'view', String(flags.pr), '--json', 'state,mergedAt,baseRefName,headRefOid,closingIssuesReferences,url']));
  if (!Array.isArray(pr.closingIssuesReferences) || !pr.closingIssuesReferences.some((ref) => ref.number === issue.number)) die(`PR #${flags.pr} is not linked to ${issue.url}`);
  if (issue.state !== 'CLOSED') die(`issue ${issue.url} is not closed after merge`);
  if (flags['dry-run']) {
    mutateStatus(issue, 'Done', true);
    return;
  }
  mutateStatus(issue, 'Done');
  updateLabels(issue, [], ['status:ready', 'status:review', 'status:blocked']);
  console.log(`Done: ${issue.url}`);
}

function taskDoneCommand(args) {
  const { positional, flags } = parseArgs(args);
  const issue = resolveIssue(positional[0]);
  const paths = String(flags.paths || '').split(',').filter(Boolean);
  const exactPaths = checkExactPaths(paths);
  if (!flags['commit-message']) die('task-done requires --commit-message');
  if (git(['status', '--porcelain=v1']).split('\n').some((line) => line.startsWith('??'))) die('untracked files present; include exact paths explicitly or remove them');
  const testedHead = git(['rev-parse', 'HEAD']);
  const commands = [
    ['npm', ['ci']],
    ['npm', ['run', 'lint']],
    ['npm', ['run', 'typecheck']],
    ['npm', ['test']],
    ['npm', ['run', 'validate:fixtures']],
    ['npm', ['run', 'build']],
  ];
  for (const [command, commandArgs] of commands) {
    const result = spawnSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit', env: process.env });
    if (result.status !== 0) die(`${command} ${commandArgs.join(' ')} failed`);
  }
  git(['add', '--', ...exactPaths]);
  const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean).sort();
  if (JSON.stringify(staged) !== JSON.stringify(exactPaths)) die(`staged paths mismatch: expected ${exactPaths.join(', ')}, got ${staged.join(', ')}`);
  git(['diff', '--cached', '--check']);
  git(['commit', '-m', flags['commit-message']]);
  const branch = git(['branch', '--show-current']);
  git(['push', '--set-upstream', 'origin', branch]);
  const base = baseline().baseForStack;
  let prs = json(gh(['pr', 'list', '--head', branch, '--json', 'number,url,state,baseRefName,headRefOid']));
  let pr = prs.find((candidate) => candidate.state === 'OPEN');
  if (!pr) {
    const bodyPath = `/tmp/cic-terminal-pr-${issue.number}.md`;
    writeFileSync(bodyPath, `## Problem\n\nDeliver issue ${issue.url} through isolated terminal workflow.\n\n## Changes\n\nAutomation commands, exact-path delivery, CI gates, and owner-gated merge.\n\n## Dependency\n\nBaseline PR #${CONFIG.baseline_pr} must merge before this PR targets master.\n\n## Verification\n\nCommands executed by task-done.\n\nCloses #${issue.number}\n`);
    const createArgs = ['pr', 'create', '--base', base, '--head', branch, '--title', flags.title || flags['commit-message'], '--body-file', bodyPath];
    if (base !== CONFIG.base_branch) createArgs.push('--draft');
    const url = gh(createArgs);
    unlinkSync(bodyPath);
    pr = json(gh(['pr', 'view', url, '--json', 'number,url,state,baseRefName,headRefOid']));
  }
  if (pr.baseRefName !== base) die(`PR #${pr.number} base ${pr.baseRefName} does not match ${base}`);
  if (pr.headRefOid !== testedHead) die(`PR #${pr.number} HEAD ${pr.headRefOid} does not match tested HEAD ${testedHead}`);
  waitForCi(pr.number);
  const verifiedHead = json(gh(['pr', 'view', String(pr.number), '--json', 'headRefOid'])).headRefOid;
  if (verifiedHead !== testedHead) die(`PR #${pr.number} HEAD changed during CI: ${verifiedHead}`);
  updateLabels(issue, ['status:review'], ['status:ready', 'status:blocked']);
  mutateStatus(issue, 'Review');
  writeState(issue, { repo: REPO, issue: issue.url, number: issue.number, branch, worktree: ROOT, head: git(['rev-parse', 'HEAD']), pr: pr.url, base, stage: 'review' });
  console.log(JSON.stringify({ issue: issue.url, pr: pr.url, base, head: git(['rev-parse', 'HEAD']), status: 'Review' }, null, 2));
}

function mergeCommand(args) {
  const { positional, flags } = parseArgs(args);
  if (!flags.pr || !flags['approved-head']) die('task-merge requires --pr <number> --approved-head <sha>');
  const issue = resolveIssue(positional[0]);
  const pr = json(gh(['pr', 'view', String(flags.pr), '--json', 'state,baseRefName,headRefOid,url']));
  validateMergeGuard(pr, flags['approved-head']);
  ciChecks(flags.pr);
  if (flags['dry-run']) {
    console.log(`[dry-run] merge PR #${flags.pr} at ${flags['approved-head']}`);
    return;
  }
  gh(['pr', 'merge', String(flags.pr), '--squash', '--match-head-commit', flags['approved-head']]);
  const after = json(gh(['pr', 'view', String(flags.pr), '--json', 'state,mergedAt,mergeCommit,baseRefName']));
  if (after.state !== 'MERGED' || !after.mergedAt || after.baseRefName !== CONFIG.base_branch) die(`merge readback failed for PR #${flags.pr}`);
  const issueAfter = resolveIssue(issue.number.toString());
  if (issueAfter.state !== 'CLOSED') die(`merged PR #${flags.pr} did not close ${issue.url}`);
  mutateStatus(issueAfter, 'Done');
  updateLabels(issueAfter, [], ['status:ready', 'status:review', 'status:blocked']);
  console.log(JSON.stringify({ issue: issue.url, pr: pr.url, state: 'MERGED', status: 'Done' }, null, 2));
}

function usage() {
  console.log(`Usage:
  kanban.sh list [--status STATUS]
  kanban.sh ready
  kanban.sh import <issue> [--dry-run]
  kanban.sh pick <issue> [--dry-run]
  kanban.sh review <issue> [--dry-run]
  kanban.sh blocked <issue> --reason REASON [--dry-run]
  kanban.sh done <issue> --pr NUMBER [--dry-run]
  task-done.sh <issue> --paths path1,path2 --commit-message MESSAGE
  task-merge.sh <issue> --pr NUMBER --approved-head SHA [--dry-run]`);
}

function main() {
  const command = process.argv[2];
  if (!command || command === '--help' || command === '-h') return usage();
  if (command === 'list') return listCommand();
  if (command === 'ready') return readyCommand();
  if (command === 'import') return importCommand(process.argv.slice(3));
  if (command === 'pick') return pickCommand(process.argv.slice(3));
  if (command === 'review') return reviewCommand(process.argv.slice(3));
  if (command === 'blocked') return blockedCommand(process.argv.slice(3));
  if (command === 'done') return doneCommand(process.argv.slice(3));
  if (command === 'task-done') return taskDoneCommand(process.argv.slice(3));
  if (command === 'task-merge') return mergeCommand(process.argv.slice(3));
  die('unknown command; use --help');
}

export { assertRepoUrl, checkExactPaths, ciChecks, parseArgs, projectSnapshot, trackingStatus, validateChecks, validateMergeGuard };
if (process.argv[1] === fileURLToPath(import.meta.url)) main();

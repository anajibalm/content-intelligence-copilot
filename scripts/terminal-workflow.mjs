#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, rmSync } from 'node:fs';
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

function gitRaw(args, cwd = ROOT) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    die(`git ${args.join(' ')} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}

function git(args, cwd = ROOT) {
  return gitRaw(args, cwd).trim();
}

function gitPathList(args, cwd = ROOT) {
  return gitRaw([...args, '-z'], cwd).split('\0').filter(Boolean);
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

function assertOrigin() {
  const origin = git(['remote', 'get-url', 'origin']);
  const normalized = origin.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
  const expected = `https://github.com/${REPO}`;
  if (normalized !== expected) die(`origin ${origin} does not match ${expected}`);
}

function assertRepoContext() {
  assertOrigin();
  const branch = git(['branch', '--show-current']);
  if (!branch) die('write requires non-detached branch');
  return branch;
}

function assertWriteContext(issue, { requireTaskState = true } = {}) {
  const branch = assertRepoContext();
  if (branch === CONFIG.base_branch || branch === 'master') die(`write requires non-base branch, got ${branch}`);
  const state = readState(issue.number);
  if (requireTaskState && !state) die(`no task state for ${issue.url}`);
  if (state && (state.repo !== REPO || state.issue !== issue.url || state.number !== issue.number)) die(`task state identity mismatch for ${issue.url}`);
  if (state && (resolve(state.worktree) !== resolve(ROOT) || state.branch !== branch)) die(`task state worktree/branch mismatch for ${issue.url}`);
  if (requireTaskState && resolve(ROOT) === resolve(MAIN_ROOT)) die('write requires isolated task worktree');
  return state;
}

function withLock(action) {
  mkdirSync(STATE_ROOT, { recursive: true });
  const lockPath = join(STATE_ROOT, '.lock');
  try {
    mkdirSync(lockPath);
  } catch {
    die(`workflow lock exists: ${lockPath}`);
  }
  try { return action(); } finally { rmSync(lockPath, { recursive: true, force: true }); }
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
  const issue = json(gh(['issue', 'view', url, '--json', 'number,title,state,stateReason,url,body,labels,milestone']));
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

function activeDependencies(dependencies) {
  if (!Array.isArray(dependencies)) die('native dependency response is not an array');
  return dependencies.filter((dependency) => {
    if (dependency.state === 'open') return true;
    if (dependency.state === 'closed' && dependency.state_reason === 'completed') return false;
    die(`native dependency #${dependency.number || dependency.id || 'unknown'} has unverified state ${dependency.state}/${dependency.state_reason || 'unknown'}`);
  });
}

function nativeBlockers(issueNumber) {
  let raw;
  try {
    raw = execFileSync('gh', ['--repo', REPO, 'api', `repos/${REPO}/issues/${issueNumber}/dependencies/blocked_by`, '--paginate', '--slurp'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    die(`cannot verify native issue dependencies: ${error.stderr?.toString().trim() || error.message}`);
  }
  let pages;
  try { pages = JSON.parse(raw); } catch (error) { die(`malformed native dependency response: ${error.message}`); }
  if (!Array.isArray(pages)) die('native dependency response is not paginated JSON');
  return activeDependencies(pages.flatMap((page) => {
    if (!Array.isArray(page)) die('native dependency page is not an array');
    return page;
  }));
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

function statusPaths() {
  const records = gitRaw(['status', '--porcelain=v1', '-z']).split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    paths.push(record.slice(3));
    if (status.includes('R') || status.includes('C')) {
      index += 1;
      paths.push(records[index]);
    }
  }
  return paths.filter(Boolean);
}

function checkExactPaths(paths) {
  const expected = [...new Set(paths.map(shellSafePath))].sort();
  if (!expected.length) die('at least one explicit --path is required');
  const staged = gitPathList(['diff', '--cached', '--name-only']).sort();
  if (staged.length) die(`index already has staged paths: ${staged.join(', ')}`);
  const changed = statusPaths().sort();
  const outside = changed.filter((path) => !expected.includes(path));
  if (outside.length) die(`working tree changes outside explicit paths: ${outside.join(', ')}`);
  return expected;
}

function validateChecks(checks, prNumber = 'PR') {
  if (!Array.isArray(checks) || checks.length === 0) die(`${prNumber} has no checks; cannot claim CI green`);
  const expected = checks.filter((check) => check.name === 'Build & Test');
  if (expected.length !== 1) die(`${prNumber} expected one CIC Build & Test check, found ${expected.length}`);
  const incomplete = checks.filter((check) => check.bucket !== 'pass' || check.state !== 'SUCCESS');
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
  if (pr.state === 'OPEN' && pr.baseRefName === CONFIG.base_branch) return { ...pr, baseForStack: pr.headRefName };
  if (pr.state === 'MERGED' && pr.baseRefName === CONFIG.base_branch) return { ...pr, baseForStack: CONFIG.base_branch };
  die(`baseline PR #${CONFIG.baseline_pr} is ${pr.state}/${pr.baseRefName}; cannot choose automation base`);
}
function remoteBaseSha(branch) {
  const output = gitRaw(['ls-remote', 'origin', `refs/heads/${branch}`]).trim();
  const sha = output.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) die(`cannot verify remote base ${branch}`);
  return sha;
}

function taskBase() {
  const dependency = baseline();
  return dependency.state === 'OPEN' ? { base: dependency.baseForStack, sha: dependency.headRefOid } : { base: CONFIG.base_branch, sha: remoteBaseSha(CONFIG.base_branch) };
}

function writeState(issue, data) {
  mkdirSync(STATE_ROOT, { recursive: true });
  const path = join(STATE_ROOT, `${issue.number}.json`);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function readState(issueNumber) {
  const path = join(STATE_ROOT, `${issueNumber}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function validateDelivery(issue, pr) {
  if (pr.state !== 'MERGED' || !pr.mergedAt || !pr.mergeCommit) die(`PR #${pr.number || 'unknown'} is not fully merged`);
  if (pr.baseRefName !== CONFIG.base_branch) die(`PR #${pr.number} base is ${pr.baseRefName}, expected ${CONFIG.base_branch}`);
  if (pr.url && !pr.url.startsWith(`https://github.com/${REPO}/pull/`)) die(`PR belongs to another repository: ${pr.url}`);
  const linked = Array.isArray(pr.closingIssuesReferences) && pr.closingIssuesReferences.some((ref) => ref.number === issue.number && (!ref.repository?.nameWithOwner || ref.repository.nameWithOwner === REPO));
  if (!linked) die(`PR #${pr.number} is not linked to ${issue.url}`);
  if (issue.state !== 'CLOSED' || (issue.stateReason && issue.stateReason !== 'COMPLETED')) die(`issue ${issue.url} is not completed after merge`);
  if (!pr.body || !/##\s+(Verification|Acceptance)/i.test(pr.body)) die(`PR #${pr.number} lacks acceptance/verification evidence`);
  return { issue, pr };
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
  if (!flags['dry-run']) assertWriteContext(issue, { requireTaskState: false });
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
  mutateStatus(issue, 'Ready');
  console.log(`imported: ${issue.url}`);
}

function pickCommand(args) {
  return withLock(() => {
    const { positional, flags } = parseArgs(args);
    const issue = resolveIssue(positional[0]);
    assertPickable(issue);
    const state = readState(issue.number);
    if (state && (state.repo !== REPO || state.issue !== issue.url || state.number !== issue.number)) die(`task state identity mismatch for ${issue.url}`);
    const worktree = state?.worktree || join(dirname(MAIN_ROOT), `${basename(MAIN_ROOT)}-task-${issue.number}`);
    const branch = state?.branch || `task/${issue.number}`;
    const base = state ? { base: state.base, sha: state.baseSha } : taskBase();
    if (existsSync(worktree)) {
      const known = git(['-C', worktree, 'rev-parse', '--show-toplevel']);
      if (resolve(known) !== resolve(worktree)) die(`existing task path is not expected worktree: ${worktree}`);
      if (git(['-C', worktree, 'remote', 'get-url', 'origin']).replace(/\.git$/, '') !== `https://github.com/${REPO}`) die(`existing worktree origin does not match ${REPO}`);
      if (state?.branch && git(['-C', worktree, 'branch', '--show-current']) !== branch) die(`existing task branch does not match state: ${branch}`);
    } else if (!flags['dry-run']) {
      git(['worktree', 'add', '-b', branch, worktree, base.sha]);
    } else {
      console.log(`[dry-run] create worktree ${worktree} on ${branch} from ${base.sha}`);
    }
    if (!flags['dry-run']) {
      writeState(issue, { repo: REPO, issue: issue.url, number: issue.number, branch, worktree, base: base.base, baseSha: base.sha, stage: 'worktree-created' });
      mutateStatus(issue, 'In Progress');
      writeState(issue, { repo: REPO, issue: issue.url, number: issue.number, branch, worktree, base: base.base, baseSha: base.sha, stage: 'in-progress' });
      console.log(JSON.stringify({ issue: issue.url, branch, worktree, baseSha: base.sha, status: 'In Progress' }, null, 2));
    }
  });
}

function reviewCommand(args) {
  const { positional, flags } = parseArgs(args);
  const issue = resolveIssue(positional[0]);
  if (flags['dry-run']) {
    mutateStatus(issue, 'Review', true);
    return;
  }
  assertWriteContext(issue);
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
  assertWriteContext(issue);
  updateLabels(issue, ['status:blocked'], ['status:ready', 'status:review']);
  mutateStatus(issue, 'Blocked');
  console.log(`Blocked: ${issue.url}\nReason: ${flags.reason}`);
}

function doneCommand(args) {
  const { positional, flags } = parseArgs(args);
  if (!flags.pr) die('done requires --pr <number>');
  const issue = resolveIssue(positional[0]);
  const pr = json(gh(['pr', 'view', String(flags.pr), '--json', 'number,state,mergedAt,mergeCommit,baseRefName,headRefOid,closingIssuesReferences,url,body']));
  validateDelivery(issue, pr);
  if (flags['dry-run']) {
    console.log(`[dry-run] reconcile ${issue.url} and PR #${flags.pr} to Done`);
    return;
  }
  mutateStatus(issue, 'Done');
  updateLabels(issue, [], ['status:ready', 'status:review', 'status:blocked']);
  console.log(`Done: ${issue.url}`);
}

function taskDoneCommand(args) {
  return withLock(() => {
    const { positional, flags } = parseArgs(args);
    const issue = resolveIssue(positional[0]);
    assertWriteContext(issue);
    const paths = String(flags.paths || '').split(',').filter(Boolean);
    const exactPaths = checkExactPaths(paths);
    if (!flags['commit-message']) die('task-done requires --commit-message');
    if (!flags['body-file']) die('task-done requires --body-file with task-specific PR body');
    const bodyPath = resolve(ROOT, flags['body-file']);
    if (!existsSync(bodyPath)) die(`PR body file not found: ${flags['body-file']}`);
    const body = readFileSync(bodyPath, 'utf8');
    if (!/##\s+(Problem|Changes)/i.test(body) || !/##\s+(Verification|Acceptance)/i.test(body)) die('PR body must include Problem/Changes and Verification/Acceptance sections');
    const before = git(['rev-parse', 'HEAD']);
    const commands = [
      ['npm', ['ci']], ['npm', ['run', 'lint']], ['npm', ['run', 'typecheck']], ['npm', ['test']],
      ['npm', ['run', 'validate:fixtures']], ['npm', ['run', 'build']],
    ];
    for (const [command, commandArgs] of commands) {
      const result = spawnSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit', env: process.env });
      if (result.status !== 0) die(`${command} ${commandArgs.join(' ')} failed`);
    }
    git(['add', '--', ...exactPaths]);
    const staged = gitPathList(['diff', '--cached', '--name-only']).sort();
    if (JSON.stringify(staged) !== JSON.stringify(exactPaths)) die(`staged paths mismatch: expected ${exactPaths.join(', ')}, got ${staged.join(', ')}`);
    git(['diff', '--cached', '--check']);
    git(['commit', '-m', flags['commit-message']]);
    const testedHead = git(['rev-parse', 'HEAD']);
    if (testedHead === before) die('commit did not advance HEAD');
    const leftover = statusPaths();
    if (leftover.length) die(`commit left working-tree changes: ${leftover.join(', ')}`);
    const branch = git(['branch', '--show-current']);
    if (!branch || branch === CONFIG.base_branch || branch === 'master') die(`delivery cannot push branch ${branch || 'detached HEAD'}`);
    git(['push', '--set-upstream', 'origin', branch]);
    const base = baseline().baseForStack;
    const prs = json(gh(['pr', 'list', '--head', branch, '--json', 'number,url,state,baseRefName,headRefOid,body']));
    let pr = prs.filter((candidate) => candidate.state === 'OPEN').find((candidate) => candidate.baseRefName === base);
    if (!pr) {
      const createArgs = ['pr', 'create', '--base', base, '--head', branch, '--title', flags.title || flags['commit-message'], '--body-file', bodyPath];
      if (base !== CONFIG.base_branch) createArgs.push('--draft');
      const url = gh(createArgs);
      pr = json(gh(['pr', 'view', url, '--json', 'number,url,state,baseRefName,headRefOid,body']));
    }
    if (pr.baseRefName !== base) die(`PR #${pr.number} base ${pr.baseRefName} does not match ${base}`);
    if (pr.headRefOid !== testedHead) die(`PR #${pr.number} HEAD ${pr.headRefOid} does not match tested HEAD ${testedHead}`);
    waitForCi(pr.number);
    const verified = json(gh(['pr', 'view', String(pr.number), '--json', 'headRefOid']));
    if (verified.headRefOid !== testedHead) die(`PR #${pr.number} HEAD changed during CI: ${verified.headRefOid}`);
    updateLabels(issue, ['status:review'], ['status:ready', 'status:blocked']);
    mutateStatus(issue, 'Review');
    writeState(issue, { repo: REPO, issue: issue.url, number: issue.number, branch, worktree: ROOT, head: testedHead, pr: pr.url, base, stage: 'review' });
    console.log(JSON.stringify({ issue: issue.url, pr: pr.url, base, head: testedHead, status: 'Review' }, null, 2));
  });
}

function mergeCommand(args) {
  return withLock(() => {
    const { positional, flags } = parseArgs(args);
    if (!flags.pr || !flags['approved-head']) die('task-merge requires --pr <number> --approved-head <sha>');
    const issue = resolveIssue(positional[0]);
    const fields = 'number,state,mergedAt,mergeCommit,baseRefName,headRefOid,closingIssuesReferences,url,body';
    let pr = json(gh(['pr', 'view', String(flags.pr), '--json', fields]));
    if (pr.state === 'MERGED') {
      validateDelivery(issue, pr);
      if (flags['dry-run']) { console.log(`[dry-run] reconcile merged PR #${flags.pr}`); return; }
      mutateStatus(issue, 'Done');
      updateLabels(issue, [], ['status:ready', 'status:review', 'status:blocked']);
      console.log(JSON.stringify({ issue: issue.url, pr: pr.url, state: 'MERGED', status: 'Done' }, null, 2));
      return;
    }
    assertWriteContext(issue);
    validateMergeGuard(pr, flags['approved-head']);
    ciChecks(flags.pr);
    if (flags['dry-run']) { console.log(`[dry-run] merge PR #${flags.pr} at ${flags['approved-head']}`); return; }
    gh(['pr', 'merge', String(flags.pr), '--squash', '--match-head-commit', flags['approved-head']]);
    pr = json(gh(['pr', 'view', String(flags.pr), '--json', fields]));
    const issueAfter = resolveIssue(issue.number.toString());
    validateDelivery(issueAfter, pr);
    mutateStatus(issueAfter, 'Done');
    updateLabels(issueAfter, [], ['status:ready', 'status:review', 'status:blocked']);
    console.log(JSON.stringify({ issue: issue.url, pr: pr.url, state: 'MERGED', status: 'Done' }, null, 2));
  });
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
  task-done.sh <issue> --paths path1,path2 --commit-message MESSAGE --body-file PR_BODY [--title "PR title"]
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

export { activeDependencies, assertRepoUrl, checkExactPaths, ciChecks, parseArgs, projectSnapshot, trackingStatus, validateChecks, validateDelivery, validateMergeGuard };
if (process.argv[1] === fileURLToPath(import.meta.url)) main();

# Tracking Resume / Idempotency

Run from repository root. Commands are read-first and safe to rerun; mutations must query by stable marker/name before create.

```bash
# Read current local and remote state
git status --short --branch
git remote -v
gh auth status
gh repo view --json nameWithOwner,visibility,defaultBranchRef,url
gh issue list --state all --limit 100 --json number,title,state,url,labels,milestone
 gh project list --owner anajibalm --format json
```

## Manifest validation

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync('docs/tracking/github-issues.manifest.json', 'utf8'));
const keys = new Set();
for (const item of manifest.items) {
  if (keys.has(item.stable_key)) throw new Error(`duplicate key: ${item.stable_key}`);
  keys.add(item.stable_key);
  for (const dep of item.dependency_keys) if (!manifest.items.some((candidate) => candidate.stable_key === dep)) throw new Error(`${item.stable_key} references unknown ${dep}`);
}
function visit(key, path = []) {
  if (path.includes(key)) throw new Error(`dependency cycle: ${[...path, key].join(' -> ')}`);
  const item = manifest.items.find((candidate) => candidate.stable_key === key);
  for (const dep of item.dependency_keys) visit(dep, [...path, key]);
}
for (const item of manifest.items) visit(item.stable_key);
console.log(JSON.stringify({items: manifest.items.length, keys: [...keys]}, null, 2));
NODE
```

## Issue sync

For each item, search all open and closed issues for `<!-- cic-tracking-key:KEY -->` before creating. Reuse matching issue; never delete/recreate. Save URL/number/node ID and update only generated body sections.

```bash
gh issue list --state all --limit 100 --search "cic-tracking-key"
```

Project item sync requires `project` scope. Use project number from `gh project list`, then:

```bash
gh project item-list PROJECT_NUMBER --owner anajibalm --limit 100 --format json
gh project item-add PROJECT_NUMBER --owner anajibalm --url ISSUE_URL --format json
gh project item-edit PROJECT_NUMBER --owner anajibalm --url ISSUE_URL --field Status --value Ready
```

Native issue dependency flags are supported by `gh issue create --blocked-by` / `--blocking`. `gh issue edit` exposes no dependency flags in installed CLI; verify relationships through issue API/UI before claiming them configured.

No command in this entrypoint stages, commits, pushes, deploys, uploads source/media, or freezes v0.2.

import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export async function resolveAuthorizedArtifact(
  storageRoot: string,
  contentId: string,
  requestedFile: string,
  authorizedPaths: readonly string[],
): Promise<string | null> {
  if (!UUID.test(contentId) || requestedFile === '' || requestedFile.includes('\0')) return null;
  const lexicalRoot = resolve(storageRoot);
  const lexicalContentRoot = resolve(lexicalRoot, contentId);
  const lexicalCandidate = resolve(lexicalContentRoot, requestedFile);
  if (!inside(lexicalRoot, lexicalContentRoot) || !inside(lexicalContentRoot, lexicalCandidate)) return null;

  let root: string;
  let contentRoot: string;
  let candidate: string;
  try {
    root = await realpath(lexicalRoot);
    contentRoot = await realpath(lexicalContentRoot);
    candidate = await realpath(lexicalCandidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (!inside(root, contentRoot) || !inside(contentRoot, candidate)) return null;

  const authorized = await Promise.all(authorizedPaths.map(async (path) => {
    try {
      return await realpath(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }));
  return authorized.includes(candidate) ? candidate : null;
}

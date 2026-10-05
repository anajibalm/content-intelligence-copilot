// Temporary media cleanup. Deletes ONLY paths explicitly marked temporary:true.
import { unlink } from 'node:fs/promises';

export interface CleanupResult {
  deleted: string[];
  skipped: string[];
}

/** Runtime-unsafe input shape: any object carrying a path + optional flag. */
interface MediaRefLike {
  path?: unknown;
  temporary?: unknown;
}

/**
 * Delete temporary media files. Paths not explicitly marked `temporary: true`
 * are never deleted, regardless of type-level annotations (contract §18).
 * Missing files are skipped, not errors.
 */
export async function cleanupTemporaryMedia(
  refs: readonly MediaRefLike[],
): Promise<CleanupResult> {
  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const ref of refs) {
    if (!ref || typeof ref.path !== 'string' || ref.temporary !== true) {
      if (ref && typeof ref.path === 'string') {
        skipped.push(ref.path);
      }
      continue;
    }
    try {
      await unlink(ref.path);
      deleted.push(ref.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        skipped.push(ref.path);
      } else {
        throw error;
      }
    }
  }
  return { deleted, skipped };
}

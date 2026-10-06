import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { NextResponse } from 'next/server';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contentId = url.searchParams.get('contentId');
  const file = url.searchParams.get('file');
  const storageRoot = process.env.CIC_STORAGE_ROOT;
  if (!contentId || !file || !storageRoot) return NextResponse.json({ error: 'artifact parameters are unavailable' }, { status: 400 });
  const root = resolve(storageRoot, contentId);
  const candidate = resolve(root, file);
  const rel = relative(root, candidate);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return NextResponse.json({ error: 'artifact path is invalid' }, { status: 400 });
  try {
    const info = await stat(candidate);
    if (!info.isFile()) return NextResponse.json({ error: 'artifact is not a file' }, { status: 404 });
    return new Response(await readFile(candidate), {
      headers: {
        'content-type': MIME_TYPES[candidate.slice(candidate.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return NextResponse.json({ error: 'artifact not found' }, { status: 404 });
    return NextResponse.json({ error: 'artifact unavailable' }, { status: 500 });
  }
}

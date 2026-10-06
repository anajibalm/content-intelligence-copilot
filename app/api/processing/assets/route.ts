import { readFile, stat } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { createDefaultAcquirer } from '../../../../lib/acquisition/index.ts';
import { createPostgresRuntimeFromEnv } from '../../../../lib/runtime/postgres.ts';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contentId = url.searchParams.get('contentId');
  const file = url.searchParams.get('file');
  if (!contentId || !file) return NextResponse.json({ error: 'artifact parameters are unavailable' }, { status: 400 });
  const runtime = createPostgresRuntimeFromEnv(createDefaultAcquirer());
  try {
    const path = await runtime.resolveArtifact(contentId, file);
    if (!path) return NextResponse.json({ error: 'artifact not found' }, { status: 404 });
    const info = await stat(path);
    if (!info.isFile()) return NextResponse.json({ error: 'artifact is not a file' }, { status: 404 });
    return new Response(await readFile(path), {
      headers: {
        'content-type': MIME_TYPES[path.slice(path.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status: 500 });
  } finally {
    await runtime.close();
  }
}

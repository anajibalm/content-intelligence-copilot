import { NextResponse } from 'next/server';
import { createDefaultAcquirer } from '../../../../../lib/acquisition/index.ts';
import { createPostgresRuntimeFromEnv } from '../../../../../lib/runtime/postgres.ts';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !("frameId" in body) || typeof body.frameId !== 'string' || body.frameId === '') {
    return NextResponse.json({ error: 'frameId must be a non-empty string' }, { status: 400 });
  }
  const runtime = createPostgresRuntimeFromEnv(createDefaultAcquirer());
  try {
    const job = await runtime.get(id, null);
    if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 });
    if (!(await runtime.addAnchor({ contentId: job.contentId, frameId: body.frameId, note: 'Analyst-confirmed product entry' }))) return NextResponse.json({ error: 'frame not found in workspace content' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status: 502 });
  } finally {
    await runtime.close();
  }
}

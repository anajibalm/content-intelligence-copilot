import { NextResponse } from 'next/server';
import { createPostgresRuntimeFromEnv } from '../../../../../../lib/runtime/postgres.ts';
import { createDefaultAcquirer } from '../../../../../../lib/acquisition/index.ts';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).decision !== 'string' || typeof (body as Record<string, unknown>).reviewer !== 'string') {
    return NextResponse.json({ error: 'decision and reviewer are required' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (!['CONFIRM', 'CORRECT', 'REJECT'].includes(String(input.decision))) return NextResponse.json({ error: 'invalid decision' }, { status: 400 });
  const runtime = createPostgresRuntimeFromEnv(createDefaultAcquirer());
  try {
    await runtime.reviewFeature({
      contentFeatureId: id,
      decision: input.decision as 'CONFIRM' | 'CORRECT' | 'REJECT',
      reviewer: String(input.reviewer),
      value: typeof input.value === 'string' ? input.value : undefined,
      reasonCode: typeof input.reasonCode === 'string' ? input.reasonCode : undefined,
      note: typeof input.note === 'string' ? input.note : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status: 404 });
  } finally {
    await runtime.close();
  }
}

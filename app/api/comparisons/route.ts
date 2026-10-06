import { NextResponse } from 'next/server';
import { ComparisonNotFoundError, comparisonConfigFromEnv, createComparisonRepository } from '../../../lib/compare/postgres.ts';

export const dynamic = 'force-dynamic';

const MODES = new Set(['CONTROLLED', 'PERFORMANCE_CONTRAST', 'MANUAL']);
const SCOPES = new Set(['PAIR', 'GROUP', 'BATCH']);
const DISTRIBUTIONS = new Set(['ORGANIC', 'PAID']);

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'request body must be valid JSON' }, { status: 400 });
  }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const contentIds = Array.isArray(input.contentIds) && input.contentIds.every(text) ? input.contentIds : null;
  if (!text(input.batchId) || !contentIds || !text(input.mode) || !MODES.has(input.mode) || !text(input.scope) || !SCOPES.has(input.scope) || !text(input.distribution) || !DISTRIBUTIONS.has(input.distribution)) {
    return NextResponse.json({ error: 'batchId, contentIds, mode, scope, and distribution are required' }, { status: 400 });
  }
  const repository = createComparisonRepository(comparisonConfigFromEnv());
  try {
    const result = await repository.create({
      batchId: input.batchId,
      contentIds,
      mode: input.mode as 'CONTROLLED' | 'PERFORMANCE_CONTRAST' | 'MANUAL',
      scope: input.scope as 'PAIR' | 'GROUP' | 'BATCH',
      distribution: input.distribution as 'ORGANIC' | 'PAID',
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof ComparisonNotFoundError ? error.statusCode : 422;
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status });
  } finally {
    await repository.close();
  }
}

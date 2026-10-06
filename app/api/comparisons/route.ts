import { NextResponse } from 'next/server';
import { ComparisonNotFoundError, comparisonConfigFromEnv, createComparisonRepository } from '../../../lib/compare/postgres.ts';

export const dynamic = 'force-dynamic';

const MODES: Record<string, true> = { CONTROLLED: true, PERFORMANCE_CONTRAST: true, MANUAL: true };
const SCOPES: Record<string, true> = { PAIR: true, GROUP: true, BATCH: true };
const DISTRIBUTIONS: Record<string, true> = { ORGANIC: true, PAID: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
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
  if (!validUuid(input.batchId) || !contentIds || contentIds.length < 2 || !contentIds.every(validUuid) || new Set(contentIds).size !== contentIds.length || !text(input.mode) || !MODES[input.mode] || !text(input.scope) || !SCOPES[input.scope] || !text(input.distribution) || !DISTRIBUTIONS[input.distribution]) {
    return NextResponse.json({ error: 'valid batchId, unique contentIds, mode, scope, and distribution are required' }, { status: 400 });
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
    return NextResponse.json({ error: error instanceof ComparisonNotFoundError ? error.message : 'comparison could not be created' }, { status });
  } finally {
    await repository.close();
  }
}

export async function GET(request: Request) {
  const comparisonId = new URL(request.url).searchParams.get('comparisonId');
  if (!validUuid(comparisonId)) return NextResponse.json({ error: 'valid comparisonId is required' }, { status: 400 });
  const repository = createComparisonRepository(comparisonConfigFromEnv());
  try {
    return NextResponse.json(await repository.get(comparisonId));
  } catch (error) {
    const status = error instanceof ComparisonNotFoundError ? error.statusCode : 422;
    return NextResponse.json({ error: error instanceof ComparisonNotFoundError ? error.message : 'comparison could not be read' }, { status });
  } finally {
    await repository.close();
  }
}

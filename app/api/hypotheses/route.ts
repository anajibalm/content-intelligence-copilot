import { NextResponse } from 'next/server';
import {
  HypothesisNotFoundError,
  HypothesisProviderError,
  HypothesisValidationError,
  createHypothesisRepository,
  hypothesisConfigFromEnv,
  type HypothesisRepository,
} from '../../../lib/hypothesis/postgres.ts';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function statusFor(error: unknown) {
  if (error instanceof HypothesisNotFoundError) return error.statusCode;
  if (error instanceof HypothesisValidationError) return error.statusCode;
  if (error instanceof HypothesisProviderError) return error.statusCode;
  return 422;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'request body must be valid JSON' }, { status: 400 });
  }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (!validUuid(input.batchId) || !validUuid(input.comparisonId)) return NextResponse.json({ error: 'valid batchId and comparisonId are required' }, { status: 400 });
  let repository: HypothesisRepository | null = null;
  try {
    repository = createHypothesisRepository(hypothesisConfigFromEnv());
    return NextResponse.json(await repository.create({ batchId: input.batchId, comparisonId: input.comparisonId }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'hypothesis could not be created' }, { status: statusFor(error) });
  } finally {
    await repository?.close();
  }
}

export async function GET(request: Request) {
  const hypothesisId = new URL(request.url).searchParams.get('hypothesisId');
  if (!validUuid(hypothesisId)) return NextResponse.json({ error: 'valid hypothesisId is required' }, { status: 400 });
  let repository: HypothesisRepository | null = null;
  try {
    repository = createHypothesisRepository(hypothesisConfigFromEnv());
    return NextResponse.json(await repository.get(hypothesisId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'hypothesis could not be read' }, { status: statusFor(error) });
  } finally {
    await repository?.close();
  }
}

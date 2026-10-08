import { NextResponse } from 'next/server';
import {
  HypothesisNotFoundError,
  HypothesisProviderError,
  HypothesisValidationError,
  createHypothesisRepository,
  hypothesisConfigFromEnv,
  type HypothesisRepository,
} from '../../../lib/hypothesis/postgres.ts';
import { operationIdFromRequest, validOperationId } from '../../../lib/hypothesis/request.ts';

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

function messageFor(error: unknown) {
  if (error instanceof HypothesisNotFoundError || error instanceof HypothesisValidationError || error instanceof HypothesisProviderError) return error.message;
  return 'hypothesis request failed validation or persistence';
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'request body must be valid JSON' }, { status: 400 });
  }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const operationId = operationIdFromRequest(input, request.headers.get('idempotency-key'));
  if (!validUuid(input.batchId) || !validUuid(input.comparisonId) || (input.regenerate !== undefined && typeof input.regenerate !== 'boolean') || !validOperationId(operationId)) return NextResponse.json({ error: 'valid batchId and comparisonId are required; regenerate must be boolean; operationId must be UUID' }, { status: 400 });
  let repository: HypothesisRepository | null = null;
  try {
    repository = createHypothesisRepository(hypothesisConfigFromEnv());
    return NextResponse.json(await repository.create({ batchId: input.batchId, comparisonId: input.comparisonId, regenerate: input.regenerate === true, operationId: operationId as string | undefined }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  } finally {
    await repository?.close();
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const hypothesisId = params.get('hypothesisId');
  const batchId = params.get('batchId');
  if (batchId && !validUuid(batchId)) return NextResponse.json({ error: 'valid batchId is required' }, { status: 400 });
  if (hypothesisId ? !validUuid(hypothesisId) : !validUuid(batchId)) return NextResponse.json({ error: 'valid hypothesisId or batchId is required' }, { status: 400 });
  let repository: HypothesisRepository | null = null;
  try {
    repository = createHypothesisRepository(hypothesisConfigFromEnv());
    if (!hypothesisId) return NextResponse.json({ items: await repository.list(batchId!) });
    const hypothesis = await repository.get(hypothesisId);
    if (batchId && hypothesis.batchId !== batchId) throw new HypothesisNotFoundError('hypothesis not found in selected batch');
    return NextResponse.json(hypothesis);
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  } finally {
    await repository?.close();
  }
}

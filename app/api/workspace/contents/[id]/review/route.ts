import { NextResponse } from 'next/server';
import { createReviewRepository, reviewConfigFromEnv, type ReviewRepository } from '../../../../../../lib/review/postgres.ts';
import { ReviewNotFoundError, ReviewValidationError } from '../../../../../../lib/review/rules.ts';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function statusFor(error: unknown) {
  if (error instanceof ReviewValidationError) return error.statusCode;
  if (error instanceof ReviewNotFoundError) return error.statusCode;
  return 500;
}

/**
 * Content-level analyst review: Confirm All / Correct fields / Reject All.
 * POST appends review rows for the unreviewed features of one content; GET returns
 * the append-only review and correction history for that content.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validUuid(id)) return NextResponse.json({ error: 'valid content id is required' }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'request body must be a JSON object' }, { status: 400 });
  let repository: ReviewRepository | null = null;
  try {
    repository = createReviewRepository(reviewConfigFromEnv());
    return NextResponse.json(await repository.reviewContent(id, body as Record<string, unknown>), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ReviewValidationError || error instanceof ReviewNotFoundError ? error.message : 'Content review unavailable' }, { status: statusFor(error) });
  } finally {
    await repository?.close();
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validUuid(id)) return NextResponse.json({ error: 'valid content id is required' }, { status: 400 });
  let repository: ReviewRepository | null = null;
  try {
    repository = createReviewRepository(reviewConfigFromEnv());
    return NextResponse.json(await repository.contentHistory(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof ReviewValidationError || error instanceof ReviewNotFoundError ? error.message : 'Content review history unavailable' }, { status: statusFor(error) });
  } finally {
    await repository?.close();
  }
}

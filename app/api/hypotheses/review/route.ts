import { NextResponse } from 'next/server';
import { createReviewRepository, reviewConfigFromEnv, type ReviewRepository } from '../../../../lib/review/postgres.ts';
import { ReviewNotFoundError, ReviewValidationError } from '../../../../lib/review/rules.ts';

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
 * Hypothesis analyst review: Approve / Edit / Reject. The hypothesis row and its
 * evidence links are append-only, so an edited statement is stored on the review row.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'request body must be a JSON object' }, { status: 400 });
  if (!validUuid((body as Record<string, unknown>).hypothesisId)) return NextResponse.json({ error: 'valid hypothesisId is required' }, { status: 400 });
  let repository: ReviewRepository | null = null;
  try {
    repository = createReviewRepository(reviewConfigFromEnv());
    return NextResponse.json(await repository.reviewHypothesis(body as Record<string, unknown>), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ReviewValidationError || error instanceof ReviewNotFoundError ? error.message : 'Hypothesis review unavailable' }, { status: statusFor(error) });
  } finally {
    await repository?.close();
  }
}

export async function GET(request: Request) {
  const hypothesisId = new URL(request.url).searchParams.get('hypothesisId');
  if (!validUuid(hypothesisId)) return NextResponse.json({ error: 'valid hypothesisId is required' }, { status: 400 });
  let repository: ReviewRepository | null = null;
  try {
    repository = createReviewRepository(reviewConfigFromEnv());
    return NextResponse.json({ hypothesisId, reviews: await repository.hypothesisHistory(hypothesisId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ReviewValidationError || error instanceof ReviewNotFoundError ? error.message : 'Hypothesis review history unavailable' }, { status: statusFor(error) });
  } finally {
    await repository?.close();
  }
}

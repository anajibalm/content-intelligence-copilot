import { NextResponse } from 'next/server';
import { createReviewRepository, reviewConfigFromEnv, type ReviewRepository } from '../../../../../../lib/review/postgres.ts';
import { ReviewNotFoundError, ReviewValidationError } from '../../../../../../lib/review/rules.ts';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Single-feature review. The content-level route (…/contents/[id]/review) is the analyst UX;
 * this endpoint keeps per-feature decisions on the same rule path. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'valid content feature id is required' }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'request body must be a JSON object' }, { status: 400 });
  let repository: ReviewRepository | null = null;
  try {
    repository = createReviewRepository(reviewConfigFromEnv());
    return NextResponse.json(await repository.reviewFeature(id, body as Record<string, unknown>));
  } catch (error) {
    const status = error instanceof ReviewValidationError ? 400 : error instanceof ReviewNotFoundError ? 404 : 500;
    return NextResponse.json({ error: error instanceof ReviewValidationError || error instanceof ReviewNotFoundError ? error.message : 'Feature review unavailable' }, { status });
  } finally {
    await repository?.close();
  }
}

import { NextResponse } from 'next/server';
import { createS10Repository, s10ConfigFromEnv, type S10Repository } from '../../../../../../../lib/s10/postgres.ts';
import { S10NotFoundError, S10ValidationError } from '../../../../../../../lib/s10/rules.ts';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function statusFor(error: unknown) { return error instanceof S10NotFoundError ? 404 : error instanceof S10ValidationError ? 400 : 500; }
function messageFor(error: unknown) { if (error instanceof S10NotFoundError || error instanceof S10ValidationError) return error.message; return 'note unavailable'; }
export async function PATCH(request: Request, context: { params: Promise<{ id: string; noteId: string }> }) {
  const { id, noteId } = await context.params;
  if (!UUID.test(id) || !UUID.test(noteId)) return NextResponse.json({ error: 'valid hypothesisId and noteId are required' }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'request body must be a JSON object' }, { status: 400 });
  let repository: S10Repository | null = null;
  try { repository = createS10Repository(s10ConfigFromEnv()); return NextResponse.json(await repository.updateNote(noteId, id, body as { body: unknown; author: unknown })); }
  catch (error) { return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) }); }
  finally { await repository?.close(); }
}

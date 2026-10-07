import { NextResponse } from 'next/server';
import { createS10Repository, s10ConfigFromEnv, type S10Repository } from '../../../../../lib/s10/postgres.ts';
import { S10NotFoundError, S10ValidationError } from '../../../../../lib/s10/rules.ts';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
function statusFor(error: unknown) { return error instanceof S10NotFoundError ? 404 : error instanceof S10ValidationError ? 400 : 500; }
function messageFor(error: unknown) { return error instanceof S10NotFoundError || error instanceof S10ValidationError ? error.message : 'S10 resource unavailable'; }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validUuid(id)) return NextResponse.json({ error: 'valid hypothesisId is required' }, { status: 400 });
  let repository: S10Repository | null = null;
  try { repository = createS10Repository(s10ConfigFromEnv()); return NextResponse.json({ hypothesisId: id, batches: await repository.listBatches(id), notes: await repository.listNotes(id), nextTests: await repository.listNextTests(id) }); }
  catch (error) { return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) }); }
  finally { await repository?.close(); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validUuid(id)) return NextResponse.json({ error: 'valid hypothesisId is required' }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'request body must be a JSON object' }, { status: 400 });
  const input = body as Record<string, unknown>;
  let repository: S10Repository | null = null;
  try {
    repository = createS10Repository(s10ConfigFromEnv());
    const kind = input.kind;
    if (kind === 'NOTE') return NextResponse.json(await repository.createNote(id, { body: input.body, author: input.author }), { status: 201 });
    if (kind === 'NEXT_TEST') return NextResponse.json(await repository.createNextTest(id, input as never), { status: 201 });
    return NextResponse.json({ error: 'kind must be NOTE or NEXT_TEST' }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) }); }
  finally { await repository?.close(); }
}

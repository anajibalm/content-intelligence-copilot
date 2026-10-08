import { NextResponse } from "next/server";
import { createDefaultAcquirer } from "../../../lib/acquisition/index.ts";
import { createPostgresRuntimeFromEnv } from "../../../lib/runtime/postgres.ts";

function runtime(batchId: string) {
  return createPostgresRuntimeFromEnv(createDefaultAcquirer(), undefined, batchId);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const batchId = url.searchParams.get('batchId');
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  const service = runtime(batchId);
  try {
    const jobs = await service.list(batchId);
    return NextResponse.json({ items: jobs.map(service.toPublic) });
  } catch (error) {
    const message = String((error as Error).message ?? error);
    return NextResponse.json({ error: message }, { status: message.includes('selected batch not found') ? 404 : 502 });
  } finally {
    await service.close();
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string' || body.url.trim() === '' || !('batchId' in body) || typeof body.batchId !== 'string' || body.batchId.trim() === '') {
    return NextResponse.json({ error: 'url and batchId are required' }, { status: 400 });
  }
  const service = runtime(body.batchId);
  try {
    const job = await service.enqueue(body.url, body.batchId);
    return NextResponse.json(service.toPublic(job), { status: 202 });
  } catch (error) {
    const message = String((error as Error).message ?? error);
    const status = message.includes('already belongs to batch') ? 409 : message.includes('selected batch not found') ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await service.close();
  }
}

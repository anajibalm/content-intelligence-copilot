import { NextResponse } from "next/server";
import { createDefaultAcquirer } from "../../../lib/acquisition/index.ts";
import { createPostgresRuntimeFromEnv } from "../../../lib/runtime/postgres.ts";

function runtime() {
  return createPostgresRuntimeFromEnv(createDefaultAcquirer());
}

export async function GET() {
  const service = runtime();
  try {
    const jobs = await service.list();
    return NextResponse.json({ items: jobs.map(service.toPublic) });
  } finally {
    await service.close();
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string" || body.url.trim() === "") {
    return NextResponse.json({ error: "url must be a non-empty string" }, { status: 400 });
  }
  const service = runtime();
  try {
    const job = await service.enqueue(body.url);
    return NextResponse.json(service.toPublic(job), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status: 502 });
  } finally {
    await service.close();
  }
}

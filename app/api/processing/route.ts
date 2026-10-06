import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import { createDefaultAcquirer } from "../../../lib/acquisition/index.ts";
import { createRuntimeService } from "../../../lib/runtime/service.ts";

function service() {
  const root = process.env.CIC_RUNTIME_ROOT ?? join(tmpdir(), "cic-staging-runtime");
  return createRuntimeService({
    storePath: join(root, "runtime.json"),
    outputRoot: join(root, "outputs"),
    acquirer: createDefaultAcquirer(),
  });
}

export async function GET() {
  return NextResponse.json({ items: service().list() });
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string" || body.url.trim() === "") {
    return NextResponse.json({ error: "url must be a non-empty string" }, { status: 400 });
  }
  try {
    const record = await service().processUrl(body.url);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    const record = "record" in Object(error) ? Object(error).record : undefined;
    return NextResponse.json({ error: String((error as Error).message), record }, { status: 502 });
  }
}

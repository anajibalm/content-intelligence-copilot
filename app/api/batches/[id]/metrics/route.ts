import { NextResponse } from 'next/server';
import { createMetricsRepository, metricsConfigFromEnv } from '../../../../../lib/metrics/postgres.ts';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repository = createMetricsRepository(metricsConfigFromEnv());
  try {
    const result = await repository.batch(id);
    if (!result) return NextResponse.json({ error: 'batch not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status: 500 });
  } finally {
    await repository.close();
  }
}

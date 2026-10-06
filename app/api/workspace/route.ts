import { NextResponse } from 'next/server';
import { createMetricsRepository } from '../../../lib/metrics/postgres.ts';
import { createWorkspaceRepository, workspaceConfigFromEnv } from '../../../lib/workspace/postgres.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const batchId = url.searchParams.get('batchId');
  const contentId = url.searchParams.get('contentId');
  const workspaceConfig = workspaceConfigFromEnv();
  const workspace = createWorkspaceRepository(workspaceConfig);
  const metrics = createMetricsRepository({ connectionString: workspaceConfig.connectionString, workspaceId: workspaceConfig.workspaceId });
  try {
    const data = await workspace.load(batchId, contentId);
    if (!data.selectedBatch) return NextResponse.json({ ...data, analysis: null });
    const analysis = await metrics.batch(data.selectedBatch.id);
    return NextResponse.json({ ...data, analysis });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status: 500 });
  } finally {
    await workspace.close();
    await metrics.close();
  }
}

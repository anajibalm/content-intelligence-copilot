import { createMetricsRepository, metricsConfigFromEnv } from '../lib/metrics/postgres.ts';

process.loadEnvFile('.env.local');
const contentIds = [
  'c22e660f-c6b3-4629-ade9-ca50e4f79bd9',
  '70047e7f-f9c0-46ef-9f40-60e458ea410d',
  '9a48cfe6-7f33-46f8-b178-fa732260ca82',
  '99962fb3-edd3-4448-8cc4-999b4c06ce87',
  '6bf24ba8-b812-4228-8f34-b7043bb1b4dc',
  '5474830f-4343-46b6-8af0-c79e285d137d',
  '8ceb2837-ee83-4473-934c-d62990561c4f',
  'fa077ea5-ef36-4f61-b450-5aed14166509',
  'c338b3f5-b451-4f69-bc66-7e1b7d29a298',
  '5b9bf05a-e0ab-45e7-84e9-11671354c7c8',
];
const config = metricsConfigFromEnv();
const databaseName = new URL(config.connectionString).pathname.slice(1);
if (databaseName !== 'cic_demo_task48_20261014') throw new Error(`refusing snapshot write outside demo DB: ${databaseName}`);
const batchId = '30000000-0000-0000-0000-000000000003';
const repository = createMetricsRepository(config);
try {
  const result = await repository.appendActualTikTokSnapshots(batchId, contentIds);
  console.log(JSON.stringify(result));
} finally {
  await repository.close();
}

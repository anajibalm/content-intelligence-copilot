import { expect, test } from '@playwright/test';

test('staging comparison to hypothesis exact source smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  const batchId = '51000000-0000-0000-0000-000000000002';
  const firstContentId = '51000000-0000-0000-0000-000000000101';
  const secondContentId = '51000000-0000-0000-0000-000000000102';
  await page.goto(`/?batchId=${batchId}`);
  await page.getByRole('button', { name: /Organic primary high/ }).click();
  await page.getByRole('button', { name: /Organic primary tie A/ }).click();
  await page.getByRole('button', { name: 'Generate comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Controlled comparison' })).toBeVisible();
  await page.getByRole('button', { name: 'Generate hypothesis' }).click();
  await expect(page.getByText(/Artifact /)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/confidence LOW|confidence MEDIUM|confidence HIGH/)).toBeVisible();
  await expect(page.getByText('Uji berikutnya yang disarankan')).toBeVisible();
  const exactLink = page.getByRole('link', { name: 'Buka sumber exact' }).first();
  await expect(exactLink).toBeVisible();
  await exactLink.click();
  await expect(page).toHaveURL(new RegExp(`batchId=${batchId}.*contentId=(${firstContentId}|${secondContentId})#metric-snapshot-`));
  expect(errors).toEqual([]);
});

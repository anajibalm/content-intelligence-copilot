import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import fixture from './fixtures/workspace.json';
import * as domainVocabulary from '../../lib/domain/types.ts';
import { ACQUISITION_FAILURE_REASONS } from '../../lib/acquisition/types.ts';

type View = 'batch' | 'library' | 'compare' | 'review';
type Violation = { rule: string; page: string; viewport: string; selector: string; measured: string; target: string };
type StyleToken = { fontSize: string; fontWeight: string; color: string; backgroundColor: string; borderRadius: string; borderWidth: string };
type StyleTokens = Record<string, StyleToken | null>;
type FixtureContent = { id: string; externalId: string; title: string | null; permalink: string; processingState: string; acquisitionState: string; acquisitionError: string | null; processingError: string | null; attemptCount: number; error: string | null; durationSeconds: number | null; hasFrameEvidence: boolean; snapshots: Array<{ id: string; distribution: string; rawMetrics: Record<string, number | null>; quality: string; qualityByMetric: Record<string, { state: string; reason: string | null }>; derivedMetrics: Record<string, { value: number | null }> }> };

const axePath = join(process.cwd(), 'node_modules/axe-core/axe.js');
const batch = fixture.batches[0] as { id: string; name: string; brandName: string; createdAt: string; contentCount: number; contractedVideoCount: number };
const hypothesisId = '93000000-0000-0000-0000-000000000001';
const comparisonId = '93000000-0000-0000-0000-000000000002';
const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
const views: View[] = ['batch', 'library', 'compare', 'review'];
const baseContents = fixture.contentsByBatch[batch.id as keyof typeof fixture.contentsByBatch] as unknown as FixtureContent[];
const validAcronyms: Record<string, true> = { KPI: true, WIB: true, ID: true, URL: true, AI: true };
const engineEnumValues: Record<string, true> = Object.fromEntries([
  ...Object.values(domainVocabulary).flatMap((value) => Array.isArray(value) ? value : []).filter((value): value is string => typeof value === 'string'),
  ...ACQUISITION_FAILURE_REASONS,
].map((value) => [value, true] as const));
const engineEnumValuesJson = JSON.stringify(engineEnumValues);
const validAcronymsJson = JSON.stringify(validAcronyms);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function detail(content: FixtureContent, withEvidence: boolean) {
  return {
    ...content,
    frames: withEvidence ? [{ id: 'hook', type: 'HOOK', timestampMs: 0, available: false, url: null }, { id: 'scene', type: 'SCENE', timestampMs: 3000, available: false, url: null }] : [],
    audio: { available: false, url: null },
    transcript: withEvidence ? [{ id: 'segment', startMs: 0, endMs: 1500, text: 'Synthetic opening transcript', role: 'HOOK' }] : [],
    anchors: [],
    extraction: [],
  };
}

function workspaceResponse(contentId: string | null) {
  const contents = baseContents.map((content, index) => index === 1 ? { ...clone(content), processingState: 'RUNNING', processingError: null, error: null } : clone(content));
  const selected = contents.find((content) => content.id === contentId) ?? contents[0]!;
  return {
    batches: fixture.batches,
    selectedBatch: batch,
    contents,
    selectedContent: detail(selected, selected.id === contents[0]!.id),
    analysis: { synthetic: true, ranking: { status: 'READY', reason: null, rankedGroups: [], excluded: [] }, kpis: [], snapshots: contents.flatMap((content) => content.snapshots) },
    synthetic: true,
  };
}

function evidence() {
  const source = baseContents[0]!;
  const snapshot = source.snapshots.find((item) => item.distribution === 'ORGANIC')!;
  const raw = Object.fromEntries(Object.entries(snapshot.rawMetrics).map(([key, value]) => [key, { value, quality: 'VALID' }]));
  const qualityJson = Object.fromEntries([...Object.keys(snapshot.rawMetrics), 'engagement_rate'].map((key) => [key, { state: 'VALID', reason: null }]));
  const basis = { sourceSnapshotId: snapshot.id, capturedAt: '2026-10-06T08:14:06.531Z', distribution: 'ORGANIC', source: 'synthetic fixture', rawObservations: raw, qualityJson, formulaVersion: 'metrics-v2' };
  return ['OBSERVED', 'DERIVED'].map((layer) => ({
    id: `evidence-${layer.toLowerCase()}`,
    layer,
    statement: `${layer}: Synthetic frozen snapshot observation`,
    role: 'SUPPORTING',
    source_type: 'METRIC_SNAPSHOT',
    source_id: snapshot.id,
    content_id: source.id,
    basis: { ...basis, statement: JSON.stringify(layer === 'OBSERVED' ? raw : snapshot.derivedMetrics) },
    captured_at: basis.capturedAt,
    currentSource: null,
    link: null,
  }));
}

function hypothesisDetail() {
  return {
    id: hypothesisId,
    batchId: batch.id,
    statement: 'Synthetic fixture hypothesis claim.',
    state: 'PENDING',
    confidence: 'LOW',
    confidenceCaps: [{ rule: 'INSUFFICIENT_SAMPLE', reason: 'sample size 2 is below threshold' }, { rule: 'ONE_COMPARISON', reason: 'one comparison is directional' }],
    suggestedNextTest: { action: 'Repeat with a controlled sample' },
    comparisons: [{ comparison_id: comparisonId, role: 'ORIGIN' }],
    provider: 'synthetic-fixture',
    model: 'synthetic-fixture',
    promptVersion: 'fixture',
    schemaVersion: 'fixture',
    ruleVersion: 'fixture',
    inputHash: 'fixture-hash',
    rawOutput: {},
    evidence: evidence(),
  };
}

function comparisonResult(body: Record<string, unknown> = {}) {
  const ids = Array.isArray(body.contentIds) ? body.contentIds as string[] : baseContents.slice(0, 2).map((content) => content.id);
  return {
    id: comparisonId,
    ruleVersion: 'compare-v1',
    mode: body.mode ?? 'CONTROLLED',
    scope: body.scope ?? 'PAIR',
    distribution: body.distribution ?? 'ORGANIC',
    quality: 'LOW',
    qualityReasons: ['INSUFFICIENT_SAMPLE'],
    snapshotIds: ids.map((id) => `snapshot-${id}`),
    controlledVariables: { same_format: null },
    uncontrolledVariables: {},
    items: ids.map((contentId, position) => ({ contentId, position, metricSnapshotId: `snapshot-${contentId}` })),
    metric: 'engagement_rate',
    basis: 'FROZEN',
    direction: 'DESC',
    tiePolicy: 'KEEP_ALL',
    metricRows: ids.map((contentId, position) => ({ contentId, metricSnapshotId: `snapshot-${contentId}`, metrics: [{ name: 'views', value: 1000 - position * 100, state: 'VALID', reason: null }] })),
  };
}

async function installApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const contentId = url.searchParams.get('contentId');
    if (url.pathname === '/api/workspace') return route.fulfill({ json: workspaceResponse(contentId) });
    if (url.pathname === '/api/processing') return route.fulfill({ json: { items: baseContents.map((content, index) => ({ id: `job-${index}`, contentId: content.id, status: index === 1 ? 'RUNNING' : index === 2 ? 'FAILED' : 'COMPLETED', attemptCount: index + 1, sourceUrl: content.permalink, error: index === 2 ? 'synthetic processing error' : null })) } });
    if (url.pathname === '/api/hypotheses' && request.method() === 'GET' && url.searchParams.has('hypothesisId')) return route.fulfill({ json: hypothesisDetail() });
    if (url.pathname === '/api/hypotheses' && request.method() === 'GET') return route.fulfill({ json: { items: [{ ...hypothesisDetail(), createdAt: '2026-10-06T08:14:06.531Z', contentIds: baseContents.slice(0, 2).map((content) => content.id), evidenceCount: 2, reviewDecision: null, reviewedStatement: null }] } });
    if (url.pathname === '/api/hypotheses/review') return route.fulfill({ json: { hypothesisId, reviews: [] } });
    if (url.pathname === '/api/comparisons' && request.method() === 'GET') return route.fulfill({ json: comparisonResult() });
    if (url.pathname === '/api/comparisons' && request.method() === 'POST') return route.fulfill({ status: 201, json: comparisonResult(request.postDataJSON() as Record<string, unknown>) });
    if (url.pathname.endsWith('/s10')) return route.fulfill({ json: { hypothesisId, batches: fixture.batches, notes: [], nextTests: [] } });
    if (url.pathname.includes('/contents/') && url.pathname.endsWith('/review')) return route.fulfill({ json: { reviews: [], corrections: [] } });
    return route.fulfill({ status: 500, json: { error: `Unmapped conformance API: ${url.pathname} ${request.method()}` } });
  });
}

function outputDirectory() {
  return process.env.CIC_UI_CONFORMANCE_OUTPUT?.replace(/^~/, homedir()) ?? join(homedir(), 'cic-evidence', 'conformance', process.env.CIC_UI_CONFORMANCE_BRANCH ?? 'local');
}

function pageSelector(element: Element) {
  if (element.id) return `#${element.id}`;
  const classes = [...element.classList].slice(0, 2).map((value) => `.${value}`).join('');
  return `${element.tagName.toLowerCase()}${classes}`;
}

async function browserRecords(page: Page, viewport: string, currentPage: string, rule: string, selector: string, target: string, script: string) {
  const results = await page.evaluate(({ ruleName, selectorText, targetText, check }) => {
    const safeCheck = check.replaceAll(String.fromCharCode(10), String.fromCharCode(92, 110)).replaceAll(String.fromCharCode(8), String.fromCharCode(92, 98));
    const isVisible = (element: Element) => { const style = getComputedStyle(element); return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0; };
    const pageSelector = (element: Element) => element.id ? '#' + element.id : element.tagName.toLowerCase() + [...element.classList].slice(0, 2).map((value) => '.' + value).join('');
    const fn = new Function('selectorText', 'isVisible', 'pageSelector', 'return (' + safeCheck + ')(selectorText);')(selectorText, isVisible, pageSelector) as Array<{ selector: string; measured: string }>;
    return fn.map((item) => ({ rule: ruleName, selector: item.selector, measured: item.measured, target: targetText }));
  }, { ruleName: rule, selectorText: selector, targetText: target, check: script }) as Array<{ rule: string; selector: string; measured: string; target: string }>;
  return results.map((item) => ({ ...item, page: currentPage, viewport }));
}

async function runRules(page: Page, currentPage: string, viewport: { width: number; height: number }, reviewTokens: StyleTokens, violations: Violation[]) {
  const viewportText = `${viewport.width}x${viewport.height}`;
  const add = (items: Violation[]) => violations.push(...items);
  const isVisible = (element: Element) => { const style = getComputedStyle(element); return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0; };

  add(await browserRecords(page, viewportText, currentPage, 'T1', '.section-heading h2, .summary-block h2, .content-list h2, .content-detail h2, .compare-panel h2, .hypothesis-panel h2, .hypothesis-queue h2, .hypothesis-claim h2, .hypothesis-evidence h3, .s10-panel h3, .s10-panel h4, .detail-evidence h3', '15px / 600', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const style = getComputedStyle(element); return Number.parseFloat(style.fontSize) === 15 && style.fontWeight === '600' ? [] : [{ selector: pageSelector(element), measured: getComputedStyle(element).fontSize + ' / ' + getComputedStyle(element).fontWeight }]; }); }`));
  add(await browserRecords(page, viewportText, currentPage, 'T2', 'button, input, select, textarea, [role="button"], [role="tab"], .metric-card, .snapshot-value, .compare-metrics dd', '>=13px', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const size = Number.parseFloat(getComputedStyle(element).fontSize); return size >= 13 ? [] : [{ selector: pageSelector(element), measured: size + 'px' }]; }); }`));
  add(await browserRecords(page, viewportText, currentPage, 'T3', '.muted, small, time, .queue-meta, dt, th, .status', '12px / 400', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const style = getComputedStyle(element); return Number.parseFloat(style.fontSize) === 12 && style.fontWeight === '400' ? [] : [{ selector: pageSelector(element), measured: style.fontSize + ' / ' + style.fontWeight }]; }); }`));
  add(await browserRecords(page, viewportText, currentPage, 'B1', '.confidence-badge, .review-state-badge, .ontology-chip, .batch-status, .state', '20px / 12px / 500 / 999px / border 0 / nowrap', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); const valid = Math.round(rect.height) === 20 && Number.parseFloat(style.fontSize) === 12 && style.fontWeight === '500' && style.borderRadius === '999px' && style.borderTopWidth === '0px' && style.whiteSpace === 'nowrap' && rect.height === element.getBoundingClientRect().height; return valid && (element.textContent ?? '').trim() ? [] : [{ selector: pageSelector(element), measured: JSON.stringify({ height: rect.height, font: style.fontSize + ' / ' + style.fontWeight, radius: style.borderRadius, border: style.borderTopWidth, whiteSpace: style.whiteSpace, text: (element.textContent ?? '').trim() }) }]; }); }`));
  add(await browserRecords(page, viewportText, currentPage, 'D1', 'details[open]', 'closed by default', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).map((element) => ({ selector: pageSelector(element), measured: 'open' })); }`));
  add(await browserRecords(page, viewportText, currentPage, 'D2', 'details:not([open])', '<=48px; summary 15px / 600', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const summary = element.querySelector(':scope > summary'); const rect = element.getBoundingClientRect(); const style = summary ? getComputedStyle(summary) : null; if (rect.height <= 48 && style && Number.parseFloat(style.fontSize) === 15 && style.fontWeight === '600') return []; return [{ selector: pageSelector(element), measured: JSON.stringify({ height: rect.height, summaryFont: style?.fontSize, summaryWeight: style?.fontWeight }) }]; }); }`));
  add(await browserRecords(page, viewportText, currentPage, 'L1', 'html', 'scrollWidth ≤ clientWidth', `function(selector) { const element = document.documentElement; return element.scrollWidth <= element.clientWidth ? [] : [{ selector: 'html', measured: element.scrollWidth + ' > ' + element.clientWidth }]; }`));
  add(await browserRecords(page, viewportText, currentPage, 'L2', 'main *', 'scrollWidth ≤ clientWidth', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => ({ selector: pageSelector(element), measured: element.scrollWidth + ' > ' + element.clientWidth })); }`));
  add(await browserRecords(page, viewportText, currentPage, 'L3', 'main *', 'leaf bounding boxes do not intersect', `function(selector) { const leaves = [...document.querySelectorAll(selector)].filter(isVisible).filter((element) => element.children.length === 0 && element.matches('button,a,input,select,textarea,[role="tab"],[role="button"],h1,h2,h3,h4,h5,h6,p,small,dt,dd,th,td,strong,summary,label,span,.confidence-badge,.review-state-badge,.ontology-chip,.batch-status')); const rects = leaves.map((element) => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0 && rect.height > 0 && getComputedStyle(rect.element ?? document.body).position !== 'fixed'); const result = []; for (let index = 0; index < rects.length; index += 1) for (let next = index + 1; next < rects.length; next += 1) { const left = rects[index], right = rects[next]; if (left.element.contains(right.element) || right.element.contains(left.element)) continue; const overlap = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left) > 0 && Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top) > 0; if (overlap) result.push({ selector: pageSelector(left.element) + ' × ' + pageSelector(right.element), measured: 'intersection' }); } return result; }`));
  if (viewport.width === 390 || viewport.width === 768) add(await browserRecords(page, viewportText, currentPage, 'L4', '.app-sidebar nav', 'title gap ≤24px', `function(selector) { const nav = document.querySelector(selector), title = document.querySelector('.topbar h1'); if (!nav || !title || !isVisible(nav) || !isVisible(title)) return []; const gap = title.getBoundingClientRect().top - nav.getBoundingClientRect().bottom; return gap <= 24 ? [] : [{ selector: '.topbar h1', measured: gap + 'px' }]; }`));
  if (viewport.width === 390) add(await browserRecords(page, viewportText, currentPage, 'L5', '.decision-region', '≤130px and controls fully visible', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const rect = element.getBoundingClientRect(); const controls = [...element.querySelectorAll('button,input,textarea,select')].filter(isVisible); const coveredControls = controls.filter((control) => { const box = control.getBoundingClientRect(); return box.top < rect.top || box.bottom > rect.bottom || box.right > innerWidth; }); const regionViolation = rect.height > 130 ? [{ selector: pageSelector(element), measured: JSON.stringify({ height: rect.height, covered: coveredControls.length > 0 }) }] : []; const controlViolations = coveredControls.map((control) => ({ selector: pageSelector(control), measured: JSON.stringify({ height: rect.height, covered: true }) })); return [...regionViolation, ...controlViolations]; }); }`));
  if (viewport.width === 768 || viewport.width === 1024) add(await browserRecords(page, viewportText, currentPage, 'L7', '.workspace-columns > *, .workspace-summary > *, .compare-selection > *, .compare-cards > *, .analysis-grid > *', 'column/card width ≥240px', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().width < 240).map((element) => ({ selector: pageSelector(element), measured: element.getBoundingClientRect().width + 'px' })); }`));
  add(await browserRecords(page, viewportText, currentPage, 'X1', 'main', 'separator has spaces and does not start line', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => [...element.innerText.matchAll(/(^|\\n)·|·(\\n|$)/g)].map((match, index) => ({ selector: pageSelector(element) + ' [separator ' + (index + 1) + ']', measured: match[0] }))); }`));
  add(await browserRecords(page, viewportText, currentPage, 'X2', 'main', 'no underscore token, raw engine enum, or long ID in primary display', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const text = element.innerText; const engineEnumValues = ${engineEnumValuesJson}; const validAcronyms = ${validAcronymsJson}; const tokens = text.match(/\\b(?:(?:[0-9a-fA-F]{8}-){3}[0-9a-fA-F-]{12,}|[A-Za-z0-9_-]{25,}|[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)\\b/g) ?? []; return tokens.filter((value) => value.includes('_') || (engineEnumValues[value] === true && validAcronyms[value] !== true) || value.length >= 25).map((value) => ({ selector: pageSelector(element), measured: value })); }); }`));
  add(await browserRecords(page, viewportText, currentPage, 'X3', '.metric-card, .snapshot-value, .compare-metrics dd, .batch-table .num, .summary-line', 'Indonesian decimal comma and thousands dot', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => [...(element.textContent ?? '').matchAll(/\\b\\d+\\.\\d+%?|\\b\\d{4,}\\b/g)].map((match) => ({ selector: pageSelector(element), measured: match[0] }))); }`));
  add(await browserRecords(page, viewportText, currentPage, 'X4', 'main', 'localized time, no ISO', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => [...element.innerText.matchAll(/\\b\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/g)].map((match) => ({ selector: pageSelector(element), measured: 'ISO timestamp: ' + match[0] }))); }`));
  add(await browserRecords(page, viewportText, currentPage, 'X5', 'main', 'one Indonesian term per concept', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => [...element.innerText.matchAll(/Rasio interaksi|\\bpillar\\b|talent class|\\btalenta\\b/gi)].map((match) => ({ selector: pageSelector(element), measured: match[0] }))); }`));
  if (viewport.width === 390 || viewport.width === 768) add(await browserRecords(page, viewportText, currentPage, 'I1', 'a, button, input, select, textarea, summary, [role="tab"], [role="button"]', '44×44px effective touch area', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const rect = element.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44 ? [] : [{ selector: pageSelector(element), measured: Math.round(rect.width) + '×' + Math.round(rect.height) + 'px' }]; }); }`));
  add(await browserRecords(page, viewportText, currentPage, 'I2', '.primary', '≤1 primary button per viewport', `function(selector) { const primaries = [...document.querySelectorAll(selector)].filter(isVisible); return primaries.filter((_, index) => index > 0).map((element) => ({ selector: pageSelector(element), measured: 'extra primary button' })); }`));
  add(await browserRecords(page, viewportText, currentPage, 'I5', 'a, button, input, select, textarea, summary, [role="tab"], [role="button"]', 'adjacent effective touch areas do not overlap and gap ≥8px', `function(selector) { const boxes = [...document.querySelectorAll(selector)].filter(isVisible).map((element) => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0 && rect.height > 0); const result = []; for (let index = 0; index < boxes.length; index += 1) for (let next = index + 1; next < boxes.length; next += 1) { const a = boxes[index].rect, b = boxes[next].rect; const horizontal = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)); const vertical = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)); const overlap = Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top); if (overlap || (horizontal < 8 && vertical < 8)) result.push({ selector: pageSelector(boxes[index].element) + ' × ' + pageSelector(boxes[next].element), measured: overlap ? 'intersection' : horizontal + '×' + vertical + 'px gap' }); } return result; }`));
  add(await browserRecords(page, viewportText, currentPage, 'H1', '.metric-card, .compare-metrics, .snapshot-value', 'missing values are – or belum tersedia; real zero stays 0', `function(selector) { return [...document.querySelectorAll(selector)].filter(isVisible).flatMap((element) => { const text = element.textContent ?? ''; return /Belum tersedia/.test(text) && /\b0\b/.test(text) ? [{ selector: pageSelector(element), measured: text.trim() }] : []; }); }`));

  const tokens = await page.evaluate(() => {
    const read = (selector: string): StyleToken | null => { const element = document.querySelector<HTMLElement>(selector); if (!element) return null; const style = getComputedStyle(element); return { fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, backgroundColor: style.backgroundColor, borderRadius: style.borderRadius, borderWidth: style.borderTopWidth }; };
    return { title: read('.section-heading h2'), body: read('.queue-meta'), badge: read('.confidence-badge'), disclosure: read('.s10-disclosure summary') };
  });
  for (const [token, value] of Object.entries(tokens)) {
    const reference = reviewTokens[token];
    if (!reference || !value || JSON.stringify(reference) === JSON.stringify(value)) continue;
    violations.push({ rule: 'R0', page: currentPage, viewport: viewportText, selector: token, measured: JSON.stringify(value), target: JSON.stringify(reference) });
  }

  await page.addScriptTag({ path: axePath });
  const axeViolations = await page.evaluate(async () => {
    const axe = (window as Window & { axe?: { run: (context: Document, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }> }> } }).axe;
    return axe?.run(document, { resultTypes: ['violations'] });
  }) as { violations?: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }> } | undefined;
  for (const item of axeViolations?.violations ?? []) if (item.impact === 'serious' || item.impact === 'critical') for (const node of item.nodes) violations.push({ rule: 'I4', page: currentPage, viewport: viewportText, selector: node.target.join(', '), measured: `${item.id} (${item.impact})`, target: 'zero serious/critical axe violations' });
}

test('UI conformance reports deterministic violations', async ({ page }) => {
  const violations: Violation[] = [];
  let currentPage = 'bootstrap';
  let currentViewport = 'unknown';
  page.on('pageerror', (error) => violations.push({ rule: 'TEST', page: currentPage, viewport: currentViewport, selector: 'page', measured: error.message, target: 'no uncaught page error' }));
  page.on('response', (response) => { if (response.status() >= 400) violations.push({ rule: 'TEST', page: currentPage, viewport: currentViewport, selector: response.url(), measured: String(response.status()), target: '<400 for route-mocked conformance request' }); });
  await installApi(page);

  const reviewTokensByViewport: Record<string, StyleTokens> = {};
  for (const viewport of viewports) {
    currentViewport = `${viewport.width}x${viewport.height}`;
    currentPage = 'Review';
    await page.setViewportSize(viewport);
    await page.goto(`/?batchId=${batch.id}&view=review&hypothesisId=${hypothesisId}`);
    await page.waitForLoadState('networkidle');
    reviewTokensByViewport[currentViewport] = await page.evaluate(() => {
      const read = (selector: string): StyleToken | null => { const element = document.querySelector<HTMLElement>(selector); if (!element) return null; const style = getComputedStyle(element); return { fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, backgroundColor: style.backgroundColor, borderRadius: style.borderRadius, borderWidth: style.borderTopWidth }; };
      return { title: read('.section-heading h2'), body: read('.queue-meta'), badge: read('.confidence-badge'), disclosure: read('.s10-disclosure summary') };
    });
    await runRules(page, 'Review', viewport, reviewTokensByViewport[currentViewport]!, violations);
  }

  for (const viewport of viewports) for (const view of views) {
    currentViewport = `${viewport.width}x${viewport.height}`;
    currentPage = view[0]!.toUpperCase() + view.slice(1);
    await page.setViewportSize(viewport);
    const contentQuery = view === 'library' ? `&contentId=${baseContents[0]!.id}` : '';
    const hypothesisQuery = view === 'review' ? `&hypothesisId=${hypothesisId}` : '';
    await page.goto(`/?batchId=${batch.id}&view=${view}${contentQuery}${hypothesisQuery}`);
    await page.waitForLoadState('networkidle');
    if (view === 'compare') {
      const choices = page.getByRole('list', { name: 'Pilihan konten perbandingan' }).getByRole('button');
      if (await choices.count() >= 2) { await choices.nth(0).click(); await choices.nth(1).click(); await page.getByRole('button', { name: 'Buat perbandingan', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Perbandingan terkontrol', exact: true })).toBeVisible(); }
      else violations.push({ rule: 'FIXTURE', page: currentPage, viewport: currentViewport, selector: '[aria-label="Pilihan konten perbandingan"]', measured: `${await choices.count()} choices`, target: 'selected comparison with result' });
    }
    await runRules(page, currentPage, viewport, reviewTokensByViewport[currentViewport]!, violations);
  }

  const output = outputDirectory();
  await mkdir(output, { recursive: true });
  const sorted = violations.sort((left, right) => `${left.rule}|${left.page}|${left.viewport}|${left.selector}`.localeCompare(`${right.rule}|${right.page}|${right.viewport}|${right.selector}`));
  const counts = new Map<string, number>();
  for (const violation of sorted) counts.set(violation.rule, (counts.get(violation.rule) ?? 0) + 1);
  const summary = ['# UI Conformance Summary', '', `Target: ${process.env.CIC_UI_CONFORMANCE_TARGET ?? 'unspecified'}`, `Branch: ${process.env.CIC_UI_CONFORMANCE_BRANCH ?? 'unspecified'}`, `Violations: ${sorted.length}`, '', '## Jumlah pelanggaran per aturan', '', '| Aturan | Jumlah |', '|---|---:|', ...[...counts.entries()].map(([rule, count]) => `| ${rule} | ${count} |`), '', '## Detail', '', '| Aturan | Halaman | Viewport | Selector | Terukur | Target |', '|---|---|---|---|---|---|', ...sorted.map((item) => `| ${item.rule} | ${item.page} | ${item.viewport} | ${item.selector.replaceAll('|', '\\|')} | ${item.measured.replaceAll('|', '\\|')} | ${item.target.replaceAll('|', '\\|')} |`), ''].join('\n');
  await writeFile(join(output, 'violations.json'), JSON.stringify({ target: process.env.CIC_UI_CONFORMANCE_TARGET ?? null, branch: process.env.CIC_UI_CONFORMANCE_BRANCH ?? null, violations: sorted }, null, 2) + '\n');
  await writeFile(join(output, 'summary.md'), summary);
  console.info(`UI_CONFORMANCE_OUTPUT ${output}`);
  console.info(`UI_CONFORMANCE_VIOLATIONS ${sorted.length}`);
  expect(sorted, `UI conformance violations written to ${output}/violations.json`).toEqual([]);
});

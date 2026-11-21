import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const target = process.env.BADGE_BUILDER_URL || 'http://localhost:4173/get-shiny/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});

async function waitForText(locator, text) {
  await locator.filter({ hasText: text }).waitFor();
}

try {
  const context = await browser.newContext({
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const issues = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED')) issues.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().startsWith(target) && response.status() >= 400) issues.push(response.url());
  });
  await page.route('https://img.shields.io/**', (route) => route.abort());
  assert.equal((await page.goto(target)).ok(), true);
  const card = (name) => page.locator('.badge-card').filter({ has: page.getByText(name, { exact: true }) });
  const rows = page.locator('.selected-row');
  const source = page.locator('.markdown-code');
  const search = page.locator('#search');
  const dialog = page.getByRole('dialog');

  await card('Python').waitFor();
  assert.equal(await page.locator('.badge-card').count(), 36);
  await page.locator('#more').click();
  assert.equal(await page.locator('.badge-card').count(), 72);
  await page.getByRole('button', { name: /^Databases/ }).click();
  await card('Postgres').waitFor();
  assert.equal(await card('Python').count(), 0);
  await page.getByRole('button', { name: /^All Badges/ }).click();
  await page.keyboard.press('/');
  assert.equal(await search.evaluate((node) => node === document.activeElement), true);
  await search.fill('does-not-exist');
  await page.getByText('No badges found').waitFor();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await search.fill('pyTH');
  await search.press('ArrowDown');
  assert.equal(await card('Python').evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(await card('Python').getAttribute('aria-pressed'), 'true');
  assert.equal(await rows.count(), 1);
  await card('Python').click();
  assert.equal(await rows.count(), 0);
  await page.getByRole('button', { name: 'Undo' }).click();
  assert.equal(await rows.count(), 1);
  await search.fill('');
  await card('Java').click();
  await card('Git').click();
  assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.badge)), ['python', 'java', 'git']);

  await page.getByRole('button', { name: 'Move Java up' }).click();
  assert.equal(await rows.first().getAttribute('data-badge'), 'java');
  const java = rows.filter({ has: page.getByRole('button', { name: 'Remove Java' }) });
  await rows.filter({ has: page.getByRole('button', { name: 'Remove Python' }) })
    .dragTo(java, { targetPosition: { x: 6, y: 3 } });
  assert.equal(await rows.first().getAttribute('data-badge'), 'python');
  await page.locator('#new-group').click();
  await page.getByLabel('Category name').fill('Featured');
  await page.getByRole('button', { name: 'Add category' }).click();
  await page.getByRole('button', { name: 'Move category Featured up' }).click();
  await page.getByRole('button', { name: 'Edit Git or move to category' }).click();
  await dialog.getByLabel('Move to category').selectOption({ label: 'Featured' });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  assert.equal(await page.locator('.selected-group').nth(1).locator('[data-badge="git"]').count(), 1);
  await page.getByLabel('Rename category Featured').fill('Toolbox');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await waitForText(source, '## Toolbox');

  await page.locator('#appearance').click();
  await page.getByLabel('Badge style').selectOption('flat-square');
  await page.getByLabel('Display label').fill('My stack');
  await page.getByLabel('Background colour').fill('#123456');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await waitForText(source, 'My_stack-123456?style=flat-square');
  await page.getByRole('button', { name: 'Edit Java or move to category' }).click();
  await page.getByLabel('Display label').fill('JDK (21)');
  await page.getByLabel('Logo colour').fill('white');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await waitForText(source, 'JDK_%2821%29');

  await page.locator('#custom').click();
  await page.getByLabel('Badge name').fill('Build Gate');
  await page.getByLabel('Display label').fill('Build - QA/CI');
  await page.getByLabel('Logo slug (optional)').fill('github');
  await waitForText(page.locator('.editor-preview'), 'Build - QA/CI');
  await page.getByRole('button', { name: 'Create and add badge' }).click();
  assert.equal(await rows.count(), 4);
  await search.fill('build gate');
  await card('Build Gate').waitFor();
  assert.equal(await card('Build Gate').getAttribute('aria-pressed'), 'true');

  await page.locator('#copy').click();
  await waitForText(page.locator('#notice-message'), 'Markdown copied.');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.includes('## Toolbox'));
  await page.locator('#project').click();
  await page.getByRole('button', { name: 'Copy Selected Badges Only' }).click();
  await waitForText(page.locator('#notice-message'), 'Badge Markdown copied.');
  assert.doesNotMatch(await page.evaluate(() => navigator.clipboard.readText()), /^##/m);
  const [markdown] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  assert.equal(markdown.suggestedFilename(), 'README.md');
  assert.equal(await readFile(await markdown.path(), 'utf8'), copied);

  await page.locator('#theme').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.reload();
  await rows.nth(3).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await rows.count(), 4);
  await page.locator('#project').click();
  const [exported] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Export Project' }).click(),
  ]);
  const path = await exported.path();
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(saved.custom[0].original.label, 'Build - QA/CI');
  assert.equal(saved.overrides.java.label, 'JDK (21)');
  await page.locator('#clear').click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  assert.equal(await rows.count(), 0);
  await page.getByRole('button', { name: 'Undo' }).click();
  assert.equal(await rows.count(), 4);
  await page.locator('#project').click();
  await page.getByRole('button', { name: 'Import Project' }).click();
  await page.locator('#project-file').setInputFiles(path);
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await waitForText(page.locator('#notice-message'), 'Project imported.');
  assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.badge)),
    saved.groups.flatMap((group) => group.badges));

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#builder').isVisible(), false);
  await page.getByRole('button', { name: /^Builder/ }).click();
  assert.equal(await page.locator('#builder').isVisible(), true);
  assert.equal(await page.locator('#explorer').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#presets').click();
  await page.getByRole('button', { name: /^32 Technology Starter Collection/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await rows.count(), 4);
  await page.locator('#presets').click();
  await page.getByRole('button', { name: /^32 Technology Starter Collection/ }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  assert.equal(await rows.count(), 32);
  await page.locator('#preview-content .badge-fallback').first().waitFor();

  assert.deepEqual(issues, []);
  await context.close();

  const remotePreview = await browser.newPage();
  await remotePreview.route('https://img.shields.io/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="70" height="28"><rect width="70" height="28"/></svg>',
  }));
  await remotePreview.goto(target);
  await remotePreview.locator('.badge-card').first().locator('img[data-ready]').waitFor();
  assert.equal(await remotePreview.locator('.badge-card').first().locator('.badge-fallback').isVisible(), false);
  console.log('Chromium desktop and mobile flows passed, including failed and successful image loading.');
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { badgeUrl } from '../js/badges.js';
import { addBadge, groupFor, moveBadge, newProject, removeBadge, selectedIds } from '../js/builder.js';
import { searchBadges } from '../js/catalog.js';
import { generateMarkdown } from '../js/markdown.js';
import { PRESETS } from '../js/presets.js';
import { parseProject } from '../js/storage.js';

const catalog = JSON.parse(readFileSync(new URL('../data/badges.json', import.meta.url)));
const index = new Map(catalog.badges.map((badge) => [badge.id, badge]));
const lookup = (id) => index.get(id);

test('every imported record has a unique identity, supported category and HTTPS Shields endpoint', () => {
  assert.ok(catalog.badges.length >= 800);
  assert.equal(index.size, catalog.badges.length);
  assert.equal(new Set(catalog.badges.map((badge) => badge.category)).size, catalog.categories.length);
  for (const badge of catalog.badges) {
    assert.ok(badge.name && badge.original.label && badge.original.color, badge.id);
    assert.ok(catalog.categories.includes(badge.category));
    const url = new URL(badgeUrl(badge));
    assert.equal(url.origin, 'https://img.shields.io');
    assert.ok(url.pathname.startsWith('/badge/'), badge.name);
    assert.equal(url.searchParams.get('style'), 'for-the-badge');
    assert.ok(!/[<>\s]/.test(url.href), badge.name);
    const project = newProject();
    addBadge(project, badge);
    assert.match(generateMarkdown(project, lookup, true), /^!\[/);
  }
});

test('search accepts partial names, aliases, upstream categories, and category filtering', () => {
  const ids = (query, category) => searchBadges(catalog.badges, query, category).map((badge) => badge.id);
  assert.ok(ids('PYTh').includes('python'));
  assert.ok(ids('vScOdE').includes('visual-studio-code'));
  assert.ok(ids('Arch Linux').includes('arch'));
  assert.ok(ids('postgresql').includes('postgres'));
  assert.ok(ids('version control').includes('git'));
  assert.ok(ids('documentation', 'Documentation & Data Formats').includes('markdown'));
  assert.deepEqual(ids('python', 'Databases'), []);
  assert.deepEqual(ids('this should not be a badge'), []);
});

test('presets contain valid unique badge IDs and the full 32-technology starter', () => {
  assert.equal(PRESETS.length, 8);
  for (const preset of PRESETS) {
    assert.equal(new Set(preset.ids).size, preset.ids.length, preset.name);
    assert.ok(preset.ids.every((id) => index.has(id)), preset.name);
  }
  assert.equal(PRESETS.find(({ name }) => name.startsWith('32 Technology')).ids.length, 32);
  assert.deepEqual(PRESETS.find(({ name }) => name === 'Custom Collection').ids, []);
});

test('selection cannot duplicate and moving badges preserves the requested order', () => {
  const project = newProject();
  assert.equal(addBadge(project, lookup('python')), true);
  assert.equal(addBadge(project, lookup('python'), 'Different'), false);
  addBadge(project, lookup('java'));
  addBadge(project, lookup('git'));
  const customGroup = groupFor(project, 'Pinned');
  assert.ok(moveBadge(project, 'git', customGroup.id));
  assert.ok(moveBadge(project, 'java', project.groups[0].id, 'python'));
  assert.deepEqual(selectedIds(project), ['java', 'python', 'git']);
  assert.ok(removeBadge(project, 'python'));
  assert.deepEqual(selectedIds(project), ['java', 'git']);
});

test('appearance overrides preserve priority and protect Shields path and query separators', () => {
  const python = lookup('python');
  assert.equal(badgeUrl(python), python.original.url);
  const url = new URL(badgeUrl(python, { color: '#010203', style: 'plastic' },
    { label: 'Build - A_B / C++ (QA)? #', logoColor: '#AABBCC', style: 'flat' }));
  assert.equal(url.pathname, '/badge/Build_--_A__B_%2F_C%2B%2B_%28QA%29%3F_%23-010203');
  assert.equal(url.searchParams.get('logoColor'), '#AABBCC');
  assert.equal(url.searchParams.get('logo'), 'python');
  assert.equal(url.searchParams.get('style'), 'flat');
});

test('Markdown follows headings, appearance, spacing, centering and plain badge copy', () => {
  const project = newProject();
  addBadge(project, lookup('python'), '[Core] <script>');
  addBadge(project, lookup('java'), '[Core] <script>');
  addBadge(project, lookup('git'), 'Tools');
  project.overrides.python = { label: '[build] (OK) & <tag>', style: 'flat' };
  project.spacing = 'roomy';
  const grouped = generateMarkdown(project, lookup);
  assert.ok(grouped.startsWith('## \\[Core\\] &lt;script&gt;'));
  assert.ok(grouped.includes('![\\[build\\] \\(OK\\) &amp; &lt;tag&gt;]('));
  assert.match(grouped, /style=flat&logo=python/);
  assert.match(grouped, /&nbsp;/);
  assert.ok(grouped.indexOf('## Tools') > grouped.indexOf('logo=openjdk'));

  project.centered = true;
  const centered = generateMarkdown(project, lookup);
  assert.ok(centered.startsWith('<div align="center">\n<h2>[Core] &lt;script&gt;</h2>'));
  assert.match(centered, /<img alt="\[build\] \(OK\) &amp; &lt;tag&gt;" src="https:\/\/img\.shields\.io\//);
  const badgesOnly = generateMarkdown(project, lookup, true);
  assert.ok(badgesOnly.startsWith('!['));
  assert.doesNotMatch(badgesOnly, /^##|<div|<img/m);
  project.centered = false;
  project.headings = false;
  assert.equal(generateMarkdown(project, lookup), badgesOnly);
});

test('versioned JSON round trips custom content and ignores corrupt or unsafe properties', () => {
  const project = newProject();
  const custom = {
    id: 'custom-build', name: 'Build Gate', category: 'Testing', aliases: [],
    original: { label: 'CI', color: 'ff0000', logo: 'github', logoColor: 'white', style: 'flat' },
  };
  project.custom.push(custom);
  addBadge(project, custom);
  addBadge(project, lookup('python'));
  project.theme = 'light';
  project.overrides.python = { style: 'plastic' };
  const json = JSON.stringify(project);
  assert.deepEqual(parseProject(json, catalog), project);
  assert.throws(() => parseProject('{"version":2,"groups":[]}', catalog), /supported/);
  assert.throws(() => parseProject('{', catalog), /valid JSON/);
  project.custom[0].original.url = 'javascript:alert(1)';
  project.custom[0].original.logo = 'data:image/svg+xml,';
  project.groups[0].badges.push('python', 'unknown');
  const sanitized = parseProject(JSON.stringify(project), catalog);
  assert.equal(badgeUrl(sanitized.custom[0]).startsWith('https://img.shields.io/'), true);
  assert.equal(sanitized.custom[0].original.logo, '');
  assert.deepEqual(selectedIds(sanitized), ['custom-build', 'python']);
});

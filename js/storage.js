import { COLORS, DEFAULT_STYLE, LOGO, STYLES } from './badges.js';
import { newProject } from './builder.js';

const KEY = 'badge-builder.project.v1';
export const MAX_PROJECT_BYTES = 2_000_000;
const CUSTOM_ID = /^custom-[a-z\d-]{1,60}$/i;
const GROUP_ID = /^[a-z\d-]{1,80}$/i;
const SPACING = ['regular', 'compact', 'roomy'];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [];
const text = (value, size) => typeof value === 'string' ? value.replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, size) : '';

export function cleanAppearance(value, allowLogo = false, allowBlankLogoColor = false) {
  const result = {};
  if (!isRecord(value)) return result;
  const label = text(value.label, 100);
  const color = text(value.color, 25);
  const logoColor = text(value.logoColor, 25);
  if (label) result.label = label;
  if (COLORS.test(color)) result.color = color;
  if (COLORS.test(logoColor) || (allowBlankLogoColor && value.logoColor === '')) result.logoColor = logoColor;
  if (STYLES.includes(value.style)) result.style = value.style;
  if (allowLogo && typeof value.logo === 'string' && LOGO.test(value.logo)) result.logo = value.logo.toLowerCase();
  return result;
}

export function parseProject(raw, catalogue) {
  if (typeof raw !== 'string' || raw.length > MAX_PROJECT_BYTES) throw new Error('Project file is too large.');
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('This file does not contain valid JSON.'); }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.groups)) {
    throw new Error('This file is not a supported Badge Builder project.');
  }

  const project = newProject();
  const validCategories = new Set(catalogue.categories);
  const validIds = new Set(catalogue.badges.map((badge) => badge.id));

  for (const item of list(value.custom, 2000)) {
    if (!isRecord(item) || typeof item.id !== 'string' || !CUSTOM_ID.test(item.id) || validIds.has(item.id)) continue;
    const name = text(item.name, 80);
    if (!name) continue;
    validIds.add(item.id);
    project.custom.push({
      id: item.id, name, category: validCategories.has(item.category) ? item.category : 'Other', aliases: [],
      original: { label: name, color: '555555', logo: '', logoColor: '', style: DEFAULT_STYLE,
        ...cleanAppearance(item.original, true, true) },
    });
  }

  const groupIds = new Set();
  const usedBadges = new Set();
  for (const group of list(value.groups, 500)) {
    if (!isRecord(group) || typeof group.id !== 'string' || !GROUP_ID.test(group.id) || groupIds.has(group.id)) continue;
    groupIds.add(group.id);
    const badges = list(group.badges, validIds.size).filter((id) => {
      if (!validIds.has(id) || usedBadges.has(id)) return false;
      usedBadges.add(id);
      return true;
    });
    project.groups.push({ id: group.id, name: text(group.name, 80) || 'Other', badges });
  }

  project.appearance = cleanAppearance(value.appearance);
  if (isRecord(value.overrides)) {
    for (const [id, appearance] of Object.entries(value.overrides)) {
      if (validIds.has(id) && !['__proto__', 'prototype', 'constructor'].includes(id)) {
        project.overrides[id] = cleanAppearance(appearance);
      }
    }
  }
  project.theme = value.theme === 'light' ? 'light' : 'dark';
  project.headings = value.headings !== false;
  project.centered = value.centered === true;
  project.spacing = SPACING.includes(value.spacing) ? value.spacing : 'regular';
  return project;
}

export function restoreProject(catalogue) {
  try {
    const raw = localStorage.getItem(KEY);
    return { project: raw ? parseProject(raw, catalogue) : newProject() };
  } catch {
    return { project: newProject(), warning: 'Saved progress could not be restored. A new collection is open.' };
  }
}

export function saveProject(project) {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

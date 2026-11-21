import { badgeAppearance, badgeUrl } from './badges.js';

export const SPACING = { regular: '\n', compact: ' ', roomy: ' &nbsp; ' };
export const VISUAL_GAP = { regular: '6px', compact: '2px', roomy: '14px' };

function oneLine(text) {
  return text.replace(/[\r\n\u0000-\u001f]+/g, ' ').trim();
}

function escapeMarkdown(text) {
  return oneLine(text)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[\\\[\]()*_~#!\x60]/g, '\\$&');
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function generateMarkdown(project, lookup, badgesOnly = false) {
  const { groups, appearance, overrides, headings, spacing, centered } = project;
  const isCentered = centered && !badgesOnly;
  const separator = SPACING[spacing] || SPACING.regular;
  const sections = [];
  const allBadges = [];
  for (const group of groups) {
    const badges = group.badges.flatMap((id) => {
      const badge = lookup(id);
      if (!badge) return [];
      const label = badgeAppearance(badge, appearance, overrides[id]).label || badge.name;
      const url = badgeUrl(badge, appearance, overrides[id]);
      if (isCentered) return [`<img alt="${escapeHtml(oneLine(label))}" src="${escapeHtml(url)}">`];
      const destination = /[()\s]/.test(url) ? `<${url}>` : url;
      return [`![${escapeMarkdown(label)}](${destination})`];
    });
    if (!badges.length) continue;
    allBadges.push(...badges);
    const images = badges.join(separator);
    if (isCentered) {
      sections.push(headings ? `<h2>${escapeHtml(oneLine(group.name))}</h2>\n${images}` : images);
    } else {
      sections.push(headings ? `## ${escapeMarkdown(group.name)}\n\n${images}` : images);
    }
  }
  if (!sections.length) return '';
  if (badgesOnly || (!headings && !isCentered)) return allBadges.join(separator) + '\n';
  const body = (headings ? sections : [allBadges.join(separator)]).join(isCentered ? '\n' : '\n\n');
  return isCentered ? `<div align="center">\n${body}\n</div>\n` : body + '\n';
}

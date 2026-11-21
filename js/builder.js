import { action, badgeImage, element, icon } from './badges.js';
import { generateMarkdown, VISUAL_GAP } from './markdown.js';

export function newProject() {
  return {
    version: 1, groups: [], custom: [], appearance: {}, overrides: {},
    headings: true, centered: false, spacing: 'regular', theme: 'dark',
  };
}

export function selectedIds(project) {
  return project.groups.flatMap((group) => group.badges);
}

export function groupFor(project, name) {
  let group = project.groups.find((item) => item.name === name);
  if (!group) {
    group = { id: crypto.randomUUID(), name, badges: [] };
    project.groups.push(group);
  }
  return group;
}

export function addBadge(project, badge, category = badge.category) {
  if (selectedIds(project).includes(badge.id)) return false;
  groupFor(project, category).badges.push(badge.id);
  return true;
}

export function removeBadge(project, id) {
  const group = project.groups.find((item) => item.badges.includes(id));
  if (!group) return false;
  group.badges.splice(group.badges.indexOf(id), 1);
  return true;
}

function shift(items, item, offset) {
  const index = items.indexOf(item);
  if (index < 0 || index + offset < 0 || index + offset >= items.length) return;
  items.splice(index, 1);
  items.splice(index + offset, 0, item);
}

export function moveBadge(project, id, targetGroupId, before = '', after = false) {
  const destination = project.groups.find((item) => item.id === targetGroupId);
  if (!destination || before === id || !removeBadge(project, id)) return false;
  const index = destination.badges.indexOf(before);
  destination.badges.splice(index < 0 ? destination.badges.length : index + Number(after), 0, id);
  return true;
}

export function setupBuilder({ getProject, lookup, update, confirm, editBadge, showPresets }) {
  const byId = (id) => document.getElementById(id);
  const selection = byId('selection');
  const preview = byId('preview-content');
  const visualTab = byId('visual-tab');
  const sourceTab = byId('source-tab');
  let source = false;
  let dragging = '';

  function keyedButton(label, glyph, callback, key) {
    const button = action(label, glyph, callback, 'icon-only small-icon');
    button.dataset.focus = key;
    return button;
  }

  function dropZone(node, group, target) {
    node.addEventListener('dragover', (event) => {
      if (!dragging || dragging === target) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      node.classList.add('drop-target');
    });
    node.addEventListener('dragleave', (event) => {
      if (!node.contains(event.relatedTarget)) node.classList.remove('drop-target');
    });
    node.addEventListener('drop', (event) => {
      if (!dragging || dragging === target) return;
      event.preventDefault();
      event.stopPropagation();
      const box = node.getBoundingClientRect();
      moveBadge(getProject(), dragging, group.id, target, event.clientY > box.top + box.height / 2);
      dragging = '';
      update();
    });
  }

  function makeRow(project, group, id, index) {
    const badge = lookup(id);
    const row = element('li', 'selected-row');
    row.dataset.badge = id;
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
      dragging = id;
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      dragging = '';
      row.classList.remove('dragging');
      selection.querySelectorAll('.drop-target').forEach((node) => node.classList.remove('drop-target'));
    });
    dropZone(row, group, id);

    const handle = element('span', 'drag-handle', '⠿');
    handle.setAttribute('aria-hidden', 'true');
    const controls = element('div', 'row-controls');
    const move = (offset) => {
      shift(group.badges, id, offset);
      update({ focus: `${id}-${offset < 0 ? 'up' : 'down'}`, fallback: `${id}-options` });
    };
    const up = keyedButton(`Move ${badge.name} up`, 'up', () => move(-1), `${id}-up`);
    const down = keyedButton(`Move ${badge.name} down`, 'down', () => move(1), `${id}-down`);
    up.disabled = index === 0;
    down.disabled = index === group.badges.length - 1;
    const options = keyedButton(`Edit ${badge.name} or move to category`, 'sliders', () => editBadge(badge), `${id}-options`);
    const remove = keyedButton(`Remove ${badge.name}`, 'close', () => {
      const undo = structuredClone(project.groups);
      removeBadge(project, id);
      update({ message: `Removed ${badge.name}.`, undo, focus: `${group.badges[index] || group.badges[index - 1]}-remove`, fallback: `${group.id}-name` });
    }, `${id}-remove`);
    controls.append(up, down, options, remove);
    row.append(handle, badgeImage(badge, project.appearance, project.overrides[id]), controls);
    return row;
  }

  function makeGroup(project, group, index) {
    const block = element('section', 'selected-group');
    dropZone(block, group);
    const heading = element('div', 'group-heading');
    const input = element('input', 'group-name');
    input.value = group.name;
    input.maxLength = 80;
    input.dataset.focus = `${group.id}-name`;
    input.setAttribute('aria-label', `Rename category ${group.name}`);
    input.addEventListener('change', () => {
      const name = input.value.trim();
      group.name = name || group.name;
      input.value = group.name;
      input.setAttribute('aria-label', `Rename category ${group.name}`);
      update({ previewOnly: true });
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
    const move = (offset) => {
      shift(project.groups, group, offset);
      update({ focus: `${group.id}-${offset < 0 ? 'up' : 'down'}`, fallback: `${group.id}-name` });
    };
    const up = keyedButton(`Move category ${group.name} up`, 'up', () => move(-1), `${group.id}-up`);
    const down = keyedButton(`Move category ${group.name} down`, 'down', () => move(1), `${group.id}-down`);
    const remove = keyedButton(`Remove category ${group.name}`, 'close', () => {
      const discard = () => {
        const undo = structuredClone(project.groups);
        project.groups.splice(project.groups.indexOf(group), 1);
        const next = project.groups[Math.min(index, project.groups.length - 1)];
        update({ message: `Removed ${group.name}.`, undo, focus: next && `${next.id}-name`, fallback: 'new-group' });
      };
      if (group.badges.length) confirm('Remove category?', `Remove “${group.name}” and its ${group.badges.length} selected badges?`, discard);
      else discard();
    }, `${group.id}-remove`);
    up.disabled = index === 0;
    down.disabled = index === project.groups.length - 1;
    heading.append(input, up, down, remove);
    block.append(heading);
    const list = element('ul', 'selected-list');
    list.append(...group.badges.map((id, position) => makeRow(project, group, id, position)));
    if (list.childElementCount) block.append(list);
    else block.append(element('p', 'group-empty muted', 'Drop badges here or move them from badge settings.'));
    return block;
  }

  function highlight(markdown) {
    const pre = element('pre', 'markdown-code');
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', 'Generated Markdown, read only');
    const code = element('code');
    for (const line of markdown.trimEnd().split('\n')) {
      const row = element('span', 'code-line');
      if (line.startsWith('## ')) {
        row.append(element('span', 'syntax-heading', line));
      } else {
        for (const token of line.split(/(https:\/\/[^\s)>"<]+|![[]|<\/?[a-z][a-z0-9]*)/gi)) {
          const syntax = token.startsWith('https:') ? 'syntax-url' : /^(?:<|!\[)/.test(token) ? 'syntax-heading' : '';
          row.append(element('span', syntax, token));
        }
      }
      code.append(row, document.createTextNode('\n'));
    }
    pre.append(code);
    return pre;
  }

  function renderPreview() {
    const project = getProject();
    const markdown = generateMarkdown(project, lookup);
    visualTab.setAttribute('aria-pressed', String(!source));
    sourceTab.setAttribute('aria-pressed', String(source));
    if (!markdown) {
      preview.replaceChildren(element('p', 'preview-empty muted', source ? 'Generated Markdown will appear here.' : 'Your README preview will appear here.'));
      return;
    }
    if (source) {
      preview.replaceChildren(highlight(markdown));
      return;
    }
    const content = element('div', project.centered ? 'readme-visual centered' : 'readme-visual');
    for (const group of project.groups) {
      if (!group.badges.length) continue;
      if (project.headings) content.append(element('h4', '', group.name));
      const strip = element('div', 'badge-strip');
      strip.style.gap = VISUAL_GAP[project.spacing];
      strip.append(...group.badges.map((id) => badgeImage(lookup(id), project.appearance, project.overrides[id])));
      content.append(strip);
    }
    preview.replaceChildren(content);
  }

  function render({ previewOnly = false, focus, fallback } = {}) {
    const project = getProject();
    if (!previewOnly) {
      const count = selectedIds(project).length;
      byId('selected-count').textContent = count;
      byId('mobile-count').textContent = count;
      byId('copy').disabled = !count;
      byId('download').disabled = !count;
      byId('clear').disabled = !project.groups.length;
      selection.replaceChildren(...project.groups.map((group, index) => makeGroup(project, group, index)));
      if (!selection.childElementCount) {
        const empty = element('div', 'empty-state builder-empty');
        const mark = element('span', 'empty-icon');
        mark.append(icon('layers'));
        empty.append(mark, element('strong', '', 'No badges selected'),
          element('p', 'muted', 'Add badges from the explorer or start with a preset.'),
          action('Browse presets', 'spark', showPresets, 'preset-link'));
        selection.append(empty);
      }
    }
    renderPreview();
    const find = (key) => key && (selection.querySelector(`[data-focus="${CSS.escape(key)}"]:not(:disabled)`) || byId(key));
    (find(focus) || find(fallback))?.focus({ preventScroll: true });
  }

  visualTab.addEventListener('click', () => { source = false; renderPreview(); });
  sourceTab.addEventListener('click', () => { source = true; renderPreview(); });
  return { render };
}

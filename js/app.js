import { action, element } from './badges.js';
import { addBadge, groupFor, newProject, removeBadge, selectedIds, setupBuilder } from './builder.js';
import { loadCatalog, setupExplorer } from './catalog.js';

export const byId = (id) => document.getElementById(id);

const themeButton = document.querySelector('#theme');
const workspace = document.querySelector('.workspace');
const exploreButton = document.querySelector('#show-explorer');
const builderButton = document.querySelector('#show-builder');
const search = document.querySelector('#search');

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
  themeButton.setAttribute('aria-label', label);
  themeButton.title = label;
  themeButton.querySelector('use').setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#101216' : '#f8faf9';
}

themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
});

function showWorkspace(view) {
  workspace.dataset.mobile = view;
  exploreButton.setAttribute('aria-pressed', String(view === 'explorer'));
  builderButton.setAttribute('aria-pressed', String(view === 'builder'));
  window.scrollTo(0, 0);
}

exploreButton.addEventListener('click', () => showWorkspace('explorer'));
builderButton.addEventListener('click', () => showWorkspace('builder'));

document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  const typing = event.target.closest('input, textarea, select, [contenteditable]');
  if ((!typing && event.key === '/' && !event.altKey) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault();
    showWorkspace('explorer');
    search.focus();
    search.select();
  }
});

const dialog = byId('dialog');
const dialogBody = byId('dialog-body');
byId('close-dialog').addEventListener('click', () => dialog.close());

function openDialog(title, content) {
  byId('dialog-title').textContent = title;
  dialogBody.replaceChildren(content);
  if (!dialog.open) dialog.showModal();
}

function confirmAction(title, message, confirm) {
  const content = element('div', 'dialog-stack');
  const buttons = element('div', 'dialog-actions');
  const cancel = action('Cancel', null, () => dialog.close());
  cancel.setAttribute('autofocus', '');
  buttons.append(cancel, action('Confirm', null, () => {
    dialog.close();
    confirm();
  }, 'primary'));
  content.append(element('p', '', message), buttons);
  openDialog(title, content);
}

const notice = byId('notice');
let undoAction;
let noticeTimer;

function notify(message, undo) {
  clearTimeout(noticeTimer);
  undoAction = undo;
  byId('undo').hidden = !undo;
  byId('notice-message').textContent = message;
  notice.hidden = false;
  if (!undo) noticeTimer = setTimeout(() => { notice.hidden = true; }, 4000);
}

byId('dismiss').addEventListener('click', () => {
  undoAction = undefined;
  notice.hidden = true;
});
byId('undo').addEventListener('click', () => undoAction?.());

loadCatalog().then(initialize).catch((error) => {
  byId('results-count').textContent = 'Catalogue could not be loaded. Reload to try again.';
  console.error(error);
});

function initialize(catalogue) {
  let project = newProject();
  const catalogIndex = new Map(catalogue.badges.map((badge) => [badge.id, badge]));
  const lookup = (id) => catalogIndex.get(id) || project.custom.find((badge) => badge.id === id);
  const getProject = () => project;
  const isSelected = (id) => selectedIds(project).includes(id);
  const toggleBadge = (badge) => {
    if (isSelected(badge.id)) {
      const undo = structuredClone(project.groups);
      removeBadge(project, badge.id);
      update({ message: `Removed ${badge.name}.`, undo });
    } else {
      addBadge(project, badge);
      update();
    }
  };
  const explorer = setupExplorer(catalogue, () => project.custom, isSelected, toggleBadge);
  const builder = setupBuilder({
    getProject, lookup, update, confirm: confirmAction, editBadge: showCategories,
    showPresets: () => notify('Presets will be available when enabled.'),
  });

  function update({ message, undo, refresh = false, ...options } = {}) {
    if (refresh) explorer.refreshFilters();
    else explorer.updateCards();
    builder.render(options);
    if (message) {
      notify(message, undo && (() => {
        project.groups = undo;
        update({ message: 'Change undone.', fallback: 'new-group' });
      }));
    } else if (undoAction) {
      undoAction = undefined;
      notice.hidden = true;
    }
  }

  function showCategories(badge) {
    const form = element('form', 'dialog-stack');
    const label = element('label', '', 'Move to category');
    const select = element('select');
    const current = project.groups.find((group) => group.badges.includes(badge.id));
    for (const group of project.groups) {
      const option = element('option', '', group.name);
      option.value = group.id;
      option.selected = group === current;
      select.append(option);
    }
    label.append(select);
    const submit = element('button', 'primary', 'Save');
    form.append(label, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (select.value !== current.id) {
        removeBadge(project, badge.id);
        project.groups.find((group) => group.id === select.value).badges.push(badge.id);
      }
      dialog.close();
      update({ focus: `${badge.id}-options` });
    });
    openDialog(badge.name, form);
  }

  byId('new-group').addEventListener('click', () => {
    const form = element('form', 'dialog-stack');
    const label = element('label', '', 'Category name');
    const input = element('input');
    input.required = true;
    input.maxLength = 80;
    input.autofocus = true;
    label.append(input);
    form.append(label, element('button', 'primary', 'Add category'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!input.value.trim()) return;
      const group = groupFor(project, input.value.trim());
      dialog.close();
      update({ focus: `${group.id}-name` });
    });
    openDialog('New category', form);
  });

  byId('clear').addEventListener('click', () => {
    confirmAction('Clear collection?', 'Remove all selections and categories from the builder?', () => {
      const undo = structuredClone(project.groups);
      project.groups = [];
      update({ message: 'Collection cleared.', undo, fallback: 'new-group' });
    });
  });

  builder.render();
}

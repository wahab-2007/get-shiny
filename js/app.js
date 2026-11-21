import { action, element } from './badges.js';
import { addBadge, groupFor, removeBadge, selectedIds, setupBuilder } from './builder.js';
import { loadCatalog, setupExplorer } from './catalog.js';
import { setupEditors } from './editors.js';
import { copyText, downloadFile } from './export.js';
import { generateMarkdown } from './markdown.js';
import { PRESETS } from './presets.js';
import { MAX_PROJECT_BYTES, parseProject, restoreProject, saveProject } from './storage.js';

const byId = (id) => document.getElementById(id);

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
  cancel.focus();
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
  const restored = restoreProject(catalogue);
  let project = restored.project;
  let saveWarningShown = false;
  setTheme(project.theme);
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
    getProject, lookup, update, confirm: confirmAction, editBadge: (badge) => editors.edit(badge), showPresets,
  });

  const editors = setupEditors({
    getProject, lookup, catalogue, open: openDialog, close: () => dialog.close(), update,
  });

  function persist() {
    if (!saveProject(project) && !saveWarningShown) {
      saveWarningShown = true;
      notify('Browser storage is unavailable. Export your project to keep your changes.');
    }
  }

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
    persist();
  }

  function showPresets() {
    const list = element('div', 'preset-list');
    for (const preset of PRESETS) {
      const load = () => {
        const undo = structuredClone(project.groups);
        project.groups = [];
        preset.ids.forEach((id) => addBadge(project, lookup(id)));
        update({ message: preset.ids.length ? `Loaded ${preset.name}.` : 'Opened an empty collection.',
          undo: undo.length ? undo : undefined });
      };
      const button = action(preset.name, null, () => {
        if (project.groups.length) {
          confirmAction('Replace the current selection?', `Load “${preset.name}” and replace your current categories and selection?`, load);
        } else {
          dialog.close();
          load();
        }
      });
      button.append(element('span', 'muted', `${preset.ids.length} badges`));
      list.append(button);
    }
    openDialog('Starter presets', list);
  }

  function openImport() {
    const form = element('form', 'dialog-stack');
    const input = element('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.required = true;
    input.id = 'project-file';
    const label = element('label', '', 'Choose an exported project JSON file');
    label.htmlFor = input.id;
    const error = element('p', 'form-error');
    error.setAttribute('role', 'alert');
    const submit = element('button', 'primary', 'Import project');
    form.append(label, input, error, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      error.textContent = '';
      try {
        const file = input.files[0];
        if (file.size > MAX_PROJECT_BYTES) throw new Error('Project file is too large.');
        const incoming = parseProject(await file.text(), catalogue);
        if (!dialog.open || !form.isConnected) return;
        const load = () => {
          project = incoming;
          setTheme(project.theme);
          update({ message: 'Project imported.', refresh: true, focus: 'project' });
        };
        if (project.groups.length || project.custom.length || Object.keys(project.appearance).length || Object.keys(project.overrides).length) {
          confirmAction('Replace the current project?', 'Importing replaces the current collection, custom badges, and appearance settings.', load);
        } else {
          dialog.close();
          load();
        }
      } catch (failure) {
        error.textContent = failure.message || 'Could not read this project file.';
      } finally {
        submit.disabled = false;
      }
    });
    openDialog('Import project', form);
  }

  async function copyMarkdown(badgesOnly = false) {
    const markdown = generateMarkdown(project, lookup, badgesOnly);
    if (!markdown) {
      notify('Add a badge before copying Markdown.');
      return;
    }
    if (await copyText(markdown)) {
      notify(badgesOnly ? 'Badge Markdown copied.' : 'Markdown copied.');
    } else {
      const field = element('textarea', 'manual-copy');
      field.readOnly = true;
      field.setAttribute('aria-label', 'Markdown to copy manually');
      field.value = markdown;
      const content = element('div', 'dialog-stack');
      content.append(element('p', '', 'Clipboard access is unavailable. Copy the selected Markdown manually.'), field);
      openDialog('Copy Markdown', content);
      field.select();
    }
  }

  themeButton.addEventListener('click', () => {
    project.theme = project.theme === 'dark' ? 'light' : 'dark';
    setTheme(project.theme);
    persist();
  });
  byId('appearance').addEventListener('click', () => editors.edit());
  byId('presets').addEventListener('click', showPresets);
  byId('custom').addEventListener('click', () => editors.createCustom((badge) => {
    project.custom.push(badge);
    addBadge(project, badge);
    update({ message: `Created ${badge.name}.`, refresh: true });
  }));
  byId('copy').addEventListener('click', () => copyMarkdown());
  byId('download').addEventListener('click', () => {
    downloadFile('README.md', generateMarkdown(project, lookup), 'text/markdown;charset=utf-8');
    notify('README.md downloaded.');
  });
  byId('project').addEventListener('click', () => {
    const menu = element('div', 'dialog-stack');
    const copyBadges = action('Copy Selected Badges Only', 'copy', () => {
      dialog.close();
      copyMarkdown(true);
    });
    copyBadges.disabled = !selectedIds(project).length;
    menu.append(copyBadges, action('Export Project', 'download', () => {
      downloadFile('badge-builder-project.json', JSON.stringify(project, null, 2) + '\n', 'application/json');
      dialog.close();
      notify('Project exported.');
    }), action('Import Project', null, openImport));
    openDialog('Collection actions', menu);
  });

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
  if (restored.warning) notify(restored.warning);
}

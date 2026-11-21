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

import { loadCatalog, setupExplorer } from './catalog.js';

loadCatalog().then((catalogue) => {
  setupExplorer(catalogue, () => [], () => false, () => {});
}).catch((error) => {
  document.querySelector('#results-count').textContent = 'Catalogue could not be loaded. Reload to try again.';
  console.error(error);
});

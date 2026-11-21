import { action, badgeImage, element, icon } from './badges.js';

const PAGE_SIZE = 36;
const ICONS = ['grid', 'code', 'layers', 'db', 'term', 'cloud', 'monitor', 'monitor', 'test', 'file', 'design', 'grid'];

export async function loadCatalog() {
  const response = await fetch(new URL('../data/badges.json', import.meta.url));
  if (!response.ok) throw new Error(`Catalogue request returned ${response.status}`);
  return response.json();
}

export function searchBadges(badges, query, category = '') {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return badges.filter((badge) => {
    if (category && badge.category !== category) return false;
    const text = [badge.name, badge.category, ...badge.aliases].join(' ').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function setupExplorer(catalogue, getCustom, isSelected, toggleBadge) {
  const byId = (id) => document.getElementById(id);
  const categories = byId('categories');
  const search = byId('search');
  const heading = byId('results-heading');
  const count = byId('results-count');
  const grid = byId('badge-grid');
  const more = byId('more');
  let active = '';
  let visible = PAGE_SIZE;
  let matches = [];
  let shown = new Map();

  function updateCards() {
    for (const [id, button] of shown) {
      const pressed = isSelected(id);
      if (button.getAttribute('aria-pressed') === String(pressed)) continue;
      button.setAttribute('aria-pressed', String(pressed));
      button.querySelector('.card-control').replaceChildren(icon(pressed ? 'check' : 'plus'));
    }
  }

  function makeCard(badge) {
    const button = action('', null, () => {
      toggleBadge(badge);
      updateCards();
    }, 'badge-card');
    button.replaceChildren();
    const artwork = element('span', 'badge-art');
    artwork.append(badgeImage(badge, {}, {}, true));
    const footer = element('span', 'card-caption');
    const labels = element('span', 'card-labels');
    labels.append(element('strong', '', badge.name), element('small', '', badge.category));
    footer.append(labels, element('span', 'card-control'));
    button.append(artwork, footer);
    shown.set(badge.id, button);
    return button;
  }

  function renderResults() {
    const badges = [...getCustom(), ...catalogue.badges];
    matches = searchBadges(badges, search.value, active);
    heading.textContent = active || 'All Badges';
    count.textContent = `${matches.length} ${matches.length === 1 ? 'badge' : 'badges'}`;
    shown = new Map();
    if (matches.length) {
      grid.replaceChildren(...matches.slice(0, visible).map(makeCard));
    } else {
      const empty = element('div', 'empty-state search-empty');
      empty.append(icon('search'), element('strong', '', 'No badges found'),
        element('p', 'muted', 'Try another search or choose a different category.'));
      empty.append(action('Reset filters', null, () => {
        active = '';
        search.value = '';
        refreshFilters();
        search.focus();
      }));
      grid.replaceChildren(empty);
    }
    more.hidden = matches.length <= visible;
    updateCards();
  }

  function renderCategories() {
    const badges = [...getCustom(), ...catalogue.badges];
    const counts = new Map([['', badges.length]]);
    for (const badge of badges) counts.set(badge.category, (counts.get(badge.category) || 0) + 1);
    const items = ['', ...catalogue.categories];
    categories.replaceChildren(...items.map((category, index) => {
      const button = action(category || 'All Badges', ICONS[index], () => {
        active = category;
        for (const [position, sibling] of [...categories.children].entries()) {
          sibling.setAttribute('aria-pressed', String(position === index));
        }
        visible = PAGE_SIZE;
        renderResults();
      });
      button.setAttribute('aria-pressed', String(category === active));
      button.append(element('span', 'category-count', counts.get(category) || 0));
      return button;
    }));
  }

  function refreshFilters() {
    visible = PAGE_SIZE;
    renderCategories();
    renderResults();
  }

  search.addEventListener('input', () => {
    visible = PAGE_SIZE;
    renderResults();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && shown.size) {
      event.preventDefault();
      shown.values().next().value.focus();
    }
  });
  grid.addEventListener('keydown', (event) => {
    const direction = { ArrowLeft: -1, ArrowRight: 1 };
    const buttons = [...shown.values()];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    let step = direction[event.key];
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const first = buttons[0].offsetTop;
      const nextRow = buttons.findIndex((button) => button.offsetTop > first);
      const columns = nextRow === -1 ? buttons.length : nextRow;
      step = event.key === 'ArrowDown' ? columns : -columns;
    }
    if (!step) return;
    event.preventDefault();
    buttons[index + step]?.focus();
  });
  more.addEventListener('click', () => {
    const previous = visible;
    visible += PAGE_SIZE;
    const next = matches.slice(previous, visible).map(makeCard);
    grid.append(...next);
    more.hidden = visible >= matches.length;
    updateCards();
    next[0]?.focus();
  });

  refreshFilters();
  return { refreshFilters, updateCards };
}

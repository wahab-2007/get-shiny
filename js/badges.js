export const STYLES = ['for-the-badge', 'flat', 'flat-square', 'plastic', 'social'];
export const DEFAULT_STYLE = STYLES[0];
export const COLORS = /^(?:#?(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})|[a-z]{3,24})$/i;
export const LOGO = /^[a-z\d-]{0,60}$/i;
const SHIELDS = 'https://img.shields.io/badge/';

function encodeLabel(value) {
  return encodeURIComponent(value.toWellFormed().replaceAll('-', '--').replaceAll('_', '__').replaceAll(' ', '_'))
    .replace(/[!'()*]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

export function badgeAppearance(badge, global = {}, individual = {}) {
  return { ...badge.original, ...global, ...individual };
}

export function badgeUrl(badge, global = {}, individual = {}) {
  const appearance = badgeAppearance(badge, global, individual);
  const keys = ['label', 'color', 'logo', 'logoColor', 'style', 'logoSize'];
  if (badge.original.url && keys.every((key) => appearance[key] === badge.original[key])) {
    return badge.original.url;
  }
  const params = new URLSearchParams({ style: appearance.style || DEFAULT_STYLE });
  for (const key of ['logo', 'logoColor', 'logoSize']) {
    if (appearance[key]) params.set(key, appearance[key]);
  }
  const label = encodeLabel(appearance.label || badge.name);
  return `${SHIELDS}${label}-${encodeURIComponent(appearance.color.replace(/^#/, ''))}?${params}`;
}

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function action(label, glyph, handler, className) {
  const button = element('button', className);
  button.type = 'button';
  if (glyph) button.append(icon(glyph));
  if (className?.includes('icon-only')) {
    button.setAttribute('aria-label', label);
    button.title = label;
  } else {
    button.append(document.createTextNode(label));
  }
  if (handler) button.addEventListener('click', handler);
  return button;
}

function cssColor(value, fallback) {
  if (!value) return fallback;
  const color = /^[\da-f]{3}$|^[\da-f]{6}$|^[\da-f]{8}$/i.test(value) ? `#${value}` : value;
  return CSS.supports('color', color) ? color : fallback;
}

let shieldsReady;
function checkShields() {
  shieldsReady ??= new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = `${SHIELDS}Shields.io-555?style=flat`;
  });
  return shieldsReady;
}

function localLogo(slug) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  const sprite = new URL('../assets/logos.svg', import.meta.url);
  sprite.hash = slug;
  use.setAttribute('href', sprite);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('local-logo');
  svg.append(use);
  return svg;
}

export function badgeImage(badge, global, individual, decorative = false) {
  const appearance = badgeAppearance(badge, global, individual);
  const wrap = element('span', 'badge-image');
  if (decorative) wrap.setAttribute('aria-hidden', 'true');
  else {
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', appearance.label || badge.name);
  }
  const fallback = element('span', `badge-fallback style-${appearance.style || DEFAULT_STYLE}`);
  fallback.setAttribute('aria-hidden', 'true');
  fallback.style.backgroundColor = cssColor(appearance.color, '#555');
  fallback.style.setProperty('--logo-color', cssColor(appearance.logoColor, 'white'));
  const logo = appearance.logo?.toLowerCase();
  if (logo && LOGO.test(logo)) fallback.append(localLogo(logo));
  fallback.append(element('span', '', appearance.label || badge.name));
  wrap.append(fallback);

  checkShields().then((available) => {
    if (!available || !wrap.isConnected) return;
    const image = new Image();
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('load', () => {
      fallback.hidden = true;
      image.dataset.ready = 'true';
    }, { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = badgeUrl(badge, global, individual);
    wrap.append(image);
  });
  return wrap;
}

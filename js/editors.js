import { action, badgeImage, COLORS, DEFAULT_STYLE, element, LOGO, STYLES } from './badges.js';
import { moveBadge, selectedIds } from './builder.js';
import { cleanAppearance } from './storage.js';

function field(name, input) {
  const label = element('label', '', name);
  label.append(input);
  return label;
}

function textField(value = '', placeholder = '', max = 100) {
  const input = element('input');
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = max;
  return input;
}

function choice(options, selected) {
  const select = element('select');
  for (const [value, label] of options) {
    const option = element('option', '', label);
    option.value = value;
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

function toggle(name, checked) {
  const input = element('input');
  input.type = 'checkbox';
  input.checked = checked;
  const label = element('label', 'toggle-field');
  label.append(input, document.createTextNode(name));
  return [input, label];
}

function appearanceInputs(form, values, defaults, styleLabel) {
  const label = textField(values.label, defaults.label || 'Original label');
  const color = textField(values.color, defaults.color || 'Original colour', 25);
  const logoColor = textField(values.logoColor, defaults.logoColor || 'Original logo colour', 25);
  const entries = STYLES.map((style) => [style, style]);
  if (styleLabel) entries.unshift(['', styleLabel]);
  const style = choice(entries, values.style || (styleLabel ? '' : DEFAULT_STYLE));
  const fields = element('div', 'appearance-fields');
  fields.append(field('Display label', label), field('Badge style', style),
    field('Background colour', color), field('Logo colour', logoColor));
  form.append(fields, element('p', 'muted', 'Use a hex code (e.g. #3776AB) or a named colour.'));
  return { label, color, logoColor, style };
}

function readInputs(inputs) {
  return Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value.trim()]));
}

function validateColors(inputs) {
  for (const input of [inputs.color, inputs.logoColor]) {
    const value = input.value.trim();
    const isHex = /^#?(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
    const isNamed = CSS.supports('color', value) && !/^(?:inherit|initial|unset|revert|currentcolor|transparent)$/i.test(value);
    input.setCustomValidity(!value || (COLORS.test(value) && (isHex || isNamed)) ? '' : 'Enter a valid hex code or named colour.');
  }
}

function sample(form, makePreview) {
  const preview = element('div', 'editor-preview');
  const render = () => {
    preview.replaceChildren(makePreview());
  };
  form.addEventListener('input', render);
  form.append(preview);
  render();
}

function formActions(form, onReset, submitText = 'Apply changes') {
  const buttons = element('div', 'dialog-actions');
  if (onReset) buttons.append(action('Reset to Original', null, onReset));
  buttons.append(element('button', 'primary', submitText));
  form.append(buttons);
}

export function setupEditors({ getProject, lookup, catalogue, open, close, update }) {
  function edit(badge) {
    const project = getProject();
    const form = element('form', 'dialog-stack');
    const inputs = appearanceInputs(form, badge ? project.overrides[badge.id] || {} : project.appearance,
      badge ? { ...badge.original, ...project.appearance } : {}, badge ? 'Inherit collection style' : 'Use original styles');
    let group;
    let headings;
    let centered;
    let spacing;

    if (badge) {
      const current = project.groups.find((item) => item.badges.includes(badge.id));
      group = choice(project.groups.map((item) => [item.id, item.name]), current.id);
      form.append(field('Move to category', group));
    } else {
      const [headingInput, headingLabel] = toggle('Show category headings', project.headings);
      const [centerInput, centerLabel] = toggle('Center output on GitHub', project.centered);
      headings = headingInput;
      centered = centerInput;
      spacing = choice([['regular', 'Regular'], ['compact', 'Compact'], ['roomy', 'Roomy']], project.spacing);
      form.append(field('Badge spacing', spacing), headingLabel, centerLabel);
    }

    const example = badge || lookup(selectedIds(project)[0]) || lookup('python') || catalogue.badges[0];
    sample(form, () => {
      const changes = cleanAppearance(readInputs(inputs));
      return badge ? badgeImage(example, project.appearance, changes) : badgeImage(example, changes, project.overrides[example.id]);
    });

    function apply(changes) {
      if (badge) {
        if (Object.keys(changes).length) project.overrides[badge.id] = changes;
        else delete project.overrides[badge.id];
      } else {
        project.appearance = changes;
      }
      close();
      update({ message: Object.keys(changes).length ? 'Appearance updated.' : 'Original appearance restored.',
        focus: badge ? `${badge.id}-options` : 'appearance' });
    }

    form.addEventListener('input', () => validateColors(inputs));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      validateColors(inputs);
      if (!form.reportValidity()) return;
      if (badge) {
        const current = project.groups.find((item) => item.badges.includes(badge.id));
        if (group.value !== current.id) moveBadge(project, badge.id, group.value);
      } else {
        project.headings = headings.checked;
        project.centered = centered.checked;
        project.spacing = spacing.value;
      }
      const changes = cleanAppearance(readInputs(inputs));
      apply(changes);
    });
    formActions(form, () => apply({}));
    open(badge ? `Edit ${badge.name}` : 'Collection appearance', form);
  }

  function createCustom(onCreate) {
    const form = element('form', 'dialog-stack');
    const name = textField('', 'My technology', 80);
    name.required = true;
    name.autofocus = true;
    form.append(field('Badge name', name));
    const inputs = appearanceInputs(form, { color: '#555555', logoColor: 'white' }, {}, '');
    inputs.logo = textField('', 'e.g. github', 60);
    const category = choice(catalogue.categories.map((value) => [value, value]), 'Other');
    form.append(field('Logo slug (optional)', inputs.logo), field('Catalogue category', category));

    function makeBadge() {
      const displayName = name.value.trim() || 'My technology';
      const attributes = cleanAppearance(readInputs(inputs), true, true);
      return {
        name: displayName, category: category.value, aliases: [],
        original: { label: displayName, color: '555555', logo: '', logoColor: 'white', style: DEFAULT_STYLE, ...attributes },
      };
    }
    sample(form, () => badgeImage(makeBadge()));
    form.addEventListener('input', () => {
      validateColors(inputs);
      name.setCustomValidity(name.value.trim() ? '' : 'Enter a badge name.');
      inputs.logo.setCustomValidity(LOGO.test(inputs.logo.value.trim()) ? '' : 'Use a Simple Icons slug with letters, digits, and hyphens.');
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      validateColors(inputs);
      if (!name.value.trim() || !form.reportValidity()) return;
      const badge = { ...makeBadge(), id: `custom-${crypto.randomUUID()}` };
      close();
      onCreate(badge);
    });
    formActions(form, null, 'Create and add badge');
    open('Create a custom badge', form);
  }

  return { edit, createCustom };
}

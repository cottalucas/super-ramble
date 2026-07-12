// Project and label colors, named like Todoist's palette. The token name is
// stored; the hex is resolved for display.
export const COLORS = {
  berry_red: '#b8255f',
  red: '#db4035',
  orange: '#ff9933',
  yellow: '#fad000',
  olive_green: '#afb83b',
  lime_green: '#7ecc49',
  green: '#299438',
  teal: '#6accbc',
  sky_blue: '#158fad',
  blue: '#14aaf5',
  grape: '#884dff',
  violet: '#af38eb',
  lavender: '#eb96eb',
  magenta: '#e05194',
  charcoal: '#808080',
  grey: '#b8b8b8'
};

export const COLOR_NAMES = Object.keys(COLORS);

export function colorHex(name) {
  return COLORS[name] || COLORS.charcoal;
}

// "berry_red" -> "Berry Red", for a labeled control that shows the color's
// name, not just its swatch.
export function colorLabel(name) {
  return (name || 'charcoal')
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

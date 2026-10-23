// Settings inside custom CSS (js/css-settings.js, theme-revamp S6): the /* @settings */ line parser, the values a
// device may keep and the variables written after the CSS.
import assert from 'node:assert/strict';
import { parseSettings, cleanValue, cleanValues, valueOf, settingsCss, MAX_SETTINGS } from '../js/css-settings.js';
import { checkCss } from '../js/custom-css.js';

const CSS = `/* @settings
slider --card-gap 0 24 2 8px  Space between cards
colour --mark #FFCC00 "Highlight colour"
color --line2 #112233
switch --chip-round 4px 999px  Round chips
switch --wc none block Word counts

// a note line is skipped
*/
.card + .card { margin-top: var(--card-gap); }`;

const { settings, problems } = parseSettings(CSS);
assert.deepEqual(problems, []);
assert.deepEqual(settings, [
  { kind: 'slider', name: '--card-gap', label: 'Space between cards', min: 0, max: 24, step: 2, def: 8, unit: 'px' },
  { kind: 'colour', name: '--mark', label: 'Highlight colour', def: '#ffcc00' },
  { kind: 'colour', name: '--line2', label: '--line2', def: '#112233' },
  { kind: 'switch', name: '--chip-round', label: 'Round chips', off: '4px', on: '999px' },
  { kind: 'switch', name: '--wc', label: 'Word counts', off: 'none', on: 'block' },
]);
// the whole thing is still CSS the filter allows
assert.equal(checkCss(CSS).ok, true);

// no block, or an unclosed one: nothing
assert.deepEqual(parseSettings('.a { color: red }'), { settings: [], problems: [] });
assert.deepEqual(parseSettings('/* @settings slider --a 0 1 1 0').settings, []);
assert.deepEqual(parseSettings('').settings, []);
// a one-line block works too
assert.equal(parseSettings('/* @settings slider --a 0 10 1 5em */').settings[0].unit, 'em');

// bad lines are skipped with a reason, good ones kept
{
  const r = parseSettings(`/* @settings
dropdown --a x y
slider a 0 10 1 5
slider --UP 0 10 1 5
slider --b 10 0 1 5
slider --c 0 10 0 5
slider --d 0 10 1 50
slider --e 0 10 1 5zz
slider --f 0 100000 0.01 5
colour --g red
colour --g2 url(x)
switch --h 1px
switch --i 1px ;}body{display:none
switch --j "a" b
slider --ok 0 10 1 5
slider --ok 0 10 1 5
*/`);
  assert.deepEqual(r.settings.map(s => s.name), ['--ok']);
  assert.equal(r.problems.length, 14);
  assert.match(r.problems[0], /^line 2: “dropdown” isn’t/);
  assert.match(r.problems.at(-1), /twice/);
}
// at most MAX_SETTINGS
{
  const many = Array.from({ length: MAX_SETTINGS + 3 }, (_, i) => `slider --s${i} 0 10 1 5`).join('\n');
  const r = parseSettings(`/* @settings\n${many}\n*/`);
  assert.equal(r.settings.length, MAX_SETTINGS);
  assert.equal(r.problems.length, 3);
}
// labels: no control characters, at most 60 characters
assert.equal(parseSettings(`/* @settings slider --a 0 1 1 0 ${'x'.repeat(80)} */`).settings[0].label.length, 60);

// values: in range, on the step, the right kind; anything else falls back to the default
const [gap, mark, , round, wc] = settings;
assert.equal(cleanValue(gap, 13), 14);
assert.equal(cleanValue(gap, '12'), 12);
assert.equal(cleanValue(gap, -5), 0);
assert.equal(cleanValue(gap, 99), 24);
assert.equal(cleanValue(gap, 'x'), null);
assert.equal(cleanValue({ kind: 'slider', min: 0, max: 1, step: 0.1 }, 0.30000000000000004), 0.3);
assert.equal(cleanValue(mark, '#ABCDEF'), '#abcdef');
assert.equal(cleanValue(mark, 'red'), null);
assert.equal(cleanValue(mark, '#fff;}body{'), null);
assert.equal(cleanValue(round, true), true);
assert.equal(cleanValue(round, 'yes'), null);
assert.deepEqual(cleanValues(settings, { '--card-gap': 6, '--mark': 'nope', '--gone': 5, '--wc': true }), { '--card-gap': 6, '--wc': true });
assert.deepEqual(cleanValues(settings, null), {});
assert.deepEqual(cleanValues(settings, ['x']), {});
assert.equal(valueOf(gap, {}), 8);
assert.equal(valueOf(round, {}), false);
assert.equal(valueOf(gap, null), 8);
assert.equal(settingsCss([gap], null), ':root { --card-gap: 8px; }');

// the variables: defaults, then the device's choices
assert.equal(settingsCss(settings, {}), ':root { --card-gap: 8px; --mark: #ffcc00; --line2: #112233; --chip-round: 4px; --wc: none; }');
assert.equal(settingsCss(settings, { '--card-gap': 20, '--mark': '#000000', '--chip-round': true, '--wc': true }),
  ':root { --card-gap: 20px; --mark: #000000; --line2: #112233; --chip-round: 999px; --wc: block; }');
assert.equal(settingsCss([], { a: 1 }), '');
assert.equal(checkCss(settingsCss(settings, {})).ok, true);
console.log('css settings tests passed');

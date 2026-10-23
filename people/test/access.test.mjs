// Unit tests for People › Access (roles). Run: node people/test/access.test.mjs
import assert from 'node:assert/strict';
import { cleanRoles, rolesText, mayChange, changeText, parseAccessPaste, normName, mergeAccess } from '../js/access.js';

assert.deepEqual(cleanRoles(['pd', 'x', 'owner', 'pd']), ['owner', 'pd']);
assert.deepEqual(cleanRoles(null), []);
assert.equal(rolesText(['pc', 'admin']), 'Admin staff, Programme coordinator');
assert.equal(rolesText([]), 'No roles');

const owner = { owner: true, admin: true }, staff = { owner: false, admin: true }, none = {};
const c = (actor, o) => mayChange({ actor, actorEmail: 'me@example.com', targetEmail: 'x@example.com', ...o });
assert.ok(c(owner, { newRoles: ['owner'] }).ok, 'owners add owners');
assert.ok(c(owner, { oldRoles: ['owner'], removing: true }).ok, 'owners remove other owners');
assert.ok(!mayChange({ actor: owner, actorEmail: 'me@example.com', targetEmail: 'ME@example.com', removing: true }).ok, 'not themselves');
assert.ok(!mayChange({ actor: owner, actorEmail: 'me@example.com', targetEmail: 'me@example.com', oldRoles: ['owner'], newRoles: ['pd'] }).ok, 'cannot drop own owner role');
assert.ok(mayChange({ actor: owner, actorEmail: 'me@example.com', targetEmail: 'me@example.com', oldRoles: ['owner'], newRoles: ['owner', 'pd'] }).ok);
assert.ok(c(staff, { newRoles: ['pc'] }).ok && c(staff, { newRoles: ['admin', 'pd'] }).ok);
assert.ok(!c(staff, { newRoles: ['owner'] }).ok, 'staff cannot grant owner');
assert.ok(!c(staff, { oldRoles: ['owner'], newRoles: ['pd'] }).ok, 'staff cannot touch an owner');
assert.ok(!c(staff, { oldRoles: ['owner'], removing: true }).ok);
assert.ok(!mayChange({ actor: staff, actorEmail: 'me@example.com', targetEmail: 'me@example.com', newRoles: ['pd'] }).ok, 'staff cannot edit themselves');
assert.ok(!c(none, { newRoles: ['pc'] }).ok && !c(undefined, { newRoles: ['pc'] }).ok);

assert.equal(changeText([], ['pc']), 'added as Programme coordinator');
assert.equal(changeText(['pc'], ['pc', 'pd']), 'set to Programme coordinator, Programme director (was Programme coordinator)');
assert.equal(changeText(['admin'], [], true), 'removed (was Admin staff)');

assert.equal(normName('Dr. Sam  EXAMPLE'), 'example sam');
assert.equal(normName('Example, Sam (Dr)'), 'example sam');

const known = [
  { email: 'sam.g@gmail.example', workEmail: 'sam_example@work.example', name: 'Dr Sam Example' },
  { email: 'alex@example.com', name: 'Alex Tan' },
  { email: 'alex2@example.com', name: 'Tan Alex' },
  { email: 'lee@example.com', name: 'Lee Wong' },
];
const p = t => parseAccessPaste(t, known);
assert.equal(p('').length, 0);
let r = p('Dr Sam Example, sam.g@gmail.example');
assert.deepEqual([r[0].email, r[0].how, r[0].problem], ['sam.g@gmail.example', 'email', '']);
r = p('Sam Example <SAM_EXAMPLE@work.example>');
assert.deepEqual([r[0].email, r[0].how], ['sam.g@gmail.example', 'work email'], 'a work email finds the sign-in email');
r = p('Example Sam');
assert.deepEqual([r[0].email, r[0].how], ['sam.g@gmail.example', 'name'], 'words in any order, titles ignored');
r = p('Alex Tan');
assert.ok(r[0].problem && !r[0].email, 'two people with that name: ask for an email');
r = p('Alex Tan, alex@example.com');
assert.deepEqual([r[0].email, r[0].how], ['alex@example.com', 'email']);
r = p('New Person, new.person@example.com');
assert.deepEqual([r[0].email, r[0].how, r[0].problem], ['new.person@example.com', 'new', '']);
r = p('new.person@example.com');
assert.ok(r[0].problem, 'a new email needs a name');
r = p('Nobody Known');
assert.ok(r[0].problem && !r[0].email);
r = p('Lee Wong\nsam.g@gmail.example\n\n');
assert.equal(r.length, 2);
assert.deepEqual(r.map(x => x.email), ['lee@example.com', 'sam.g@gmail.example']);
console.log('access: all checks passed');

// a copy saved with capitals merges into the lowercase record, which wins; on its own it shows as not working yet
{
  const m = mergeAccess([
    { id: 'Dian@example.com', email: 'Dian@example.com', name: 'Dian', roles: ['admin'] },
    { id: 'dian@example.com', email: 'dian@example.com', name: 'Dian', roles: ['admin', 'pc'] },
    { id: 'Lee@Example.com', name: 'Lee', roles: ['pd'] },
    { id: 'ok@example.com', name: 'Ok', roles: ['pd'] }]);
  assert.equal(m.length, 3);
  assert.deepEqual(m[0], { email: 'dian@example.com', strays: ['Dian@example.com'], active: true, name: 'Dian', roles: ['admin', 'pc'] });
  assert.deepEqual(m[1], { email: 'lee@example.com', strays: ['Lee@Example.com'], active: false, name: 'Lee', roles: ['pd'] });
  assert.deepEqual(m[2], { email: 'ok@example.com', strays: [], active: true, name: 'Ok', roles: ['pd'] });
}

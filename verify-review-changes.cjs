const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync('admin-safety.js', 'utf8'), context);
const changedKeys = (saved, draft) => {
  context.saved = saved;
  context.draft = draft;
  return JSON.parse(vm.runInContext(`JSON.stringify((() => {
    const before = safetyCells(saved), after = safetyCells(draft);
    return Object.keys(after).filter(key => !safetyEqual(before[key], after[key]));
  })())`, context));
};
const saved = { leaderboard: [{ dept: 'STED', points: 0 }], announcements: [{ active: true, message: 'Arrive early' }] };
const draft = { leaderboard: [{ dept: 'STED', points: 2 }], announcements: [{ message: 'Arrive early', active: true }] };
assert.deepEqual(changedKeys(saved, draft), ['leaderboard/STED']);
assert.deepEqual(changedKeys(saved, { ...saved, announcements: draft.announcements }), []);
assert.deepEqual(changedKeys(saved, { ...saved, announcements: [{ message: 'New message', active: true }] }), ['announcements']);
assert.deepEqual(changedKeys(saved, { ...saved, announcements: [{ message: 'Arrive early', active: false }] }), ['announcements']);
assert.deepEqual(changedKeys(saved, { ...saved, announcements: [] }), ['announcements']);
assert.deepEqual(changedKeys(saved, { ...saved, announcements: [...saved.announcements, { message: 'Extra', active: true }] }), ['announcements']);
const ordered = { announcements: [{ message: 'First', active: true }, { message: 'Second', active: true }] };
assert.deepEqual(changedKeys(ordered, { announcements: [...ordered.announcements].reverse() }), ['announcements']);
console.log('Review checks passed: ignore field order; retain score, text, visibility, addition, removal and item-order changes.');

import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, validate } from '../scripts/compare.mjs';

function snapshot(patch, avg = 4.5) {
  const row = { id: 'a', name: 'A', avg, n: 2000, win_pct: 10, top4_pct: null };
  return { schema_version: 1, set: '18', patch, captured_at: '2026-10-27T00:00:00+09:00',
    filters: { mode: 'ranked', rank: 'emerald+', region: 'default', window: '7d', unit_scope: 'all', comp_scope: 'standard' },
    sources: { comps: 'https://www.metatft.com/comps', units: 'https://www.metatft.com/units' },
    comps: [{ ...row, definition: 'A|B', pick_raw: 0.3 }], units: [{ ...row, pick_pct: 5 }] };
}
test('lower placement is improvement; win rate stays distinct from top4', () => {
  const old = snapshot('18.4b'), current = snapshot('18.5b',4.2);
  current.units[0].win_pct = 13;
  const r = compare(old,current);
  assert.equal(r.units[0].delta,-0.3);
  assert.equal(r.units[0].status,'개선 관측');
  assert.equal(r.units[0].win_delta_pp,3);
  assert.equal(r.units[0].top4_delta_pp,null);
});
test('small samples and missing counts do not earn high confidence', () => {
  const old = snapshot('18.4b'), current = snapshot('18.5b',4.1);
  current.units[0].n = 15; old.comps[0].n = null;
  const r = compare(old,current);
  assert.match(r.units[0].status,/표본 부족/);
  assert.match(r.comps[0].status,/표본 미확인/);
});
test('different filters, sets and mixed patches cannot be silently compared', () => {
  for (const field of ['mode','rank','region','window','unit_scope','comp_scope']) {
    const old = snapshot('18.4b'), current = snapshot('18.5b'); current.filters[field] = 'different';
    assert.throws(() => compare(old,current),/Filter mismatch/);
  }
  const next = snapshot('19.1'); next.set = '19';
  assert.throws(() => compare(snapshot('18.4b'),next),/Cross-set/);
  assert.throws(() => compare(snapshot('18.5b'),snapshot('18.5b')),/different patch/);
  assert.throws(() => validate(snapshot('18.4b,18.5b')),/one explicit patch/);
});
test('missing entities and changed definitions are not fabricated as gains or losses', () => {
  const old = snapshot('18.4b'), current = snapshot('18.5b',3);
  current.comps[0].definition = 'A|C'; current.units[0].id = 'new';
  const r = compare(old,current);
  assert.equal(r.comps[0].delta,undefined);
  assert.equal(r.units.length,2);
  assert.ok(r.units.every(row => row.delta === undefined));
});
test('corrupt data fails closed', () => {
  const s = snapshot('18.5b'); s.units[0].avg = NaN;
  assert.throws(() => validate(s),/Invalid average/);
  s.units[0].avg = 4; s.units.push(s.units[0]);
  assert.throws(() => validate(s),/duplicate/);
});

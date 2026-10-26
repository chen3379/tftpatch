// One-time import of the four verified Korean UI captures from 2026-10-27.
// Future runs must supply their own observed metadata, never reuse these counts.
import fs from 'node:fs';
import { validate } from './compare.mjs';

function comps(text) {
  const rows = [];
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (!/^[SABCD]$/.test(lines[i])) continue;
    const end = lines.indexOf('평균 등수', i);
    if (end < 0 || lines[end + 2] !== '선택률') throw Error('Comp UI format changed');
    const name = lines[i + 1], members = lines.slice(i + 4, end);
    if (!members.length || !/레벨/.test(lines[i + 2])) throw Error('Missing comp composition');
    rows.push({ id: `set18:${name}`, name, tier: lines[i], definition: members.slice().sort().join('|'), members,
      avg: Number(lines[end + 1]), pick_raw: Number(lines[end + 3]), n: null, top4_pct: null, win_pct: null });
    i = end + 3;
  }
  return rows;
}

function units(text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const start = lines.indexOf('인기 아이템') + 1, rows = [];
  if (!start || (lines.length - start) % 5 !== 0) throw Error('Unit UI format changed');
  for (let i = start; i < lines.length; i += 5) {
    const match = lines[i + 4].match(/^([\d,]+)\s+([\d.]+)%$/);
    if (!match || !/^[SABCD]$/.test(lines[i + 1])) throw Error('Invalid unit row');
    rows.push({ id: `set18:${lines[i]}`, name: lines[i], tier: lines[i + 1], avg: Number(lines[i + 2]),
      win_pct: Number(lines[i + 3].replace('%', '')), n: Number(match[1].replaceAll(',', '')),
      pick_pct: Number(match[2]), top4_pct: null });
  }
  return rows;
}

for (const [patch, compN, unitN] of [['18.4b',1696080,1633920], ['18.5b',4048952,4052064]]) {
  const read = kind => fs.readFileSync(`data/raw/${kind}-${patch}.txt`, 'utf8');
  const snapshot = {
    schema_version: 1, set: '18', patch, captured_at: '2026-10-27T00:14:35+09:00',
    capture_note: 'Batch finalized at this time; pages retrieved sequentially in preceding minutes. Counts differ because source refreshes and rolling windows move.',
    filters: { mode: '랭크', rank: '에메랄드+', region: '지역 별도 제한 없음(사이트 기본값)', window: '지난 7일',
      unit_scope: '전체 성급·아이템', comp_scope: '상황별 꺼짐; 현재 UI 조합 분류' },
    sources: { comps: 'https://www.metatft.com/comps', units: 'https://www.metatft.com/units' },
    raw_files: { comps: `data/raw/comps-${patch}.txt`, units: `data/raw/units-${patch}.txt` },
    total_boards: { comps: compN, units: unitN },
    limitations: ['Exact effective date bounds unavailable', 'Comp sample sizes and top4 not shown', 'Comp pick-rate unit unverified', 'No star/item stratification for units'],
    comps: comps(read('comps')), units: units(read('units'))
  };
  validate(snapshot);
  fs.mkdirSync('data/snapshots', { recursive: true });
  fs.writeFileSync(`data/snapshots/${patch}.json`, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(JSON.stringify({ patch, comps: snapshot.comps.length, units: snapshot.units.length }));
}

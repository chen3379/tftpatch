import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const fail = message => { throw new Error(message); };
export function validate(s) {
  if (s.schema_version !== 1 || !s.patch || !s.set || !s.captured_at) fail('Missing snapshot identity');
  if (typeof s.patch !== 'string' || !/^\d+\.\d+[a-z]?$/.test(s.patch)) fail('Expected one explicit patch version');
  if (!Number.isFinite(Date.parse(s.captured_at))) fail('Invalid capture timestamp');
  if (!s.filters?.mode || !s.filters?.rank || !s.filters?.region || !s.filters?.window) fail('Missing filters');
  if (!s.sources?.comps || !s.sources?.units) fail('Missing source URLs');
  for (const type of ['comps', 'units']) {
    if (!Array.isArray(s[type]) || !s[type].length) fail(`Empty ${type} capture`);
    const keys = new Set();
    for (const row of s[type]) {
      if (!row.id || !row.name || keys.has(row.id)) fail(`Missing/duplicate ${type} ID`);
      keys.add(row.id);
      if (!Number.isFinite(row.avg) || row.avg < 1 || row.avg > 8) fail('Invalid average');
      if (row.n != null && (!Number.isInteger(row.n) || row.n <= 0)) fail('Invalid sample size');
      for (const field of ['win_pct', 'top4_pct', 'pick_pct']) {
        if (row[field] != null && (!Number.isFinite(row[field]) || row[field] < 0 || row[field] > 100)) fail(`Invalid ${field}`);
      }
      if (row.pick_raw != null && (!Number.isFinite(row.pick_raw) || row.pick_raw < 0)) fail('Invalid raw pick rate');
      if (type === 'comps' && !row.definition) fail('Missing comp definition');
    }
  }
  return s;
}

export function compare(previous, current, { threshold = 0.10, minN = 1000 } = {}) {
  validate(previous); validate(current);
  if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isInteger(minN) || minN <= 0) fail('Invalid comparison policy');
  if (previous.set !== current.set) fail('Cross-set comparisons require a new baseline');
  if (previous.patch === current.patch) fail('Expected different patch versions');
  for (const field of ['mode', 'rank', 'region', 'window', 'unit_scope', 'comp_scope']) {
    if (previous.filters[field] !== current.filters[field]) fail(`Filter mismatch: ${field}`);
  }
  const result = {};
  for (const type of ['comps', 'units']) {
    const oldRows = new Map(previous[type].map(row => [row.id, row]));
    const newRows = new Map(current[type].map(row => [row.id, row]));
    result[type] = [...new Set([...oldRows.keys(), ...newRows.keys()])].map(id => {
      const before = oldRows.get(id), after = newRows.get(id);
      if (!before || !after) return { id, name: (after || before).name, status: '비교 보류: 한쪽 패치에만 관측', before, after };
      if (type === 'comps' && before.definition !== after.definition) return { id, name: after.name, status: '비교 보류: 조합 정의 변경', before, after };
      const delta = Math.round((after.avg - before.avg) * 100) / 100;
      const enough = before.n != null && after.n != null && Math.min(before.n, after.n) >= minN;
      const sparse = [before.n, after.n].some(n => n != null && n < minN);
      let status = delta <= -threshold ? '개선 관측' : delta >= threshold ? '악화 관측' : '변화 작음';
      if (sparse) status = '비교 보류: 표본 부족';
      else if (!enough) status += ' (개별 표본 미확인)';
      return { id, name: after.name, status, delta, before, after,
        win_delta_pp: before.win_pct == null || after.win_pct == null ? null : Math.round((after.win_pct - before.win_pct) * 10) / 10,
        top4_delta_pp: before.top4_pct == null || after.top4_pct == null ? null : Math.round((after.top4_pct - before.top4_pct) * 10) / 10 };
    }).sort((a,b) => (a.delta ?? Infinity) - (b.delta ?? Infinity));
  }
  return result;
}

const num = n => n == null ? '미제공' : n.toFixed(2);
const count = n => n == null ? '미제공' : n.toLocaleString('en-US');
const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
export function markdown(previous, current, result) {
  const out = [
    `# TFT ${previous.patch} → ${current.patch} 통계 비교`, '',
    `자료 정리 시각: ${current.captured_at}. 출처: [MetaTFT 덱](${current.sources.comps}), [MetaTFT 유닛](${current.sources.units}).`, '',
    `조건: ${current.filters.mode} · ${current.filters.rank} · ${current.filters.region} · ${current.filters.window}.`, '',
    '평균 등수는 낮을수록 좋으며 Δ=현재−이전입니다. |Δ|≥0.10을 실무상 변화 기준으로 사용합니다. 통계적 유의성을 뜻하지 않습니다. 개별 표본 1,000 미만은 보류합니다. 표본이 표시되지 않은 덱은 탐색적 관측입니다.', '',
    '동일한 지난 7일 필터여도 각 패치가 서비스된 기간의 교집합만 집계되므로 실제 노출 기간은 다릅니다. 동일 길이의 대조 실험이 아니며, 사용률·숙련도·아이템·성급·생존자 편향이 섞여 있습니다.', '',
    '## 덱', '',
    '선택률은 사이트 표시값 그대로이며 단위를 확인하지 못해 %나 %p로 변환하지 않았습니다. 덱별 표본 수·순방률은 이번 목록 화면에서 미제공입니다.', '',
    '| 덱 | 이전 평균 | 현재 평균 | Δ | 이전→현재 선택률(원표기) | 판단 |',
    '|---|---:|---:|---:|---:|---|'
  ];
  for (const r of result.comps) out.push(`| ${escape(r.name)} | ${num(r.before?.avg)} | ${num(r.after?.avg)} | ${num(r.delta)} | ${num(r.before?.pick_raw)}→${num(r.after?.pick_raw)} | ${r.status} |`);
  out.push('', '## 챔피언', '', '전체 성급·아이템 상태가 섞인 유닛 포함 보드의 평균입니다. 5코스트의 좋은 평균을 초반 유닛과 직접 비교하지 않으며, 같은 챔피언의 패치 간 변화로 해석합니다. 승률은 1위 비율이고 순방률이 아닙니다.', '',
    '| 챔피언 | 이전 평균 | 현재 평균 | Δ | 1위율 이전→현재 | 사용률 이전→현재 | 표본 이전→현재 | 판단 |',
    '|---|---:|---:|---:|---:|---:|---:|---|');
  for (const r of result.units) out.push(`| ${escape(r.name)} | ${num(r.before?.avg)} | ${num(r.after?.avg)} | ${num(r.delta)} | ${num(r.before?.win_pct)}→${num(r.after?.win_pct)}% | ${num(r.before?.pick_pct)}→${num(r.after?.pick_pct)}% | ${count(r.before?.n)}→${count(r.after?.n)} | ${r.status} |`);
  return out.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [oldFile, newFile, output] = process.argv.slice(2);
  if (!oldFile || !newFile || !output) fail('Usage: node scripts/compare.mjs previous.json current.json report.md');
  const previous = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
  const current = JSON.parse(fs.readFileSync(newFile, 'utf8'));
  const result = compare(previous, current);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, markdown(previous, current, result));
  console.log(JSON.stringify({ output, comps: result.comps.length, units: result.units.length }));
}

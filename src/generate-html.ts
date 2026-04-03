/**
 * flowsnap - HTML Report Generator
 *
 * ctrf-report.json(CTRF 포맷)과 스크린샷을 읽어서 self-contained HTML 리포트를 생성.
 * 디자인: 모노스페이스, 흑백 기조, 넉넉한 여백, 장식 최소화.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { CtrfReport, CtrfTest, FlowScreenshot } from './types';

// --- Constants ---

const STATUS_INDICATOR: Record<string, { symbol: string; color: string }> = {
  passed: { symbol: '●', color: '#4ade80' },
  failed: { symbol: '●', color: '#f87171' },
  skipped: { symbol: '○', color: '#525866' },
  pending: { symbol: '●', color: '#fbbf24' },
  other: { symbol: '●', color: '#fb923c' },
};

/** Safely serialize data for embedding in a <script> block */
function jsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/<\/(script)/gi, '<\\/$1');
}

// --- Utilities ---

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

function shortUrl(url: string): string {
  try {
    const p = new URL(url);
    return p.pathname + p.search;
  } catch {
    return url;
  }
}

function toBase64(filePath: string): string {
  try {
    return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
  } catch {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';
  }
}

// --- HTML builder ---

function buildHtml(report: CtrfReport, base64Map: Map<string, string>): string {
  const { summary, tests } = report.results;

  // 전체 스크린샷 맵 구축
  const ssMap = new Map<string, FlowScreenshot>();
  for (const t of tests) {
    const shots = t.extra?.flow?.screenshots ?? [];
    for (const s of shots) ssMap.set(s.id, s);
  }

  const totalShots = ssMap.size;
  const totalTests = summary.tests;
  const passRate = totalTests > 0 ? Math.round((summary.passed / totalTests) * 100) : 0;

  // Sidebar tree — group by full suite hierarchy
  interface TreeNode {
    name: string;
    children: Map<string, TreeNode>;
    tests: { test: CtrfTest; idx: number }[];
  }

  function newNode(name: string): TreeNode {
    return { name, children: new Map(), tests: [] };
  }

  const root = newNode('root');
  tests.forEach((t, i) => {
    const suitePath = t.suite ?? ['default'];
    let node = root;
    for (const seg of suitePath) {
      if (!node.children.has(seg)) node.children.set(seg, newNode(seg));
      node = node.children.get(seg)!;
    }
    node.tests.push({ test: t, idx: i });
  });

  function countAll(node: TreeNode): { test: CtrfTest; idx: number }[] {
    const result = [...node.tests];
    for (const child of node.children.values()) result.push(...countAll(child));
    return result;
  }

  function renderNode(node: TreeNode, depth: number): string {
    const allTests = countAll(node);
    if (allTests.length === 0) return '';

    const passed = allTests.filter((i) => i.test.status === 'passed').length;
    const total = allTests.length;
    const hasFail = allTests.some((i) => i.test.status === 'failed');
    const groupColor = hasFail ? 'var(--red)' : passed === total ? 'var(--accent)' : 'var(--t2)';

    const childrenHtml = Array.from(node.children.values())
      .map((child) => renderNode(child, depth + 1))
      .join('\n');

    const rowsHtml = node.tests
      .map((i) => {
        const ind = STATUS_INDICATOR[i.test.status] || STATUS_INDICATOR.other;
        return `<a class="sb-row" href="#lane-${i.idx}" data-i="${i.idx}" data-status="${i.test.status}" data-proj="${esc(node.name)}" style="padding-left:${(depth + 1) * 16 + 12}px">
  <span class="sb-dot" style="color:${ind.color}">${ind.symbol}</span>
  <span class="sb-text">${esc(i.test.name)}</span>
  <span class="sb-time">${dur(i.test.duration)}</span>
</a>`;
      })
      .join('\n');

    return `<div class="sb-group" data-proj="${esc(node.name)}" data-depth="${depth}">
  <div class="sb-group-head" style="padding-left:${depth * 16 + 12}px">
    <span class="sb-arrow">▼</span>
    <span class="sb-group-name">${esc(node.name)}</span>
    <span class="sb-group-count" style="color:${groupColor}">${passed}/${total}</span>
  </div>
  <div class="sb-group-body">${childrenHtml}${rowsHtml}</div>
</div>`;
  }

  const sbTree = Array.from(root.children.values())
    .map((child) => renderNode(child, 0))
    .join('\n');

  // Collect all tests in tree order for lanes
  const projectGroups = new Map<string, { test: CtrfTest; idx: number }[]>();
  tests.forEach((t, i) => {
    const proj = t.suite?.[0] ?? 'default';
    const group = projectGroups.get(proj) || [];
    group.push({ test: t, idx: i });
    projectGroups.set(proj, group);
  });

  // Reorder tests to match tree order (project groups)
  const orderedTests: { test: CtrfTest; idx: number }[] = [];
  for (const [, items] of Array.from(projectGroups)) {
    for (const item of items) orderedTests.push(item);
  }

  // Flow lanes — in tree order
  const lanesHtml = orderedTests
    .map(({ test: t, idx: i }) => {
      const ind = STATUS_INDICATOR[t.status] || STATUS_INDICATOR.other;
      const shots = t.extra?.flow?.screenshots ?? [];
      const projectName = t.suite?.[0] ?? 'default';

      const cardsHtml =
        shots.length === 0
          ? '<div class="lane-empty">no screenshots</div>'
          : shots
              .map((ss, j) => {
                const src = base64Map.get(ss.id) || '';
                const arrow = j < shots.length - 1 ? '<div class="arrow">→</div>' : '';
                return `<div class="card" data-test="${esc(t.name)}" data-label="${esc(ss.label)}" data-url="${esc(ss.url)}" data-src="${src}">
  <div class="card-img"><img src="${src}" alt="" loading="lazy"/><span class="card-num">#${j + 1}</span></div>
  <div class="card-meta">
    <span class="card-label">${esc(ss.label)}</span>
    <span class="card-url">${esc(shortUrl(ss.url))}</span>
  </div>
</div>${arrow}`;
              })
              .join('\n');

      const laneClass = t.status === 'failed' ? ' fail' : t.status === 'skipped' ? ' skip' : '';
      const displayStatus = t.rawStatus && t.rawStatus !== t.status ? ` (${t.rawStatus})` : '';
      return `<section class="lane${laneClass}" id="lane-${i}">
  <div class="lane-head">
    <span class="lane-fold">▼</span>
    <span class="lane-dot" style="color:${ind.color}">${ind.symbol}</span>
    <span class="lane-title">${esc(t.name)}${displayStatus ? ` <span style="color:var(--t3);font-size:10px">${esc(displayStatus)}</span>` : ''}</span>
    <span class="lane-tag">${esc(projectName)}</span>
    <span class="lane-time">${dur(t.duration)}${shots.length > 0 ? ` · ${shots.length} shots` : ''}</span>
  </div>
  ${t.message ? `<div class="lane-error"><span class="err-icon">!</span><pre class="err-msg">${esc(t.message)}</pre></div>` : ''}
  <div class="lane-track">${cardsHtml}</div>
</section>`;
    })
    .join('\n');

  // Gallery data for modal
  const galleryJson = jsonForScript(
    tests
      .filter((t) => (t.extra?.flow?.screenshots ?? []).length > 0)
      .map((t) => ({
        title: t.name,
        shots: (t.extra?.flow?.screenshots ?? [])
          .map((ss) => ({ src: base64Map.get(ss.id) || '', label: ss.label, url: ss.url }))
          .filter((s) => s.src),
      })),
  );

  // timestamp 표시
  const reportTime = report.timestamp
    ? esc(new Date(report.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))
    : '';
  const durationMs = summary.duration ?? 0;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>E2E Flow Report</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0d0d0d;
  --bg2:#161616;
  --bg3:#1e1e1e;
  --border:#282828;
  --t1:#e0e0e0;
  --t2:#888;
  --t3:#555;
  --accent:#4ade80;
  --red:#f87171;
  --mono:'SF Mono','Cascadia Code','Fira Code','Consolas',monospace;
}
html{font-size:13px;scroll-behavior:smooth}
body{
  font-family:var(--mono);
  background:var(--bg);
  color:var(--t1);
  display:flex;
  height:100vh;
  overflow:hidden;
  -webkit-font-smoothing:antialiased;
}

/* Sidebar */
.sb{
  width:280px;
  min-width:280px;
  border-right:1px solid var(--border);
  display:flex;
  flex-direction:column;
  background:var(--bg);
}
.sb-head{
  padding:20px;
  border-bottom:1px solid var(--border);
}
.sb-head h1{
  font-size:13px;
  font-weight:500;
  color:var(--t1);
  letter-spacing:-.01em;
}
.sb-head .sb-sub{
  font-size:11px;
  color:var(--t3);
  margin-top:6px;
}
.sb-summary{margin-top:10px}
.sb-big{font-size:18px;font-weight:600;color:var(--t1);display:block;line-height:1}
.sb-detail{font-size:10px;color:var(--t3);display:block;margin-top:4px;line-height:1.4}
.sb-detail .g{color:var(--accent)}
.sb-detail .r{color:var(--red)}
.sb-bar{height:4px;display:flex;border-radius:2px;overflow:hidden;margin-top:8px;gap:1px}
.sb-bar span{height:100%}

/* Stats removed — info is in main header */

/* Filter */
.sb-filter{
  padding:10px 20px;
  border-bottom:1px solid var(--border);
  display:flex;
  gap:2px;
}
.sb-filter button{
  font-family:var(--mono);
  font-size:11px;
  background:transparent;
  border:none;
  color:var(--t3);
  padding:4px 8px;
  border-radius:3px;
  cursor:pointer;
}
.sb-filter button:hover{color:var(--t2)}
.sb-filter button.on{color:var(--t1);background:var(--bg3)}
.sb-tree-toggle{margin-left:auto;display:flex;gap:2px}
.sb-tree-toggle button{width:20px;height:20px;font-size:13px;display:flex;align-items:center;justify-content:center}

/* Test list */
.sb-list{
  flex:1;
  overflow-y:auto;
  padding:6px 8px;
}
.sb-list::-webkit-scrollbar{width:3px}
.sb-list::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}

/* Search */
.sb-search{padding:8px 12px;border-bottom:1px solid var(--border)}
.sb-search input{
  width:100%;font-family:var(--mono);font-size:11px;
  background:var(--bg2);border:1px solid var(--border);
  color:var(--t1);padding:5px 8px;border-radius:3px;outline:none;
}
.sb-search input:focus{border-color:var(--t3)}
.sb-search input::placeholder{color:var(--t3)}

/* Tree group */
.sb-group{margin-bottom:2px}
.sb-group{margin-bottom:4px}
.sb-group-head{
  display:flex;
  align-items:center;
  gap:6px;
  padding:7px 12px;
  cursor:pointer;
  border-radius:4px;
  font-size:11px;
  background:var(--bg2);
  border:1px solid var(--border);
  user-select:none;
  margin:0 0 2px;
}
.sb-group-head:hover{background:var(--bg3);border-color:var(--t3)}
.sb-arrow{font-size:10px;color:var(--t2);transition:transform .15s;width:12px}
.sb-group.collapsed .sb-arrow{transform:rotate(-90deg)}
.sb-group.collapsed .sb-group-body{display:none}
.sb-group-name{font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--t1);font-size:11px}
.sb-group[data-depth="1"] > .sb-group-head{background:transparent;border-color:transparent}
.sb-group[data-depth="1"] > .sb-group-head:hover{background:var(--bg2)}
.sb-group[data-depth="1"] .sb-group-name{text-transform:none;font-weight:500;color:var(--t2);font-size:11px}
.sb-group[data-depth="2"] > .sb-group-head{background:transparent;border-color:transparent}
.sb-group[data-depth="2"] > .sb-group-head:hover{background:var(--bg2)}
.sb-group[data-depth="2"] .sb-group-name{text-transform:none;font-weight:400;color:var(--t3);font-size:10px}
.sb-group-count{margin-left:auto;font-size:10px;font-weight:600}

/* Tree item */
.sb-row{
  display:flex;
  align-items:center;
  gap:8px;
  padding:5px 12px;
  border-radius:4px;
  text-decoration:none;
  color:inherit;
  cursor:pointer;
}
.sb-row:hover{background:var(--bg2)}
.sb-row.active{background:var(--bg3)}
.sb-dot{font-size:8px;flex-shrink:0}
.sb-text{
  flex:1;
  font-size:11px;
  color:var(--t1);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.sb-time{
  font-size:10px;
  color:var(--t2);
  flex-shrink:0;
}

/* Main */
.main{
  flex:1;
  overflow-y:auto;
  background:var(--bg);
}
.main::-webkit-scrollbar{width:4px}
.main::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}

/* Header removed — stats in sidebar */

/* Lanes */
.lanes{padding:8px 0 60px}

.lane{
  border-bottom:1px solid var(--border);
  scroll-margin-top:8px;
}
.lane.hl{background:var(--bg2)}
.lane.fail{border-left:2px solid var(--red)}
.lane.skip{border-left:2px solid var(--t3)}

.lane-head{
  display:flex;
  align-items:center;
  gap:8px;
  padding:14px 32px;
  font-size:12px;
  cursor:pointer;
  user-select:none;
}
.lane-head:hover{background:var(--bg2)}
.lane-fold{font-size:8px;color:var(--t3);transition:transform .15s;width:10px}
.lane.collapsed .lane-fold{transform:rotate(-90deg)}
.lane.collapsed .lane-track,
.lane.collapsed .lane-error,
.lane.collapsed .lane-empty{display:none}
.lane-dot{font-size:8px}
.lane-title{
  color:var(--t1);
  font-weight:500;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width:360px;
}
.lane-tag{
  font-size:10px;
  color:var(--t3);
  padding:1px 6px;
  border:1px solid var(--border);
  border-radius:3px;
}
.lane-time{
  font-size:10px;
  color:var(--t3);
  margin-left:auto;
}

.lane-track{
  display:flex;
  align-items:center;
  gap:0;
  padding:0 32px 20px;
  overflow-x:auto;
}
.lane-track::-webkit-scrollbar{height:3px}
.lane-track::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}

.lane-error{
  display:flex;align-items:flex-start;gap:8px;
  padding:8px 32px;
  background:rgba(248,113,113,.06);
  border-top:1px solid rgba(248,113,113,.15);
}
.err-icon{
  flex-shrink:0;width:18px;height:18px;
  display:flex;align-items:center;justify-content:center;
  background:var(--red);color:var(--bg);
  font-size:11px;font-weight:700;border-radius:50%;
}
.err-msg{
  font-size:11px;color:var(--red);
  white-space:pre-wrap;word-break:break-all;
  line-height:1.4;opacity:.85;
  max-height:80px;overflow-y:auto;
}

.lane-empty{
  padding:0 32px 20px;
  font-size:11px;
  color:var(--t3);
  font-style:italic;
}

/* Card */
.card{
  flex-shrink:0;
  width:300px;
  border:1px solid var(--border);
  border-radius:6px;
  overflow:hidden;
  cursor:pointer;
  background:var(--bg2);
  transition:border-color .12s;
}
.card:hover{border-color:var(--t3)}

.card-img{position:relative;overflow:hidden;height:188px;background:var(--bg)}
.card-img img{display:block;width:100%;height:100%;object-fit:cover}
.card-num{
  position:absolute;top:6px;left:6px;
  background:rgba(0,0,0,.7);color:var(--t1);
  font-size:10px;font-weight:600;
  padding:2px 6px;border-radius:3px;
}

.card-meta{
  padding:8px 10px;
}
.card-label{
  display:block;
  font-size:11px;
  color:var(--t1);
  margin-bottom:2px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.card-url{
  display:block;
  font-size:10px;
  color:var(--t3);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

/* Arrow */
.arrow{
  flex-shrink:0;
  padding:0 8px;
  font-size:16px;
  color:var(--t3);
}

/* Modal */
.modal{
  position:fixed;inset:0;z-index:100;
  background:rgba(0,0,0,.9);
  display:none;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:32px;
}
.modal.open{display:flex}

.modal img.mi{
  max-width:82vw;
  max-height:68vh;
  border-radius:4px;
  object-fit:contain;
}
.modal .mc{
  margin-top:16px;
  text-align:center;
  font-size:12px;
}
.modal .mc-test{color:var(--t1)}
.modal .mc-label{color:var(--t2);margin-top:4px}
.modal .mc-url{color:var(--t3);font-size:10px;margin-top:2px}
.modal .mc-count{color:var(--t3);font-size:10px;margin-top:8px}

.modal .mn{
  display:flex;gap:12px;margin-top:14px;
}
.modal .mn button{
  font-family:var(--mono);
  background:var(--bg3);
  border:1px solid var(--border);
  color:var(--t2);
  width:36px;height:36px;
  border-radius:4px;
  font-size:16px;
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
}
.modal .mn button:hover{color:var(--t1);border-color:var(--t3)}

.modal .mx{
  position:fixed;top:16px;right:20px;
  background:transparent;border:none;
  color:var(--t3);font-size:24px;cursor:pointer;
  font-family:var(--mono);
}
.modal .mx:hover{color:var(--t1)}

/* Thumbs */
.modal .mt{
  display:flex;gap:4px;margin-top:10px;
  overflow-x:auto;max-width:82vw;padding:2px 0;
}
.modal .mt::-webkit-scrollbar{height:2px}
.modal .mt::-webkit-scrollbar-thumb{background:var(--border)}
.modal .mt img{
  width:48px;height:32px;
  object-fit:cover;border-radius:3px;
  cursor:pointer;opacity:.4;
  border:1px solid transparent;
  transition:opacity .1s;
}
.modal .mt img:hover{opacity:.7}
.modal .mt img.on{opacity:1;border-color:var(--t2)}

/* Mobile */
.sb-toggle{
  display:none;position:fixed;top:10px;left:10px;z-index:20;
  background:var(--bg2);border:1px solid var(--border);
  color:var(--t2);width:32px;height:32px;border-radius:4px;
  font-size:16px;cursor:pointer;font-family:var(--mono);
  align-items:center;justify-content:center;
}
@media(max-width:768px){
  .sb{position:fixed;left:0;top:0;bottom:0;transform:translateX(-100%);transition:transform .2s;z-index:30}
  .sb.open{transform:translateX(0)}
  .sb-toggle{display:flex}
}
</style>
</head>
<body>

<button class="sb-toggle" id="sbt">☰</button>

<aside class="sb" id="sb">
  <div class="sb-head">
    <h1>E2E Flow Report</h1>
    <div class="sb-sub">${reportTime}</div>
    <div class="sb-summary">
      <span class="sb-big">${summary.passed} / ${totalTests}</span>
      <span class="sb-detail">${dur(durationMs)} · <span class="g">${summary.passed} passed</span>${summary.failed > 0 ? ` · <span class="r">${summary.failed} failed</span>` : ''}${summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ''}${summary.pending > 0 ? ` · ${summary.pending} pending` : ''} · ${totalShots} shots</span>
      <div class="sb-bar">
        <span style="width:${(summary.passed / totalTests) * 100}%;background:var(--accent)"></span>
        ${summary.failed > 0 ? `<span style="width:${(summary.failed / totalTests) * 100}%;background:var(--red)"></span>` : ''}
        ${summary.skipped > 0 ? `<span style="width:${(summary.skipped / totalTests) * 100}%;background:var(--t3)"></span>` : ''}
        ${summary.pending > 0 ? `<span style="width:${(summary.pending / totalTests) * 100}%;background:var(--yellow, #fbbf24)"></span>` : ''}
      </div>
    </div>
  </div>
  <div class="sb-filter">
    <button class="on" data-f="all">all</button>
    <button data-f="passed">pass</button>
    <button data-f="failed">fail</button>
    ${summary.skipped > 0 ? '<button data-f="skipped">skip</button>' : ''}
    ${summary.pending > 0 ? '<button data-f="pending">pending</button>' : ''}
    ${tests.some((t) => t.status === 'other') ? '<button data-f="other">other</button>' : ''}
    <span class="sb-tree-toggle">
      <button id="expandAll" title="전체 펼치기">+</button>
      <button id="collapseAll" title="전체 접기">−</button>
    </span>
  </div>
  <div class="sb-search"><input id="search" type="text" placeholder="search tests..." autocomplete="off"/></div>
  <div class="sb-list">${sbTree}</div>
</aside>

<main class="main">
  <div class="lanes">${lanesHtml}</div>
</main>

<div class="modal" id="mod">
  <button class="mx" id="modX">×</button>
  <img class="mi" id="modI" src="" alt=""/>
  <div class="mc">
    <div class="mc-test" id="modT"></div>
    <div class="mc-label" id="modL"></div>
    <div class="mc-url" id="modU"></div>
    <div class="mc-count" id="modC"></div>
  </div>
  <div class="mn"><button id="modP">←</button><button id="modN">→</button></div>
  <div class="mt" id="modTh"></div>
</div>

<script>
(function(){
var G=${galleryJson};
var ci=0,cs=[];

function show(shots,i){
  cs=shots;ci=i;render();
  document.getElementById('mod').classList.add('open');
}
function render(){
  var s=cs[ci];if(!s)return;
  document.getElementById('modI').src=s.src;
  document.getElementById('modT').textContent=s._test||'';
  document.getElementById('modL').textContent=s.label;
  document.getElementById('modU').textContent=s.url;
  document.getElementById('modC').textContent=(ci+1)+' / '+cs.length;
  var h='';cs.forEach(function(t,i){
    h+='<img src="'+t.src+'" class="'+(i===ci?'on':'')+'" data-i="'+i+'" alt=""/>';
  });
  document.getElementById('modTh').innerHTML=h;
  document.getElementById('modTh').querySelectorAll('img').forEach(function(el){
    el.onclick=function(){ci=+el.dataset.i;render()};
  });
}

var mod=document.getElementById('mod');
document.getElementById('modX').onclick=function(){mod.classList.remove('open')};
mod.onclick=function(e){if(e.target===mod)mod.classList.remove('open')};
document.getElementById('modP').onclick=function(){ci=(ci-1+cs.length)%cs.length;render()};
document.getElementById('modN').onclick=function(){ci=(ci+1)%cs.length;render()};
document.addEventListener('keydown',function(e){
  if(!mod.classList.contains('open'))return;
  if(e.key==='Escape')mod.classList.remove('open');
  if(e.key==='ArrowLeft'){ci=(ci-1+cs.length)%cs.length;render()}
  if(e.key==='ArrowRight'){ci=(ci+1)%cs.length;render()}
});

// Card click → modal
document.querySelectorAll('.card').forEach(function(c){
  c.onclick=function(){
    var lane=c.closest('.lane');
    var cards=Array.from(lane.querySelectorAll('.card'));
    var idx=cards.indexOf(c);
    var shots=cards.map(function(el){
      return{src:el.dataset.src,label:el.dataset.label,url:el.dataset.url,_test:el.dataset.test};
    });
    show(shots,idx);
  };
});

// Sidebar click
document.querySelectorAll('.sb-row').forEach(function(a){
  a.onclick=function(e){
    e.preventDefault();
    document.querySelectorAll('.sb-row').forEach(function(x){x.classList.remove('active')});
    a.classList.add('active');
    var t=document.getElementById('lane-'+a.dataset.i);
    if(t){t.scrollIntoView({behavior:'smooth',block:'start'});t.classList.add('hl');setTimeout(function(){t.classList.remove('hl')},1500)}
    document.getElementById('sb').classList.remove('open');
  };
});

// Filter
var statuses=${jsonForScript(orderedTests.map((o) => o.test.status))};
document.querySelectorAll('.sb-filter button').forEach(function(b){
  b.onclick=function(){
    document.querySelectorAll('.sb-filter button').forEach(function(x){x.classList.remove('on')});
    b.classList.add('on');
    var f=b.dataset.f;
    document.querySelectorAll('.sb-row').forEach(function(r){r.style.display=(f==='all'||r.dataset.status===f)?'flex':'none'});
    document.querySelectorAll('.lane').forEach(function(l,i){l.style.display=(f==='all'||statuses[i]===f)?'block':'none'});
  };
});

// Lane fold/unfold
document.querySelectorAll('.lane-head').forEach(function(h){
  h.onclick=function(){h.parentElement.classList.toggle('collapsed')};
});

// Scroll spy — highlight active sidebar item
var lanes=document.querySelectorAll('.lane');
var sbRows=document.querySelectorAll('.sb-row');
var mainEl=document.querySelector('.main');
var spyTimeout;
mainEl.addEventListener('scroll',function(){
  clearTimeout(spyTimeout);
  spyTimeout=setTimeout(function(){
    var scrollTop=mainEl.scrollTop+60;
    var active=null;
    lanes.forEach(function(l,i){
      if(l.offsetTop<=scrollTop)active=i;
    });
    sbRows.forEach(function(r){r.classList.remove('active')});
    if(active!==null){
      // find matching sb-row
      sbRows.forEach(function(r){
        if(parseInt(r.dataset.i)===parseInt(lanes[active].id.replace('lane-','')))r.classList.add('active');
      });
    }
  },100);
});

// Search
document.getElementById('search').addEventListener('input',function(e){
  var q=e.target.value.toLowerCase();
  document.querySelectorAll('.sb-row').forEach(function(r){
    var match=!q||r.querySelector('.sb-text').textContent.toLowerCase().includes(q);
    r.style.display=match?'flex':'none';
  });
  document.querySelectorAll('.sb-group').forEach(function(g){
    var visible=g.querySelectorAll('.sb-row[style*="flex"]').length>0||!q;
    g.style.display=visible?'block':'none';
  });
  // lane도 필터
  document.querySelectorAll('.lane').forEach(function(l,i){
    var title=l.querySelector('.lane-title').textContent.toLowerCase();
    l.style.display=(!q||title.includes(q))?'block':'none';
  });
});

// Tree toggle
document.querySelectorAll('.sb-group-head').forEach(function(h){
  h.onclick=function(){h.parentElement.classList.toggle('collapsed')};
});
document.getElementById('expandAll').onclick=function(){
  document.querySelectorAll('.sb-group').forEach(function(g){g.classList.remove('collapsed')});
};
document.getElementById('collapseAll').onclick=function(){
  document.querySelectorAll('.sb-group').forEach(function(g){g.classList.add('collapsed')});
};

document.getElementById('sbt').onclick=function(){document.getElementById('sb').classList.toggle('open')};
})();
</script>
</body>
</html>`;
}

// --- Main ---

export async function generateFlowHtml(ctrfReportPath: string, outputHtmlPath: string): Promise<void> {
  const report: CtrfReport = JSON.parse(fs.readFileSync(ctrfReportPath, 'utf-8'));
  const baseDir = path.dirname(ctrfReportPath);
  const base64Map = new Map<string, string>();

  // Load each test's flow screenshots as base64
  const resolvedBase = path.resolve(baseDir) + path.sep;
  for (const t of report.results.tests) {
    const shots = t.extra?.flow?.screenshots ?? [];
    for (const s of shots) {
      const resolved = path.resolve(baseDir, s.screenshotPath);
      // Prevent path traversal — screenshot must stay within base directory
      if (!resolved.startsWith(resolvedBase)) {
        continue;
      }
      base64Map.set(s.id, toBase64(resolved));
    }
  }

  const html = buildHtml(report, base64Map);
  const outDir = path.dirname(outputHtmlPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputHtmlPath, html, 'utf-8');
}

const isMain = typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('generate-html');
if (isMain) {
  const args = process.argv.slice(2);
  generateFlowHtml(args[0] || './flow-report/ctrf-report.json', args[1] || './flow-report/index.html')
    .then(() => console.log('Generated'));
}

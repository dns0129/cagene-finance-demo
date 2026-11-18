/* The company's own chart of accounts, Manager.io style. The system accounts keep their internal ids
   (1000 cash, 1100 receivables, 4100 revenue…) because every template posts to them; a chart only
   changes what people see: each account's code and name, extra accounts the company adds, codes for
   bank accounts, unused system accounts hidden from pickers, and the section headings and totals the
   grouped statements print. Amounts never change when the chart changes. */
(() => {
'use strict';
const L = window.AccountingLocale;
const esc = L.literal, uiEsc = L.escape;
const isRecord = v => v && typeof v === 'object' && !Array.isArray(v);
const own = Object.hasOwn;
const MAIN = 'main';

const SECTIONS = [
  {id:'nca', side:'bs', zh:'非流动资产', en:'Non-current assets'},
  {id:'ca', side:'bs', zh:'流动资产', en:'Current assets'},
  {id:'cl', side:'bs', zh:'流动负债', en:'Current liabilities'},
  {id:'ncl', side:'bs', zh:'非流动负债', en:'Non-current liabilities'},
  {id:'eq', side:'bs', zh:'权益', en:'Equity'},
  {id:'rev', side:'pl', zh:'营业收入', en:'Revenue'},
  {id:'cos', side:'pl', zh:'销售成本', en:'Cost of sales'},
  {id:'oi', side:'pl', zh:'其他收入', en:'Other income'},
  {id:'opx', side:'pl', zh:'营业费用', en:'Expenses'},
  {id:'oe', side:'pl', zh:'其他支出', en:'Other expenses'},
  {id:'tax', side:'pl', zh:'所得税', en:'Income tax'},
];
const SECTION = Object.fromEntries(SECTIONS.map(s => [s.id, s]));
const LINES = {
  bs:{zh:'资产负债表', en:'Balance Sheet'},
  pl:{zh:'损益表', en:'Income Statement'},
  assets:{zh:'资产合计', en:'Total assets'},
  liabilities:{zh:'负债合计', en:'Total liabilities'},
  le:{zh:'负债及权益合计', en:'Total liabilities and equity'},
  gp:{zh:'毛利', en:'Gross profit'},
  pbt:{zh:'税前利润', en:'Profit before tax'},
  np:{zh:'净利润', en:'Net profit'},
};
// Import words for the computed lines, in the order they appear on the statements.
const LINE_WORDS = {'标题:资产负债表':'bs','标题:损益表':'pl','合计:资产':'assets','合计:负债':'liabilities','合计:负债及权益':'le','毛利':'gp','税前利润':'pbt','净利润':'np'};
// What a new account behaves like. The section decides where it prints; the rest decides cash-flow class.
const KINDS = {
  nca:{sec:'nca', short:'非流动资产', zh:'非流动资产（物业、厂房、设备）', base:{t:'A', cf:'inv', k:'ppe'}},
  ca:{sec:'ca', short:'流动资产', zh:'流动资产（押金、暂记款等）', base:{t:'A', cf:'wc', op:'otherOpex'}},
  car:{sec:'ca', short:'待收款', zh:'流动资产 · 待收款（收款渠道待结算、其他应收）', base:{t:'A', cf:'wc', op:'customers'}},
  cl:{sec:'cl', short:'流动负债', zh:'流动负债', base:{t:'L', cf:'wc', op:'otherOpex'}},
  clf:{sec:'cl', short:'借款或董事往来', zh:'流动负债 · 借款或董事往来（现金流量列筹资）', base:{t:'L', cf:'fin', k:'borrow'}},
  ncl:{sec:'ncl', short:'非流动负债', zh:'非流动负债 · 长期借款', base:{t:'L', cf:'fin', k:'borrow'}},
  rev:{sec:'rev', short:'营业收入', zh:'营业收入', base:{t:'R', pl:'rev', cf:'pl', op:'customers'}},
  oi:{sec:'oi', short:'其他收入', zh:'其他收入', base:{t:'R', pl:'oth', cf:'pl', op:'otherOpex'}},
  cos:{sec:'cos', short:'销售成本', zh:'销售成本（采购、货品成本）', base:{t:'X', pl:'opx', fn:'cos', cf:'pl', op:'suppliers'}},
  opx:{sec:'opx', short:'营业费用', zh:'营业费用', base:{t:'X', pl:'opx', fn:'admin', cf:'pl', op:'otherOpex'}},
  oe:{sec:'oe', short:'其他支出', zh:'其他支出（利息、汇兑损益等）', base:{t:'X', pl:'oth', cf:'pl', op:'otherOpex'}},
};
const CODE_RE = /^[0-9A-Za-z][0-9A-Za-z.\-]{0,19}$/;
const cmpCode = (a, b) => String(a).localeCompare(String(b), 'en', {numeric:true});
const clean = v => typeof v === 'string' ? v.trim() : '';
// A name equal to the Chinese default (what the export writes for an unrenamed row) isn't stored, so it keeps following the interface language
// (an exported chart re-imports unchanged instead of freezing every default label as typed text).
const stock = (name, ...defaults) => !name || defaults.includes(name);

function sectionOf(a){
  if (a.sec) return a.sec;
  if (a.t === 'A' || a.t === 'XA') return a.cf === 'inv' && a.k !== 'hfs' ? 'nca' : 'ca';
  if (a.t === 'L') return a.k === 'borrow' ? 'ncl' : 'cl';
  if (a.t === 'E' || a.t === 'XE') return 'eq';
  if (a.t === 'R') return a.pl === 'rev' ? 'rev' : 'oi';
  if (a.t === 'O') return 'oci';
  if (a.pl === 'opx') return a.fn === 'cos' ? 'cos' : 'opx';
  if (a.pl === 'tax' || a.pl === 'discTax') return 'tax';
  return 'oe';
}

// The account list for a book: system accounts with the chart's codes and names, plus its own accounts.
function build(base, chart){
  const out = base.map(a => ({...a, code:a.c}));
  if (!chart) return out;
  for (const a of out) {
    const o = chart.accounts?.[a.c];
    if (!o) continue;
    if (o.code) a.code = o.code;
    if (o.name) { a.sysZh = a.zh; a.sysEn = a.en; a.zh = a.en = o.name; a.user = true; delete a.natZh; delete a.natEn; }
    if (o.hidden) a.off = true;
  }
  for (const c of chart.custom || []) {
    const k = KINDS[c.kind];
    const a = {...k.base, c:c.id, code:c.code, zh:c.name, en:c.name, user:true, custom:true, kind:c.kind, sec:k.sec};
    if (a.cf === 'wc') a.wc = c.id;
    if (c.hidden) a.off = true;
    out.push(a);
  }
  return out.sort((x, y) => (x.hidden ? 1 : 0) - (y.hidden ? 1 : 0) || cmpCode(x.code, y.code));
}
const lookup = (base, chart) => Object.fromEntries(build(base, chart).map(a => [a.c, a]));

function cashAccounts(book){
  const extra = book.cashAccounts || [], allocated = extra.reduce((n, a) => n + a.opening, 0);
  const codes = book.chart?.cash || {};
  return [{id:MAIN, name:codes[MAIN]?.name || '默认资金账户', user:!!codes[MAIN]?.name, opening:(book.opening['1000'] || 0) - allocated}, ...extra.map(a => ({...a, user:true}))]
    .map(a => ({...a, code:codes[a.id]?.code || ''}));
}

function fail(message){ throw new Error(message); }
function checkLabel(o, where, {name = 'name', code = 'code', needName = false} = {}){
  if (o[code] != null && (typeof o[code] !== 'string' || !CODE_RE.test(o[code]))) fail(`${where}：代码只能用字母、数字、点或短横线，最多 20 位`);
  if (o[name] != null || needName) { const n = clean(o[name]); if (!n || n.length > 80 || n !== o[name]) fail(`${where}：名称必填，最多 80 个字符`); }
}
function validate(book, base){
  const c = book.chart;
  if (c == null) return;
  if (!isRecord(c) || c.v !== 1) fail('科目表格式不正确');
  const ids = new Set(base.map(a => a.c));
  if (c.accounts != null) {
    if (!isRecord(c.accounts)) fail('科目表格式不正确');
    for (const [id, o] of Object.entries(c.accounts)) {
      if (!ids.has(id) || id === '3900' || !isRecord(o)) fail('科目表包含无效的系统科目：' + id);
      checkLabel(o, '科目 ' + id);
      if (o.hidden != null && typeof o.hidden !== 'boolean') fail('科目表格式不正确');
    }
  }
  if (c.custom != null) {
    if (!Array.isArray(c.custom) || c.custom.length > 500) fail('科目表最多 500 个自建科目');
    const seen = new Set();
    for (const a of c.custom) {
      if (!isRecord(a) || typeof a.id !== 'string' || !/^U[1-9]\d{0,5}$/.test(a.id) || seen.has(a.id) || !own(KINDS, a.kind)) fail('自建科目的编号或类别无效');
      seen.add(a.id);
      if (!a.code) fail('自建科目必须有代码');
      checkLabel(a, '科目 ' + a.code, {needName:true});
      if (a.hidden != null && typeof a.hidden !== 'boolean') fail('科目表格式不正确');
    }
  }
  for (const [key, list, extra] of [['sections', SECTION, ['total', 'totalCode']], ['lines', LINES, []]]) {
    if (c[key] == null) continue;
    if (!isRecord(c[key])) fail('科目表格式不正确');
    for (const [id, o] of Object.entries(c[key])) {
      if (!own(list, id) || !isRecord(o)) fail('科目表的标题或合计行无效');
      checkLabel(o, '标题 ' + id);
      if (extra.length) checkLabel(o, '合计 ' + id, {name:'total', code:'totalCode'});
    }
  }
  if (c.cash != null) {
    if (!isRecord(c.cash)) fail('科目表格式不正确');
    const cashIds = new Set([MAIN, ...(Array.isArray(book.cashAccounts) ? book.cashAccounts : []).map(a => a?.id)]);
    for (const [id, o] of Object.entries(c.cash)) {
      if (!cashIds.has(id) || !isRecord(o) || (o.name != null && id !== MAIN)) fail('科目表的资金账户无效');
      checkLabel(o, '资金账户');
    }
  }
  const codes = new Map();
  const claim = (code, what) => { const k = code.toLowerCase(); if (codes.has(k)) fail(`代码 ${code} 重复：${codes.get(k)}、${what}`); codes.set(k, what); };
  for (const a of build(base, c)) if (!a.hidden) claim(a.code, a.zh);
  for (const [id, o] of Object.entries(c.cash || {})) if (o.code) claim(o.code, o.name || (id === MAIN ? '默认资金账户' : '资金账户 ' + id));
}

// Codes people type (CSV vouchers): the company's codes first, then system ids nobody has reused.
function codeIndex(accounts, book){
  const out = {};
  for (const a of accounts) if (!a.hidden) out[a.code] = a;
  for (const a of cashAccounts(book)) if (a.code) out[a.code] = {...accounts.find(x => x.c === '1000'), cash:a.id};
  for (const a of accounts) if (!a.hidden && !own(out, a.c)) out[a.c] = a;
  return out;
}

/* ---------- import / export (CSV: 代码,名称,对应,备注) ---------- */
const HEAD = {code:['代码','科目代码','code','accountcode'], name:['名称','科目名称','name','accountname'], map:['对应','系统对应','对应系统科目','map','mapping'], note:['备注','说明','note','notes']};
const norm = s => String(s ?? '').replace(/[\s_]/g, '').toLowerCase();
const sectionByWord = w => SECTIONS.find(s => s.id === w || s.zh === w);
const kindByWord = w => Object.entries(KINDS).find(([k, v]) => k === w || v.short === w)?.[0];

function parseImport(text, book, base){
  const EBook = window.AccountingEnterprise;
  const [header, ...rows] = EBook.readCsv(String(text || '').replace(/^﻿/, ''));
  if (!header) fail('请粘贴或选择科目表 CSV');
  const col = {};
  header.forEach((h, i) => { for (const [k, names] of Object.entries(HEAD)) if (names.map(norm).includes(norm(h))) col[k] = i; });
  if (col.code == null || col.name == null || col.map == null) fail('表头需要包含「代码」「名称」「对应」三列');
  if (!rows.length || rows.length > 800) fail('科目表需要 1–800 行');
  const current = book.chart || {};
  const chart = {v:1, accounts:{}, custom:[], sections:{}, lines:{}, cash:{}};
  const summary = [], usedBase = new Set(), cashRows = [], customIds = new Set((current.custom || []).map(a => a.id));
  let nextId = Math.max(0, ...(current.custom || []).map(a => +a.id.slice(1))) + 1;
  const baseIds = new Map(base.filter(a => !a.hidden).map(a => [a.c, a]));
  rows.forEach((row, i) => {
    const at = `第 ${i + 2} 行`;
    const code = clean(row[col.code]), name = clean(row[col.name]), raw = clean(row[col.map]).replace(/：/g, ':').replace(/\s+/g, '');
    if (!code && !name && !raw) return;
    const bad = message => fail(`${at}（${code || name}）：${message}`);
    if (code && !CODE_RE.test(code)) bad('代码只能用字母、数字、点或短横线，最多 20 位');
    if (name.length > 80) bad('名称最多 80 个字符');
    const push = (action, detail = '') => summary.push({row:i + 2, code, name, action, detail});
    if (!raw || raw === '忽略') { push('忽略'); return; }
    if (own(LINE_WORDS, raw)) {
      const key = LINE_WORDS[raw];
      chart.lines[key] = {...(code ? {code} : {}), ...(stock(name, LINES[key].zh) ? {} : {name})};
      push(key === 'bs' || key === 'pl' ? '报表标题' : '合计行', LINES[key].zh); return;
    }
    const m = raw.match(/^(标题|合计|新增):(.+)$/);
    if (m && m[1] !== '新增') {
      const sec = sectionByWord(m[2]); if (!sec) bad('不认识的分组：' + m[2]);
      const o = chart.sections[sec.id] ||= {};
      if (m[1] === '标题') { if (code) o.code = code; if (!stock(name, sec.zh)) o.name = name; push('分组标题', sec.zh); }
      else { if (code) o.totalCode = code; if (!stock(name, `${o.name || sec.zh}合计`, `${sec.zh}合计`)) o.total = name; push('分组合计', sec.zh); }
      return;
    }
    if (!code || !name) bad('科目需要代码和名称');
    if (m) {
      const kind = kindByWord(m[2]); if (!kind) bad('不认识的类别：' + m[2]);
      const old = (current.custom || []).find(a => a.code.toLowerCase() === code.toLowerCase() && !chart.custom.some(x => x.id === a.id))
        || (current.custom || []).find(a => a.name === name && !chart.custom.some(x => x.id === a.id));
      let id = old?.id;
      if (!id) { while (customIds.has('U' + nextId)) nextId++; id = 'U' + nextId++; customIds.add(id); }
      chart.custom.push({id, code, name, kind});
      push('新增科目', KINDS[kind].zh); return;
    }
    if (raw === '资金账户') { cashRows.push({code, name, row:i + 2}); push('资金账户', cashRows.length === 1 ? '默认资金账户改名' : ''); return; }
    const sys = baseIds.get(raw);
    if (!sys || raw === '3900') bad('「对应」需要是系统科目代码、资金账户、新增:类别、标题:分组、合计:分组或忽略');
    if (usedBase.has(raw)) bad(`系统科目 ${raw} 已对应到前面的行`);
    usedBase.add(raw);
    chart.accounts[raw] = stock(name, sys.zh) ? {code} : {code, name};
    push('对应系统科目', `${raw} ${sys.zh}`);
  });
  for (const k of ['sections', 'lines']) for (const [id, o] of Object.entries(chart[k])) if (!Object.keys(o).length) delete chart[k][id];
  // Cash: the first bank row renames the default account; the others match existing accounts by name or are added.
  const newCash = [], existing = book.cashAccounts || [];
  cashRows.forEach((r, i) => {
    if (!i) { chart.cash[MAIN] = {code:r.code, name:r.name}; return; }
    const same = existing.find(a => a.name.trim().toLowerCase() === r.name.toLowerCase());
    if (same) { chart.cash[same.id] = {code:r.code}; return; }
    let id = ('B' + r.code).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40);
    while (existing.some(a => a.id === id) || newCash.some(a => a.id === id)) id += '-';
    newCash.push({id, name:r.name, opening:0});
    chart.cash[id] = {code:r.code};
  });
  // System accounts the company's chart doesn't list stay available to the templates but leave the pickers.
  for (const a of base) if (!a.hidden && a.c !== '1000' && !usedBase.has(a.c)) chart.accounts[a.c] = {hidden:true};
  for (const k of ['sections', 'lines', 'cash']) if (!Object.keys(chart[k]).length) delete chart[k];
  return {chart, newCash, summary};
}

function exportRows(book, accounts){
  const c = book.chart || {}, rows = [['代码', '名称', '对应', '备注']];
  const label = (o, fb) => o?.name || fb;
  const line = key => rows.push([c.lines?.[key]?.code || '', label(c.lines?.[key], LINES[key].zh), Object.entries(LINE_WORDS).find(([, v]) => v === key)[0], '']);
  const section = sec => {
    const s = c.sections?.[sec.id] || {};
    rows.push([s.code || '', s.name || sec.zh, '标题:' + sec.zh, '']);
    if (sec.id === 'ca') for (const a of cashAccounts(book)) rows.push([a.code, a.name, '资金账户', a.id === MAIN ? '第一个资金账户对应默认账户' : '']);
    for (const a of accounts) {
      if (a.hidden || a.off || sectionOf(a) !== sec.id || (sec.id === 'ca' && a.c === '1000')) continue;
      rows.push([a.code, a.zh, a.custom ? '新增:' + KINDS[a.kind].short : a.c, a.custom ? '' : (a.sysZh ? `系统科目：${a.sysZh}` : '')]);
    }
    rows.push([s.totalCode || '', s.total || `${s.name || sec.zh}合计`, '合计:' + sec.zh, '']);
  };
  line('bs');
  for (const s of SECTIONS) {
    if (s.id === 'rev') { line('le'); line('pl'); }
    section(s);
    if (s.id === 'ca') line('assets');
    if (s.id === 'ncl') line('liabilities');
    if (s.id === 'cos') line('gp');
    if (s.id === 'oe') line('pbt');
  }
  line('np');
  return rows;
}

/* ---------- the 科目表 tab ---------- */
const sectionName = (book, id) => book.chart?.sections?.[id]?.name || SECTION[id].zh;
const view = {showHidden:false};
function paneHTML({book, accounts, used, writable}){
  const chart = book.chart, dis = writable ? '' : ' disabled';
  const kindLabel = a => a.custom ? KINDS[a.kind].zh : a.sysZh ? `系统：${uiEsc(a.sysZh)}` : '系统科目';
  const name = a => a.user ? esc(a.zh) : uiEsc(a.zh);
  const row = a => {
    const inUse = used.has(a.c);
    const acts = [`<button class="btn small" data-chart="edit" data-id="${esc(a.c)}"${dis}>修改</button>`];
    if (a.c !== '1000') acts.push(`<button class="btn small" data-chart="toggle" data-id="${esc(a.c)}"${dis}>${a.off ? '显示' : '隐藏'}</button>`);
    if (a.custom && !inUse) acts.push(`<button class="btn small" data-chart="delete" data-id="${esc(a.c)}"${dis}>删除</button>`);
    return `<tr class="${a.off ? 'chart-off' : ''}" data-chart-row="${esc(a.c)}"><td class="code">${esc(a.code)}</td><td>${name(a)}${a.off ? '<small>已隐藏，不出现在科目选择里</small>' : ''}</td><td><small>${kindLabel(a)}</small></td><td><small>${inUse ? '已使用' : '未使用'}</small></td><td class="chart-acts">${acts.join('')}</td></tr>`;
  };
  const cashRow = a => `<tr data-chart-cash="${esc(a.id)}"><td class="code">${esc(a.code) || '—'}</td><td>${a.user ? esc(a.name) : uiEsc(a.name)}</td><td><small>资金账户（银行、现金）</small></td><td><small>${a.id === MAIN ? '默认账户' : ''}</small></td><td class="chart-acts"><button class="btn small" data-chart="cash" data-id="${esc(a.id)}"${dis}>修改</button></td></tr>`;
  const groups = SECTIONS.map(sec => {
    const list = accounts.filter(a => !a.hidden && sectionOf(a) === sec.id && !(a.c === '1000' && chart) && (view.showHidden || !a.off || used.has(a.c)));
    const cash = sec.id === 'ca' && chart ? cashAccounts(book).map(cashRow).join('') : '';
    const s = chart?.sections?.[sec.id];
    return `<tbody><tr class="chart-sec"><th colspan="4">${s?.code ? `<span class="code">${esc(s.code)}</span>` : ''}${s?.name ? esc(s.name) : uiEsc(sec.zh)}${s?.name && s.name !== sec.zh ? `<small>${uiEsc(sec.zh)}</small>` : ''}</th><th class="chart-acts">${chart ? `<button class="btn small" data-chart="section" data-sec="${sec.id}"${dis}>修改标题</button>` : ''}</th></tr>${cash}${list.map(row).join('') || (cash ? '' : '<tr><td colspan="5" class="empty">没有科目</td></tr>')}</tbody>`;
  }).join('');
  const offCount = accounts.filter(a => a.off && !used.has(a.c)).length;
  const toggle = offCount ? `<p class="tdesc"><button class="text-button" data-chart="show-hidden">${view.showHidden ? '收起' : '显示'}已隐藏的系统科目（${offCount} 个）</button> 这些科目没有余额，只是不出现在科目选择里；模板需要时仍会记到它们。</p>` : '';
  const intro = chart
    ? `<p class="tdesc">报表按下面的分组和代码排列。改代码和名称不会改变任何金额；有凭证的科目不能删除，只能隐藏。</p>`
    : `<p class="tdesc">目前使用系统默认科目。可以导入公司自己的科目表（代码、名称、对应的系统科目），之后凭证、总账和报表都按你们的代码和名称显示，报表改为按科目表分组。</p>`;
  return `<div class="pane-bar"><p class="tip"><b>做什么：</b>定好记账用的科目：代码、名称和它在报表里的分组。<b>什么时候用：</b>开始用系统时设置一次，之后需要新科目再来。改名、改代码不会改动金额，自动记账照常工作。</p><div class="pane-ctl">
      <button class="btn small" data-chart="import"${dis}>导入科目表</button><button class="btn small" data-chart="export">导出科目表 CSV</button>${chart ? `<button class="btn small" data-chart="add"${dis}>新增科目</button><button class="btn small" data-chart="reset"${dis}>恢复系统默认</button>` : ''}</div></div>
    ${intro}${toggle}<div class="scroll"><table class="wk chart-table"><thead><tr><th>代码</th><th>名称</th><th>类别</th><th>状态</th><th></th></tr></thead>${groups}</table></div>`;
}

const kindOptions = sel => Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${uiEsc(v.zh)}</option>`).join('');
function editHTML({title, code = '', name = '', kind = null, kindLocked = false, extra = '', note = ''}){
  return `<div class="modal-box chart-dialog" role="dialog" aria-modal="true" aria-labelledby="chartDialogTitle"><h3 id="chartDialogTitle">${uiEsc(title)}</h3>${note ? `<p class="tdesc">${note}</p>` : ''}
    <div class="fields"><div class="field"><label for="chart-code">代码</label><input id="chart-code" value="${esc(code)}" autocomplete="off" maxlength="20"></div>
    <div class="field"><label for="chart-name">名称</label><input id="chart-name" value="${esc(name)}" autocomplete="off" maxlength="80"></div>
    ${kind != null ? `<div class="field full"><label for="chart-kind">类别</label><select id="chart-kind"${kindLocked ? ' disabled' : ''}>${kindOptions(kind)}</select>${kindLocked ? '<small>已有凭证的科目不能改类别，以免已出的报表变化。</small>' : ''}</div>` : ''}${extra}</div>
    <p class="err" id="chart-error" role="alert"></p>
    <div class="actions"><button class="btn primary" data-chart="save">保存</button><button class="btn" data-act="closeModal">取消</button></div></div>`;
}
function importHTML(){
  return `<div class="modal-box chart-dialog chart-wide" role="dialog" aria-modal="true" aria-labelledby="chartImportTitle"><h3 id="chartImportTitle">导入科目表</h3>
    <p class="tdesc">CSV 需要「代码、名称、对应」三列（可加「备注」）。「对应」填：系统科目代码（例如 1100）表示改用你们的代码和名称；<b>资金账户</b>表示银行或现金账户；<b>新增:营业费用</b>等表示新科目；<b>标题:流动资产</b>、<b>合计:流动资产</b>、<b>合计:资产</b>、<b>毛利</b>、<b>净利润</b>等是报表标题和合计行；<b>忽略</b>跳过这一行。先点「导出科目表 CSV」可以得到当前科目表作为模板。</p>
    <div class="fields"><div class="field full"><label for="chart-file">选择 CSV 文件</label><input id="chart-file" type="file" accept=".csv,text/csv"></div>
    <div class="field full"><label for="chart-text">或粘贴 CSV 内容</label><textarea id="chart-text" rows="8" spellcheck="false"></textarea></div></div>
    <p class="err" id="chart-error" role="alert"></p><div id="chart-preview"></div>
    <div class="actions"><button class="btn" data-chart="import-preview">预览</button><button class="btn primary" data-chart="import-confirm" hidden>确认导入</button><button class="btn" data-act="closeModal">取消</button></div></div>`;
}
function previewHTML(result, book){
  const counts = Object.fromEntries(['对应系统科目', '新增科目', '资金账户', '分组标题', '分组合计', '报表标题', '合计行', '忽略'].map(k => [k, 0]));
  for (const r of result.summary) counts[r.action]++;
  for (const k of Object.keys(counts)) if (!counts[k]) delete counts[k];
  const kept = (book.cashAccounts || []).length;
  return `<p class="tdesc">${Object.entries(counts).map(([k, n]) => `${uiEsc(k)} ${n} 行`).join(' · ')}${result.newCash.length ? ` · 将新增 ${result.newCash.length} 个资金账户（期初 0）` : ''}${kept ? ` · 原有 ${kept} 个资金账户保留` : ''}。未列出的系统科目会隐藏，但已有的凭证不受影响。</p>
    <div class="scroll chart-preview"><table class="wk"><thead><tr><th>行</th><th>代码</th><th>名称</th><th>处理</th></tr></thead><tbody>${result.summary.map(r => `<tr><td>${r.row}</td><td class="code">${esc(r.code)}</td><td>${esc(r.name)}</td><td>${uiEsc(r.action)}${r.detail ? ` <small>${uiEsc(r.detail)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

/* Clicks inside the tab and its dialogs. `ctx` reads the live book; `commit(next)` saves a whole new chart. */
class ChartManager {
  constructor(ctx){
    this.ctx = ctx;
    this.pending = null;
    this.editing = null;
    document.addEventListener('click', e => this.click(e));
    document.addEventListener('change', e => { if (e.target.id === 'chart-file') this.readFile(e.target); });
  }
  modal(html){ const m = document.querySelector('#modal'); m.innerHTML = L.markup(html); m.hidden = false; m.querySelector('input,textarea,select,button')?.focus(); }
  error(message){ const el = document.querySelector('#chart-error'); if (el) el.textContent = L.text(message); }
  val(id){ return (document.querySelector('#' + id)?.value || '').trim(); }
  readFile(input){
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 512 * 1024) { this.error('文件太大，科目表 CSV 最大 512 KB'); return; }
    file.text().then(text => { document.querySelector('#chart-text').value = text; this.preview(); }).catch(() => this.error('无法读取这个文件'));
  }
  preview(){
    const {book, base} = this.ctx;
    this.pending = null;
    document.querySelector('[data-chart="import-confirm"]').hidden = true;
    document.querySelector('#chart-preview').innerHTML = '';
    try {
      const result = parseImport(document.querySelector('#chart-text').value, book(), base);
      this.ctx.check(result.chart, result.newCash);
      this.pending = result;
      this.error('');
      document.querySelector('#chart-preview').innerHTML = L.markup(previewHTML(result, book()));
      document.querySelector('[data-chart="import-confirm"]').hidden = false;
    } catch (e) { this.error(e.message); }
  }
  chartCopy(){ return structuredClone(this.ctx.book().chart || {v:1}); }
  submit(next, newCash = [], message = '科目表已更新。'){
    try { this.ctx.check(next, newCash); }
    catch (e) { this.error(e.message); return false; }
    if (!this.ctx.commit(next, newCash, message)) return false;
    document.querySelector('#modal').hidden = true;
    return true;
  }
  click(e){
    const el = e.target.closest('[data-chart]');
    if (!el || !this.ctx.ready()) return;
    const act = el.dataset.chart, id = el.dataset.id, book = this.ctx.book();
    if (act === 'show-hidden') { view.showHidden = !view.showHidden; this.ctx.render(); return; }
    const accounts = this.ctx.accounts(), a = accounts.find(x => x.c === id);
    if (act === 'export') { this.ctx.download('科目表.csv', window.AccountingEnterprise.csv(exportRows(book, accounts))); return; }
    if (!this.ctx.writable()) { this.ctx.toast('当前账本只读，不能修改科目表。'); return; }
    switch (act) {
      case 'import': this.pending = null; this.modal(importHTML()); break;
      case 'import-preview': this.preview(); break;
      case 'import-confirm': if (this.pending) this.submit(this.pending.chart, this.pending.newCash, '科目表已导入。报表已按新的分组显示，可用提示条撤销。'); break;
      case 'add':
        this.editing = {kind:'add'};
        this.modal(editHTML({title:'新增科目', kind:'opx', note:'新科目会出现在凭证、总账和报表里。类别决定它在报表中的分组和现金流量分类。'}));
        break;
      case 'edit': {
        if (!a) return;
        const used = this.ctx.used().has(a.c);
        this.editing = {kind:'account', id};
        this.modal(editHTML({title:'修改科目', code:a.code, name:a.zh, kind:a.custom ? a.kind : null, kindLocked:used,
          note:a.custom ? '' : `系统科目：${uiEsc(a.sysZh || a.zh)}（${esc(a.c)}）。自动记账仍使用这个科目，只是显示你们的代码和名称。`}));
        break;
      }
      case 'cash': {
        const c = cashAccounts(book).find(x => x.id === id); if (!c) return;
        this.editing = {kind:'cash', id};
        this.modal(editHTML({title:'资金账户代码', code:c.code, name:c.name, note:id === MAIN ? '默认资金账户：可以改代码和名称。' : '名称可在「资金账户」页修改；这里设置它在科目表中的代码。'}));
        if (id !== MAIN) document.querySelector('#chart-name').disabled = true;
        break;
      }
      case 'section': {
        const s = book.chart?.sections?.[el.dataset.sec] || {}, sec = SECTION[el.dataset.sec];
        this.editing = {kind:'section', id:sec.id};
        this.modal(editHTML({title:'分组标题与合计', code:s.code || '', name:s.name || sec.zh,
          extra:`<div class="field"><label for="chart-total-code">合计行代码</label><input id="chart-total-code" value="${esc(s.totalCode || '')}" autocomplete="off" maxlength="20"></div><div class="field"><label for="chart-total">合计行名称</label><input id="chart-total" value="${esc(s.total || '')}" placeholder="${uiEsc((s.name || sec.zh) + '合计')}" autocomplete="off" maxlength="80"></div>`}));
        break;
      }
      case 'save': this.save(); break;
      case 'toggle': {
        if (!a) return;
        const next = this.chartCopy();
        if (a.custom) { const c = next.custom.find(x => x.id === id); if (a.off) delete c.hidden; else c.hidden = true; }
        else { const o = (next.accounts ||= {})[id] ||= {}; if (a.off) delete o.hidden; else o.hidden = true; if (!Object.keys(o).length) delete next.accounts[id]; }
        this.submit(next, [], a.off ? '科目已显示。' : '科目已隐藏，不再出现在科目选择里。');
        break;
      }
      case 'delete': {
        if (!a?.custom || this.ctx.used().has(id)) { this.ctx.toast('这个科目已有凭证或期初余额，不能删除，可以隐藏。'); return; }
        const next = this.chartCopy(); next.custom = next.custom.filter(x => x.id !== id);
        this.submit(next, [], `已删除科目 ${a.code} ${a.zh}。`);
        break;
      }
      case 'reset': {
        if (book.chart?.custom?.some(x => this.ctx.used().has(x.id))) { this.ctx.toast('有自建科目已经使用，不能恢复系统默认。可以逐个修改。'); return; }
        this.submit(undefined, [], '已恢复系统默认科目表。');
        break;
      }
    }
  }
  save(){
    const ed = this.editing; if (!ed) return;
    const code = this.val('chart-code'), name = this.val('chart-name'), next = this.chartCopy();
    if (code && !CODE_RE.test(code)) { this.error('代码只能用字母、数字、点或短横线，最多 20 位'); return; }
    if (ed.kind === 'section') {
      const total = this.val('chart-total'), totalCode = this.val('chart-total-code');
      if (totalCode && !CODE_RE.test(totalCode)) { this.error('合计行代码只能用字母、数字、点或短横线'); return; }
      const o = {...(code ? {code} : {}), ...(name && name !== SECTION[ed.id].zh ? {name} : {}), ...(totalCode ? {totalCode} : {}), ...(total ? {total} : {})};
      next.sections ||= {};
      if (Object.keys(o).length) next.sections[ed.id] = o; else delete next.sections[ed.id];
      this.submit(next, [], '分组标题已更新。');
      return;
    }
    if (ed.kind === 'cash') {
      const o = {...(code ? {code} : {}), ...(ed.id === MAIN && name && name !== '默认资金账户' ? {name} : {})};
      next.cash ||= {};
      if (Object.keys(o).length) next.cash[ed.id] = o; else delete next.cash[ed.id];
      this.submit(next, [], '资金账户代码已更新。');
      return;
    }
    if (!code || !name) { this.error('请填写代码和名称'); return; }
    if (ed.kind === 'add') {
      const ids = new Set((next.custom || []).map(x => x.id));
      let n = 1; while (ids.has('U' + n)) n++;
      (next.custom ||= []).push({id:'U' + n, code, name, kind:this.val('chart-kind')});
      this.submit(next, [], `已新增科目 ${code} ${name}。`);
      return;
    }
    const a = this.ctx.accounts().find(x => x.c === ed.id); if (!a) return;
    if (a.custom) {
      const c = next.custom.find(x => x.id === a.c);
      Object.assign(c, {code, name});
      if (!this.ctx.used().has(a.c)) c.kind = this.val('chart-kind') || c.kind;
    } else {
      const o = (next.accounts ||= {})[a.c] ||= {};
      if (code !== a.c) o.code = code; else delete o.code;
      if (name !== (a.sysZh || a.zh)) o.name = name; else delete o.name;
      if (!Object.keys(o).length) delete next.accounts[a.c];
    }
    this.submit(next, [], `科目 ${code} 已更新。`);
  }
}

window.AccountingChart = {SECTIONS, SECTION, LINES, KINDS, MAIN, sectionOf, build, lookup, cashAccounts, validate, codeIndex, parseImport, exportRows, paneHTML, ChartManager, sectionName, cmpCode};
})();

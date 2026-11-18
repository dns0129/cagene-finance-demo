/* Independent report drafts are part of the selected ledger's JSON backup. */
(() => {
'use strict';
const Locale=window.AccountingLocale, escape=Locale.literal;
const GROUPS = {income:'营业收入', cost:'营业成本', expense:'期间费用', other:'其他损益', tax:'所得税'};
let sequence = 0;
const rowId = () => 'r-' + Date.now().toString(36) + '-' + (++sequence);
const row = (kind = 'cost', name = '', amount = '') => ({id:rowId(), kind, name, amount, note:''});
const field = (key, label, value, extra = '') => `<div class="field"><label for="report-${key}">${label}</label><input id="report-${key}" data-report-meta="${key}" value="${escape(value)}" maxlength="${key === 'currency' ? 6 : 120}" ${extra}></div>`;

function validate(draft) {
  if (!draft || draft.v !== 1 || !Array.isArray(draft.rows) || draft.rows.length > 500) throw new Error('自定义财报格式不正确，最多支持 500 行');
  for (const key of ['title','period','currency','notes']) if (typeof draft[key] !== 'string' || draft[key].length > (key === 'notes' ? 5000 : key === 'currency' ? 6 : 120)) throw new Error('自定义财报的文字格式不正确');
  const ids = new Set();
  for (const r of draft.rows) {
    if (!r || typeof r.id !== 'string' || !/^[\w-]{1,80}$/.test(r.id) || ids.has(r.id) || !Object.hasOwn(GROUPS, r.kind)) throw new Error('自定义财报包含无效或重复的项目');
    ids.add(r.id);
    for (const key of ['name','amount','note']) if (typeof r[key] !== 'string' || r[key].length > (key === 'amount' ? 40 : 200)) throw new Error('自定义财报项目的文字或金额格式不正确');
  }
  return draft;
}

class ReportEditor {
  constructor({root, getState, getSlot=()=>({owner:getState(),key:'customReport'}), save, toast, getLedger, format, money, readonly=()=>false}) {
    Object.assign(this, {root, getState, getSlot, save, toast, getLedger, format, money, readonly});
    root.addEventListener('input', e => this.input(e));
    root.addEventListener('change', e => { if (e.target.matches('select[data-report-kind]')) this.input(e); });
    root.addEventListener('click', e => this.click(e));
  }
  draft() {
    const {owner,key}=this.getSlot();
    if (!owner[key]) owner[key]=ReportEditor.createDraft(this.getState().company);
    return owner[key];
  }
  static createDraft(company) {
    return {v:1,title:Locale.text('我的经营损益表'),period:Locale.text(`${company.year} 年度`),currency:company.cur,notes:'',
      rows:[row('income',Locale.text('营业收入')),row('cost',Locale.text('自定义成本')),row('expense',Locale.text('自定义费用'))]};
  }
  calculate() {
    const d = this.draft(), totals = {income:0, cost:0, expense:0, other:0, tax:0}, errors = new Map();
    for (const r of d.rows) {
      const value = r.amount.trim() ? this.money(r.amount) : 0;
      if (!r.name.trim()) errors.set(r.id, '请为这个项目填写名称');
      else if (!Number.isSafeInteger(value) || /\.\d{3,}/.test(r.amount)) errors.set(r.id, '请填写有效金额，最多两位小数');
      else totals[r.kind] += value;
    }
    const gross = totals.income - totals.cost;
    const operating = gross - totals.expense;
    const pretax = operating + totals.other;
    const net = pretax - totals.tax;
    if (!Object.values({...totals, gross, operating, pretax, net}).every(Number.isSafeInteger)) errors.set('total','合计金额过大，请减小金额');
    return {totals, gross, operating, pretax, net, errors, valid:errors.size === 0};
  }
  render() {
    const d = this.draft();
    this.root.innerHTML = Locale.markup(`<div class="report-layout"><div class="report-controls"><section class="report-card"><div class="report-panel-head"><h3>报表信息</h3><small>自动保存草稿</small></div><div class="fields report-meta">${field('title','报表名称',d.title)}${field('currency','币种符号',d.currency)}<div class="field full">${field('period','报告期间',d.period)}</div></div></section>
      <section class="report-card"><div class="report-panel-head"><h3>自由定义每个项目</h3><small id="report-row-count">${d.rows.length} 个项目</small></div><p class="tdesc">材料采购、外包设计、平台佣金……名称由你决定。空金额按 0 计算；冲减项目可以填负数。</p><div class="report-editor-rows">${d.rows.map((r,i) => this.rowHTML(r,i,d.rows.length)).join('')}</div><div class="report-actions"><button class="btn primary" data-report-act="add">＋ 添加项目</button><button class="btn" data-report-act="ledger">从账本生成草稿</button><button class="btn subtle" data-report-act="example">查看示例</button></div></section>
      <section class="report-card"><div class="field"><label for="report-notes">报表说明（选填）</label><textarea id="report-notes" rows="3" maxlength="5000" data-report-meta="notes" placeholder="补充计算口径、成本构成或你想记住的说明">${escape(d.notes)}</textarea></div></section></div>
      <aside class="report-preview-wrap"><section class="report-card" id="report-print"><div class="report-preview-label"><span>LIVE PREVIEW / 实时预览</span><span>自由编辑</span></div><div id="report-preview"></div><div class="report-actions"><button class="btn primary" data-report-act="csv">导出 CSV</button><button class="btn" data-report-act="print">打印 / PDF</button><button class="btn subtle" data-report-act="json">导出草稿 JSON</button></div></section><p class="hint">这份报表是独立的编辑草稿。可以试算和调整，账本分录及自动财务报表仍由原始交易生成。</p><p class="report-math">计算口径：营业收入 − 营业成本 − 期间费用 ＋ 其他损益 − 所得税 = 净利润。其他损益中，利得填正数、损失填负数。</p></aside></div>`);
    if(this.readonly())this.root.querySelector('.report-controls').hidden=true;
    this.preview();
  }
  rowHTML(r, i, total) {
    return `<div class="report-row" data-report-row="${r.id}"><div class="report-row-top"><div class="field"><label for="rr-kind-${r.id}">归属</label><select id="rr-kind-${r.id}" data-report-kind="${r.id}">${Object.entries(GROUPS).map(([k,l]) => `<option value="${k}"${k === r.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label for="rr-name-${r.id}">项目名称</label><input id="rr-name-${r.id}" data-report-row-field="name" data-row-id="${r.id}" maxlength="200" value="${escape(r.name)}" placeholder="自由填写名称"></div><div class="field"><label for="rr-amt-${r.id}">金额</label><input id="rr-amt-${r.id}" data-report-row-field="amount" data-row-id="${r.id}" value="${escape(r.amount)}" inputmode="decimal" maxlength="40" placeholder="0.00"></div></div><div class="report-row-bottom"><input aria-label="${(r.name?escape(r.name):'项目')}的备注" data-report-row-field="note" data-row-id="${r.id}" value="${escape(r.note)}" maxlength="200" placeholder="＋ 添加备注（选填）"><button data-report-act="up" data-row-id="${r.id}" aria-label="上移项目"${i === 0 ? ' disabled' : ''}>↑</button><button data-report-act="down" data-row-id="${r.id}" aria-label="下移项目"${i === total-1 ? ' disabled' : ''}>↓</button><button data-report-act="delete" data-row-id="${r.id}" aria-label="删除${(r.name?escape(r.name):'项目')}">×</button></div><p class="report-row-error" data-report-error="${r.id}" hidden></p></div>`;
  }
  preview() {
    const d = this.draft(), c = this.calculate(), fmt = value => c.valid ? this.format(value) : '—';
    let body = '';
    const subtotal = (label, value, cls = 'subtotal') => `<tr class="${cls}"><td>${label}</td><td>${fmt(value)}</td></tr>`;
    for (const [kind,label] of Object.entries(GROUPS)) {
      const rows = d.rows.filter(r => r.kind === kind);
      if (rows.length) body += `<tr class="group-heading"><td>${label}</td><td>${escape(d.currency)}</td></tr>` + rows.map(r => `<tr><td>${(r.name?escape(r.name):'未命名项目')}${r.note ? `<small class="destination">${escape(r.note)}</small>` : ''}</td><td>${c.errors.has(r.id) ? '—' : this.format(r.amount.trim() ? this.money(r.amount) : 0)}</td></tr>`).join('');
      if (kind === 'income') body += subtotal('营业收入合计', c.totals.income);
      if (kind === 'cost') body += subtotal('毛利润', c.gross);
      if (kind === 'expense') body += subtotal('营业利润', c.operating);
      if (kind === 'other') body += subtotal('税前利润', c.pretax);
    }
    body += subtotal('净利润', c.net, 'report-net');
    const box = this.root.querySelector('#report-preview');
    if (box) box.innerHTML = Locale.markup(`<div class="report-preview-title"><p>${escape(this.getState().company.name)}</p><h3>${(d.title?escape(d.title):'未命名报表')}</h3><p>${escape(d.period)} · 单位：${(d.currency?escape(d.currency):'未设置')}</p></div>${!c.valid ? `<p class="err" role="status">${c.errors.get('total') || '请修正左侧标记的项目，才能计算完整报表。'}</p>` : ''}<table class="free-report"><tbody>${body}</tbody></table>${d.notes ? `<div class="report-notes">${escape(d.notes)}</div>` : ''}`);
    for (const r of d.rows) {
      const error = this.root.querySelector(`[data-report-error="${r.id}"]`);
      if (error) { error.hidden = !c.errors.has(r.id); error.textContent = Locale.text(c.errors.get(r.id) || ''); }
      const input = this.root.querySelector(`#rr-amt-${r.id}`);
      if (input) input.setAttribute('aria-invalid', String(c.errors.has(r.id)));
    }
    for (const action of ['csv','print']) { const button = this.root.querySelector(`[data-report-act="${action}"]`); if (button) button.disabled = !c.valid; }
  }
  input(e) {
    if(this.readonly())return;
    const el = e.target, d = this.draft();
    if (el.dataset.reportMeta) d[el.dataset.reportMeta] = el.value;
    else if (el.dataset.reportRowField) { const r = d.rows.find(r => r.id === el.dataset.rowId); if (!r) return; r[el.dataset.reportRowField] = el.value; }
    else if (el.dataset.reportKind) { const r = d.rows.find(r => r.id === el.dataset.reportKind); if (!r || !Object.hasOwn(GROUPS, el.value)) return; r.kind = el.value; }
    else return;
    this.save(); this.preview();
  }
  replace(draft, message) {
    const previous = structuredClone(this.draft());
    const {owner,key}=this.getSlot();
    owner[key] = draft; this.save(); this.render();
    this.toast(message, () => { if(this.getSlot().owner!==owner)return; owner[key]=previous; this.save(); this.render(); });
  }
  click(e) {
    const el = e.target.closest('[data-report-act]'); if (!el || el.disabled) return;
    const d = this.draft(), index = d.rows.findIndex(r => r.id === el.dataset.rowId), action = el.dataset.reportAct;
    if(this.readonly()&&!['csv','json','print'].includes(action))return;
    if (action === 'add') {
      if (d.rows.length >= 500) return this.toast('一份草稿最多支持 500 个项目');
      const added = row(); d.rows.push(added); this.save(); this.render(); this.root.querySelector(`#rr-name-${added.id}`)?.focus();
    } else if (action === 'delete' && index >= 0) {
      const removed = d.rows.splice(index,1)[0], {owner,key}=this.getSlot(); this.save(); this.render();
      this.toast('已删除项目', () => { if(this.getSlot().owner!==owner)return; const rows=owner[key].rows; rows.splice(Math.min(index,rows.length),0,removed); this.save(); this.render(); });
    } else if (['up','down'].includes(action) && index >= 0) {
      const target = index + (action === 'up' ? -1 : 1); if (target < 0 || target >= d.rows.length) return;
      [d.rows[index],d.rows[target]] = [d.rows[target],d.rows[index]]; this.save(); this.render();
    } else if (action === 'example') {
      this.replace({...d, title:'小店月度经营报表 · 示例', period:'示例月份', rows:[row('income','咖啡与甜点收入','16800'), row('cost','咖啡豆与原料采购','4200'), row('expense','店铺租金','1800'), row('expense','外卖平台服务费','560')], notes:'示例：自定义项目名称与成本构成。请按实际情况修改。'}, '已载入报表示例，可撤销');
    } else if (action === 'ledger') {
      const rows = this.getLedger().map(r => row(r.kind,r.name,String(r.amount/100)));
      this.replace({...d, title:'账本经营损益草稿', period:`${this.getState().company.year} 年度`, currency:this.getState().company.cur, rows, notes:'从当前账本的持续经营损益生成。终止经营与 OCI 请在自动财务报表中查看。'}, '已生成可自由修改的草稿，可撤销');
    } else if (action === 'csv') {
      const c = this.calculate(); if (!c.valid) return;
      const cell = s => { let v = String(s ?? ''); if (typeof s !== 'number' && /^\s*[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g,'""') + '"'; };
      const t=Locale.text;
      const lines = [[t('报表'),d.title],[t('公司'),this.getState().company.name],[t('期间'),d.period],[t('币种'),d.currency],[],
        ['归属','项目名称','金额','备注'].map(t),...d.rows.map(r=>[t(GROUPS[r.kind]),r.name,(r.amount.trim()?this.money(r.amount):0)/100,r.note]),[],
        ...[['营业收入',c.totals.income],['营业成本',c.totals.cost],['毛利润',c.gross],['期间费用',c.totals.expense],['其他损益',c.totals.other],['税前利润',c.pretax],['所得税',c.totals.tax],['净利润',c.net]].map(([label,n])=>[t('汇总'),t(label),n/100]),[t('说明'),d.notes]];
      this.download('自定义财报.csv','\uFEFF'+lines.map(line => line.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
    } else if (action === 'json') this.download('自定义财报草稿.json', JSON.stringify(d,null,2), 'application/json');
    else if (action === 'print') window.print();
  }
  download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type})), a = document.createElement('a'); a.href = url; a.download = Locale.text(name); a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
}
window.AccountingReportEditor = ReportEditor;
window.AccountingReportEditor.validate = validate;
})();

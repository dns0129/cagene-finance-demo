/* Browser adapter for the monthly bank reconciliation workflow. */
(() => {
'use strict';
const B=window.AccountingBank, E=window.AccountingEnterprise;
const Locale=window.AccountingLocale, esc=Locale.literal, uiEsc=Locale.escape;
const btn = (action,label,attrs='') => `<button type="button" class="btn" data-bank-act="${action}"${attrs}>${label}</button>`;

class BankWorkspace {
  // invoices(through) lists sales invoices issued up to that date with balances as of it; settle() posts one receipt and matches it.
  constructor({root, modal, book, save, toast, format, validDate, download, openVoucher, defaultMonth, canWrite, ai=null, invoices=()=>[], settle=null}) {
    Object.assign(this,{root,modal,book,save,toast,format,validDate,download,openVoucher,defaultMonth,canWrite,ai,invoices,settle});
    this.reset();
    for (const el of [root,modal]) {
      el.addEventListener('click', event=>{const action=event.target.closest('[data-bank-act]'); if(action && !action.disabled) this.click(action);});
      el.addEventListener('change', event=>this.change(event.target));
    }
    modal.addEventListener('input', event=>{
      if(event.target.matches('[data-bank-input]')) this.invalidate();
      else if(event.target.matches('[data-settle-amt]')) { const box=this.modal.querySelector('#settle-pick-'+event.target.dataset.settleAmt); if(box) box.checked=!!event.target.value.trim(); this.settleTotal(); }
    });
  }
  reset() { this.selected=null; this.account=B.MAIN; this.filter='bank'; this.page=1; this.preview=null; this.settling=null; this.closeReviewMonth=null; this.aiState?.ctl?.abort(); this.aiState={status:'idle'}; }
  monthEnd(month=this.month()) { return E.monthEnd(+this.book().company.year,month); }
  openInvoices(month=this.month()) { return this.invoices(this.monthEnd(month)).filter(x=>x.balance>0); }
  month() {
    const prior=Array.from({length:12},(_,i)=>i+1).filter(m=>B.get(this.book(),m,this.account));
    return this.selected ?? Number(prior.at(-1) || this.defaultMonth());
  }
  select(month) { this.selected=month; this.filter='bank'; this.page=1; }
  locked(month = this.month()) { return month<=E.closedThrough(this.book()); }
  money(n) { return n==null?'—':this.format(n); }
  render() {
    const book=this.book(), month=this.month(), r=B.summary(book,month,this.account), s=r.statement, locked=this.locked();
    const options=Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}"${m===month?' selected':''}>${m} 月${B.get(book,m,this.account)?' · 已导入':''}${m<=E.closedThrough(book)?' · 已锁定':''}</option>`).join('');
    const filters=[
      ['bank','未匹配流水',r.bankUnmatched ?? 0],
      ['books','未匹配凭证',r.unmatchedVouchers.length],
      ['matched','已确认匹配',Object.keys(s?.matches || {}).length],
    ];
    const bankRows=s?.rows.map((row,i)=>({row,i,match:s.matches[i]})) || [];
    const data=this.filter==='books' ? r.unmatchedVouchers : bankRows.filter(row=>this.filter==='matched'?row.match:!row.match);
    const pages=Math.max(1,Math.ceil(data.length/12)); this.page=Math.min(this.page,pages);
    const body=data.slice((this.page-1)*12,this.page*12);
    const all=this.settle?this.invoices(this.monthEnd(month)):[], open=all.filter(x=>x.balance>0);
    const next = s?.from&&!r.complete ? `已匯入 ${s.from} 至 ${s.to}。月結前請補齊整個月份。` : locked ? '此月已锁定。' : !s ? '选择资金账户和月份后，导入该月的对账单。'
      : r.ready ? '流水、凭证和余额均已核对，可返回月结。'
      : `还有 ${r.bankUnmatched} 条流水、${r.unmatchedVouchers.length} 笔凭证未匹配。${r.openingDifference||r.endingDifference?'请同时核对余额差额。':''}`;
    this.root.innerHTML=Locale.markup(`<article class="enterprise-card bank-summary">
      <div class="enterprise-heading"><div><h3>${book.company.year} 年 ${month} 月资金账户对账</h3><p>核对所选资金账户的流水与凭证 · ${esc(book.company.cur)}</p></div><div class="actions"><div class="field period-select"><label for="bank-account">资金账户</label><select id="bank-account">${B.accounts(book).map(a=>`<option value="${esc(a.id)}"${a.id===this.account?' selected':''}>${a.id===B.MAIN?uiEsc(a.name):esc(a.name)}</option>`).join('')}</select></div><div class="field period-select"><label for="bank-month">对账月份</label><select id="bank-month">${options}</select></div></div></div>
      <div class="close-status${s && !r.ready?' has-issues':''}"><strong>${r.ready?'对账完成':s?'有待核对差异':'尚未导入对账单'}</strong><span>${next}</span></div>
      <div class="actions bank-main-actions"><button type="button" class="btn ${s?'':'primary'}" data-bank-act="import"${locked || !this.canWrite()?' disabled':''}>${s?'匯入更多流水 / 更新':'导入银行流水 CSV'}</button>${!s?btn('template','下载 CSV 模板'):''}${btn('close',this.closeReviewMonth?`返回 ${this.closeReviewMonth} 月月结`:'返回本月月结')}</div>
      <details class="entry-more bank-balance"${s&&r.ready?'':' open'}><summary>核对金额与余额</summary><div class="scroll"><table class="enterprise-table bank-totals"><thead><tr><th scope="col">核对项目</th><th scope="col">银行对账单</th><th scope="col">账面现金</th><th scope="col">差额</th></tr></thead><tbody>
        ${[['期初余额',s?.opening,r.bookOpening,r.openingDifference],['本月净变动',r.bankMovement,r.bookMovement,r.movementDifference],['期末余额',s?.closing,r.bookEnding,r.endingDifference]].map(([label,bank,ledger,diff])=>`<tr><th scope="row">${label}</th><td>${this.money(bank)}</td><td>${this.money(ledger)}</td><td${diff?' class="err"':''}>${this.money(diff)}</td></tr>`).join('')}
      </tbody></table></div></details>
    </article>
    <article class="enterprise-card bank-items">
      <div class="seg" role="group" aria-label="对账结果">${filters.map(([key,label,count])=>`<button type="button" data-bank-act="filter" data-value="${key}" aria-pressed="${key===this.filter}">${label} <span>${count}</span></button>`).join('')}</div>
      ${body.length?`<div class="scroll"><table class="enterprise-table bank-table"><thead><tr><th scope="col">日期与摘要</th><th scope="col">收付金额</th><th scope="col">状态与操作</th></tr></thead><tbody>${body.map(item=>this.filter==='books'?this.voucherRow(item):this.bankRow(item,r,locked,open)).join('')}</tbody></table></div>`:`<p class="empty">${this.filter==='books'?'本月没有未匹配的现金凭证。':!s?'请先导入银行流水。':this.filter==='matched'?'还没有确认的匹配。':'本月银行流水已全部匹配。'}</p>`}
      ${pages>1?`<div class="journal-pagination">${btn('page','上一页',` data-value="${this.page-1}"${this.page===1?' disabled':''}`)}<span>${this.page} / ${pages} 页 · ${data.length} 项</span>${btn('page','下一页',` data-value="${this.page+1}"${this.page===pages?' disabled':''}`)}</div>`:''}
    </article>
    ${this.aiCard(r,locked)}
    ${all.length?this.invoiceCard(month,open,r,locked):''}`);
  }
  /* Sales invoices still unpaid at month end, with the unmatched deposit that most likely pays each one. */
  invoiceCard(month,open,r,locked) {
    const cur=esc(this.book().company.cur), labels=window.AccountingInvoices?.STATUS || {}, s=r.statement, writable=!locked && this.canWrite();
    const hint=new Map();
    if (s) s.rows.forEach((row,i)=>{ if(!s.matches[i]) for(const x of B.invoiceCandidates(row,open)) if(x.suggested && (!hint.has(x.id) || x.sameNo && !hint.get(x.id).sameNo)) hint.set(x.id,{i,row,sameNo:x.sameNo}); });
    const total=open.reduce((n,x)=>n+x.balance,0), overdue=open.filter(x=>x.status==='overdue'), late=overdue.reduce((n,x)=>n+x.balance,0);
    const list=[...open].sort((a,b)=>a.date.localeCompare(b.date) || a.no.localeCompare(b.no)), shown=list.slice(0,20);
    const row=x=>{const h=hint.get(x.id);return `<tr data-bank-invoice="${esc(x.id)}"><td><strong>${esc(x.no)}</strong><small>${esc(x.partyName)}${E.monthOf(x.date)===month?' · 本月开票':''}</small></td><td>${x.date}<small>${x.dueDate?'到期 '+x.dueDate:'未设到期日'}</small></td><td>${this.money(x.balance)}${x.balance<x.amount?`<small>原额 ${this.money(x.amount)}</small>`:''}</td>
      <td><span class="inv-status inv-${x.status}">${labels[x.status] || ''}</span>${h?`<small class="bank-suggestion">疑似收款：${h.row.date} · ${cur} ${this.money(h.row.amount)}${h.sameNo?' · 单号一致':''}</small>${writable?btn('settle','对应这笔流水',` data-index="${h.i}" data-id="${esc(x.id)}"`):''}`:''}</td></tr>`;};
    return `<article class="enterprise-card bank-invoices">
      <div class="enterprise-heading"><div><h3>截至 ${month} 月末未收款发票</h3><p>${open.length?`${open.length} 张 · 未收合计 ${cur} ${this.money(total)}${overdue.length?` · 其中逾期 ${overdue.length} 张 ${cur} ${this.money(late)}`:''}`:'已开发票在月末前均已收清。'}</p></div></div>
      ${shown.length?`<div class="scroll"><table class="enterprise-table bank-table bank-invoice-table"><thead><tr><th scope="col">发票与客户</th><th scope="col">开票与到期</th><th scope="col">未收余额</th><th scope="col">状态与操作</th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>`:''}
      ${list.length>shown.length?`<p class="hint">仅显示最早的 ${shown.length} 张，共 ${list.length} 张；完整列表请到「销售发票」页查看。</p>`:''}
      ${open.length?'<p class="hint">收到客户付款后，在上方流水中点「对应发票收款」，系统会记收款凭证、核销发票并确认匹配。</p>':''}
    </article>`;
  }
  /* AI comparison: results live only in this page, and every match still goes through saveMatch(). */
  aiCurrent(statement) {
    const a=this.aiState;
    return a.status!=='idle' && a.month===this.month() && a.account===this.account && a.rows===statement?.rows;
  }
  aiCard(r,locked) {
    if (!this.ai) return '';
    const s=r.statement, a=this.aiCurrent(s)?this.aiState:{status:'idle'}, label=esc(this.ai.label());
    const pending=s ? r.bankUnmatched+r.unmatchedVouchers.length : 0;
    const head=`<div class="enterprise-heading"><div><h3>AI 对比流水与账面</h3><p>由 ${label} 对照未匹配的银行流水、现金凭证和未收款发票，找出可匹配项并解释差异。</p></div><div class="actions">${a.status==='busy'?btn('ai-stop','停止'):`<button type="button" class="btn primary" data-bank-act="ai-run"${!s||!pending?' disabled':''}>${a.status==='done'?'重新对比':'开始 AI 对比'}</button>`}</div></div>`;
    let body;
    if (!s) body='<p class="empty">请先导入本月银行流水，再进行 AI 对比。</p>';
    else if (a.status==='busy') body=`<p class="tdesc"><span class="spin"></span>${label} 正在对比 ${r.bankUnmatched} 条流水和 ${r.unmatchedVouchers.length} 笔凭证…</p>`;
    else if (a.status==='error') body=`<p class="err" role="alert">${uiEsc(a.error)}</p>`;
    else if (a.status==='done') body=this.aiResult(a.result,r,locked);
    else body=!pending?'<p class="empty">本月流水和现金凭证已全部匹配，无需对比。</p>'
      :`<p class="hint">${this.ai.connected()?'':'尚未连接 AI，点击按钮后先完成连接。'}对比时会发送本月未匹配流水与凭证的日期、金额、摘要、往来对象和单据号，以及未收款发票的客户与余额。AI 只提出建议，匹配仍需逐笔确认，不会自动记账。</p>`;
    return `<article class="enterprise-card bank-ai" aria-live="polite">${head}${body}</article>`;
  }
  aiResult(result,r,locked) {
    const s=r.statement, cur=esc(this.book().company.cur), writable=!locked && this.canWrite();
    const openRow=i=>s.rows[i] && !s.matches[i], vouchers=new Map(r.unmatchedVouchers.map(v=>[v.txn.id,v]));
    const invoices=new Map(this.openInvoices().map(x=>[String(x.no).trim().toLowerCase(),x]));
    const bankCell=i=>{const row=s.rows[i];return `<strong>${row.memo?esc(row.memo):'银行流水'}</strong><small>${row.date}${row.ref?' · '+esc(row.ref):''} · ${cur} ${this.money(row.amount)}</small>`;};
    const bookCell=id=>{const v=vouchers.get(id);return `<strong>${esc(v.txn.memo)}</strong><small>${v.txn.date} · ${esc(id)}${v.txn.ref?' · '+esc(v.txn.ref):''} · ${cur} ${this.money(v.amount)}</small>`;};
    const why=x=>`${x.reason?`<span>${esc(x.reason)}</span>`:''}${x.action?`<small>建议：${esc(x.action)}</small>`:''}`;
    const table=(title,note,headers,rows)=>rows.length?`<section class="bank-ai-group"><h4>${title} <span>${rows.length}</span></h4>${note?`<p class="hint">${note}</p>`:''}<div class="scroll"><table class="enterprise-table bank-table bank-ai-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`:'';
    const level={high:'高',medium:'中',low:'低'};
    const matches=result.matches.filter(m=>openRow(m.index)&&vouchers.has(m.id)&&s.rows[m.index].amount===vouchers.get(m.id).amount);
    const sure=matches.filter(m=>m.confidence==='high');
    const mismatches=result.mismatches.filter(m=>openRow(m.index)&&vouchers.has(m.id));
    const bankOnly=result.bankOnly.filter(b=>openRow(b.index)), bookOnly=result.bookOnly.filter(b=>vouchers.has(b.id));
    const left=result.unreviewedRows+result.unreviewedVouchers;
    return `${result.summary?`<p class="bank-ai-summary">${esc(result.summary)}</p>`:''}
      ${table('建议匹配',`同月、同方向、同金额。${writable&&sure.length>1?`<button type="button" class="btn small" data-bank-act="ai-match-all">确认全部 ${sure.length} 笔高可信匹配</button>`:''}`,['银行流水','账面凭证','AI 判断','操作'],
        matches.map(m=>`<tr><td>${bankCell(m.index)}</td><td>${bookCell(m.id)}</td><td><span class="bank-ai-level level-${m.confidence}">可信度 ${level[m.confidence]}</span>${why(m)}</td><td>${writable?btn('ai-match','确认匹配',` data-index="${m.index}" data-id="${esc(m.id)}"`):''}${btn('voucher','查看凭证',` data-id="${esc(m.id)}"`)}</td></tr>`))}
      ${table('金额不一致','疑似同一笔业务，但流水与凭证金额不同。请核对原单后修改凭证，或补记差额（如手续费）。',['银行流水','账面凭证','AI 判断','操作'],
        mismatches.map(m=>`<tr><td>${bankCell(m.index)}</td><td>${bookCell(m.id)}</td><td><span class="bank-ai-level level-low">差额 ${cur} ${this.money(s.rows[m.index].amount-vouchers.get(m.id).amount)}</span>${why(m)}</td><td>${btn('voucher','查看凭证',` data-id="${esc(m.id)}"`)}</td></tr>`))}
      ${table('银行有、账面没有','银行已发生但账面没有对应的现金凭证。',['银行流水','类型','AI 判断','操作'],
        bankOnly.map(b=>{const invoice=b.invoice&&invoices.get(b.invoice.toLowerCase());return `<tr><td>${bankCell(b.index)}</td><td>${B.AI_BANK_KINDS[b.kind]}${invoice?`<small>发票 ${esc(invoice.no)} · 未收 ${cur} ${this.money(invoice.balance)}</small>`:''}</td><td>${why(b)}</td><td>${invoice&&writable&&this.settle&&s.rows[b.index].amount>0?btn('settle','对应发票收款',` data-index="${b.index}" data-id="${esc(invoice.id)}"`):''}</td></tr>`;}))}
      ${table('账面有、银行没有','账面已记现金收付，但本月对账单没有对应流水。',['账面凭证','类型','AI 判断','操作'],
        bookOnly.map(b=>`<tr><td>${bookCell(b.id)}</td><td>${B.AI_BOOK_KINDS[b.kind]}</td><td>${why(b)}</td><td>${btn('voucher','查看凭证',` data-id="${esc(b.id)}"`)}</td></tr>`))}
      ${!matches.length&&!mismatches.length&&!bankOnly.length&&!bookOnly.length?'<p class="empty">AI 提到的项目都已处理。可在下方继续核对，或重新对比。</p>':''}
      ${left||result.omitted?`<p class="hint">${left?`AI 未说明 ${left} 项，请在下方列表人工核对。`:''}${result.omitted?`超出单次上限的 ${result.omitted} 项未发送。`:''}</p>`:''}
      <p class="hint">AI 也会出错。确认匹配前请核对银行原单和凭证。</p>`;
  }
  async aiRun() {
    if (!this.ai) return;
    if (!this.ai.connected()) { this.ai.connect(); return; }
    const book=this.book(), month=this.month(), account=this.account, report=B.summary(book,month,account);
    if (!report.statement || this.aiState.status==='busy') return;
    const ctl=new AbortController(), base={month,account,rows:report.statement.rows};
    this.aiState={...base,status:'busy',ctl}; this.render();
    try {
      const raw=await this.ai.json(B.aiPrompt(report,{year:book.company.year,month,currency:book.company.cur,invoices:this.openInvoices(month),traditional:Locale.current==='zh-HK'}),{signal:ctl.signal,task:'reconcile'});
      if (this.aiState.ctl!==ctl) return;
      this.aiState={...base,status:'done',result:B.aiParse(raw,B.summary(this.book(),month,account))};
    } catch(e) {
      if (this.aiState.ctl!==ctl) return;
      this.aiState=e?.code==='cancelled'?{status:'idle'}:{...base,status:'error',error:this.ai.failure(e)};
    }
    if (!this.root.hidden) this.render();
  }
  aiMatchAll() {
    if (this.locked() || !this.canWrite() || this.aiState.status!=='done') return;
    const month=this.month(), at=new Date().toISOString();
    let next=B.get(this.book(),month,this.account), count=0;
    if (!this.aiCurrent(next)) return;
    for (const m of this.aiState.result.matches.filter(m=>m.confidence==='high')) {
      try { next=B.changeMatch({...this.book(),...this.withStatement(next)},month,m.index,m.id,at,this.account); count++; } catch(e) { /* already matched or no longer equal: leave for manual review */ }
    }
    if (!count || !this.persist(next)) return;
    this.render(); this.toast(`已确认 ${count} 笔匹配。`);
  }
  withStatement(statement) {
    const book=this.book(), month=this.month();
    return this.account===B.MAIN ? {bankReconciliation:{...book.bankReconciliation,[month]:statement}}
      : {bankReconciliationByAccount:{...book.bankReconciliationByAccount,[this.account]:{...(book.bankReconciliationByAccount?.[this.account]||{}),[month]:statement}}};
  }
  voucherRow({txn,amount}) {
    return `<tr><td><strong>${esc(txn.memo)}</strong><small>${txn.date} · ${esc(txn.id)}${txn.ref?' · '+esc(txn.ref):''}</small></td><td>${this.money(amount)}</td><td>${btn('voucher','查看凭证',` data-id="${esc(txn.id)}"`)}</td></tr>`;
  }
  bankRow({row,i,match}, report, locked, open=[]) {
    let controls;
    if (match) {
      controls=`${btn('voucher','查看已匹配凭证',` data-id="${esc(match.id)}"`)}${locked?'':btn('unmatch','解除匹配',` data-index="${i}"`)}`;
    } else {
      const options=B.candidates(report,i), suggestions=options.filter(v=>v.suggested);
      const first=suggestions.length===1?suggestions[0]:null;
      const message=suggestions.length ? `${suggestions.length} 笔建议` : options.length ? `${options.length} 笔同额凭证（日期较远）` : '无同额凭证';
      // A customer deposit can settle open invoices directly: one receipt voucher, then the match.
      const bills=this.settle ? B.invoiceCandidates(row,open) : [], bill=bills.find(x=>x.suggested);
      controls=`<span class="bank-candidate">${message}</span>${first?`<small class="bank-suggestion">${esc(first.txn.id)} · ${esc(first.txn.memo)} · ${first.sameRef?'流水号一致 · ':''}日期差 ${first.days} 天</small>`:''}${options.length && !locked ? btn('match','选择匹配',` data-index="${i}"`) : ''}`
        +`${bill?`<small class="bank-suggestion">发票 ${esc(bill.no)} · ${esc(bill.partyName)} · 未收 ${this.money(bill.balance)}${bill.sameNo?' · 单号一致':''}</small>`:''}${bills.length && !locked && this.canWrite() ? btn('settle','对应发票收款',` data-index="${i}"`) : ''}`;
    }
    return `<tr data-bank-row="${i}"><td><strong>${(row.memo?esc(row.memo):'银行流水')}</strong><small>${row.date}${row.ref?' · '+esc(row.ref):''}</small></td><td>${this.money(row.amount)}</td><td>${controls}</td></tr>`;
  }
  dialog(html) {
    this.modal.innerHTML=Locale.markup(`<div class="modal-box batch-dialog bank-dialog" role="dialog" aria-modal="true" aria-labelledby="bank-dialog-title">${html}</div>`);
    this.modal.hidden=false;
    this.modal.querySelector('input,select,[data-act="closeModal"]')?.focus();
  }
  importDialog() {
    if (this.locked() || !this.canWrite()) return;
    const month=this.month(), current=B.get(this.book(),month,this.account);
    this.preview=null;
    this.dialog(`<h3 id="bank-dialog-title">导入 ${month} 月银行对账单</h3>
      <p class="tdesc">可重複匯入同月不同日期區段。輸入 CSV 實際覆蓋的起訖日期和區段起訖餘額。日期留空時按整月處理。支持「交易日期、收款金额、付款金额」，或用「金额」一列（流入为正、流出为负）。摘要和流水号选填。无交易月份可提交只有表头的 CSV。</p>
      ${current&&!current.from?'<p class="period-notice">選擇日期區段會保留原有匹配。日期留空並整月重新匯入會替換整月流水及匹配。</p>':''}
      <div class="fields"><div class="field"><label for="bank-from">區段開始日期</label><input id="bank-from" type="date" data-bank-input></div><div class="field"><label for="bank-to">區段結束日期</label><input id="bank-to" type="date" data-bank-input></div></div>
      <div class="fields"><div class="field"><label for="bank-opening">对账单期初余额</label><input id="bank-opening" data-bank-input inputmode="decimal" autocomplete="off"></div><div class="field"><label for="bank-closing">对账单期末余额</label><input id="bank-closing" data-bank-input inputmode="decimal" autocomplete="off"></div></div>
      <div class="field"><label for="bank-file">选择 CSV 文件</label><input id="bank-file" type="file" accept=".csv,text/csv"></div>
      <div class="field"><label for="bank-text">或粘贴 CSV</label><textarea id="bank-text" data-bank-input rows="5" maxlength="300000" spellcheck="false"></textarea></div>
      <div id="bank-import-result" aria-live="polite"></div>
      <div class="actions">${btn('template','下载 CSV 模板')}${btn('preview','校验并预览')}<button type="button" class="btn primary" data-bank-act="import-confirm" id="bank-import-confirm" disabled>確認匯入</button><button type="button" class="btn" data-act="closeModal">取消</button></div>`);
    this.modal.querySelector('#bank-opening').value=current&&!current.from?String(current.opening/100):'';
    this.modal.querySelector('#bank-closing').value=current&&!current.from?String(current.closing/100):'';
  }
  importInput() {
    const val = id => this.modal.querySelector('#bank-'+id).value;
    return {opening:val('opening'),closing:val('closing'),from:val('from'),to:val('to'),text:val('text')};
  }
  invalidate() {
    this.preview=null;
    const result=this.modal.querySelector('#bank-import-result'), confirm=this.modal.querySelector('#bank-import-confirm');
    if (result) result.replaceChildren();
    if (confirm) confirm.disabled=true;
  }
  showPreview() {
    this.invalidate();
    const book=this.book(),month=this.month(),input=this.importInput(),result=this.modal.querySelector('#bank-import-result');
    try {
      const s=B.importStatement(book,month,input,this.validDate,this.account);
      this.preview={book,month,input,account:this.account};
      const repeat=s.rows.length-new Set(s.rows.map(row=>JSON.stringify(row))).size;
      result.innerHTML=Locale.markup(`<div class="preview"><strong>${s.rows.length} 条流水通过校验 · 净变动 ${esc(book.company.cur)} ${this.money(s.closing-s.opening)}</strong>
        ${s.from?`<p class="hint">匯入後覆蓋 ${s.from} 至 ${s.to}，原有匹配會保留。</p>`:''}
        ${repeat?`<p class="hint">有 ${repeat} 条内容相同的流水，已分别保留，请对照银行原单确认。</p>`:''}
        <ol class="batch-preview">${s.rows.slice(0,10).map(r=>`<li>${r.date} · ${(r.memo || r.ref ? esc(r.memo || r.ref) : '银行流水')} · ${this.money(r.amount)}</li>`).join('')}</ol>${s.rows.length>10?'<p class="hint">仅预览前 10 条。</p>':''}</div>`);
      this.modal.querySelector('#bank-import-confirm').disabled=false;
    } catch(e) { result.innerHTML=Locale.markup(`<p class="err">${uiEsc(e.message)}。本次尚未导入。</p>`); }
  }
  commitImport() {
    const preview=this.preview, book=this.book(), month=this.month(), input=this.importInput();
    if (!preview || preview.book!==book || preview.month!==month || preview.account!==this.account || !Object.keys(input).every(k=>input[k]===preview.input[k])) return;
    let statement;
    try { statement=B.importStatement(book,month,input,this.validDate,this.account); }
    catch(e) { this.showPreview(); return; }
    if (!this.persist(statement)) return;
    this.preview=null; this.select(month); this.modal.hidden=true; this.render();
    this.toast(`已导入 ${statement.rows.length} 条银行流水，请确认匹配。`);
  }
  persist(statement) {
    if (this.locked() || !this.canWrite()) return false;
    const book=this.book(), field=this.account===B.MAIN?'bankReconciliation':'bankReconciliationByAccount',old=book[field];
    if(this.account===B.MAIN)book[field]={...old,[this.month()]:statement};
    else book[field]={...old,[this.account]:{...(old?.[this.account]||{}),[this.month()]:statement}};
    if (this.save()) return true;
    if (old) book[field]=old; else delete book[field];
    this.toast('保存失败，本次对账改动没有应用。');
    return false;
  }
  matchDialog(index) {
    if (this.locked() || !this.canWrite()) return;
    const r=B.summary(this.book(),this.month(),this.account), row=r.statement?.rows[index], options=B.candidates(r,index);
    if (!row || !options.length) return;
    const suggested=options.filter(o=>o.suggested);
    const sameRef=suggested.filter(o=>o.sameRef);
    const defaultId=sameRef.length===1?sameRef[0].txn.id:suggested.length===1?suggested[0].txn.id:'';
    const text=o=>`${o.suggested?'建议 · ':''}${o.txn.date} · ${o.txn.id} · ${esc(o.txn.memo)}${o.sameRef?' · 流水号一致':''} · 日期差 ${o.days} 天`;
    this.dialog(`<h3 id="bank-dialog-title">确认匹配银行流水</h3><p class="tdesc">${row.date} · ${(row.memo || row.ref ? esc(row.memo || row.ref) : '银行流水')} · ${esc(this.book().company.cur)} ${this.money(row.amount)}</p>
      <div class="field"><label for="bank-voucher">选择同月、同方向、同金额凭证</label><select id="bank-voucher"><option value="">请选择凭证</option>${options.map(o=>`<option value="${esc(o.txn.id)}"${defaultId===o.txn.id?' selected':''}>${text(o)}</option>`).join('')}</select></div>
      <p class="hint">${suggested.length>1 && !defaultId?'有多笔建议，请按单据核对后选择。':'请核对原始单据后确认。'} 确认只保存对账关联，不新增凭证。</p><p id="bank-match-error" class="err" role="alert"></p>
      <div class="actions"><button type="button" class="btn primary" data-bank-act="match-confirm" data-index="${index}">确认匹配</button><button type="button" class="btn" data-act="closeModal">取消</button></div>`);
  }
  saveMatch(index,id) {
    try {
      const next=B.changeMatch(this.book(),this.month(),index,id,new Date().toISOString(),this.account);
      if (!this.persist(next)) return;
      this.modal.hidden=true; this.render(); this.toast(id?'匹配已确认。':'匹配已解除。');
    } catch(e) {
      const error=this.modal.querySelector('#bank-match-error');
      if (error && !this.modal.hidden) error.textContent=Locale.text(e.message); else this.toast(e.message);
    }
  }
  /* Deposit -> invoices: the accountant picks invoices of one customer whose allocations add up to the deposit. */
  settleDialog(index, preferId) {
    if (this.locked() || !this.canWrite() || !this.settle) return;
    const month=this.month(), s=B.get(this.book(),month,this.account), row=s?.rows[index];
    if (!row || s.matches[index]) return;
    const options=B.invoiceCandidates(row,this.openInvoices(month)).slice(0,30);
    if (!options.length) return;
    const sameAmount=options.filter(x=>x.sameAmount);
    const pick=preferId ? options.find(x=>x.id===preferId) : options.find(x=>x.sameNo) || (sameAmount.length===1?sameAmount[0]:null);
    this.settling={index,month,account:this.account,row,options};
    const cur=esc(this.book().company.cur);
    const tags=x=>[x.sameNo&&'单号一致',x.sameAmount&&'金额一致',x.sameParty&&'客户名一致'].filter(Boolean).join(' · ');
    const line=(x,k)=>`<tr><td><input type="checkbox" id="settle-pick-${k}" data-settle-pick="${k}"${x===pick?' checked':''}></td><td><label for="settle-pick-${k}"><strong>${esc(x.no)}</strong><small>${esc(x.partyName)} · ${x.date}${tags(x)?' · '+tags(x):''}</small></label></td><td>${this.money(x.balance)}</td>
      <td><input id="settle-amt-${k}" data-settle-amt="${k}" inputmode="decimal" autocomplete="off" aria-label="${esc(x.no)} 本次核销金额" value="${x===pick?String(Math.min(x.balance,row.amount)/100):''}"></td></tr>`;
    this.dialog(`<h3 id="bank-dialog-title">对应发票收款</h3><p class="tdesc">${row.date} · ${(row.memo || row.ref ? esc(row.memo || row.ref) : '银行流水')} · ${cur} ${this.money(row.amount)}</p>
      <p class="hint">勾选这笔收款对应的发票（可多张，须为同一客户）。确认后会记一张收款凭证：借 银行存款、贷 应收账款，核销所选发票，并与这条流水确认匹配。</p>
      <div class="scroll"><table class="enterprise-table bank-table bank-settle-table"><thead><tr><th scope="col"><span class="sr-only">选择</span></th><th scope="col">发票</th><th scope="col">未收余额</th><th scope="col">本次核销</th></tr></thead><tbody>${options.map(line).join('')}</tbody></table></div>
      <p id="bank-settle-total" class="hint" aria-live="polite"></p><p id="bank-settle-error" class="err" role="alert"></p>
      <div class="actions"><button type="button" class="btn primary" data-bank-act="settle-confirm">确认收款并匹配</button><button type="button" class="btn" data-act="closeModal">取消</button></div>`);
    this.settleTotal();
  }
  settleRead() {
    const st=this.settling, allocations=[];
    if (!st) return {allocations,total:0};
    let total=0;
    for (const [k,x] of st.options.entries()) {
      if (!this.modal.querySelector('#settle-pick-'+k)?.checked) continue;
      let cents;
      try { cents=B.parseAmount(this.modal.querySelector('#settle-amt-'+k).value); } catch(e) { return {error:`${x.no}：${e.message}`}; }
      if (cents<=0) return {error:`${x.no}：核销金额须大于零`};
      if (cents>x.balance) return {error:`${x.no}：核销金额不能超过未收余额`};
      allocations.push({itemId:x.itemId,amount:cents,partyId:String(x.partyId).trim().toLowerCase()}); total+=cents;
    }
    return {allocations,total};
  }
  settleTotal() {
    const el=this.modal.querySelector('#bank-settle-total'), st=this.settling;
    if (!el || !st) return;
    const r=this.settleRead(), gap=st.row.amount-r.total;
    el.textContent=r.error?'':Locale.text(`已分配 ${this.money(r.total)} / 流水 ${this.money(st.row.amount)}${gap?` · ${gap>0?'还差':'超出'} ${this.money(Math.abs(gap))}`:' · 金额一致'}`);
  }
  pickInvoice(box) {
    const st=this.settling, k=Number(box.dataset.settlePick), amount=this.modal.querySelector('#settle-amt-'+k);
    if (!st || !amount) return;
    if (!box.checked) amount.value='';
    else if (!amount.value.trim()) {
      box.checked=false;
      const r=this.settleRead(), rest=Math.min(st.options[k].balance,st.row.amount-(r.error?0:r.total));
      box.checked=true;
      if (rest>0) amount.value=String(rest/100);
    }
    this.settleTotal();
  }
  settleConfirm() {
    const st=this.settling, error=this.modal.querySelector('#bank-settle-error'), fail=text=>{ if(error) error.textContent=Locale.text(text); };
    if (!st) return;
    const current=B.get(this.book(),st.month,st.account);
    if (st.month!==this.month() || st.account!==this.account || current?.rows[st.index]!==st.row || current.matches[st.index]) return fail('对账单已变更，请关闭后重新操作。');
    const r=this.settleRead();
    if (r.error) return fail(r.error);
    if (!r.allocations.length) return fail('请至少勾选一张发票。');
    if (new Set(r.allocations.map(a=>a.partyId)).size>1) return fail('一笔收款只能核销同一客户的发票，请分开处理。');
    if (r.total!==st.row.amount) return fail(`核销合计须等于流水金额 ${this.money(st.row.amount)}。如差额是手续费或预收款，请先另行记账。`);
    const message=this.settle({month:st.month,account:st.account,index:st.index,allocations:r.allocations.map(({itemId,amount})=>({itemId,amount}))});
    if (message) return fail(message);
    this.settling=null; this.modal.hidden=true; this.render();
  }
  click(el) {
    const {bankAct,value,id,index}=el.dataset;
    if (bankAct==='filter') { this.filter=value; this.page=1; this.render(); }
    else if (bankAct==='page') { this.page=Number(value); this.render(); }
    else if (bankAct==='template') this.download('银行流水导入模板.csv',E.csv([B.HEADERS.map(Locale.text)]),'text/csv;charset=utf-8');
    else if (bankAct==='import') this.importDialog();
    else if (bankAct==='preview') this.showPreview();
    else if (bankAct==='import-confirm') this.commitImport();
    else if (bankAct==='match') this.matchDialog(Number(index));
    else if (bankAct==='match-confirm') this.saveMatch(Number(index),this.modal.querySelector('#bank-voucher').value);
    else if (bankAct==='unmatch') this.saveMatch(Number(index),null);
    else if (bankAct==='ai-run') this.aiRun();
    else if (bankAct==='ai-stop') this.aiState.ctl?.abort();
    else if (bankAct==='ai-match') this.saveMatch(Number(index),id);
    else if (bankAct==='ai-match-all') this.aiMatchAll();
    else if (bankAct==='settle') this.settleDialog(Number(index),id);
    else if (bankAct==='settle-confirm') this.settleConfirm();
    else if (bankAct==='voucher') this.openVoucher(id);
    else if (bankAct==='close') this.root.dispatchEvent(new CustomEvent('bank-close',{detail:this.month()}));
  }
  change(el) {
    if (el.matches('[data-settle-pick]')) { this.pickInvoice(el); return; }
    if (el.id==='bank-month') { this.select(Number(el.value)); this.render(); this.root.querySelector('#bank-month').focus(); return; }
    if (el.id==='bank-account') { this.account=el.value;this.selected=null;this.filter='bank';this.page=1;this.render();this.root.querySelector('#bank-account').focus();return; }
    if (el.id!=='bank-file') return;
    const field=this.modal.querySelector('#bank-text'), file=el.files?.[0];
    if (!field || !file) return;
    this.invalidate(); field.value='';
    const result=this.modal.querySelector('#bank-import-result');
    if (file.size>1_200_000) { result.textContent=Locale.text('CSV 文件过大。'); return; }
    const reader=new FileReader();
    reader.onload=()=>{if(field.isConnected && !field.value && el.files?.[0]===file){field.value=String(reader.result);result.textContent=Locale.text('文件已读取，请填写余额后点击「校验并预览」。');}};
    reader.onerror=()=>{if(result.isConnected) result.textContent=Locale.text('无法读取 CSV 文件。');};
    reader.readAsText(file);
  }
}
window.AccountingBankWorkspace=BankWorkspace;
})();

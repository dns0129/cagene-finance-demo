/* Sales invoices: line items that post Dr receivable / Cr revenue as one voucher.
   Amounts are integer cents; quantities are thousandths. Settlement reuses the receivable open items. */
(() => {
'use strict';
const Business=window.AccountingBusiness, E=window.AccountingEnterprise;
const Locale=window.AccountingLocale, esc=Locale.literal, uiEsc=Locale.escape;
const TPL='salesInvoice', RECEIVABLE='1100';
const REVENUE={'4100':'服务收入','4000':'销售收入'};
const MAX_LINES=50, MAX=999_999_999_999;
const isRecord=value=>value && typeof value==='object' && !Array.isArray(value);
const key=value=>String(value ?? '').trim().normalize('NFKC').toLowerCase();
const linked=txn=>txn?.inv?.v===1;
const lineAmount=(qty,price)=>Math.round(qty*price/1000);

function quantity(text){
  const raw=String(text ?? '').trim().replace(/,/g,'');
  if(!/^\d{1,7}(?:\.\d{1,3})?$/.test(raw))throw new Error('数量须为正数，最多三位小数');
  const [whole,part='']=raw.split('.'), value=Number(whole)*1000+Number(part.padEnd(3,'0'));
  if(!value)throw new Error('数量须大于零');
  return value;
}
function price(text,allowZero=false){
  const raw=String(text ?? '').trim();
  if(!/^(?:\d{1,10}|\d{1,3}(?:,\d{3}){1,3})(?:\.\d{1,2})?$/.test(raw))throw new Error('单价须为正数，最多两位小数');
  const [whole,part='']=raw.replace(/,/g,'').split('.'), value=Number(whole)*100+Number(part.padEnd(2,'0'));
  if(!value&&!allowZero)throw new Error('单价须大于零');
  return value;
}
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const moneyInput=cents=>(cents/100).toFixed(2);
function invoiceHeader(data){
  const header={};
  for(const [k,label,max] of [['branch','分店',60],['maker','制作人',80],['issueTime','开票时间',5]]){
    const value=data[k]??'';
    if(typeof value!=='string'||value.length>max)throw new Error(label+'格式不正确');
    if(value.trim())header[k]=value.trim();
  }
  if(header.issueTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(header.issueTime))throw new Error('开票时间格式不正确');
  return header;
}
function formLine(l){
  return {desc:l.desc,qty:String(l.qty/1000),price:moneyInput(l.price),code:l.code||'',staff:l.staff||'',expiry:l.expiry||'',discount:l.discount?moneyInput(l.discount):''};
}
function lineValues(r){
  const qty=quantity(r.qty), unit=price(r.price);
  let discount=0;
  if(String(r.discount??'').trim()){
    try{discount=price(r.discount,true);}catch{throw new Error('折扣金额须为非负数，最多两位小数');}
  }
  const gross=lineAmount(qty,unit);
  if(!Number.isSafeInteger(gross)||gross<=0||gross>MAX)throw new Error('金额超出允许范围');
  if(discount>gross)throw new Error('折扣金额不能超过该行原价合计');
  return {qty,price:unit,amount:gross-discount,...(discount?{discount}:{})};
}
function lineDetails(r){
  const details={};
  for(const [k,label,max] of [['code','项目编号',40],['staff','服务人员',80],['expiry','项目到期日',10]]){
    const value=r[k]??'';
    if(typeof value!=='string'||value.length>max)throw new Error(label+'格式不正确');
    if(value.trim())details[k]=value.trim();
  }
  if(details.expiry&&!validDay(details.expiry))throw new Error('项目到期日无效');
  return details;
}
// Form text (a JSON string or rows of strings) -> stored integer lines.
function parseLines(raw){
  let rows=raw;
  if(typeof raw==='string'){try{rows=JSON.parse(raw||'[]');}catch(e){throw new Error('发票明细格式不正确');}}
  if(!Array.isArray(rows))throw new Error('发票明细格式不正确');
  const filled=rows.filter(r=>isRecord(r) && [r.desc,r.qty,r.price].some(v=>String(v ?? '').trim()));
  if(!filled.length)throw new Error('请至少填写一行发票明细');
  if(filled.length>MAX_LINES)throw new Error(`一张发票最多 ${MAX_LINES} 行明细`);
  let total=0;
  const lines=filled.map((r,i)=>{
    const fail=text=>{throw new Error(`第 ${i+1} 行：${text}`);};
    const desc=String(r.desc ?? '').trim();
    if(!desc)fail('请填写项目描述');
    if(desc.length>120)fail('项目描述过长');
    try{
      const line={desc,...lineValues(r),...lineDetails(r)};
      total+=line.amount;
      return line;
    }catch(e){fail(e.message);}
  });
  if(!Number.isSafeInteger(total)||total>MAX)throw new Error('发票合计超出允许范围');
  if(total===0)throw new Error('发票折后合计须大于零');
  return {lines,total};
}
const totalOf=inv=>inv.lines.reduce((n,l)=>n+l.amount,0);
const sumAccount=(txn,account)=>txn.groups.flat().reduce((n,l)=>l.a===account?n+l.s:n,0);

function validate(book){
  const numbers=new Set(), requests=new Set();
  for(const t of book.txns){
    if(t.inv==null){if(t.tpl===TPL)throw new Error('销售发票凭证缺少发票明细');continue;}
    const inv=t.inv, fail=text=>{throw new Error(`销售发票 ${typeof inv?.no==='string'?inv.no:''} ${text}`.replace(/\s+/g,' '));};
    if(!linked(t)||t.tpl!==TPL)fail('的版本或凭证类型无效');
    if(typeof inv.no!=='string'||!inv.no.trim()||inv.no!==inv.no.trim()||inv.no.length>40)fail('的发票号无效');
    if(numbers.has(key(inv.no)))fail('的发票号重复');
    numbers.add(key(inv.no));
    if(!Object.hasOwn(REVENUE,inv.account))fail('的收入科目无效');
    if(!Array.isArray(inv.lines)||!inv.lines.length||inv.lines.length>MAX_LINES)fail('的明细行数无效');
    invoiceHeader(inv);
    for(const l of inv.lines){
      if(!isRecord(l)||typeof l.desc!=='string'||!l.desc.trim()||l.desc.length>120||!Number.isSafeInteger(l.qty)||l.qty<=0
        ||!Number.isSafeInteger(l.price)||l.price<=0||!Number.isSafeInteger(l.amount)||l.amount<0||!Number.isSafeInteger(l.discount??0)||(l.discount??0)<0||l.amount!==lineAmount(l.qty,l.price)-(l.discount??0))fail('的明细金额无效');
      lineDetails(l);
    }
    const total=totalOf(inv), open=t.biz?.events?.[0];
    if(!Number.isSafeInteger(total)||total<=0||total>MAX)fail('的合计金额无效');
    if(t.biz?.events?.length!==1||open.kind!=='open'||open.ledger!=='receivable'||open.amount!==total)fail('与客户应收明细不一致');
    if(sumAccount(t,RECEIVABLE)!==total||sumAccount(t,inv.account)!==-total||t.groups.flat().length!==2)fail('与凭证分录金额不一致');
    if(open.dueDate&&open.dueDate<t.date)fail('的到期日早于开票日期');
    // Set when an accountant approves a salesperson's request; the server ties the approval to this voucher.
    if(inv.request!==undefined){
      if(typeof inv.request!=='string'||!/^[a-f0-9-]{36}$/.test(inv.request))fail('的审核申请编号无效');
      if(requests.has(inv.request))fail('对应的发票申请已过账过一次');
      requests.add(inv.request);
    }
  }
  return true;
}
function numberTaken(book,no,excludeId){
  const wanted=key(no);
  return book.txns.some(t=>linked(t)&&t.id!==excludeId&&key(t.inv.no)===wanted);
}
function nextNumber(book){
  const prefix=`INV-${book.company.year}-`;
  let last=0;
  for(const t of book.txns)if(linked(t)&&t.inv.no.startsWith(prefix)){
    const n=t.inv.no.slice(prefix.length);
    if(/^\d{1,9}$/.test(n))last=Math.max(last,Number(n));
  }
  return prefix+String(last+1).padStart(4,'0');
}
const daysBetween=(from,to)=>Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);

// One row per invoice, with settlement taken from the receivable open item of the same voucher.
function summary(book,through,asOf=through){
  const items=new Map(Business.summary(book,through).items.map(x=>[x.id,x]));
  const invoices=book.txns.filter(t=>linked(t)&&(!through||t.date<=through)).map(txn=>{
    const item=items.get(txn.id+':0'), amount=totalOf(txn.inv);
    const balance=item?item.balance:amount, credited=item?item.returned:0, dueDate=item?.dueDate||'';
    const received=item?item.cashSettled-item.cashReturned:0;
    const overdueDays=balance>0&&dueDate&&dueDate<asOf?daysBetween(dueDate,asOf):0;
    const status=balance===0?(credited>=amount?'void':'paid'):overdueDays?'overdue':balance<amount?'partial':'unpaid';
    return {txn,id:txn.id,itemId:txn.id+':0',no:txn.inv.no,date:txn.date,dueDate,partyId:item?.partyId||'',partyName:item?.partyName||txn.party||'',
      account:txn.inv.account,lines:txn.inv.lines,amount,balance,received,credited,settled:amount-balance,overdueDays,status,
      applications:item?.applications||[],returns:item?.returns||[]};
  }).sort((a,b)=>b.date.localeCompare(a.date)||b.txn.seq-a.txn.seq);
  const totals={count:invoices.length,amount:0,settled:0,balance:0,overdue:0,overdueCount:0};
  for(const x of invoices){
    totals.amount+=x.amount;totals.settled+=x.settled;totals.balance+=x.balance;
    if(x.status==='overdue'){totals.overdue+=x.balance;totals.overdueCount++;}
  }
  return {invoices,totals};
}
function printData(x){
  const payments=new Map();
  const add=(label,amount)=>payments.set(label,(payments.get(label)||0)+amount);
  for(const {txn,amount} of x.applications){
    add(txn.groups.flat().some(l=>l.a==='1000')?(txn.p?.paymentMethod||'已收款'):'抵扣',amount);
  }
  for(const {cash,cancel} of x.returns){
    if(cash)add('已退款',-cash);
    if(cancel)add('已沖減',cancel);
  }
  return {no:x.no,date:x.date,partyName:x.partyName,partyId:x.partyId,...invoiceHeader(x.txn.inv),
    lines:x.lines,amount:x.amount,balance:x.balance,payments:[...payments]};
}
function customers(book){
  const seen=new Map();
  for(const p of Business.summary(book).parties)if(['receivable','customerAdvance'].includes(p.ledger)&&!seen.has(key(p.id)))seen.set(key(p.id),{id:p.id,name:p.name});
  return [...seen.values()];
}
const STATUS={unpaid:'未收款',partial:'部分收款',overdue:'已逾期',paid:'已收清',void:'已冲销'};
const qtyText=n=>(n/1000).toLocaleString('en-US',{maximumFractionDigits:3});

/* ---------- browser workspace ---------- */
const btn=(action,label,attrs='',cls='btn')=>`<button type="button" class="${cls}" data-inv-act="${action}"${attrs}>${label}</button>`;
function displayLines(lines,money){
  return `<thead><tr><th scope="col">项目描述</th><th scope="col">数量</th><th scope="col">单价</th><th scope="col">折扣</th><th scope="col">金额</th></tr></thead>
    <tbody>${lines.map(l=>{
      const detail=[l.code,l.staff,l.expiry?'到期日 '+l.expiry:''].filter(Boolean).join(' / ');
      return `<tr><th scope="row">${esc(l.desc)}${detail?`<small>${esc(detail)}</small>`:''}</th><td>${qtyText(l.qty)}</td><td>${money(l.price)}</td><td>${money(l.discount||0)}</td><td>${money(l.amount)}</td></tr>`;
    }).join('')}</tbody>`;
}
function headerInputs(prefix,f){
  return [['branch','分店',60],['maker','制作人',80],['issueTime','开票时间',5]].map(([k,label,max])=>
    `<label class="field">${label}<input id="${prefix}-${k}" data-${prefix}-field="${k}" type="${k==='issueTime'?'time':'text'}" maxlength="${max}" value="${esc(f[k])}"></label>`).join('');
}
function itemEditor(prefix,lines,amounts,total,currency,money,button){
  const rows=lines.map((line,i)=>{
    const field=(key,label,attrs='')=>`<label class="field">${label}<input id="${prefix}-${key}-${i}" data-${prefix}-line="${i}" data-k="${key}" value="${esc(line[key])}" autocomplete="off" ${attrs}></label>`;
    const remove=lines.length>1?button('line-del','删除',` data-index="${i}" aria-label="删除第 ${i+1} 行"`,'btn small'):'';
    return `<fieldset class="salon-item"><legend>项目 ${i+1}</legend>
      ${field('desc','项目描述','maxlength="120" placeholder="商品或服务内容"')}
      <div class="salon-item-grid">${field('code','项目编号','maxlength="40"')}${field('staff','服务人员','maxlength="80"')}${field('expiry','项目到期日','type="date"')}</div>
      <div class="salon-item-grid">${field('qty','数量','inputmode="decimal"')}${field('price','单价','inputmode="decimal"')}${field('discount','整行折扣','inputmode="decimal" placeholder="0"')}</div>
      <div class="salon-item-end">${remove}<span>金额 <strong data-${prefix}-amount="${i}">${amounts[i]==null?'—':money(amounts[i])}</strong></span></div>
    </fieldset>`;
  }).join('');
  return `<section class="salon-editor-items"><h4>项目明细</h4>${rows}
    <div class="salon-item-total">${button('line-add','＋ 添加一行',lines.length>=MAX_LINES?' disabled':'','btn small')}
    <span>发票合计 · ${esc(currency)} <strong id="${prefix}-total">${money(total)}</strong></span></div></section>`;
}
class InvoiceWorkspace {
  // The company's chart may rename and renumber accounts; the page passes accountName/accountLabel (escaped HTML).
  acctName(code){ return this.accountName ? this.accountName(code) : code===RECEIVABLE ? '应收账款' : REVENUE[code]; }
  acctLabel(code){ return this.accountLabel ? this.accountLabel(code) : `${code} ${REVENUE[code]}`; }
  constructor(options){
    Object.assign(this,options); // root, modal, book, post, toast, format, today, entryDate, openVoucher, receive, canWrite, lockedDate, company, accountName, accountLabel, accountHidden
    this.reset();
    for(const el of [this.root,this.modal]){
      el.addEventListener('click',event=>{const action=event.target.closest('[data-inv-act]');if(action&&!action.disabled)this.click(action);});
      el.addEventListener('change',event=>this.change(event.target));
    }
    this.modal.addEventListener('input',event=>{
      this.input(event.target);
      if(event.target.id.startsWith('receipt-'))this.modal.querySelector('#receipt-error').textContent='';
    });
  }
  reset(){this.scope='all';this.month=12;this.filter='all';this.page=1;this.form=null;}
  money(n){return this.format(n);}
  cur(){return this.book().company.cur;}
  period(){const book=this.book(),through=E.periodFor(book,this.month).end,today=this.today();return {through,asOf:today.slice(0,4)===String(book.company.year)&&today<through?today:through};}
  data(){const {through,asOf}=this.period();return {...summary(this.book(),through,asOf),through,asOf};}
  badge(x){return `<span class="inv-status inv-${x.status}">${STATUS[x.status]}${x.status==='overdue'?` ${x.overdueDays} 天`:''}</span>`;}
  render(){
    const d=this.data(), t=d.totals, writable=this.canWrite();
    const filters=[['all','全部',t.count],['open','待收款',d.invoices.filter(x=>x.balance>0).length],['overdue','已逾期',t.overdueCount],['paid','已收清',d.invoices.filter(x=>x.balance===0).length]];
    const list=d.invoices.filter(x=>this.filter==='all'||(this.filter==='open'?x.balance>0:this.filter==='overdue'?x.status==='overdue':x.balance===0));
    const pages=Math.max(1,Math.ceil(list.length/12));this.page=Math.min(Math.max(1,this.page),pages);
    const rows=list.slice((this.page-1)*12,this.page*12).map(x=>`<tr data-invoice="${esc(x.id)}"><th scope="row"><strong>${esc(x.no)}</strong><small>${esc(x.date)} · ${esc(x.id)}</small></th>
      <td class="inv-text"><strong>${esc(x.partyName)}</strong><small>${esc(x.lines[0].desc)}${x.lines.length>1?` 等 ${x.lines.length} 项`:''}</small></td>
      <td class="inv-text">${x.dueDate?esc(x.dueDate):'—'}<small>${this.badge(x)}</small></td><td>${this.money(x.amount)}</td><td><strong>${this.money(x.balance)}</strong></td>
      <td><div class="actions">${btn('view','查看',` data-id="${esc(x.id)}"`,'btn small')}${x.balance>0&&writable?btn('receive','收款',` data-id="${esc(x.id)}"`,'btn small'):''}${writable&&!this.lockedDate(x.date)?btn('edit','修改',` data-id="${esc(x.id)}"`,'btn small'):''}</div></td></tr>`).join('');
    const months=Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}"${m===this.month?' selected':''}>${m===12?'12 月（全年）':m+' 月'}</option>`).join('');
    const pending=this.reviews?.list().filter(r=>r.status==='pending')||[];
    const scopes=[['all','全部',pending.length+t.count],['review','待审',pending.length],['posted','销售发票',t.count]];
    const navigation=this.reviews?`<div class="seg" role="group" aria-label="发票分类">${scopes.map(([key,label,count])=>btn('scope',`${label} <span>${count}</span>`,` data-value="${key}" aria-pressed="${key===this.scope}"`,'')).join('')}</div>`:'';
    const review=this.scope==='posted'?'':this.reviewCard(writable,pending);
    const posted=`<article class="enterprise-card">
      <div class="enterprise-heading"><div><h3>销售发票</h3><p>截至 ${esc(d.through)} · 逾期按 ${esc(d.asOf)} 计算 · 金额单位 ${esc(this.cur())}</p></div><div class="actions"><div class="field period-select"><label for="invoice-month">截至月末</label><select id="invoice-month">${months}</select></div>${btn('new','＋ 新建销售发票',writable?'':' disabled','btn primary')}</div></div>
      <div class="member-metrics"><div><span>开票总额 · ${t.count} 张</span><strong>${this.money(t.amount)}</strong></div><div><span>已收款 / 已冲减</span><strong>${this.money(t.settled)}</strong></div><div><span>未收余额</span><strong>${this.money(t.balance)}</strong></div><div><span>逾期未收 · ${t.overdueCount} 张</span><strong${t.overdue?' class="err"':''}>${this.money(t.overdue)}</strong></div></div>
      <p class="hint">开票会自动记录收入和应收款。到账后可点「收款」登记，也可在银行对账时一次完成收款和匹配。</p>
      <div class="seg" role="group" aria-label="发票状态">${filters.map(([k,label,count])=>`<button type="button" data-inv-act="filter" data-value="${k}" aria-pressed="${k===this.filter}">${label} <span>${count}</span></button>`).join('')}</div>
      ${rows?`<div class="scroll"><table class="enterprise-table member-table invoice-table"><thead><tr><th scope="col">发票号 / 日期</th><th scope="col">客户 / 内容</th><th scope="col">到期日 / 状态</th><th scope="col">发票金额</th><th scope="col">未收余额</th><th scope="col">操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="empty">${t.count?'没有符合此状态的发票。':'还没有销售发票。点击「新建销售发票」，保存后会自动记入销售收入与应收账款。'}</p>`}
      ${pages>1?`<div class="journal-pagination">${btn('page','上一页',` data-value="${this.page-1}"${this.page===1?' disabled':''}`)}<span>${this.page} / ${pages} 页 · ${list.length} 张</span>${btn('page','下一页',` data-value="${this.page+1}"${this.page===pages?' disabled':''}`)}</div>`:''}
    </article>${this.salesSummary(d)}`;
    this.root.innerHTML=Locale.markup(navigation+review+(this.scope==='review'?'':posted));
  }
  salesSummary(data){
    if(!this.reviews?.authors)return '';
    const authors=new Map(this.reviews.authors().map(author=>[author.requestId,author])), groups=new Map();
    for(const invoice of data.invoices){
      const author=authors.get(invoice.txn.inv.request);
      if(!author)continue;
      const row=groups.get(author.id)||{name:author.name,count:0,amount:0,received:0,balance:0};
      row.count++;row.amount+=invoice.amount;row.received+=invoice.received;row.balance+=invoice.balance;
      groups.set(author.id,row);
    }
    if(!groups.size)return '';
    const rows=[...groups.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name));
    return `<article class="enterprise-card"><div class="enterprise-heading"><div><h3>銷售開票與收款</h3><p>本年度截至 ${esc(data.through)} · 已過帳銷售申請 · ${esc(this.cur())}</p></div></div>
      <div class="scroll"><table class="enterprise-table"><thead><tr><th scope="col">銷售</th><th scope="col">發票</th><th scope="col">開票金額</th><th scope="col">實收</th><th scope="col">未收</th></tr></thead>
      <tbody>${rows.map(row=>`<tr><th scope="row">${esc(row.name)}</th><td>${row.count}</td><td>${this.money(row.amount)}</td><td>${this.money(row.received)}</td><td>${this.money(row.balance)}</td></tr>`).join('')}</tbody></table></div></article>`;
  }
  /* Requests from salespeople wait here; approving one posts it through the normal invoice form. */
  reviewCard(writable,pending){
    if(!this.reviews)return '';
    const error=this.reviews.error();
    if(!pending.length&&!error&&this.scope!=='review')return '';
    const rows=pending.map(r=>`<tr data-review="${esc(r.id)}"><th scope="row"><strong>${esc(r.data.partyName)}</strong><small>${esc(r.data.lines[0].desc)}${r.data.lines.length>1?` 等 ${r.data.lines.length} 项`:''}</small></th>
      <td class="inv-text">${esc(r.requester)}<small>${esc(new Date(r.updatedAt).toLocaleString(Locale.current,{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))}</small></td>
      <td class="inv-text">${esc(r.data.date)}</td><td>${this.money(r.data.total)}</td>
      <td>${writable&&!r.mine?btn('review','审核',` data-id="${esc(r.id)}"`,'btn small primary'):'<small>须由其他人审核</small>'}</td></tr>`).join('');
    return `<article class="enterprise-card invoice-reviews" aria-live="polite"><div class="enterprise-heading"><div><h3>待审核的销售发票 <span class="count">${pending.length}</span></h3><p>销售提交的发票申请，审核通过后才会记账（借 应收账款、贷 收入）。</p></div><div class="actions">${writable&&this.reviews.batch&&pending.some(r=>!r.mine)?btn('batch','Wonder 核對及批量過帳','','btn primary'):''}${btn('reviews-refresh','刷新','','btn small')}</div></div>
      ${error?`<p class="err" role="alert">${uiEsc(error)}</p>`:''}
      ${rows?`<div class="scroll"><table class="enterprise-table member-table invoice-table"><thead><tr><th scope="col">客户 / 内容</th><th scope="col">提交人 / 时间</th><th scope="col">开票日期</th><th scope="col">金额</th><th scope="col">操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:error?'':'<p class="empty">目前没有待审发票。</p>'}</article>`;
  }
  openBatch(period){
    if(!this.canWrite()||!this.reviews?.batch)return;
    const all=this.reviews.list().filter(r=>r.status==='pending'&&!r.mine);
    const months=[...new Set(all.map(r=>r.data.date.slice(0,7)))].sort().reverse();
    period=months.includes(period)?period:months[0];
    const pending=all.filter(r=>r.data.date.startsWith(period+'-'));
    this.dialog(`<h3 id="invoice-dialog-title">Wonder 核對及批量過帳</h3>
      <p>對照 Wonder 月結記錄後，勾選已核對的發票。系統會按開票日期一次過帳。</p>
      <div class="fields"><div class="field"><label for="inv-batch-period">開票月份</label><select id="inv-batch-period">${months.map(m=>`<option${m===period?' selected':''}>${esc(m)}</option>`).join('')}</select></div>
      <div class="field"><label for="inv-batch-account">收入科目</label><select id="inv-batch-account">${Object.keys(REVENUE).filter(code=>!this.accountHidden?.(code)).reverse().map(code=>`<option value="${code}">${this.acctLabel(code)}</option>`).join('')}</select></div></div>
      <div class="pay-bank-list">${pending.map(r=>`<label><input type="checkbox" data-inv-batch data-updated="${r.updatedAt}" data-total="${r.data.total}" value="${esc(r.id)}"><span>${esc(r.data.date)} · ${esc(r.data.partyName)}<br><small>${esc(r.requester)} · ${esc(r.data.lines[0].desc)}</small></span><strong>${this.money(r.data.total)}</strong></label>`).join('')}</div>
      <div class="actions">${btn('batch-all','全選本月','','btn small')}<strong id="inv-batch-total" role="status">已選 0 張</strong></div>
      <label class="checkline"><input id="inv-batch-checked" type="checkbox"> 已核對所選發票與 Wonder 記錄</label>
      <p id="inv-batch-error" class="err" role="alert"></p>
      <div class="actions">${btn('batch-save','確認並批量過帳','','btn primary')}<button type="button" class="btn" data-act="closeModal">取消</button></div>`);
    this.modal.querySelector('#inv-batch-period').focus();
  }
  batchTotal(){
    const el=this.modal.querySelector('#inv-batch-total');
    if(!el)return;
    const checked=[...this.modal.querySelectorAll('[data-inv-batch]:checked')];
    el.textContent=Locale.text(`已選 ${checked.length} 張 · ${this.cur()} ${this.money(checked.reduce((n,box)=>n+Number(box.dataset.total),0))}`);
  }
  async postBatch(button){
    const field=id=>this.modal.querySelector('#inv-batch-'+id);
    const error=field('error'),checks=[...this.modal.querySelectorAll('[data-inv-batch]:checked')], ids=checks.map(el=>el.value);
    const versions=Object.fromEntries(checks.map(el=>[el.value,Number(el.dataset.updated)]));
    if(!ids.length||!field('checked').checked){error.textContent=Locale.text('請勾選發票並確認已核對 Wonder。');return;}
    button.disabled=true;
    try{
      const result=await this.reviews.batch({ids,versions,period:field('period').value,account:field('account').value,wonderChecked:true});
      this.modal.hidden=true;
      this.toast(`已批量過帳 ${result.posted.length} 張發票。`);
      try{await this.reviews.refreshLedger();}catch{location.reload();}
    }catch(e){error.textContent=Locale.text(e.message);}
    finally{button.disabled=false;}
  }
  openReview(id){
    if(!this.canWrite()||!this.reviews)return;
    const r=this.reviews.list().find(x=>x.id===id&&x.status==='pending'&&!x.mine);
    if(!r)return;
    this.form={...this.blank(),partyId:r.data.partyId,partyName:r.data.partyName,date:r.data.date,dueDate:r.data.dueDate,
      ...invoiceHeader(r.data),maker:r.data.maker||r.requester,issueTime:r.data.issueTime||'',lines:r.data.lines.map(formLine),
      request:{id:r.id,requester:r.requester,note:r.data.note,total:r.data.total,at:r.updatedAt}};
    this.renderForm();
    this.modal.querySelector('#inv-no')?.focus();
  }
  async reject(){
    const f=this.form, note=this.modal.querySelector('#inv-reject-note')?.value.trim()||'', error=this.modal.querySelector('#inv-error');
    if(!f?.request)return;
    if(!note){if(error)error.textContent=Locale.text('请填写退回原因，销售会看到这段说明。');return;}
    const message=await this.reviews.reject(f.request.id,note);
    if(message){if(error)error.textContent=Locale.text(message);return;}
    const who=f.request.requester;
    this.form=null;this.modal.hidden=true;this.render();this.toast(`已退回给 ${who}，对方修改后会重新提交。`);
  }
  dialog(html,cls=''){
    this.modal.innerHTML=Locale.markup(`<div class="modal-box invoice-dialog ${cls}" role="dialog" aria-modal="true" aria-labelledby="invoice-dialog-title">${html}</div>`);
    this.modal.hidden=false;
  }
  openReceipt(invoice){
    const year=String(this.book().company.year), today=this.today();
    const initial=today.startsWith(year+'-') ? today : this.entryDate();
    const date=initial < invoice.date ? invoice.date : initial;
    const accounts=this.cashAccounts();
    this.dialog(`<h3 id="invoice-dialog-title">登记发票收款</h3>
      <div class="receipt-context"><div><strong>${esc(invoice.no)}</strong><span>${esc(invoice.partyName)}</span></div><div><span>未收余额</span><strong>${esc(this.cur())} ${this.money(invoice.balance)}</strong></div></div>
      <div class="fields receipt-fields"><div class="field"><label for="receipt-date">收款日期</label><input id="receipt-date" type="date" min="${invoice.date}" max="${year}-12-31" value="${date}"></div>
      <div class="field"><label for="receipt-amount">本次收款金额（${esc(this.cur())}）</label><input id="receipt-amount" inputmode="decimal" autocomplete="off" value="${(invoice.balance/100).toFixed(2)}"></div>
      <label class="field">付款方式（选填）<input id="receipt-method" maxlength="60" placeholder="如 支付寶、現金"></label><div class="field full"><label for="receipt-account">到账账户</label><select id="receipt-account">${accounts.length>1?'<option value="">选择实际到账账户</option>':''}${accounts.map(a=>`<option value="${esc(a.id)}">${this.cashOption(a)}</option>`).join('')}</select></div></div>
      <p class="hint">确认后会生成收款凭证并冲减未收余额。已导入银行对账单时，也可${btn('receipt-bank','从银行流水核销','','text-button')}。</p>
      <p id="receipt-error" class="err" role="alert" tabindex="-1"></p>
      <div class="actions">${btn('receipt-save','确认收款',` data-id="${esc(invoice.id)}"`,'btn primary')}<button class="btn" data-act="closeModal">取消</button></div>`, 'receipt-dialog');
    this.modal.querySelector('#receipt-date').focus();
  }
  saveReceipt(id){
    const field=name=>this.modal.querySelector('#receipt-'+name).value;
    const date=field('date'), error=this.receive(id,{date,amount:field('amount').trim(),cashAccount:field('account'),paymentMethod:field('method').trim()});
    if(error){const message=this.modal.querySelector('#receipt-error');message.textContent=Locale.text(error);message.focus();return;}
    this.month=Math.max(this.month,E.monthOf(date));
    this.modal.hidden=true;
    this.render();
    const invoice=[...this.root.querySelectorAll('[data-inv-act="view"]')].find(button=>button.dataset.id===id);
    (invoice || this.root.querySelector('[data-inv-act="filter"][aria-pressed="true"]'))?.focus({preventScroll:true});
  }
  blank(){
    const book=this.book();
    return {maker:this.currentMaker?.()||'',issueTime:new Date().toTimeString().slice(0,5),editId:null,partyId:'',partyName:'',date:this.entryDate(),dueDate:'',no:nextNumber(book),account:'4100',memo:'',lines:[{desc:'',qty:'1',price:''}]};
  }
  openForm(id,copy=false){
    if(!this.canWrite())return;
    const book=this.book(), txn=id&&book.txns.find(t=>t.id===id&&linked(t));
    if(id&&!txn)return;
    if(txn&&!copy&&this.lockedDate(txn.date)){this.toast('此发票所在期间已锁定，请先反结账。');return;}
    this.form=txn?{editId:copy?null:txn.id,partyId:txn.biz.events[0].partyId,partyName:txn.biz.events[0].partyName,date:copy?this.entryDate():txn.date,
      dueDate:copy?'':txn.biz.events[0].dueDate||'',no:copy?nextNumber(book):txn.inv.no,account:txn.inv.account,memo:txn.memoUser||'',
      ...invoiceHeader(txn.inv),lines:txn.inv.lines.map(formLine)}:this.blank();
    this.renderForm();
    this.modal.querySelector('#inv-party-id')?.focus();
  }
  totals(){
    let total=0,error='';
    const amounts=this.form.lines.map(l=>{
      if(![l.desc,l.qty,l.price].some(v=>String(v).trim()))return null;
      try{const {amount}=lineValues(l);total+=amount;return amount;}catch(e){error||=e.message;return null;}
    });
    return {amounts,total,error};
  }
  previewHTML(){
    const {total}=this.totals(), f=this.form;
    return total?`<span class="ph">保存后自动生成的分录</span><table class="mini"><tbody><tr><td><span class="dr">借</span> ${this.acctName(RECEIVABLE)}${f.partyName.trim()?' · '+esc(f.partyName.trim()):''}</td><td class="amt dr-amt">${this.money(total)}</td><td class="amt cr-amt"></td></tr><tr><td class="ca"><span class="cr">贷</span> ${this.acctName(f.account)}</td><td class="amt dr-amt"></td><td class="amt cr-amt">${this.money(total)}</td></tr></tbody></table>`
      :'<span class="ph">分录预览</span><p class="tdesc">填写数量和单价后显示自动记账的借贷明细。</p>';
  }
  renderForm(){
    const f=this.form, {amounts,total}=this.totals(), people=customers(this.book());
    const q=f.request;
    this.dialog(`<h3 id="invoice-dialog-title">${q?'审核销售发票申请':f.editId?'修改销售发票':'新建销售发票'}</h3>
      ${q?`<p class="period-notice">由 ${esc(q.requester)} 提交 · 申请金额 ${this.money(q.total)}${q.note?` · 说明：${esc(q.note)}`:''}</p><p class="tdesc">请核对客户和明细，确认发票号和收入科目。批准后系统按下方分录记账；如需修改可直接改，或退回给销售。</p>`
        :'<p class="tdesc">保存后系统自动把这张发票记入销售收入和客户应收账款，无需再手工做分录。</p>'}
      <div class="salon-editor-columns"><section class="salon-editor-info"><h4>开票资料</h4>
      <div class="fields"><div class="field"><label for="inv-party-id">客户编号</label><input id="inv-party-id" data-inv-field="partyId" value="${esc(f.partyId)}" maxlength="80" list="inv-customers" placeholder="如 C001" autocomplete="off"><datalist id="inv-customers">${people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</datalist></div>
        <div class="field"><label for="inv-party-name">客户名称</label><input id="inv-party-name" data-inv-field="partyName" value="${esc(f.partyName)}" maxlength="80" autocomplete="off"></div>
        <div class="field"><label for="inv-date">开票日期</label><input id="inv-date" data-inv-field="date" type="date" value="${esc(f.date)}"></div>
        <div class="field"><label for="inv-due">到期日（选填）</label><input id="inv-due" data-inv-field="dueDate" type="date" value="${esc(f.dueDate)}"></div>
        <div class="field"><label for="inv-no">发票号</label><input id="inv-no" data-inv-field="no" value="${esc(f.no)}" maxlength="40" autocomplete="off"></div>
        <div class="field"><label for="inv-account">记入收入科目</label><select id="inv-account" data-inv-field="account">${Object.keys(REVENUE).filter(code=>code===f.account || !this.accountHidden?.(code)).map(code=>`<option value="${code}"${code===f.account?' selected':''}>${this.acctLabel(code)}</option>`).join('')}</select></div>${headerInputs('inv',f)}</div>
      <div class="field full"><label for="inv-memo">摘要（留空则自动生成）</label><input id="inv-memo" data-inv-field="memo" value="${esc(f.memo)}" maxlength="120" autocomplete="off"></div>
      <div class="preview" id="inv-preview">${this.previewHTML()}</div>
      </section>${itemEditor('inv',f.lines,amounts,total,this.cur(),n=>this.money(n),btn)}</div>
      ${q?`<div class="field full" id="inv-reject" hidden><label for="inv-reject-note">退回原因（销售会看到）</label><textarea id="inv-reject-note" rows="2" maxlength="300"></textarea></div>`:''}
      <p class="err" id="inv-error" role="alert"></p>
      <div class="actions">${btn('save',q?'批准并过账':f.editId?'保存修改':'保存并记账','','btn primary')}${q?btn('reject','退回给销售'):''}<button type="button" class="btn" data-act="closeModal">取消</button></div>`,'salon-editor');
  }
  refreshTotals(){
    const {amounts,total}=this.totals();
    amounts.forEach((amount,i)=>{const cell=this.modal.querySelector(`[data-inv-amount="${i}"]`);if(cell)cell.textContent=amount==null?'—':this.money(amount);});
    const sum=this.modal.querySelector('#inv-total'), preview=this.modal.querySelector('#inv-preview'), error=this.modal.querySelector('#inv-error');
    if(sum)sum.textContent=this.money(total);
    if(preview)preview.innerHTML=Locale.markup(this.previewHTML());
    if(error)error.textContent='';
  }
  input(el){
    if(!this.form||this.modal.hidden)return;
    if(el.dataset.invLine!=null){const line=this.form.lines[Number(el.dataset.invLine)];if(line){line[el.dataset.k]=el.value;this.refreshTotals();}}
    else if(el.dataset.invField&&el.tagName==='INPUT'){
      this.form[el.dataset.invField]=el.value;
      if(el.dataset.invField==='partyId'){
        const known=customers(this.book()).find(p=>key(p.id)===key(el.value)), name=this.modal.querySelector('#inv-party-name');
        if(known&&name&&name.value!==known.name){name.value=known.name;this.form.partyName=known.name;}
      }
      this.refreshTotals();
    }
  }
  change(el){
    if(el.matches('[data-inv-batch]')){this.batchTotal();return;}
    if(el.id==='inv-batch-period'){this.openBatch(el.value);return;}
    if(el.id==='invoice-month'){const m=Number(el.value);if(Number.isInteger(m)&&m>=1&&m<=12){this.month=m;this.page=1;this.render();this.root.querySelector('#invoice-month')?.focus();}return;}
    if(this.form&&!this.modal.hidden&&el.dataset.invField&&el.tagName==='SELECT'){this.form[el.dataset.invField]=el.value;this.refreshTotals();}
  }
  save(){
    const f=this.form;if(!f)return;
    const show=text=>{const error=this.modal.querySelector('#inv-error');if(error)error.textContent=Locale.text(text);};
    let parsed,header;
    try{parsed=parseLines(f.lines);header=invoiceHeader(f);}catch(e){show(e.message);return;}
    const message=this.post({date:f.date,dueDate:f.dueDate,partyId:f.partyId,partyName:f.partyName,invNo:f.no,account:f.account,memo:f.memo,
      ...header,lines:JSON.stringify(parsed.lines.map(formLine))},f.editId,f.request?.id);
    if(message){show(message);return;}
    this.form=null;this.modal.hidden=true;this.render();
  }
  view(id){
    const x=this.data().invoices.find(v=>v.id===id) || summary(this.book()).invoices.find(v=>v.id===id);
    if(!x)return;
    const company=this.book().company, writable=this.canWrite();
    const history=[...x.applications.map(a=>({txn:a.txn,label:'收款 / 核销',amount:a.amount})),...x.returns.map(r=>({txn:r.txn,label:'退款 / 冲减',amount:r.amount}))]
      .sort((a,b)=>a.txn.date.localeCompare(b.txn.date)||a.txn.seq-b.txn.seq);
    this.dialog(`<article class="invoice-doc"><header><div><p class="inv-company">${esc(company.name)}</p><h3 id="invoice-dialog-title">销售发票 <small>INVOICE</small></h3></div><dl><div><dt>发票号</dt><dd>${esc(x.no)}</dd></div><div><dt>开票日期</dt><dd>${esc(x.date)}</dd></div><div><dt>到期日</dt><dd>${x.dueDate?esc(x.dueDate):'—'}</dd></div><div><dt>状态</dt><dd>${this.badge(x)}</dd></div></dl></header>
      <p class="inv-billto"><span>客户</span><strong>${esc(x.partyName)}</strong><small>编号 ${esc(x.partyId)}</small></p>
      <div class="scroll"><table class="enterprise-table invoice-lines">${displayLines(x.lines,n=>this.money(n))}
        <tfoot><tr><th scope="row" colspan="4">发票合计 · ${esc(company.cur)}</th><td><strong>${this.money(x.amount)}</strong></td></tr><tr><th scope="row" colspan="4">已收款 / 已冲减</th><td>${this.money(x.settled)}</td></tr><tr><th scope="row" colspan="4">未收余额</th><td><strong>${this.money(x.balance)}</strong></td></tr></tfoot></table></div>
      <div class="inv-posting"><p>已自动记账 · 凭证 ${esc(x.id)}：借 ${this.acctName(RECEIVABLE)} ${this.money(x.amount)} / 贷 ${this.acctName(x.account)} ${this.money(x.amount)}</p>
        ${history.length?`<ul>${history.map(h=>`<li>${esc(h.txn.date)} · ${h.label} ${esc(h.txn.id)} · ${this.money(h.amount)}</li>`).join('')}</ul>`:'<p>尚无收款记录。</p>'}</div></article>
      <div class="actions invoice-actions">${btn('print','打印发票 / PDF',` data-id="${esc(x.id)}"`,'btn primary')}${btn('voucher','查看凭证',` data-id="${esc(x.id)}"`)}${x.balance>0&&writable?btn('receive','收款',` data-id="${esc(x.id)}"`):''}<button type="button" class="btn" data-act="closeModal">关闭</button></div>`,'invoice-view');
    this.modal.querySelector('[data-inv-act="print"]')?.focus();
  }
  print(id){
    const invoice=summary(this.book()).invoices.find(x=>x.id===id);
    if(invoice)window.SalonInvoicePrint.open(printData(invoice),this.cur());
  }
  click(el){
    const {invAct,value,id,index}=el.dataset;
    if(invAct==='scope'){
      this.scope=value;this.filter='all';this.page=1;this.render();
      this.root.querySelector('[data-inv-act="scope"][aria-pressed="true"]')?.focus();
      return;
    }
    if(invAct==='filter'){this.filter=value;this.page=1;this.render();}
    else if(invAct==='page'){this.page=Number(value);this.render();}
    else if(invAct==='new')this.openForm();
    else if(invAct==='edit')this.openForm(id);
    else if(invAct==='view')this.view(id);
    else if(invAct==='print')this.print(id);
    else if(invAct==='voucher'){this.modal.hidden=true;this.openVoucher(id);}
    else if(invAct==='receive'){
      const x=summary(this.book(),this.period().through).invoices.find(v=>v.id===id);
      if(x&&x.balance>0)this.openReceipt(x);
    }
    else if(invAct==='receipt-save')this.saveReceipt(id);
    else if(invAct==='receipt-bank'){this.modal.hidden=true;this.openBank();}
    else if(invAct==='line-add'&&this.form&&this.form.lines.length<MAX_LINES){this.form.lines.push({desc:'',qty:'1',price:''});this.renderForm();this.modal.querySelector(`#inv-desc-${this.form.lines.length-1}`)?.focus();}
    else if(invAct==='line-del'&&this.form&&this.form.lines.length>1){this.form.lines.splice(Number(index),1);this.renderForm();}
    else if(invAct==='save')this.save();
    else if(invAct==='review')this.openReview(id);
    else if(invAct==='batch')this.openBatch();
    else if(invAct==='batch-save')this.postBatch(el);
    else if(invAct==='batch-all'){
      const boxes=[...this.modal.querySelectorAll('[data-inv-batch]')], all=boxes.every(box=>box.checked);
      for(const box of boxes)box.checked=!all;
      el.textContent=Locale.text(all?'全選本月':'清除選取');this.batchTotal();
    }
    else if(invAct==='reviews-refresh')this.reviews?.refresh();
    else if(invAct==='reject'){
      const box=this.modal.querySelector('#inv-reject');
      if(box?.hidden){box.hidden=false;el.textContent=Locale.text('确认退回');box.querySelector('textarea').focus();}
      else this.reject();
    }
  }
}
window.AccountingInvoices={TPL,REVENUE,STATUS,MAX_LINES,linked,parseLines,invoiceHeader,formLine,lineValues,displayLines,headerInputs,itemEditor,printData,validate,numberTaken,nextNumber,summary,customers,Workspace:InvoiceWorkspace};
})();

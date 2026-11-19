/* Training has its own per-level storage adapter and uses the real ledger UI. */
(() => {
'use strict';
const L=window.AccountingLocale, content=window.AccountingTrainingContent;
const prefix='acct2102-reconciliation-training-v1:';
const key=kind=>kind.replace(/^acct2102-finance-record-v1/,'book');
const pad=n=>String(n).padStart(2,'0');
const icon='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 3.5h14v17l-3.5-2-3.5 2-3.5-2L5 20.5zM8 8h8M8 11.5h8M8 15h4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const check='<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m4.5 10 3.5 3.5 7.5-7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const roleCopy={
  all:['全部关卡','按角色选择适合你的练习。'],
  accountant:['会计','从日常凭证、银行对账到月结。'],
  sales:['销售','根据订单提交申请，处理会计退回。'],
  owner:['老板','用报表和业务明细核对经营情况。'],
};

class Storage {
  constructor(storage) { this.storage=storage; this.level=null; }
  scoped(kind,level=this.level) {
    if(!level)throw new Error('请选择练习关卡');
    return prefix+level.id+':'+key(kind);
  }
  getItem(kind) { return this.level?this.storage().getItem(this.scoped(kind)):null; }
  setItem(kind,value) { this.storage().setItem(this.scoped(kind),value); }
  removeItem(kind) { this.storage().removeItem(this.scoped(kind)); }
  progress(level) {
    try {
      const raw=this.storage().getItem(this.scoped('book',level));
      if(raw) return content.review(level,JSON.parse(raw)).passed?'passed':'started';
      if(this.storage().getItem(this.scoped('book-draft',level)))return 'started';
    } catch { return 'started'; }
    return 'new';
  }
  reset() { for(const kind of ['book','book-draft','book-recovery'])this.removeItem(kind); }
}

class View {
  constructor(catalog,coach) {
    this.catalog=catalog; this.coach=coach; this.reviewed=false; this.role='all';
  }
  reset() { this.reviewed=false; }
  renderCatalog(storage) {
    const statuses=content.levels.map(level=>storage.progress(level));
    const done=statuses.filter(s=>s==='passed').length;
    const roles=Object.keys(roleCopy);
    const cases=content.levels.map((level,i)=>({level,i,role:content.roleOf(level)}));
    const available=role=>cases.filter(entry=>role==='all'||entry.role===role);
    const shown=available(this.role);
    this.catalog.innerHTML=L.markup(`
      <header class="training-cover">
        <div><span class="training-kicker">${icon} 海岬商贸 · 练习账套</span>
        <h2>财务工作台实训</h2>
        <p>选一个岗位，用虚构业务资料在系统里实操。每一步都能定位到对应页面、记录或表单。</p></div>
        <div class="training-progress">
          <span>我的通关进度</span><strong>${pad(done)}<small> / ${pad(content.levels.length)}</small></strong>
          <progress value="${done}" max="${content.levels.length}" aria-label="已通过关卡数"></progress>
          <small>进度保存在当前浏览器</small>
        </div>
      </header>
      <div class="training-catalog-head"><h2>按岗位练习</h2><span>2026 年 6 月 · 港币</span></div>
      <div class="training-role-filters" role="group" aria-label="筛选实训岗位">
        ${roles.map(role=>{
          const items=available(role);
          const passed=items.filter(({i})=>statuses[i]==='passed').length;
          return `<button type="button" class="btn" data-act="trainingRole" data-v="${role}" aria-pressed="${this.role===role}"><strong>${roleCopy[role][0]}</strong><span>${passed}/${items.length}</span></button>`;
        }).join('')}
      </div>
      <p class="training-role-caption" role="status">${roleCopy[this.role][1]} 共 ${shown.length} 关</p>
      <ol class="training-cases">${shown.map(({level,i,role},visibleIndex)=>{
        const status=statuses[i];
        return `<li value="${i+1}" style="--training-delay:${Math.min(visibleIndex,5)*32}ms">
          <span class="training-case-no" aria-hidden="true">${pad(i+1)}</span>
          <div class="training-case-copy"><div><span>${content.roles[role]} · ${level.tag}</span>${level.advanced?'<span class="training-advanced">进阶</span>':''}<span>约 ${level.minutes} 分钟</span></div>
          <h3>${level.title}</h3><p>${level.brief}</p></div>
          <div class="training-case-actions">
            <span class="training-state" data-state="${status}">${status==='passed'?check+' 已通过':status==='started'?'进行中':'未开始'}</span>
            <button type="button" class="btn ${status==='passed'?'':'primary'}" data-act="trainingStart" data-v="${level.id}" aria-label="${status==='passed'?'查看练习':status==='started'?'继续练习':'开始练习'}：${level.title}">${status==='passed'?'查看练习':status==='started'?'继续练习':'开始练习'} <span aria-hidden="true">↗</span></button>
          </div>
        </li>`;
      }).join('')}</ol>
      <p class="training-footnote">每关的数据单独保存，可以重复练习。实训不会读取或改动正式账本。</p>`);
  }
  renderCoach(level,book) {
    const r=book?content.review(level,book):null;
    const done=r?.itemChecks.filter(Boolean).length ?? 0;
    const next=r?.itemChecks.findIndex(ok=>!ok) ?? -1;
    const number=pad(content.levels.indexOf(level)+1);
    const role=content.roleOf(level);
    const nextLevel=content.levels.slice(content.levels.indexOf(level)+1).find(candidate=>content.roleOf(candidate)===role);
    const html=L.markup(`
      <div class="training-coach-head">
        <span class="training-kicker">${icon} 第 ${number} 关 · ${content.roles[role]} · ${level.tag}</span>
        <h2 id="trainingCoachTitle">${level.title}</h2>
        <p>${level.brief}</p>
      </div>
      <div class="training-coach-body">
        <details class="training-source" open>
          <summary>题目资料 <small>HK$</small></summary>
          <dl>${level.source.map(([label,amount,ref])=>`<div><dt>${label}<small>${ref}</small></dt><dd>${amount}</dd></div>`).join('')}</dl>
          ${level.csv?`<label class="training-csv-label" for="trainingCsv">练习 CSV</label><textarea id="trainingCsv" readonly rows="3">${L.literal(level.csv)}</textarea><button type="button" class="btn" data-act="trainingCopyCsv">复制练习 CSV</button>`:''}
        </details>
        <div class="training-step-head"><h3>跟着做</h3><span>${done} / ${level.steps.length} 项完成</span></div>
        <ol class="training-steps">${level.steps.map(({title,text,action,label,options},i)=>`<li data-state="${r?.itemChecks[i]?'passed':i===next?'current':'pending'}">
          <span class="training-step-index" aria-hidden="true">${r?.itemChecks[i]?check:i+1}</span>
          <div><h4>${title}${r?.itemChecks[i]?'<span class="sr-only">（已完成）</span>':''}</h4><p>${text}</p>
            <button type="button" class="btn" data-act="trainingLocate" data-v="${action}">${label} <span aria-hidden="true">↗</span></button>
            ${options?`<label class="training-answer" for="training-answer-${i}"><span class="sr-only">${title}的判断</span><select id="training-answer-${i}" data-training-answer="${i}"><option value="">选择你的判断</option>${options.map((option,index)=>`<option value="${index}"${book?.trainingAnswers?.[i]===index?' selected':''}>${option}</option>`).join('')}</select></label>`:''}</div>
          </li>`).join('')}</ol>
        <section id="trainingResult" class="training-result" data-state="${r?.passed?'passed':this.reviewed?'reviewed':'pending'}" aria-live="polite" tabindex="-1">
          ${r?.passed?`<h3>${check} 本关已通过</h3><p>${r.balanceHint}</p><p>${level.takeaway}</p>
            ${nextLevel?`<button type="button" class="btn primary" data-act="trainingStart" data-v="${nextLevel.id}">下一关</button>`:'<button type="button" class="btn primary" data-act="section" data-v="training">返回关卡总览</button>'}`
            :`${this.reviewed?`<h3>还差这些</h3><ul>${level.steps.filter((_,i)=>!r?.itemChecks[i]).map(s=>`<li>${s.title}</li>`).join('')}</ul><p>${r?.balanceHint || '无法读取本关数据，请重置本关后重试。'}</p>`:''}
              <button type="button" class="btn primary" data-act="trainingCheck">检查本关结果</button>`}
        </section>
        <div class="training-coach-footer"><button type="button" data-act="trainingReset">重置本关</button></div>
      </div>`);
    if(this.previousCoach===html)return;
    const active=document.activeElement, action=active?.dataset.act, value=active?.dataset.v;
    const focused=this.coach.contains(active);
    this.coach.innerHTML=html;
    this.previousCoach=html;
    if(focused){
      const replacement=[...this.coach.querySelectorAll('button')].find(b=>b.dataset.act===action&&b.dataset.v===value);
      (replacement || this.coach.querySelector('#trainingResult'))?.focus({preventScroll:true});
    }
  }
}

// Storage for the practice sales form. The real SalesPortal sends these same
// operations to the account API; here they only update the active fixture.
function salesRequest(book,commit,validDate,path,method='GET',input) {
  if(!book.trainingSales)throw new Error('请先打开销售实训。');
  const data=structuredClone(book.trainingSales);
  if(path==='sales'&&method==='GET')return {...data,company:book.company};
  const saveCustomer=(rawId,rawName)=>{
    const id=String(rawId||'').trim(), name=String(rawName||'').trim();
    if(!id||!name||id.length>80||name.length>80)throw new Error('请填写客户编号和名称（各最多 80 字）。');
    const known=data.customers.find(c=>c.id.toLowerCase()===id.toLowerCase());
    if(known&&known.name!==name)throw new Error('该编号对应的客户名称不同，请核对客户。');
    if(!known)data.customers.push({id,name});
    return known || {id,name};
  };
  if(path==='sales/customers'&&method==='POST'){
    saveCustomer(input.id,input.name);
  }else{
    const [,area,id]=path.split('/');
    if(area!=='requests'||!['POST','PUT','DELETE'].includes(method))throw new Error('找不到此实训操作。');
    const index=data.requests.findIndex(request=>request.id===id);
    const existing=data.requests[index];
    if(method!=='POST'&&(!existing||existing.status==='approved'))throw new Error('找不到可以修改或撤回的申请。');
    if(method==='DELETE')data.requests.splice(index,1);
    else {
      const {date,dueDate}=input, year=book.company.year;
      if(!validDate(date,year)||dueDate&&(!validDate(dueDate,year)||dueDate<date))
        throw new Error('请填写有效的开票及到期日。到期日不得早于开票日期。');
      const customer=saveCustomer(input.partyId,input.partyName);
      const {lines,total}=window.AccountingInvoices.parseLines(input.lines);
      const note=String(input.note||'').trim();
      if(note.length>500)throw new Error('给会计的说明最多 500 字。');
      const request={id:existing?.id||crypto.randomUUID(),status:'pending',updatedAt:Date.now(),reviewNote:'',
        data:{partyId:customer.id,partyName:customer.name,date,dueDate,note,...window.AccountingInvoices.invoiceHeader(input),lines,total}};
      if(existing)data.requests[index]=request;
      else data.requests.push(request);
    }
  }
  if(!commit(data))throw new Error('练习进度没有保存。请刷新后再试。');
  return {ok:true};
}
window.AccountingTraining={Storage,View,salesRequest};
})();

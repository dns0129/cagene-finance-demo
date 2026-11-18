(() => {
'use strict';
const L=window.AccountingLocale, esc=L.literal, $=(s,r=document)=>r.querySelector(s);
const fields=[['base','底薪'],['attendance','勤工'],['work','工錢'],['commission','佣金'],['deduction','扣款'],['employeeMpf','僱員 MPF'],['employerMpf','僱主 MPF']];
const mpfModes=[['manual','手工核定'],['monthly','一般按月僱員'],['holiday','供款假期：只計僱主'],['none','不適用']];
const amount=n=>((n||0)/100).toLocaleString('en-HK',{minimumFractionDigits:2,maximumFractionDigits:2});
const decimal=n=>(n/100).toFixed(2);
const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit'}).format();
const previous=month=>{
  const [y,m]=month.split('-').map(Number);
  return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
};
function cents(raw){
  if(!raw)return 0;
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw new Error('金額必須為非負數，最多兩位小數。');
  const [d,c='']=raw.split('.');
  return Number(d)*100+Number(c.padEnd(2,'0'));
}
function draftRow(person){
  const input=key=>person.elements.namedItem(key);
  const number=key=>input(key).disabled?0:cents(input(key).value.trim());
  return {
    staffId:person.dataset.payPerson,
    ...Object.fromEntries(fields.map(([key])=>[key,number(key)])),
    mpfMode:input('mpfMode').value,
    mpfIncome:input('mpfIncome').disabled||!input('mpfIncome').value.trim()?null:number('mpfIncome'),
    earningsMonth:input('earningsMonth').value,
    leave:input('leave').value,
  };
}
function draftTotals(row){
  const gross=row.base+row.attendance+row.work+row.commission-row.deduction;
  let employee=row.employeeMpf, employer=row.employerMpf;
  if(row.mpfMode==='monthly'||row.mpfMode==='holiday'){
    ({employee,employer}=window.AccountingBusiness.monthlyMpf(row.mpfIncome??gross,row.mpfMode==='holiday'));
  }
  return {gross,employee,employer,net:gross-employee};
}
const button=(action,label,cls='btn',value='')=>`<button type="button" class="${cls}" data-pay="${action}" data-value="${esc(value)}">${label}</button>`;
const badge=(label,type='')=>`<span class="pay-badge ${type}">${label}</span>`;
const stageLabel=r=>r.status==='posted'?'已過帳':r.status==='draft'?'草稿':r.rows.every(row=>r.confirmations[row.staffId])?'待銀行核對':'待員工確認';
const toCsv=rows=>'\ufeff'+rows.map(row=>row.map(value=>{
  const text=String(value??'');
  return '"'+(/^[=+\-@\t\r]/.test(text)?"'":'')+text.replaceAll('"','""')+'"';
}).join(',')).join('\r\n');

class Payroll {
  constructor({root,modal,request,user,download,logout,flush,reload,back}){
    Object.assign(this,{root,modal,request,user,download,logout,flush,reload,back});
    this.mine=false; this.data=null; this.selected=null; this.bank=null; this.error='';
    document.addEventListener('click',e=>{
      const target=e.target.closest('[data-pay]');
      if(target&&!target.disabled)this.action(target);
    });
    document.addEventListener('submit',e=>{
      if(e.target.matches('[data-pay-form]')){e.preventDefault();this.form(e.target);}
    });
    root.addEventListener('change',e=>{
      if(e.target.id==='pay-bank-account'){this.bankAccount=e.target.value;this.loadBank().catch(error=>this.message(error.message));}
      if(e.target.matches('[data-pay-bank]')){
        const rows=this.bank.rows.filter(row=>$('[data-pay-bank][value="'+row.month+':'+row.index+'"]',root)?.checked);
        $('#pay-bank-total',root).textContent=amount(rows.reduce((n,row)=>n-row.amount,0));
        const net=this.run()?.totals.net;
        $('[data-pay="post"]',root).disabled=!rows.length||rows.reduce((n,row)=>n-row.amount,0)!==net;
      }
    });
  }
  get canEdit(){return ['hr','accountant'].includes(this.user().role);}
  get isFinance(){return this.user().role==='accountant';}
  run(){return this.data?.runs?.find(run=>run.id===this.selected);}
  message(message){this.error=message;const el=(!this.modal.hidden&&$('#pay-error',this.modal))||$('#pay-page-error',this.root);if(el)el.textContent=L.text(message);}
  async load(mine=this.mine){
    if(this.data && this.mine!==mine){this.data=null;this.selected=null;this.bank=null;}
    this.mine=mine; const token=this.loadToken=Symbol();
    try {
      const data=await this.request(mine?'payroll/mine':'payroll');
      if(token!==this.loadToken)return;
      this.data=data;
      this.error='';
      if(!mine && !this.run())this.selected=this.data.runs[0]?.id||null;
    }catch(error){ if(token===this.loadToken)this.error=error.message; }
    if(token===this.loadToken)this.render();
  }
  render(){
    const d=this.data;
    const restricted=['hr','employee','sales'].includes(this.user().role);
    const header=restricted?`<header class="pay-portal-top"><strong>財務工作台</strong><div class="actions"><a class="btn" href="#tutorial" data-portal-tutorial>操作教程</a>${this.user().role==='hr'?button('mode',this.mine?'薪酬管理':'我的糧單','btn',this.mine?'manage':'mine'):this.user().role==='sales'?button('back','返回銷售工作台'):''}${button('password','修改密碼')}${button('logout','退出登入')}</div></header>`:'';
    this.root.innerHTML=L.markup(`${header}<div class="pay-body">
      <section class="pay-banner"><div><p>${esc(d?.company||'工作台')}</p><h2>${this.mine?'我的糧單':'薪酬與出糧'}</h2></div>
      <div class="actions">${restricted?'':button('mode',this.mine?'薪酬管理':'我的糧單','btn',this.mine?'manage':'mine')}${this.canEdit&&!this.mine?button('new','建立工資表','btn primary'):''}</div></section>
      <p id="pay-page-error" class="err" role="alert">${esc(this.error)}</p>
      ${!d?button('reload','重新載入'):this.mine?this.renderMine(d):this.renderManage(d)}</div>`);
  }
  renderMine(d){
    return `<section class="enterprise-card"><div class="enterprise-heading"><h3>已發佈糧單</h3>${button('reload','重新載入','btn small')}</div>${d.slips.length?d.slips.map(slip=>`<div class="pay-list-item"><div><strong>${slip.period}</strong><small>實發淨薪 HK$ ${amount(slip.row.net)}</small></div>
      ${badge(slip.confirmedAt?'已確認 · 已鎖定':'待核對',slip.confirmedAt?'paid':'')}${button('slip','查看糧單','btn',slip.id)}</div>`).join(''):'<p class="empty">暫未有糧單。HR 發佈後，糧單會在這裏顯示。</p>'}</section>`;
  }
  renderManage(d){
    const run=this.run();
    return `<div class="pay-grid">
      <section class="enterprise-card pay-periods"><h3>工資月份</h3>${d.runs.length?d.runs.map(r=>`<button class="pay-period" type="button" data-pay="select" data-value="${r.id}" aria-pressed="${r===run}"><strong>${r.period}</strong><small>${stageLabel(r)}</small></button>`).join(''):'<p class="empty">暫未建立工資表。</p>'}</section>
      ${run?`<section class="enterprise-card pay-run"><div class="enterprise-heading"><div><h3>${run.period} 工資表</h3><p>${run.rows.length} 位員工</p></div>${badge(stageLabel(run),run.status==='posted'?'paid':'')}</div>
        <div class="pay-steps"><span>1. 編製工資表</span><span>2. 員工確認</span><span>3. 銀行核對及過帳</span></div>
        <div class="pay-metrics">${[['gross','總薪金'],['employeeMpf','僱員 MPF'],['employerMpf','僱主 MPF'],['net','實發淨薪']].map(([key,label])=>`<div><span>${label}</span><strong>${amount(run.totals[key])}</strong></div>`).join('')}</div>
        <div class="scroll"><table class="enterprise-table pay-table"><thead><tr><th>員工</th><th>總薪金</th><th>實發淨薪</th><th>確認狀態</th><th>糧單</th></tr></thead><tbody>${run.rows.map(row=>`<tr><th scope="row">${esc(row.name)}<small>${esc(row.staffId)}</small></th><td>${amount(row.gross)}</td><td>${amount(row.net)}</td><td>${run.confirmations[row.staffId]?'已確認':run.status==='draft'?'草稿':'待確認'}</td><td>${button('slip','查看','btn small',row.staffId)}</td></tr>`).join('')}</tbody></table></div>
        <div class="actions pay-run-actions">${this.canEdit&&run.status==='draft'?button('edit','編輯草稿')+button('publish','發佈糧單','btn primary'):''}
        ${this.canEdit&&run.status==='published'&&run.rows.some(row=>!run.confirmations[row.staffId])?button('correct','修正未確認糧單'):''}
        ${this.canEdit&&run.status==='published'&&!Object.keys(run.confirmations).length?button('withdraw','撤回發佈'):''}
        ${button('export','工資總匯 CSV')}${run.status!=='draft'?button('payment-export','付款核對 CSV'):''}${button('history','操作記錄')}</div>
        ${run.status==='posted'?`<p class="period-notice">計提憑證 ${run.accrual} · 付款憑證 ${run.payments.join('、')} · 已匹配銀行流水</p>`:this.isFinance&&run.status==='published'&&run.rows.every(r=>run.confirmations[r.staffId])?this.renderBank():''}</section>`:'<section class="enterprise-card"><p class="empty">新增員工檔案後，就可以建立第一個月的工資表。</p></section>'}
      </div><section class="enterprise-card"><div class="enterprise-heading"><h3>員工檔案</h3>${this.canEdit?button('staff','新增員工'):''}</div>
      ${d.staff.length?d.staff.map(row=>`<div class="pay-list-item"><div><strong>${esc(row.name)}</strong><small>${esc(row.id)} · ${esc(row.title||'未填職位')} · ${row.userId===null?'未綁定帳號':'已綁定帳號'}${row.active?'':' · 已停用'}</small></div>${this.canEdit?button('staff','編輯','btn small',row.id):''}</div>`).join(''):'<p class="empty">暫未有員工檔案。</p>'}</section>`;
  }
  renderBank(){
    const d=this.bank;
    const run=this.run();
    if(!d)return `<div class="pay-reconcile"><h4>三方付款核對</h4><p>員工已全部確認。選取銀行實際扣款後，系統會核對三方金額。</p>${button('bank','載入銀行扣款','btn primary')}</div>`;
    return `<div class="pay-reconcile"><h4>三方付款核對</h4>
      <div class="pay-metrics"><div><span>工資表實發淨薪</span><strong>${amount(run.totals.net)}</strong></div><div><span>待過帳計提 · 應付工資</span><strong>${amount(run.totals.net)}</strong></div><div><span>已勾選銀行實際扣款</span><strong id="pay-bank-total">0.00</strong></div></div>
      <div class="field"><label for="pay-bank-account">付款帳戶</label><select id="pay-bank-account"><option value="">請選擇帳戶</option>${d.accounts.map(a=>`<option value="${esc(a.id)}"${a.id===this.bankAccount?' selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
      ${this.bankAccount?`<div class="pay-bank-list">${d.rows.length?d.rows.map(row=>`<label><input type="checkbox" data-pay-bank value="${row.month}:${row.index}"><span>${row.date} · ${esc(row.memo||row.ref||'銀行扣款')}</span><strong>${amount(-row.amount)}</strong></label>`).join(''):'<p class="empty">此帳戶暫無可核對扣款，請先到銀行對帳匯入流水。</p>'}</div>`:''}
      <p>核對收款人、日期和銀行回報後，再勾選實際扣款。</p><button type="button" class="btn primary" data-pay="post" disabled>確認核對並過帳</button></div>`;
  }
  show(title,body,cls=''){
    this.modal.innerHTML=L.markup(`<section class="modal-box pay-dialog ${cls}" role="dialog" aria-modal="true" aria-labelledby="pay-dialog-title"><h3 id="pay-dialog-title"${cls==='slip'?' class="sr-only"':''}>${title}</h3>${body}<p id="pay-error" class="err" role="alert"></p></section>`);
    this.modal.hidden=false;
    this.modal.querySelector('input,select,button')?.focus();
  }
  close(){this.modal.hidden=true;this.modal.replaceChildren();}
  staffForm(row){
    const input=(name,label,value='',max=80)=>`<div class="field"><label for="pay-${name}">${label}</label><input id="pay-${name}" name="${name}" maxlength="${max}" value="${esc(value??'')}" ${name==='id'&&row?'readonly':''}></div>`;
    this.show(row?'編輯員工檔案':'新增員工檔案',`<form data-pay-form="staff"><div class="fields">${input('id','員工編號',row?.id,40)}${input('name','姓名',row?.name)}${input('title','職位',row?.title)}
      ${input('username','員工登入用戶名或電郵',row?.username,254)}${input('bank','銀行名稱',row?.bank)}${input('last4','帳號尾四位',row?.last4,4)}</div>
      <label><input type="checkbox" name="active" ${row?.active===false?'':'checked'}> 在職</label>
      <div class="actions"><button type="submit" class="btn primary">儲存員工</button>${button('cancel','取消')}</div></form>`);
  }
  draftPerson(staff,row,defaultEarnings,issued){
    return L.markup(`<fieldset class="pay-person" data-pay-person="${esc(staff.id)}" hidden>
      <legend class="sr-only">${esc(staff.name)}的工資</legend>
      <header class="pay-person-head"><div><h4 tabindex="-1">${esc(staff.name)}</h4><p>${esc(staff.id)}${staff.title?' · '+esc(staff.title):''}</p></div>
        ${issued?'':'<button type="button" class="btn pay-remove-person" data-pay-draft-remove>移出本月</button>'}</header>
      ${staff.active?`<div class="fields">
        ${fields.slice(0,5).map(([key,label])=>this.draftAmount(key,label,row)).join('')}
        <label class="field pay-earnings-month">工錢／佣金所屬月<input name="earningsMonth" type="month" value="${esc(row?.earningsMonth||defaultEarnings)}"></label>
        <label class="field">強積金處理<select name="mpfMode">${mpfModes.map(([key,label])=>`<option value="${key}"${row?.mpfMode===key?' selected':''}>${label}</option>`).join('')}</select></label>
        <label class="field">強積金有關入息（留空用總薪金）<input name="mpfIncome" inputmode="decimal" value="${row?.mpfIncome!=null&&row.mpfIncome!==row.gross?decimal(row.mpfIncome):''}"></label>
        ${fields.slice(5).map(([key,label])=>this.draftAmount(key,label,row)).join('')}
        <label class="field full">假期／出勤備註<input name="leave" maxlength="300" value="${esc(row?.leave||'')}" placeholder="例：年假 2 天；病假 1 天"></label>
      </div><p class="pay-draft-calc" role="status"></p>`:'<p class="pay-draft-note">員工檔案已停用。儲存前請移出本月，或到員工檔案恢復在職狀態。</p>'}
      </fieldset>`);
  }
  draftAmount(key,label,row){
    return `<label class="field">${label}<input name="${key}" inputmode="decimal" value="${row?.[key]?decimal(row[key]):''}"></label>`;
  }
  recalcDraftPerson(person){
    const {elements}=person;
    const mode=elements.namedItem('mpfMode').value;
    for(const key of ['employeeMpf','employerMpf'])elements.namedItem(key).disabled=mode!=='manual';
    elements.namedItem('mpfIncome').disabled=!['monthly','holiday'].includes(mode);
    const output=$('.pay-draft-calc',person);
    try {
      const {gross,employee,employer,net}=draftTotals(draftRow(person));
      output.textContent=gross>0?L.text(`總薪金 ${amount(gross)} · 僱員 MPF ${amount(employee)} · 僱主 MPF ${amount(employer)} · 實發淨薪 ${amount(net)}`):L.text('輸入薪酬金額後顯示試算。');
    }catch{output.textContent=L.text('請核對輸入金額。');}
  }
  draftForm(run){
    const issued=run?.status==='published', period=run?.period||currentMonth();
    const existing=new Map((run?.rows||[]).map(row=>[row.staffId,row]));
    const staff=this.data.staff.filter(row=>issued
      ?row.active&&existing.has(row.id)&&!run.confirmations[row.id]
      :row.active||existing.has(row.id));
    this.show(issued?'修正未確認糧單':run?'編輯工資表':'建立工資表',`<form data-pay-form="draft" data-version="${run?.version||''}">
      <div class="pay-draft-top"><div class="field"><label for="pay-period">工資月份</label><input id="pay-period" name="period" type="month" value="${period}" ${run?'readonly':''} required></div>
      <p>${issued?'選擇要修正的員工。儲存後，更新會顯示在未確認的糧單。':'先選擇本月要出糧的員工，再逐人填寫。切換員工時會保留目前輸入。'}</p></div>
      <div class="pay-draft-layout">
        <section class="pay-draft-directory" aria-labelledby="pay-roster-title">
          <h4 id="pay-roster-title">${issued?'可修正的員工':'本月員工'}</h4>
          ${issued?'':`<label class="field" for="pay-picker">選擇員工</label><div class="pay-pick-row">
            <select id="pay-picker"></select><button type="button" class="btn" data-pay-draft-add disabled>加入</button></div>`}
          <p class="pay-roster-count" role="status"></p>
          <div class="pay-draft-roster" role="group" aria-labelledby="pay-roster-title"></div>
        </section>
        <section class="pay-draft-editor" aria-label="員工工資資料">
          <p class="pay-draft-empty">${issued?'沒有可修正的未確認糧單。':staff.length?'選擇並加入員工後，即可填寫底薪、佣金、扣款和強積金。':'請先在「員工檔案」新增在職員工。'}</p>
        </section>
      </div>
      <div class="actions"><button type="submit" class="btn primary" disabled>${issued?'更新未確認糧單':'儲存工資草稿'}</button>${button('cancel','取消')}</div>
    </form>`,'wide pay-draft-dialog');
    const form=$('[data-pay-form="draft"]',this.modal), editor=$('.pay-draft-editor',form);
    const roster=$('.pay-draft-roster',form), picker=$('#pay-picker',form), add=$('[data-pay-draft-add]',form);
    const month=$('#pay-period',form), submit=$('[type=submit]',form);
    const included=new Map();
    let activeId='', defaultEarnings=previous(period);
    const selectPerson=(id,focus=false)=>{
      activeId=id;
      for(const [key,person] of included)person.hidden=key!==id;
      for(const item of roster.querySelectorAll('[data-pay-draft-select]'))item.setAttribute('aria-pressed',String(item.dataset.payDraftSelect===id));
      $('.pay-draft-empty',editor).hidden=!!id;
      if(focus)$('h4',included.get(id))?.focus({preventScroll:true});
    };
    const addPerson=employee=>{
      editor.insertAdjacentHTML('beforeend',this.draftPerson(employee,existing.get(employee.id),defaultEarnings,issued));
      const person=editor.lastElementChild;
      included.set(employee.id,person);
      if(employee.active)this.recalcDraftPerson(person);
    };
    const refreshRoster=()=>{
      roster.innerHTML=L.markup(staff.filter(person=>included.has(person.id)).map(person=>
        `<button type="button" data-pay-draft-select="${esc(person.id)}"><strong>${esc(person.name)}</strong><small>${esc(person.id)}${person.active?'':' · 已停用'}</small></button>`).join(''));
      $('.pay-roster-count',form).textContent=L.text(`${included.size} 位員工`);
      submit.disabled=!included.size;
      if(picker){
        const options=staff.filter(person=>person.active&&!included.has(person.id));
        picker.innerHTML=L.markup(`<option value="">${options.length?'請選擇員工':'沒有可加入的員工'}</option>`+options.map(person=>
          `<option value="${esc(person.id)}">${esc(person.name)} · ${esc(person.id)}</option>`).join(''));
        picker.disabled=!options.length;
        add.disabled=true;
      }
    };
    for(const employee of staff.filter(person=>existing.has(person.id)))addPerson(employee);
    refreshRoster();
    selectPerson(included.keys().next().value||'');
    form.addEventListener('click',event=>{
      const selection=event.target.closest('[data-pay-draft-select]');
      if(selection)selectPerson(selection.dataset.payDraftSelect,true);
      if(event.target===add){
        const employee=staff.find(person=>person.id===picker.value);
        if(!employee||included.has(employee.id))return;
        addPerson(employee);
        refreshRoster();
        selectPerson(employee.id,true);
      }
      if(event.target.matches('[data-pay-draft-remove]')){
        included.get(activeId).remove();
        included.delete(activeId);
        refreshRoster();
        const next=included.keys().next().value||'';
        selectPerson(next,!!next);
        if(!next)picker.focus();
      }
    });
    form.addEventListener('change',event=>{
      if(event.target===picker)add.disabled=!picker.value;
      if(event.target===month&&month.value){
        const next=previous(month.value);
        for(const input of form.querySelectorAll('[name=earningsMonth]'))if(input.value===defaultEarnings)input.value=next;
        defaultEarnings=next;
      }
    });
    form.addEventListener('input',event=>{
      const person=event.target.closest('[data-pay-person]');
      if(person)this.recalcDraftPerson(person);
      if($('#pay-error',this.modal).textContent)this.message('');
    });
  }
  draftPayload(form,period){
    const rows=[];
    for(const person of form.querySelectorAll('[data-pay-person]')){
      try {
        if(!person.elements.namedItem('base'))throw new Error('員工已停用，請先移出本月。');
        const row=draftRow(person), {gross,net}=draftTotals(row);
        if(gross<=0||net<=0)throw new Error('請核對總薪金、扣款與實發淨薪，總薪金及實發淨薪須大於零。');
        if((row.work||row.commission)&&(!row.earningsMonth||row.earningsMonth>period))throw new Error('工錢或佣金有金額時，請填寫有效的所屬月。');
        rows.push(row);
      }catch(error){
        const button=[...form.querySelectorAll('[data-pay-draft-select]')].find(button=>button.dataset.payDraftSelect===person.dataset.payPerson);
        button?.click();
        throw new Error($('h4',person).textContent+' · '+error.message);
      }
    }
    return {period,version:Number(form.dataset.version)||null,rows};
  }
  slip(doc){
    const row=doc.row, title=doc.period+' 糧單';
    const lines=fields.slice(0,5).filter(([k])=>row[k]||k==='base').map(([key,label])=>`<tr><th scope="row">${label}</th><td>${esc(['work','commission'].includes(key)?row.earningsMonth:doc.period)}</td><td>${key==='deduction'?'−':''}${amount(row[key])}</td></tr>`).join('');
    this.show(title,`<article class="pay-slip" aria-label="糧單"><header><strong>${esc(doc.company||this.data.company||'公司')}</strong><h4>${title}</h4></header>
      <dl><div><dt>員工編號</dt><dd>${esc(row.staffId)}</dd></div><div><dt>員工姓名</dt><dd>${esc(row.name)}</dd></div><div><dt>職位</dt><dd>${esc(row.title||'—')}</dd></div></dl>
      <table><thead><tr><th>內容</th><th>所屬月份</th><th>金額 HKD</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><th colspan="2">總薪金</th><td>${amount(row.gross)}</td></tr></tfoot></table>
      <table><thead><tr><th>強積金</th><th>僱主供款</th><th>僱員供款</th><th>總供款</th></tr></thead><tbody><tr><th>MPF</th><td>${amount(row.employerMpf)}</td><td>${amount(row.employeeMpf)}</td><td>${amount(row.employerMpf+row.employeeMpf)}</td></tr></tbody></table>
      <p class="pay-net"><span>淨薪金額 HKD</span><strong>${amount(row.net)}</strong></p><div class="pay-slip-meta"><p>付款方式：銀行轉帳<br>銀行：${esc(row.bank||'—')}<br>帳號尾四位：${esc(row.last4||'—')}</p><p>假期資料：${esc(row.leave||'—')}</p></div>
      <p>${doc.confirmedAt?'員工已確認 · '+new Date(doc.confirmedAt).toLocaleString(L.current):doc.status==='draft'?'工資草稿':'待員工確認'}</p></article>
      <div class="actions">${button('print','列印／另存 PDF')}${this.mine&&!doc.confirmedAt?button('confirm','確認糧單','btn primary',doc.id):''}${button('cancel','關閉')}</div>`,'slip');
  }
  async form(form){
    const values=Object.fromEntries(new FormData(form)), action=form.dataset.payForm;
    const submit=$('[type=submit]',form); submit.disabled=true;
    try {
      let body={...values,active:!!values.active};
      if(action==='draft')body=this.draftPayload(form,values.period);
      form.inert=true;
      const result=await this.request('payroll/'+action,'POST',body);
      if(result.run)this.selected=result.run.id;
      this.close();await this.load();
    }catch(error){this.message(error.message);}
    finally{form.inert=false;submit.disabled=false;}
  }
  async loadBank(){
    const id=this.run()?.id;
    if(!id)return;
    if(!await this.flush())throw new Error('請先處理未儲存的銀行資料。');
    const account=this.bankAccount||'';
    const data=await this.request('payroll/bank/'+id+'?account='+encodeURIComponent(account));
    if(this.run()?.id!==id||account!==(this.bankAccount||''))return;
    this.bank=data;this.render();$('#pay-bank-account',this.root)?.focus({preventScroll:true});
  }
  async action(el){
    const {pay:act,value}=el.dataset,run=this.run();
    this.message('');
    el.disabled=true;
    try{
      if(act==='reload')await this.load();
      if(act==='mode')await this.load(value==='mine');
      if(act==='select'){this.selected=value;this.bank=null;this.bankAccount='';this.render();}
      if(act==='logout')await this.logout(el);
      if(act==='password')window.AccountingCompany.admin.passwordDialog();
      if(act==='back')this.back();
      if(['new','edit','correct'].includes(act))this.draftForm(act==='new'?null:run);
      if(act==='staff')this.staffForm(this.data.staff.find(row=>row.id===value));
      if(act==='cancel')this.close();
      if(act==='bank')await this.loadBank();
      if(act==='slip'){
        const doc=this.mine?this.data.slips.find(s=>s.id===value):{period:run.period,company:run.company,status:run.status,row:run.rows.find(r=>r.staffId===value),confirmedAt:run.confirmations[value]};
        this.slip(doc);
      }
      if(act==='print'){
        document.body.classList.add('print-payroll');
        const end=()=>document.body.classList.remove('print-payroll');
        window.addEventListener('afterprint',end,{once:true});
        try{window.print();}catch(error){end();throw error;}
      }
      if(act==='confirm'){
        const slip=this.data.slips.find(s=>s.id===value);
        await this.request('payroll/confirm/'+value,'POST',{publishedVersion:slip.publishedVersion});this.close();await this.load();
      }
      if(['publish','withdraw','post'].includes(act)){
        if(act==='post'&&!await this.flush())throw new Error('請先處理未儲存的帳本變更。');
        const input={version:run.version};
        if(act==='post'){input.account=this.bankAccount;input.revision=this.bank.revision;input.rows=[...this.root.querySelectorAll('[data-pay-bank]:checked')].map(input=>input.value);}
        await this.request('payroll/'+act+'/'+run.id,'POST',input);
        if(act==='post'){this.reload();return;}
        await this.load();
      }
      if(act==='history'){
        const {history}=await this.request('payroll/history/'+run.id);
        const actions={draft:'儲存草稿',publish:'發佈糧單',withdraw:'撤回發佈',confirm:'員工確認',correct:'修正未確認糧單',post:'核對並過帳'};
        this.show('工資操作記錄',`<div class="pay-audit">${history.map(item=>`<details><summary>${actions[item.action]||esc(item.action)} · ${esc(item.name)} · ${esc(new Date(item.at).toLocaleString(L.current))}</summary><div class="pay-audit-diff">${this.auditDiff(item)}</div></details>`).join('')}</div>${button('cancel','關閉')}`,'wide');
      }
      if(act==='export'){
        const rows=[['工資月份','員工編號','姓名',...fields.map(([,name])=>name),'總薪金','實發淨薪','工錢／佣金所屬月'],
          ...run.rows.map(r=>[run.period,r.staffId,r.name,...fields.map(([key])=>decimal(r[key])),decimal(r.gross),decimal(r.net),r.earningsMonth])];
        this.download(run.period+'-工資總匯.csv',toCsv(rows),'text/csv;charset=utf-8');
      }
      if(act==='payment-export'){
        const rows=[['員工編號','姓名','銀行','帳號尾四位','實發淨薪 HKD'],...run.rows.map(r=>[r.staffId,r.name,r.bank,r.last4,decimal(r.net)])];
        this.download(run.period+'-付款核對-不可上載銀行.csv',toCsv(rows),'text/csv;charset=utf-8');
      }
    }catch(error){
      if(act==='confirm'&&error.code==='payroll_conflict'){
        this.close();
        await this.load();
        this.message('糧單已更新，請重新打開核對。');
      }else this.message(error.message);
    }
    finally{if(el.isConnected)el.disabled=false;}
  }
  auditDiff({before,after}){
    const rows=new Map((before?.rows||[]).map(row=>[row.staffId,row])), lines=[];
    for(const row of after.rows||[]){
      const prior=rows.get(row.staffId);
      if(!prior){lines.push(`<p>${esc(row.name)} · 加入工資表 · 淨薪 ${amount(row.net)}</p>`);continue;}
      rows.delete(row.staffId);
      for(const [key,label] of [...fields,['net','實發淨薪']])if(row[key]!==prior[key])
        lines.push(`<p>${esc(row.name)} · ${label} · ${amount(prior[key])} → ${amount(row[key])}</p>`);
      for(const [key,label] of [['earningsMonth','工錢／佣金所屬月'],['leave','假期備註']])if(row[key]!==prior[key])
        lines.push(`<p>${esc(row.name)} · ${label} · ${esc(prior[key]||'—')} → ${esc(row[key]||'—')}</p>`);
      if(!before?.confirmations?.[row.staffId]&&after.confirmations?.[row.staffId])lines.push(`<p>${esc(row.name)} · 已確認糧單</p>`);
    }
    for(const row of rows.values())lines.push(`<p>${esc(row.name)} · 從草稿移除</p>`);
    if(before?.status!==after.status)lines.push(`<p>狀態 · ${before?stageLabel(before):'—'} → ${stageLabel(after)}</p>`);
    if(after.accrual)lines.push(`<p>計提憑證 ${after.accrual} · 付款憑證 ${after.payments.join('、')}</p>`);
    return lines.join('')||'<p>工資金額沒有變更。</p>';
  }
}
window.AccountingPayroll=Payroll;
})();

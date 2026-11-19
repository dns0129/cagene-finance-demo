/* One company, several people: member management, the audit log, password changes and the
   salesperson's own workspace. The server decides every permission; these pages only show what a role may use. */
(() => {
'use strict';
const L=window.AccountingLocale, esc=L.literal, uiEsc=L.escape, Inv=window.AccountingInvoices;
const $=(s,r=document)=>r.querySelector(s);
const ROLE_NAMES={owner:'老板',accountant:'会计',sales:'销售',hr:'HR',employee:'员工'};
const ROLE_HINTS={owner:'查看财务与薪酬、管理成员',accountant:'记账、对账、审核销售发票',sales:'自己的客户与发票',hr:'员工档案与工資',employee:'只看自己的糧单'};
const money=c=>{
  if(c==null || !Number.isFinite(c))return '';
  const a=Math.abs(Math.round(c)), s=(a/100).toLocaleString('en-US',{minimumFractionDigits:a%100?2:0,maximumFractionDigits:2});
  return c<0?`(${s})`:s;
};
const when=t=>t?new Date(t).toLocaleString(L.current,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const roleOptions=(selected,none=false)=>`${none?`<option value=""${selected?'':' selected'}>无权限（停用）</option>`:''}${Object.entries(ROLE_NAMES).map(([k,v])=>`<option value="${k}"${k===selected?' selected':''}>${v} · ${ROLE_HINTS[k]}</option>`).join('')}`;
function dialog(markup,cls=''){
  const modal=$('#modal');
  modal.innerHTML=L.markup(`<section class="modal-box space-dialog company-dialog ${cls}" role="dialog" aria-modal="true" aria-labelledby="company-dialog-title">${markup}</section>`);
  modal.hidden=false; modal.querySelector('input,select,textarea,button')?.focus();
}
const closeButton='<button type="button" class="btn" data-act="closeModal">关闭</button>';
const passwordInput=(id,label,autocomplete,name=id)=>`<div class="field"><label for="company-${id}">${label}</label><input id="company-${id}" name="${name}" type="password" required minlength="12" maxlength="128" autocomplete="${autocomplete}"></div>`;

/* ---------- people, audit log and passwords (all signed-in roles may change their own password) ---------- */
const SETTING_NAMES={bankReconciliation:'银行对账',bankReconciliationByAccount:'银行对账',company:'公司资料',opening:'期初余额',openingShares:'期初股本',settings:'账本设置',
  cashAccounts:'资金账户',closedThrough:'月结锁定',closeHistory:'月结记录',customReport:'管理报表草稿'};
function describe(e){
  const d=e.detail||{}, role=r=>r?ROLE_NAMES[r]||r:'无权限';
  switch(e.action){
    case 'book.save': {
      const [added=0,changed=0,removed=0]=d.totals||[], parts=[];
      if(added)parts.push(`新增凭证 ${added} 张（${(d.added||[]).slice(0,6).join('、')}${added>6?' 等':''}）`);
      if(changed)parts.push(`修改凭证 ${changed} 张（${(d.changed||[]).slice(0,6).join('、')}${changed>6?' 等':''}）`);
      if(removed)parts.push(`删除凭证 ${removed} 张（${(d.removed||[]).slice(0,6).join('、')}${removed>6?' 等':''}）`);
      const settings=[...new Set((d.settings||[]).map(k=>SETTING_NAMES[k]||k))];
      if(settings.length)parts.push(`更新${settings.join('、')}`);
      if(d.library)parts.push('更新财报文件');
      return parts.join('；')||'保存账本';
    }
    case 'member.add': return `新增成员 ${d.name}（${d.username} · ${role(d.role)}）${d.by?' · 命令行':''}`;
    case 'member.role': return `${d.name} 的角色：${role(d.from)} → ${role(d.to)}`;
    case 'member.password': return `重设 ${d.name} 的密码`;
    case 'password.change': return '修改自己的密码';
    case 'sales.customer': return `新增銷售客戶 · ${d.customer} ${d.name}`;
    case 'invoice.batch': return `${d.period} Wonder 核對 · ${d.count} 張發票已批量過帳`;
    case 'payroll.post': return `${d.period} 工資已核對並過帳 · 實發 ${money(d.net)}`;
    case 'request.create': return `提交发票申请 · ${d.customer} · ${money(d.total)}`;
    case 'request.update': return `修改并重新提交发票申请 · ${d.customer} · ${money(d.total)}`;
    case 'request.withdraw': return '撤回发票申请';
    case 'request.approve': return `批准 ${d.requester} 的发票申请并过账 · ${d.no} · 凭证 ${d.txn}`;
    case 'request.reject': return `退回发票申请 · 原因：${d.note}`;
    default: return e.action;
  }
}
class CompanyAdmin {
  constructor({request, user, signedOut}){
    Object.assign(this,{request,user,signedOut});
    document.addEventListener('click',e=>{const el=e.target.closest('[data-company]');if(el&&!el.disabled)this.click(el);});
    $('#modal').addEventListener('submit',e=>{if(e.target.matches('[data-company-form]')){e.preventDefault();this.submit(e.target);}});
  }
  can(...roles){return roles.includes(this.user().role);}
  click(el){
    const action=el.dataset.company;
    if(action==='password')this.passwordDialog();
    else if(action==='members'&&this.can('owner'))this.members();
    else if(action==='audit'&&this.can('owner','accountant'))this.audit();
  }
  passwordDialog(){
    dialog(`<h3 id="company-dialog-title">修改密码</h3><form data-company-form="password"><p>修改后，其他浏览器上的登录会被退出。</p>
      ${passwordInput('current','当前密码','current-password','current')}${passwordInput('new','新密码（至少 12 个字符）','new-password','password')}${passwordInput('again','再输入一次新密码','new-password','again')}
      <p class="space-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">保存新密码</button><button type="button" class="btn" data-act="closeModal">取消</button></div></form>`);
  }
  async members(error=''){
    let list;
    try { ({members:list}=await this.request('members')); }
    catch(e){ dialog(`<h3 id="company-dialog-title">成员与权限</h3><p class="space-error" role="alert">${uiEsc(e.message)}</p><div class="actions">${closeButton}</div>`); return; }
    const me=this.user().id;
    const rows=list.map(m=>`<tr><th scope="row"><strong>${esc(m.name)}</strong><small>${esc(m.username||m.email||'')}${m.id===me?' · 我':''}</small></th>
      <td><form data-company-form="member-role" data-id="${esc(m.id)}" class="company-inline"><label class="sr-only" for="company-role-${esc(m.id)}">${esc(m.name)} 的角色</label><select id="company-role-${esc(m.id)}" name="role">${roleOptions(m.role,true)}</select><button type="submit" class="btn small">保存</button></form></td>
      <td>${m.id===me?'<button type="button" class="btn small" data-company="password">修改密码</button>':`<form data-company-form="member-password" data-id="${esc(m.id)}" class="company-inline"><label class="sr-only" for="company-reset-${esc(m.id)}">${esc(m.name)} 的新密码</label><input id="company-reset-${esc(m.id)}" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="新密码"><button type="submit" class="btn small">重设</button></form>`}</td></tr>`).join('');
    dialog(`<h3 id="company-dialog-title">成员与权限</h3>
      <p class="tdesc">老板和会计能看到全部账务；销售只能看到自己提交的发票申请和审核结果，开出的发票要由会计审核后才会记账。修改角色或重设密码后，对方需要重新登录。</p>
      <p class="space-error" role="alert" id="company-members-error">${uiEsc(error)}</p>
      <div class="scroll"><table class="enterprise-table company-members"><thead><tr><th scope="col">成员</th><th scope="col">角色</th><th scope="col">密码</th></tr></thead><tbody>${rows}</tbody></table></div>
      <form data-company-form="member-add" class="company-add"><h4>添加成员</h4><div class="fields">
        <div class="field"><label for="company-add-name">姓名</label><input id="company-add-name" name="name" required maxlength="60" autocomplete="off"></div>
        <div class="field"><label for="company-add-username">登录用户名</label><input id="company-add-username" name="username" required minlength="3" maxlength="32" autocapitalize="none" spellcheck="false" autocomplete="off"></div>
        <div class="field"><label for="company-add-role">角色</label><select id="company-add-role" name="role">${roleOptions('sales')}</select></div>
        ${passwordInput('add-password','初始密码（至少 12 个字符）','new-password','password')}</div>
        <p class="hint">请把用户名和初始密码私下交给对方，并提醒对方登录后在首页「修改密码」。</p>
        <p class="space-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">添加成员</button>${closeButton}</div></form>`,'company-wide');
  }
  async audit(){
    let entries;
    try { ({entries}=await this.request('audit')); }
    catch(e){ dialog(`<h3 id="company-dialog-title">操作记录</h3><p class="space-error" role="alert">${uiEsc(e.message)}</p><div class="actions">${closeButton}</div>`); return; }
    dialog(`<h3 id="company-dialog-title">操作记录</h3><p class="tdesc">最近 300 条：谁在什么时间新增、修改、删除了哪些凭证，以及成员、权限和发票审核的变动。</p>
      ${entries.length?`<div class="scroll company-audit"><table class="enterprise-table"><thead><tr><th scope="col">时间</th><th scope="col">人员</th><th scope="col">内容</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${esc(when(e.at))}</td><td>${esc(e.user||'系统')}</td><td>${esc(describe(e))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">还没有操作记录。</p>'}
      <div class="actions">${closeButton}</div>`,'company-wide');
  }
  async submit(form){
    const kind=form.dataset.companyForm, data=Object.fromEntries(new FormData(form)), error=form.querySelector('.space-error') || $('#company-members-error');
    const show=text=>{if(error)error.textContent=L.text(text);};
    const button=form.querySelector('[type=submit]');
    if(button?.disabled)return;
    if(kind==='password' && data.password!==data.again)return show('两次输入的新密码不一致。');
    if(button)button.disabled=true;
    try {
      if(kind==='password'){ await this.request('password','POST',{current:data.current,password:data.password}); dialog(`<h3 id="company-dialog-title">修改密码</h3><p role="status">密码已更新。</p><div class="actions">${closeButton}</div>`); return; }
      if(kind==='member-add'){ await this.request('members','POST',{name:data.name,username:data.username,role:data.role,password:data.password}); return this.members(); }
      if(kind==='member-role'){
        await this.request('members/'+form.dataset.id,'PUT',{role:data.role||null});
        if(form.dataset.id===this.user().id){ this.signedOut(); return; }
        return this.members();
      }
      if(kind==='member-password'){ await this.request(`members/${form.dataset.id}/password`,'POST',{password:data.password}); return this.members('密码已重设，对方需要用新密码重新登录。'); }
    } catch(e){ show(e.message||'操作未成功，请重试。'); }
    finally { if(button?.isConnected)button.disabled=false; }
  }
}

/* ---------- the salesperson's own workspace ---------- */
const REQUEST_STATUS={pending:'待会计审核',rejected:'已退回',approved:'已过账'};
const sbtn=(action,label,attrs='',cls='btn')=>`<button type="button" class="${cls}" data-sales="${action}"${attrs}>${label}</button>`;
class SalesPortal {
  constructor({root, request, user, logout, payroll, practice=false}){
    Object.assign(this,{root,request,user,logout,payroll,practice});
    this.data=null; this.filter='all'; this.form=null; this.error='';
    document.addEventListener('click',e=>{const el=e.target.closest('[data-sales]');if(el&&!el.disabled)this.click(el);});
    $('#modal').addEventListener('input',e=>this.input(e.target));
  }
  async load(){
    try { this.data=await this.request('sales'); this.error=''; }
    catch(e){ this.error=e.message||'无法读取发票申请，请重试。'; }
    this.render();
  }
  state(r){
    if(r.status!=='approved')return r.status;
    return r.invoice?(r.invoice.balance===0?'paid':'posted'):'removed';
  }
  statusHTML(r){
    if(r.status==='pending')return '<span class="inv-status">待会计审核</span>';
    if(r.status==='rejected')return `<span class="inv-status inv-overdue">已退回</span><small>原因：${esc(r.reviewNote)}</small>`;
    const x=r.invoice;
    if(!x)return '<span class="inv-status">已过账</span><small>凭证已被会计删除，请联系会计。</small>';
    const label=Inv.STATUS[x.status]+(x.status==='overdue'?` ${x.overdueDays} 天`:'');
    return `<span class="inv-status inv-${x.status}">${label}</span><small>已过账 · ${esc(x.no)}${x.balance?` · 未收 ${money(x.balance)}`:''}</small>`;
  }
  render(){
    const d=this.data, cur=esc(d?.company?.cur||'');
    if(!this.practice){
      document.body.dataset.role='sales';
      document.title=L.text('企业财务工作台 · 我的销售发票');
    }
    if(!d){
      this.root.innerHTML=L.markup(`<div class="sales-shell">${this.header()}<p class="space-error" role="alert">${uiEsc(this.error||'正在读取…')}</p>${sbtn('reload','重试','','btn primary')}</div>`);
      this.root.hidden=false; return;
    }
    const all=d.requests, count=k=>all.filter(r=>this.state(r)===k || k==='posted' && this.state(r)==='paid').length;
    const unpaid=all.reduce((n,r)=>n+(r.invoice?.balance||0),0);
    const filters=[['all','全部',all.length],['pending','待审核',count('pending')],['rejected','已退回',count('rejected')],['posted','已过账',count('posted')]];
    const list=all.filter(r=>this.filter==='all' || this.filter===r.status || this.filter==='posted' && r.status==='approved');
    const rows=list.map(r=>{
      const open=r.status!=='approved';
      return `<tr data-request="${esc(r.id)}"><th scope="row"><strong>${esc(r.data.partyName)}</strong><small>${esc(r.data.lines[0].desc)}${r.data.lines.length>1?` 等 ${r.data.lines.length} 项`:''}</small></th>
        <td>${esc(r.data.date)}<small>提交于 ${esc(when(r.updatedAt))}</small></td><td>${money(r.data.total)}</td><td class="sales-status">${this.statusHTML(r)}</td>
        <td><div class="actions">${sbtn('view','查看',` data-id="${esc(r.id)}"`,'btn small')}${open?sbtn('edit',r.status==='rejected'?'修改后重交':'修改',` data-id="${esc(r.id)}"`,'btn small')+sbtn('withdraw','撤回',` data-id="${esc(r.id)}"`,'btn small'):''}</div></td></tr>`;
    }).join('');
    this.root.innerHTML=L.markup(`<div class="sales-shell">${this.header()}
      <article class="enterprise-card"><div class="enterprise-heading"><div><h3>我的客戶</h3><p>${d.customers.length} 位客戶</p></div>${sbtn('customer','新增客戶')}</div>
      ${d.customers.length?`<div class="actions">${d.customers.map(c=>`<span class="space-pill">${esc(c.id)} · ${esc(c.name)}</span>`).join('')}</div>`:''}</article>
      <article class="enterprise-card"><div class="enterprise-heading"><div><h3>我的销售发票</h3><p>${esc(d.company?.name||'')} · 金额单位 ${cur} · 发票由会计审核后才会记账</p></div><div class="actions">${sbtn('new','＋ 新建发票申请','','btn primary')}</div></div>
      ${this.error?`<p class="space-error" role="alert">${uiEsc(this.error)}</p>`:''}
      <div class="member-metrics"><div><span>待会计审核</span><strong>${count('pending')}</strong></div><div><span>已退回待修改</span><strong${count('rejected')?' class="err"':''}>${count('rejected')}</strong></div><div><span>已过账发票</span><strong>${count('posted')+count('paid')}</strong></div><div><span>客户未付 · ${cur}</span><strong>${money(unpaid)}</strong></div></div>
      <div class="seg" role="group" aria-label="申请状态">${filters.map(([k,label,n])=>`<button type="button" data-sales="filter" data-value="${k}" aria-pressed="${k===this.filter}">${label} <span>${n}</span></button>`).join('')}</div>
      ${rows?`<div class="scroll"><table class="enterprise-table member-table sales-table"><thead><tr><th scope="col">客户 / 内容</th><th scope="col">开票日期</th><th scope="col">金额</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>${rows}</tbody></table></div>`
        :`<p class="empty">${all.length?'没有符合此状态的申请。':'还没有发票申请。点「新建发票申请」填写客户和明细，提交后由会计审核并记账。'}</p>`}
      </article></div>`);
    this.root.hidden=false;
  }
  header(){
    if(this.practice)return '';
    const u=this.user();
    return `<header class="sales-top"><div class="sales-brand"><strong>财务工作台</strong><small>销售 · SALES</small></div>
      <div class="sales-user"><span class="space-pill">销售</span><strong>${esc(u.name)}</strong><a class="btn small" href="#tutorial" data-portal-tutorial>操作教程</a>${sbtn('payroll','我的糧單','','btn small')}${sbtn('password','修改密码','','btn small')}${sbtn('logout','退出登录','','btn small')}</div></header>`;
  }
  customerForm(){
    dialog(`<h3 id="company-dialog-title">新增自己的客戶</h3><div class="fields">
      <label class="field">客戶編號<input id="sales-new-id" maxlength="80"></label>
      <label class="field">客戶名稱<input id="sales-new-name" maxlength="80"></label></div>
      <p id="sales-customer-error" class="err" role="alert"></p>
      <div class="actions">${sbtn('save-customer','儲存客戶','','btn primary')}${closeButton}</div>`);
  }
  async saveCustomer(button){
    button.disabled=true;
    try{
      await this.request('sales/customers','POST',{id:$('#sales-new-id').value,name:$('#sales-new-name').value});
      $('#modal').hidden=true;await this.load();
    }catch(error){$('#sales-customer-error').textContent=L.text(error.message);}
    finally{button.disabled=false;}
  }
  blank(){ return {maker:this.user?.()?.name||'',issueTime:new Date().toTimeString().slice(0,5),id:null,partyId:'',partyName:'',date:today(),dueDate:'',note:'',lines:[{desc:'',qty:'1',price:''}]}; }
  openForm(id){
    const r=id&&this.data.requests.find(x=>x.id===id&&x.status!=='approved');
    if(id&&!r)return;
    this.form=r?{id:r.id,partyId:r.data.partyId,partyName:r.data.partyName,date:r.data.date,dueDate:r.data.dueDate,note:r.data.note,
      ...Inv.invoiceHeader(r.data),lines:r.data.lines.map(Inv.formLine)}:this.blank();
    this.source=r||null;
    this.renderForm();
  }
  lineAmount(l){ try { return Inv.lineValues(l).amount; } catch { return null; } }
  renderForm(r=this.source){
    const f=this.form, people=this.data.customers;
    const amounts=f.lines.map(line=>this.lineAmount(line));
    dialog(`<h3 id="company-dialog-title">${f.id?'修改发票申请':'新建发票申请'}</h3>
      <p class="tdesc">提交后由会计审核：会计确认发票号和收入科目后过账，你可以在列表里看到审核结果和客户付款情况。</p>
      ${r?.status==='rejected'?`<p class="period-notice">会计退回原因：${esc(r.reviewNote)}</p>`:''}
      <div class="salon-editor-columns"><section class="salon-editor-info"><h4>开票资料</h4>
      <div class="fields"><div class="field"><label for="sales-party-id">客户编号</label><input id="sales-party-id" data-sales-field="partyId" value="${esc(f.partyId)}" maxlength="80" list="sales-customers" placeholder="如 C001" autocomplete="off"><datalist id="sales-customers">${people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</datalist></div>
        <div class="field"><label for="sales-party-name">客户名称</label><input id="sales-party-name" data-sales-field="partyName" value="${esc(f.partyName)}" maxlength="80" autocomplete="off"></div>
        <div class="field"><label for="sales-date">开票日期</label><input id="sales-date" data-sales-field="date" type="date" value="${esc(f.date)}"></div>
        <div class="field"><label for="sales-due">到期日（选填）</label><input id="sales-due" data-sales-field="dueDate" type="date" value="${esc(f.dueDate)}"></div>${Inv.headerInputs('sales',f)}</div>
      <div class="field full"><label for="sales-note">给会计的说明（选填）</label><textarea id="sales-note" data-sales-field="note" rows="2" maxlength="500">${esc(f.note)}</textarea></div>
      </section>${Inv.itemEditor('sales',f.lines,amounts,this.total(),this.data.company?.cur||'',money,sbtn)}</div>
      <p class="err" id="sales-error" role="alert"></p>
      <div class="actions">${sbtn('submit',f.id?'重新提交审核':'提交审核','','btn primary')}<button type="button" class="btn" data-act="closeModal">取消</button></div>`,'invoice-dialog salon-editor');
  }
  total(){ return this.form.lines.reduce((n,l)=>n+(this.lineAmount(l)||0),0); }
  input(el){
    if(!this.form || $('#modal').hidden)return;
    if(el.dataset.salesLine!=null){
      const i=Number(el.dataset.salesLine), line=this.form.lines[i];
      if(!line)return;
      line[el.dataset.k]=el.value;
      const amount=this.lineAmount(line), cell=$(`[data-sales-amount="${i}"]`);
      if(cell)cell.textContent=amount==null?'—':money(amount);
    } else if(el.dataset.salesField){
      this.form[el.dataset.salesField]=el.value;
      if(el.dataset.salesField==='partyId'){
        const known=this.data.customers.find(p=>p.id.trim().toLowerCase()===el.value.trim().toLowerCase()), name=$('#sales-party-name');
        if(known&&name){name.value=known.name;this.form.partyName=known.name;}
      }
    }
    const total=$('#sales-total'); if(total)total.textContent=money(this.total());
    const error=$('#sales-error'); if(error)error.textContent='';
  }
  async submit(button){
    const f=this.form, error=$('#sales-error');
    if(!f)return;
    button.disabled=true;
    try {
      const body={partyId:f.partyId,partyName:f.partyName,date:f.date,dueDate:f.dueDate,note:f.note,...Inv.invoiceHeader(f),lines:f.lines};
      if(f.id)await this.request('sales/requests/'+f.id,'PUT',body); else await this.request('sales/requests','POST',body);
      this.form=null; $('#modal').hidden=true; this.filter='all'; await this.load();
    } catch(e){ if(error)error.textContent=L.text(e.message||'提交未成功，请重试。'); }
    finally { if(button.isConnected)button.disabled=false; }
  }
  view(id){
    const r=this.data.requests.find(x=>x.id===id); if(!r)return;
    const d=r.data, x=r.invoice;
    dialog(`<h3 id="company-dialog-title">发票申请 · ${esc(d.partyName)}</h3>
      <dl class="sales-facts"><div><dt>状态</dt><dd>${this.statusHTML(r)}</dd></div><div><dt>客户</dt><dd>${esc(d.partyName)} · ${esc(d.partyId)}</dd></div><div><dt>开票日期</dt><dd>${esc(d.date)}</dd></div><div><dt>到期日</dt><dd>${d.dueDate?esc(d.dueDate):'—'}</dd></div>
        ${x?`<div><dt>发票号</dt><dd>${esc(x.no)}</dd></div><div><dt>已收 / 未收</dt><dd>${money(x.settled)} / ${money(x.balance)}</dd></div>`:''}</dl>
      <div class="scroll"><table class="enterprise-table invoice-lines">${Inv.displayLines(d.lines,money)}
        <tfoot><tr><th scope="row" colspan="4">合计</th><td><strong>${money(d.total)}</strong></td></tr></tfoot></table></div>
      ${d.note?`<p class="hint">说明：${esc(d.note)}</p>`:''}<div class="actions">${x?.print?sbtn('print','打印发票 / PDF',` data-id="${esc(id)}"`,'btn primary'):''}${closeButton}</div>`,'invoice-dialog');
  }
  confirmWithdraw(id){
    const r=this.data.requests.find(x=>x.id===id&&x.status!=='approved'); if(!r)return;
    dialog(`<h3 id="company-dialog-title">撤回发票申请</h3><p>确认撤回给 ${esc(r.data.partyName)} 的 ${money(r.data.total)} 发票申请？撤回后会计不会再看到它。</p><p class="err" id="sales-error" role="alert"></p>
      <div class="actions">${sbtn('withdraw-confirm','确认撤回',` data-id="${esc(id)}"`,'btn primary')}<button type="button" class="btn" data-act="closeModal">取消</button></div>`);
  }
  async withdraw(id,button){
    button.disabled=true;
    try { await this.request('sales/requests/'+id,'DELETE'); $('#modal').hidden=true; await this.load(); }
    catch(e){ const error=$('#sales-error'); if(error)error.textContent=L.text(e.message); }
    finally { if(button.isConnected)button.disabled=false; }
  }
  click(el){
    const {sales:action,id,value,index}=el.dataset;
    if(this.practice&&['payroll','password','logout'].includes(action))return;
    if(action==='payroll'){this.payroll();return;}
    if(action==='customer'){this.customerForm();return;}
    if(action==='save-customer'){this.saveCustomer(el);return;}
    if(action==='filter'){this.filter=value;this.render();}
    else if(action==='reload')this.load();
    else if(action==='logout')this.logout(el);
    else if(action==='password')$('#modal')&&window.AccountingCompany.admin?.passwordDialog();
    else if(action==='new')this.openForm();
    else if(action==='edit')this.openForm(id);
    else if(action==='view')this.view(id);
    else if(action==='print'){const data=this.data.requests.find(r=>r.id===id)?.invoice?.print;if(data)window.SalonInvoicePrint.open(data,this.data.company.cur);}
    else if(action==='withdraw')this.confirmWithdraw(id);
    else if(action==='withdraw-confirm')this.withdraw(id,el);
    else if(action==='line-add'&&this.form&&this.form.lines.length<Inv.MAX_LINES){this.form.lines.push({desc:'',qty:'1',price:''});this.renderForm();$(`#sales-desc-${this.form.lines.length-1}`)?.focus();}
    else if(action==='line-del'&&this.form&&this.form.lines.length>1){this.form.lines.splice(Number(index),1);this.renderForm();}
    else if(action==='submit')this.submit(el);
  }
}
window.AccountingCompany={ROLE_NAMES,CompanyAdmin,SalesPortal,describe,admin:null};
})();

/* Account session, persistence and report library for the hosted workspace. */
(() => {
'use strict';
const L=window.AccountingLocale, esc=L.literal, $=(s,r=document)=>r.querySelector(s);
const icons={
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file:'<path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 7v-2"/>',
  chart:'<path d="M4 4v16h16M8 15l4-4 3 2 5-6"/>',
  home:'<path d="M3 10l9-7 9 7v10H3zM9 20v-6h6v6"/>',
  book:'<path d="M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4zM12 6v15"/>',
  bank:'<path d="m3 9 9-5 9 5M5 11v6m5-6v6m4-6v6m5-6v6M3 20h18"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
};
const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[k]||icons.file}</svg>`;
const localKeys={'acct2102-finance-record-v1':'ledger','acct2102-finance-record-v1-draft':'draft','acct2102-finance-record-v1-recovery':'recovery'};
const empty=()=>({ledger:null,draft:null,recovery:null,folders:[],reports:[]});
const UUID=()=>crypto.randomUUID();
const date=value=>value?new Date(value).toLocaleDateString(L.current):'—';
const btn=(act,label,cls='btn',id='')=>`<button type="button" class="${cls}" data-space="${act}"${act.startsWith('folder') && cls.startsWith('folder-button')?` aria-pressed="${cls.includes('selected')}"`:''}${id?` data-id="${esc(id)}"`:''}>${label}</button>`;
const usernameField=(id,autocomplete='username')=>`<div class="field"><label for="${id}">用户名</label><input id="${id}" name="username" required minlength="3" maxlength="32" autocapitalize="none" spellcheck="false" autocomplete="${autocomplete}" aria-describedby="${id}-hint"><small id="${id}-hint">3–32 位字母、数字、点、下划线或短横线，以字母或数字开头。</small></div>`;

class PersonalSpace {
  constructor({onReady,onSales,onPayroll,onStatus,openReport,onChange,leave,download,legacy,copyDraft,makeDraft}) {
    Object.assign(this,{onReady,onSales,onPayroll,onStatus,openReport,onChange,leave,download,legacy,copyDraft,makeDraft});
    this.gate=$('#identityGate');
    this.demo=document.body.hasAttribute('data-demo-workspace');
    this.demoBar=$('#demoBar');
    this.data=empty(); this.revision=0; this.updatedAt=0; this.change=0; this.synced=0;
    this.user=null;this.mode='login';this.folder=null;this.error='';this.allowSignup=false;
    this.busy=false;this.inFlight=null;this.timer=null;this.ready=false;
    this.gate.addEventListener('submit',e=>{e.preventDefault();this.submitAuth(e.target);});
    this.demoBar?.addEventListener('change',event=>{
      if(event.target.id==='demo-role')void this.updateDemo('enter',event.target.value);
    });
    $('#modal').addEventListener('submit',e=>{
      if(e.target.matches('#space-username-form')){e.preventDefault();this.submitUsername(e.target);}
      else if(e.target.matches('[data-space-form]')){e.preventDefault();this.submitLibrary(e.target);}
    });
    document.addEventListener('click',e=>{
      const el=e.target.closest('[data-space]');if(el&&!el.disabled)this.click(el.dataset.space,el.dataset.id,el);
    });
  }
  async request(path,method='GET',data,base=this.demo?'/api/demo/workspace/':'/api/workspace/') {
    const transport=window.pagesDemoRequest || window.fetch.bind(window);
    const response=await transport(base+path,{
      method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(18000),
      headers:{'X-Account-Workspace':'1',...(this.user?{'X-Workspace-User':this.user.id}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},
      ...(data===undefined?{}:{body:JSON.stringify(data)}),
    });
    const payload=await response.json();
    if(!response.ok)throw Object.assign(new Error(payload.error?.message||'无法连接个人空间。'),{code:payload.error?.code});
    return payload;
  }
  async start(){
    this.renderGate(true);
    try {
      const {user,allowSignup}=await this.request('session');
      this.allowSignup=allowSignup;this.user=user;
      if(this.demo&&!this.user)this.user=(await this.request('enter','POST',{},'/api/demo/')).user;
      if(this.user) await this.enter(); else this.renderGate();
    } catch(e) {
      this.renderGate(false,(this.demo&&e.message)||'个人空间暂时无法连接，请重试。',true);
    }
  }
  renderDemoBar(){
    const roles=[['accountant','会计'],['owner','管理层'],['sales','销售'],['hr','人事'],['employee','员工']];
    this.demoBar.innerHTML=L.markup(`<div class="demo-bar-title"><strong>演示版本</strong><small>虚构资料，可直接操作</small></div>
      <div class="demo-bar-actions"><label for="demo-role">角色</label><select id="demo-role">${roles.map(([id,label])=>`<option value="${id}"${id===this.user.role?' selected':''}>${label}</option>`).join('')}</select>
      <a class="btn small" href="index.html?training=1${L.current==='zh-HK'?'&amp;lang=zh-HK':''}#training">实训关卡</a>${btn('demo-reset','重置演示','btn small')}${btn('logout',window.pagesDemoRequest?'返回试用首页':'返回登录','btn small')}</div>
      <p id="demo-error" class="space-error" role="alert"></p>`);
    this.demoBar.hidden=false;
  }
  demoURL(exit=false){
    const url=new URL(location.href);
    url.hash='';url.searchParams.delete('file');
    if(exit && window.pagesDemoRequest)return new URL('../',url).href;
    if(exit)url.searchParams.delete('demo');
    return url.href;
  }
  async updateDemo(action,role=this.user.role){
    if(!this.demo||this.busy)return;
    if(action==='reset'&&!window.confirm(L.text('重置会清除当前演示改动，并恢复预设的流水、凭证、发票和工资。继续重置？')))return;
    this.busy=true;
    const controls=[...this.demoBar.querySelectorAll('button,select')];
    controls.forEach(control=>{control.disabled=true;});
    $('#demo-error').textContent='';
    try {
      if(action==='enter'){
        this.leave();
        if(!await this.flush())throw new Error(this.error||'请先保存演示账套的改动。');
      }else{
        clearTimeout(this.timer);
        if(this.inFlight)await this.inFlight;
      }
      await this.request(action,'POST',{role},'/api/demo/');
      clearTimeout(this.timer);this.synced=this.change;
      if(action==='reset'&&!new URLSearchParams(location.search).has('file'))location.reload();
      else location.replace(this.demoURL());
    } catch(e) {
      $('#demo-error').textContent=L.text(e.message);
      $('#demo-role').value=this.user.role;
      if(action==='reset'&&this.pending)void this.flush();
    } finally {
      this.busy=false;
      controls.forEach(control=>{control.disabled=false;});
    }
  }
  async enter(){
    // One company per system: the role decides which workspace opens. The server enforces the same rule.
    const role=this.user?.role || null;
    document.body.dataset.role=role || 'none';
    if(this.demo)this.renderDemoBar();
    if(role==='sales'){
      this.data=empty();this.ready=true;this.gate.hidden=true;document.body.dataset.session='ready';
      await this.onSales();return;
    }
    if(['hr','employee'].includes(role)){
      this.data=empty();this.ready=true;this.gate.hidden=true;document.body.dataset.session='ready';
      await this.onPayroll(role==='employee');return;
    }
    if(!['owner','accountant'].includes(role)){this.renderWaiting();return;}
    const {state,revision,updatedAt}=await this.request('state');
    this.data=state;this.revision=revision;this.updatedAt=updatedAt;
    this.change=0;this.synced=0;this.error='';
    this.onReady();
    this.ready=true;this.gate.hidden=true;document.body.dataset.session='ready';
    $('#pageTitle')?.focus();
  }
  renderWaiting(){
    this.gate.hidden=false;
    this.gate.innerHTML=L.markup(`<div class="identity-shell"><section class="identity-brand" aria-label="财务工作台"><div class="identity-logo">${icon('book')}<span>财务工作台<small>LEDGER WORKSPACE</small></span></div></section>
      <section class="identity-panel"><div class="identity-form"><span class="workspace-kicker">WAITING FOR ACCESS</span><h2>账号尚未分配角色</h2>
      <p>${esc(this.user.name)}，你的账号已经建立，但老板还没有为你分配角色（会计或销售）。请联系老板，分配后重新登录即可。</p>
      ${btn('logout','退出登录','btn primary')}</div></section></div>`);
  }
  renderGate(loading=false,error='',retry=false){
    if(this.demo){
      this.gate.hidden=false;
      this.gate.innerHTML=L.markup(`<section class="demo-entry-state"><h2>演示版本</h2>
        ${loading?'<p role="status">正在准备演示账套…</p>':`<p class="space-error" role="alert">${L.escape(error)}</p>${btn('retry-auth','重试','btn primary')}`}
        <a class="btn" href="${esc(this.demoURL(true))}">返回登录</a></section>`);
      return;
    }
    const reg=this.mode==='register';
    this.gate.hidden=false;
    this.gate.innerHTML=L.markup(`<div class="identity-shell"><section class="identity-brand" aria-label="财务工作台">
      <div class="identity-logo">${icon('book')}<span>财务工作台<small>LEDGER WORKSPACE</small></span></div>
      <div class="identity-copy"><span class="identity-kicker">个人财务空间</span><h1>把账本与财报<br>放在同一个空间。</h1><p>从日常凭证到月末财报，登录后继续你的会计工作。</p></div>
      <ul class="identity-features"><li>${icon('lock')} 独立的账号与账本</li><li>${icon('folder')} 按文件夹整理财报</li><li>${icon('chart')} 查看账户财务概况</li></ul>
      </section><section class="identity-panel"><div class="identity-top">${btn('locale',esc(L.current==='zh-HK'?'简体':'繁體'))}</div>
      <div class="identity-form"><span class="workspace-kicker">ACCOUNT ACCESS</span><h2>${reg?'创建账号':'登录个人空间'}</h2>
      <p>${reg?'设置用户名和密码即可注册，邮箱选填。':'使用用户名或邮箱和密码继续。'}</p>
      ${loading?'<p role="status" class="identity-loading">正在连接个人空间…</p>':retry?`<p role="alert" class="space-error">${L.escape(error)}</p>${btn('retry-auth','重试连接','btn primary')}`:`<form id="identity-form">
      ${reg?`${usernameField('identity-username')}<div class="field"><label for="identity-email">邮箱（选填）</label><input id="identity-email" name="email" type="email" maxlength="254" autocomplete="email"></div>
      <div class="field"><label for="identity-name">显示名称（选填）</label><input id="identity-name" name="name" maxlength="60" autocomplete="name"></div>`:
      '<div class="field"><label for="identity-identifier">用户名或邮箱</label><input id="identity-identifier" name="identifier" maxlength="254" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>'}
      <div class="field"><label for="identity-password">密码</label><input id="identity-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="${reg?'new-password':'current-password'}" aria-describedby="identity-hint" required><small id="identity-hint">${reg?'使用至少 12 个字符。':'可使用密码管理器或粘贴密码。'}</small></div>
      <p id="identity-error" class="space-error" role="alert">${L.escape(error)}</p>
      <button type="submit" class="btn primary">${reg?'创建账号':'登录'}</button></form>
      ${this.allowSignup?`<p class="identity-switch">${reg?'已有账号？':'还没有账号？'} ${btn('auth-mode',reg?'返回登录':'创建账号','text-button')}</p>`:''}`}
      <a class="identity-training identity-demo" href="index.html?demo=1${L.current==='zh-HK'?'&amp;lang=zh-HK':''}">
        <span class="identity-training-icon">${icon('chart')}</span>
        <span class="identity-training-copy"><strong>进入演示版本</strong><small>免密码 · 内置银行、发票和工资样例</small></span>
        <span class="identity-training-action">进入 ${icon('arrow')}</span>
      </a>
      <a class="identity-training" href="index.html?training=1&amp;from=login${L.current==='zh-HK'?'&amp;lang=zh-HK':''}#training">
        <span class="identity-training-icon">${icon('book')}</span>
        <span class="identity-training-copy"><strong>财务实训教程</strong><small>免登录 · 会计、销售、老板</small></span>
        <span class="identity-training-action">开始练习 ${icon('arrow')}</span>
      </a></div></section></div>`);
  }
  async submitAuth(form){
    if(this.busy)return;
    const button=form.querySelector('[type=submit]'), err=$('#identity-error');
    this.busy=true;button.disabled=true;form.setAttribute('aria-busy','true');
    const label=button.textContent;button.textContent=L.text('正在处理…');err.textContent='';
    try {
      const data=Object.fromEntries(new FormData(form));
      this.user=(await this.request(this.mode,'POST',data)).user;
      await this.enter();
    } catch(e){
      if(this.user){this.renderGate(false,'账号已登录，但空间未能加载。',true);}
      else {err.textContent=L.text(e.message || '登录失败，请重试。');err.tabIndex=-1;err.focus();}
    } finally {this.busy=false;button.disabled=false;button.textContent=label;form.removeAttribute('aria-busy');}
  }
  async submitUsername(form){
    if(this.busy || !this.ready || this.user.username)return;
    const button=form.querySelector('[type=submit]'), err=form.querySelector('.space-error');
    const data=Object.fromEntries(new FormData(form));
    this.busy=true;button.disabled=true;form.setAttribute('aria-busy','true');err.textContent='';
    try {
      this.user=(await this.request('username','POST',data)).user;
      form.reset();
      if(form.isConnected)$('#modal').hidden=true;
      this.onChange();
      $('#pageTitle')?.focus();
    } catch(e) {
      err.textContent=L.text(e.message||'设置用户名失败，请重试。');err.tabIndex=-1;err.focus();
    } finally {
      this.busy=false;button.disabled=false;form.removeAttribute('aria-busy');
    }
  }
  getItem(key){const value=this.data[localKeys[key]];return value==null?null:JSON.stringify(value);}
  setItem(key,value){this.data[localKeys[key]]=JSON.parse(value);this.touch();}
  removeItem(key){if(this.data[localKeys[key]]!==null){this.data[localKeys[key]]=null;this.touch();}}
  get pending(){return this.change!==this.synced;}
  touch(){
    this.change++;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.flush(),250);
    this.onStatus();
  }
  async flush(){
    clearTimeout(this.timer);
    if(this.inFlight){await this.inFlight;return !this.pending || (!this.error && this.flush());}
    if(!this.pending || !this.user)return !this.pending;
    const version=this.change;
    this.error='';
    this.inFlight=(async()=>{
      try {
        const {revision,updatedAt}=await this.request('state','PUT',{revision:this.revision,state:this.data});
        this.revision=revision;this.updatedAt=updatedAt;this.synced=version;
      } catch(e){this.error=e.message||'空间保存失败，请重试。';}
    })();
    await this.inFlight;this.inFlight=null;this.onStatus();
    if(!this.error&&this.pending)return this.flush();
    return !this.pending;
  }
  async logout(button){
    if(this.busy)return;
    this.busy=true;if(button)button.disabled=true;
    try {
      this.leave();
      if(!await this.flush()){this.onStatus();return;}
      if(this.demo){location.replace(this.demoURL(true));return;}
      await this.request('logout','POST',{});
      document.body.dataset.session='signed-out';
      const url=new URL(location.href);url.hash='';url.searchParams.delete('file');location.replace(url.href);
    } catch(e){this.error=e.message;this.onStatus();}
    finally {this.busy=false;if(button)button.disabled=false;}
  }
  currentReport(){
    const id=new URLSearchParams(location.search).get('file');
    return this.data.reports.find(r=>r.id===id)||null;
  }
  dialog(title,markup){
    const modal=$('#modal');
    modal.innerHTML=L.markup(`<section class="modal-box space-dialog" role="dialog" aria-modal="true" aria-labelledby="space-dialog-title"><h3 id="space-dialog-title">${title}</h3>${markup}</section>`);
    modal.hidden=false;modal.querySelector('input,select,[data-act="closeModal"]')?.focus();
  }
  form(kind,id,fields,action='保存'){
    return `<form data-space-form="${kind}" data-id="${esc(id||'')}">${fields}<p class="space-error" role="alert"></p><div class="actions"><button class="btn primary" type="submit">${action}</button><button class="btn" type="button" data-act="closeModal">取消</button></div></form>`;
  }
  folderSelect(selected){
    return `<div class="field"><label for="space-folder">所属文件夹</label><select id="space-folder" name="folder"><option value="">未归档</option>${this.data.folders.map(f=>`<option value="${esc(f.id)}"${selected===f.id?' selected':''}>${esc(f.name)}</option>`).join('')}</select></div>`;
  }
  renderHome(metrics,todos=[]){
    const state=this.data, active=this.folder, selected=state.folders.find(f=>f.id===active);
    const documents=state.reports.filter(r=>active===null || r.folderId===active).sort((a,b)=>b.updatedAt-a.updatedAt);
    const folders=state.folders.map(f=>`<div class="space-folder-row">${btn('folder',`${icon('folder')}<span>${esc(f.name)}</span><small>${state.reports.filter(r=>r.folderId===f.id).length}</small>`,'folder-button'+(active===f.id?' selected':''),f.id)}${active===f.id?btn('folder-edit','管理','text-button',f.id):''}</div>`).join('');
    const reportRows=documents.map(r=>{
      const folder=state.folders.find(f=>f.id===r.folderId);
      return `<tr><td><button type="button" class="space-file" data-space="open" data-id="${esc(r.id)}">${icon('file')}<span><strong>${esc(r.draft.title||L.text('未命名财报'))}</strong><small>${esc(r.draft.period)}</small></span></button></td><td>${folder?esc(folder.name):'未归档'}</td><td>${date(r.updatedAt)}</td><td>${btn('report-edit','管理','btn small',r.id)}</td></tr>`;
    }).join('');
    $('#spaceHome').innerHTML=L.markup(`
      <section class="space-welcome"><div class="space-welcome-copy"><h2>${this.user.readOnly?'查看公司財務':'开始处理账务'}</h2><div class="space-quick-actions">
        ${(this.user.readOnly?[['reports','chart','查看財報','利潤、現金和資產負債'],['invoices','file','查看銷售','發票和收款進度'],['payroll','file','查看薪酬','工資表與確認狀態'],['close','check','查看月結','期間進度與核對結果']]:[['bookkeeping','plus','记一笔','收入、支出和业务凭证'],['invoices','file','开票 / 收款','开票、审核和登记收款'],['bank','bank','核对银行流水','导入对账单、处理差异'],['close','check','做月结','复核、锁定已完成期间']]).map(([page,glyph,label,detail])=>`<a href="index.html#${page}" data-act="section" data-v="${page}">${icon(glyph)}<span><strong>${label}</strong><small>${detail}</small></span></a>`).join('')}</div></div><div class="space-account"><span class="space-avatar">${esc([...this.user.name][0])}</span><div><strong>${esc(this.user.name)}</strong>${this.user.username?`<small>用户名：${esc(this.user.username)}</small>`:''}${this.user.email?`<small>${esc(this.user.email)}</small>`:''}</div><span class="space-pill">${icon('lock')} ${window.AccountingCompany?.ROLE_NAMES[this.user.role]||'个人空间'}</span>${this.user.username?'':btn('set-username','设置用户名','btn small space-username-btn')}
        <div class="space-account-actions"><button type="button" class="btn small" data-company="password">修改密码</button>${this.user.role==='owner'?'<button type="button" class="btn small" data-company="members">成员与权限</button>':''}<button type="button" class="btn small" data-company="audit">操作记录</button></div></div></section>
      <section class="space-todos${todos.length?' has-todos':''}" aria-label="待处理事项"><h3>待处理事项</h3>${todos.length?`<ul>${todos.map(link=>`<li>${link}</li>`).join('')}</ul>`:'<p>暂无待审核或逾期发票，已导入的流水暂无未匹配项。</p>'}</section>
      <section class="space-metrics" aria-label="财务数据">${metrics.map(m=>`<article class="space-metric"><span>${m.label}</span><strong>${esc(m.value)}</strong><small>${m.hint}</small></article>`).join('')}</section>
      <section class="space-library"><header><h3>我的财报</h3><div class="actions"><a class="btn" href="index.html#reports" data-act="section" data-v="reports">查看账本报表</a>${btn('folder-new',`${icon('folder')} 新建文件夹`)}${btn('space-export','导出空间资料')}${btn('report-new',`${icon('plus')} 新建财报`,'btn primary')}</div></header>
      <div class="space-library-body"><aside class="space-folders" aria-label="财报文件夹">${btn('folder-all',`${icon('file')}<span>全部财报</span><small>${state.reports.length}</small>`,'folder-button'+(active===null?' selected':''))}${folders||'<p class="space-folder-empty">还没有文件夹</p>'}</aside>
      <div class="space-files"><div class="space-files-heading"><strong>${selected?esc(selected.name):'全部财报'}</strong><span>${documents.length} 份文件</span></div>
      ${documents.length?`<div class="scroll"><table><thead><tr><th scope="col">财报名称</th><th scope="col">文件夹</th><th scope="col">最近更新</th><th scope="col">操作</th></tr></thead><tbody>${reportRows}</tbody></table></div>`:`<div class="space-empty">${icon('folder')}<strong>这里还没有财报</strong><p>创建一份管理报表，或从现有账本生成报表草稿。</p>${btn('report-new','创建财报','btn')}</div>`}</div></div></section>
      ${this.legacy()?'<aside class="space-import"><div><strong>发现此浏览器中的旧账本</strong><p>可复制到当前个人空间，原账本仍保留。</p></div><button class="btn" data-act="spaceImportLegacy">预览导入</button></aside>':''}
    `);
  }
  click(action,id,button){
    if(action==='demo-reset'&&this.user){void this.updateDemo('reset');return;}
    if(action==='locale'){L.set(L.current==='zh-HK'?'zh-CN':'zh-HK');this.renderGate();return;}
    if(action==='auth-mode'){this.mode=this.mode==='login'?'register':'login';this.renderGate();$('#identity-username,#identity-identifier')?.focus();return;}
    if(action==='retry-auth'){this.start();return;}
    if(action==='logout' && this.user && !this.ready){this.logout(button);return;}
    if(!this.ready)return;
    if(this.user.readOnly&&!['open','space-export','folder','folder-all','set-username'].includes(action))return;
    const state=this.data;
    const f=state.folders.find(x=>x.id===id), r=state.reports.find(x=>x.id===id);
    const name=value=>`<div class="field"><label for="space-name">名称</label><input id="space-name" name="name" required maxlength="${action.startsWith('folder')?80:120}" value="${esc(value||'')}"></div>`;
    if(action==='logout'){this.logout(button);return;}
    if(action==='set-username' && !this.user.username){
      this.dialog('设置登录用户名',`<form id="space-username-form"><p>设置后可用用户名或原邮箱登录，密码保持不变。</p>
        ${usernameField('space-username','off')}
        <div class="field"><label for="space-current-password">当前密码</label><input id="space-current-password" name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"></div>
        <p class="space-error" role="alert"></p><div class="actions"><button type="submit" class="btn primary">保存用户名</button><button type="button" class="btn" data-act="closeModal">取消</button></div></form>`);
      return;
    }
    if(action==='space-export'){this.download('个人空间资料.json',JSON.stringify({format:'accounting-personal-space-v1',...this.data},null,2));return;}
    if(action==='folder-all'||action==='folder'){this.folder=f?.id||null;this.onChange();return;}
    if(action==='open'&&r){this.openReport(r.id);return;}
    if(action==='folder-new')this.dialog('新建文件夹',this.form(action,null,name(''),'创建'));
    else if(action==='folder-edit'&&f){
      this.dialog('管理文件夹',this.form(action,f.id,name(f.name))+`<div class="space-delete">${btn('folder-delete','删除空文件夹','text-button',f.id)}</div>`);
    }else if(action==='report-new'||action==='report-copy'){
      this.dialog(action==='report-new'?'新建财报':'保存为财报文件',this.form(action,null,name(action==='report-copy'?this.copyDraft()?.title:'')+this.folderSelect(this.folder),'创建并打开'));
    }else if(action==='report-edit'&&r){
      this.dialog('管理财报',this.form(action,r.id,name(r.draft.title)+this.folderSelect(r.folderId))+`<div class="space-delete">${btn('report-delete','删除财报','text-button',r.id)}</div>`);
    }else if(action==='report-delete'&&r){
      this.dialog('删除财报',this.form(action,r.id,`<p>确认删除「${esc(r.draft.title)}」？</p>`,'确认删除'));
    }else if(action==='folder-delete'&&f){
      this.dialog('删除文件夹',this.form(action,f.id,`<p>确认删除「${esc(f.name)}」？只能删除空文件夹。</p>`,'确认删除'));
    }
  }
  submitLibrary(form){
    const data=this.data, {spaceForm:kind,id}=form.dataset;
    const fields=new FormData(form), name=String(fields.get('name')||'').trim(), folder=fields.get('folder')||null;
    const error=text=>{form.querySelector('.space-error').textContent=L.text(text);};
    const f=data.folders.find(x=>x.id===id), r=data.reports.find(x=>x.id===id);
    if(!kind.endsWith('delete') && !name)return error('请输入名称。');
    if(folder && !data.folders.some(x=>x.id===folder))return error('该文件夹已不存在。');
    if(kind.startsWith('folder')&&!kind.endsWith('delete')&&data.folders.some(x=>x.id!==id && x.name===name))return error('已有同名文件夹。');
    const now=Date.now();
    if(kind==='folder-new'){
      if(data.folders.length>=120)return error('已达到文件夹数量上限。');
      const folder={id:UUID(),name,updatedAt:now};data.folders.push(folder);this.folder=folder.id;
    }else if(kind==='folder-edit'&&f){f.name=name;f.updatedAt=now;}
    else if(kind==='folder-delete'&&f){
      if(data.reports.some(x=>x.folderId===f.id))return error('请先将财报移出此文件夹。');
      data.folders=data.folders.filter(x=>x.id!==f.id);if(this.folder===f.id)this.folder=null;
    }else if(kind==='report-new'||kind==='report-copy'){
      if(data.reports.length>=300)return error('已达到财报数量上限。');
      const draft=kind==='report-copy'?(this.copyDraft()||this.makeDraft()):this.makeDraft();
      draft.title=name;
      const doc={id:UUID(),folderId:folder,draft,updatedAt:now};
      data.reports.push(doc);this.touch();$('#modal').hidden=true;this.openReport(doc.id);return;
    }else if(kind==='report-edit'&&r){r.draft.title=name;r.folderId=folder;r.updatedAt=now;}
    else if(kind==='report-delete'&&r){data.reports=data.reports.filter(x=>x.id!==id);}
    else return error('找不到该项目。');
    this.touch();$('#modal').hidden=true;this.onChange();
    $('#pageTitle')?.focus();
  }
}
window.AccountingPersonalSpace={PersonalSpace,icon};
})();

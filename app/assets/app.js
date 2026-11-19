(() => {
'use strict';
const RECORD_KEY = 'acct2102-finance-record-v1';
const DRAFT_KEY = RECORD_KEY + '-draft';
const RECOVERY_KEY = RECORD_KEY + '-recovery';
const Locale = window.AccountingLocale;
const Account = window.AccountingPersonalSpace;
const entryParams = new URLSearchParams(location.search);
const trainingMode = entryParams.get('training')==='1';
const accountMode = !trainingMode && document.body.dataset.accountWorkspace==='required';
const demoMode = accountMode && document.body.hasAttribute('data-demo-workspace');
let workspace=null;
let trainingStore, trainingView, trainingSalesPortal;
const trainingRole=()=>trainingMode ? TrainingContent.roleOf(trainingStore?.level) : null;
const readOnly=()=>workspace?.user?.readOnly===true || trainingRole()==='owner';
const canWriteLedger=()=>!UI.loadBlocked&&!readOnly();
const store=()=>trainingMode ? trainingStore : workspace || localStorage;
const EBook = window.AccountingEnterprise;
const Bank = window.AccountingBank;
const Member = window.AccountingMembership;
const Business = window.AccountingBusiness;
const Stock = window.AccountingInventory;
const Assets = window.AccountingFixedAssets;
const Invoices = window.AccountingInvoices;
const Company = window.AccountingCompany;
const Chart = window.AccountingChart;
const Guide = window.AccountingLedgerGuide;
const Tutorial = window.AccountingTutorial;
const Training = window.AccountingTraining, TrainingContent = window.AccountingTrainingContent;
if (![Locale, window.OpenCC, Account, EBook, Bank, Member, Business, Stock, Assets, Invoices, window.AccountingAI,
  window.AccountingBankWorkspace, window.AccountingReportEditor, Company, Chart, Guide, Tutorial,
  ...(trainingMode?[Training,TrainingContent]:[])].every(Boolean)) {
  if (trainingMode) {
    const gate = document.querySelector('#identityGate');
    const home = Locale?.current === 'zh-HK' ? 'index.html?lang=zh-HK' : 'index.html';
    const notice = `<div class="identity-panel"><div class="identity-form">
      <h2 role="alert">练习暂时无法打开</h2>
      <p>实训页面没有加载完整，请重新加载。若使用本机版，重启财务工作台后可以再试。</p>
      <div class="actions"><button type="button" class="btn primary">重新加载</button><a class="btn" href="${home}">返回首页</a></div>
    </div></div>`;
    gate.innerHTML = Locale && window.OpenCC ? Locale.markup(notice) : notice;
    gate.querySelector('button').addEventListener('click', () => location.reload());
    gate.hidden = false;
    document.querySelectorAll('.app, .rail, .skip-link, #mobileJump').forEach(element => { element.hidden = true; });
    return;
  }
  const message = document.createElement('p');
  message.className = 'err';
  message.setAttribute('role', 'alert');
  const error = '应用资源未完整加载。若使用本机版，请关闭旧启动窗口，在原端口重新启动后刷新页面。若使用网页版，请刷新页面。账本数据未被修改。';
  message.textContent = Locale && window.OpenCC ? Locale.text(error) : error;
  if(accountMode){const gate=document.querySelector('#identityGate');if(gate){gate.hidden=false;gate.append(message);}}
  else document.querySelector('#taskBar')?.replaceChildren(message);
  for (const id of ['work', 'mobileJump', 'saveStatus']) {
    const element = document.getElementById(id);
    if (element) element.hidden = true;
  }
  const backup = document.querySelector('.rail-bottom button');
  if (backup) backup.disabled = true;
  return;
}
const trainingCaseFromURL = () => TrainingContent.find(new URLSearchParams(location.search).get('case'));
if(trainingMode){
  trainingStore=new Training.Storage(()=>localStorage);
  trainingStore.level=trainingCaseFromURL() || null;
  document.body.dataset.training='';
  document.body.dataset.session='ready';
}
function removeRetiredLedger(){
  const obsolete = [
    'acct2102-statement-lab-v1', 'acct2102-statement-lab-v1-draft',
    'acct2102-statement-lab-v1-recovery', 'acct2102-purpose-v1', 'acct2102-lab-return-v1',
  ];
  try { for (const key of obsolete) localStorage.removeItem(key); } catch (e) {}
}
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const $ = (s, r = document) => r.querySelector(s);
const esc = Locale.literal, uiEsc = Locale.escape;

/* ================= Chart of accounts =================
   t: A asset · XA contra-asset · L liability · E equity · XE dividends · R revenue/gain · X expense/loss · O OCI
   cf: cash · wc (operating working capital) · pl · oci · inv · fin                                        */
const COA = [
  {c:'1000',t:'A',en:'Cash and cash equivalents',zh:'现金及现金等价物',cf:'cash'},
  {c:'1100',t:'A',en:'Accounts receivable',zh:'应收账款',cf:'wc',op:'customers',wc:'ar'},
  {c:'1105',t:'XA',en:'Allowance for doubtful accounts',zh:'坏账准备',cf:'wc',op:'customers',wc:'ar'},
  {c:'1110',t:'A',en:'Interest receivable',zh:'应收利息',cf:'wc',op:'intRec',wc:'1110'},
  {c:'1150',t:'A',en:'Staff advances',zh:'员工借支',cf:'wc',op:'otherOpex',wc:'1150'},
  {c:'1160',t:'A',en:'Commission recoverable',zh:'应收佣金追回款',cf:'wc',op:'otherOpex',wc:'1160'},
  {c:'1200',t:'A',en:'Inventories',zh:'存货',cf:'wc',op:'suppliers',wc:'1200'},
  {c:'1300',t:'A',en:'Prepaid expenses',zh:'预付费用',cf:'wc',op:'otherOpex',wc:'1300'},
  {c:'1350',t:'A',en:'Supplier advances',zh:'预付供应商款',cf:'wc',op:'suppliers',wc:'1350'},
  {c:'1360',t:'A',en:'Prepaid profits tax',zh:'预付利得税',cf:'wc',op:'tax',wc:'1360'},
  {c:'1450',t:'A',en:'Assets held for sale',zh:'持有待售资产',cf:'inv',k:'hfs'},
  {c:'1500',t:'A',en:'Land',zh:'土地',cf:'inv',k:'ppe'},
  {c:'1510',t:'A',en:'Equipment',zh:'设备',cf:'inv',k:'ppe'},
  {c:'1515',t:'XA',en:'Accumulated depreciation – equipment',zh:'累计折旧—设备',cf:'inv',k:'ppe'},
  {c:'1600',t:'A',en:'Investments at FVOCI',zh:'FVOCI 股权投资',cf:'inv',k:'invest'},
  {c:'2000',t:'L',en:'Accounts payable',zh:'应付账款',cf:'wc',op:'suppliers',wc:'2000'},
  {c:'2050',t:'L',en:'Commissions payable',zh:'应付佣金',cf:'wc',op:'otherOpex',wc:'2050'},
  {c:'2060',t:'L',en:'Employee reimbursements payable',zh:'应付员工报销',cf:'wc',op:'otherOpex',wc:'2060'},
  {c:'2070',t:'L',en:'MPF contributions payable',zh:'应付强积金',cf:'wc',op:'employees',wc:'2070'},
  {c:'2080',t:'L',en:'Accrued operating expenses',zh:'应计营业费用',cf:'wc',op:'otherOpex',wc:'2080'},
  {c:'2100',t:'L',en:'Salaries payable',zh:'应付职工薪酬',cf:'wc',op:'employees',wc:'2100'},
  {c:'2150',t:'L',en:'Interest payable',zh:'应付利息',cf:'wc',op:'intPaid',wc:'2150'},
  {c:'2200',t:'L',en:'Income tax payable',zh:'应交所得税',cf:'wc',op:'tax',wc:'2200'},
  {c:'2300',t:'L',en:'Unearned revenue',zh:'预收收入（合同负债）',cf:'wc',op:'customers',wc:'2300'},
  {c:'2400',t:'L',en:'Dividends payable',zh:'应付股利',cf:'fin',k:'div'},
  {c:'2500',t:'L',en:'Long-term borrowings',zh:'长期借款',cf:'fin',k:'borrow'},
  {c:'3000',t:'E',en:'Share capital',zh:'股本',cf:'fin',k:'shares'},
  {c:'3100',t:'E',en:'Retained earnings',zh:'留存收益',cf:'fin',k:'otherEq'},
  {c:'3200',t:'E',en:'Revaluation surplus',zh:'重估盈余',cf:'fin',k:'otherEq'},
  {c:'3210',t:'E',en:'Fair value reserve',zh:'公允价值储备',cf:'fin',k:'otherEq'},
  {c:'3300',t:'XE',en:'Dividends',zh:'股利',cf:'fin',k:'div',temp:true},
  {c:'3900',t:'E',en:'Income summary',zh:'本年利润（汇总）',cf:'fin',k:'otherEq',hidden:true,temp:true},
  {c:'4000',t:'R',en:'Sales revenue',zh:'销售收入',pl:'rev',cf:'pl',op:'customers'},
  {c:'4100',t:'R',en:'Service revenue',zh:'服务收入',pl:'rev',cf:'pl',op:'customers'},
  {c:'4500',t:'R',en:'Interest income',zh:'利息收入',pl:'oth',cf:'pl',op:'intRec'},
  {c:'4600',t:'R',en:'Gain on disposal of equipment',zh:'处置设备利得',pl:'oth',cf:'pl',adj:'ppe'},
  {c:'4700',t:'R',en:'Other operating income',zh:'其他经营收益',pl:'oth',cf:'pl',op:'otherOpex'},
  {c:'5000',t:'X',en:'Cost of goods sold',zh:'销售成本',pl:'opx',fn:'cos',cf:'pl',op:'suppliers',natEn:'Changes in inventories (goods used)',natZh:'耗用的存货（商品成本）'},
  {c:'6000',t:'X',en:'Salaries and wages expense',zh:'工资薪酬费用',pl:'opx',fn:'admin',cf:'pl',op:'employees',natEn:'Employee benefits expense',natZh:'员工福利费用'},
  {c:'6100',t:'X',en:'Rent expense',zh:'租金费用',pl:'opx',fn:'admin',cf:'pl',op:'otherOpex'},
  {c:'6200',t:'X',en:'Advertising expense',zh:'广告费用',pl:'opx',fn:'sell',cf:'pl',op:'otherOpex'},
  {c:'6250',t:'X',en:'Commission expense',zh:'佣金费用',pl:'opx',fn:'sell',cf:'pl',op:'otherOpex'},
  {c:'6300',t:'X',en:'Utilities expense',zh:'水电费用',pl:'opx',fn:'admin',cf:'pl',op:'otherOpex'},
  {c:'6400',t:'X',en:'Insurance expense',zh:'保险费用',pl:'opx',fn:'admin',cf:'pl',op:'otherOpex'},
  {c:'6500',t:'X',en:'Depreciation expense',zh:'折旧费用',pl:'opx',fn:'admin',cf:'pl',adj:'dep'},
  {c:'6600',t:'X',en:'Bad debt expense',zh:'坏账费用（应收款减值）',pl:'opx',fn:'admin',cf:'pl',op:'customers'},
  {c:'6700',t:'X',en:'Restructuring costs',zh:'重组费用',pl:'opx',fn:'other',cf:'pl',op:'otherOpex'},
  {c:'6800',t:'X',en:'Revaluation loss on land',zh:'土地重估损失',pl:'opx',fn:'other',cf:'pl',adj:'reval'},
  {c:'6900',t:'X',en:'Other operating expenses',zh:'其他营业费用',pl:'opx',fn:'other',cf:'pl',op:'otherOpex'},
  {c:'7000',t:'X',en:'Interest expense',zh:'利息费用',pl:'oth',cf:'pl',op:'intPaid'},
  {c:'7100',t:'X',en:'Loss on disposal of equipment',zh:'处置设备损失',pl:'oth',cf:'pl',adj:'ppe'},
  {c:'8000',t:'X',en:'Income tax expense',zh:'所得税费用',pl:'tax',cf:'pl',op:'tax'},
  {c:'8500',t:'X',en:'Discontinued operations – profit/(loss) before tax',zh:'终止经营税前损益',pl:'disc',cf:'pl',op:'discOps',adj:'disc'},
  {c:'8510',t:'X',en:'Discontinued operations – income tax',zh:'终止经营所得税',pl:'discTax',cf:'pl',op:'tax'},
  {c:'9000',t:'O',en:'OCI – revaluation gain on land',zh:'OCI：土地重估利得',cf:'oci',res:'3200'},
  {c:'9100',t:'O',en:'OCI – fair value gain/(loss) on FVOCI investments',zh:'OCI：FVOCI 投资公允价值变动',cf:'oci',res:'3210'},
];
const BASE_COA = COA.map(a => ({...a}));
const ACC = {};
/* The company's chart (assets/chart.js) renames, renumbers, hides and adds accounts. COA and ACC are
   rebuilt in place, so everything that loops over accounts picks up the company's accounts. Internal ids
   stay the same: `a.c` is the key templates post to, `a.code` is what people see. */
let VISIBLE = [], PICK = [], chartApplied;
function applyChart(chart){
  chartApplied = chart;
  COA.length = 0; COA.push(...Chart.build(BASE_COA, chart || null));
  for (const k of Object.keys(ACC)) delete ACC[k];
  COA.forEach(a => ACC[a.c] = a);
  VISIBLE = COA.filter(a => !a.hidden);
  PICK = VISIBLE.filter(a => !a.off);
}
applyChart(undefined);
const syncChart = () => { if (S && S.chart !== chartApplied) applyChart(S.chart); };
const TYPE_ZH = {A:'资产',XA:'资产备抵',L:'负债',E:'权益',XE:'股利（权益减项）',R:'收入/利得',X:'费用/损失',O:'其他综合收益'};
const TYPE_EN = {A:'asset',XA:'contra-asset',L:'liability',E:'equity',XE:'dividends (contra-equity)',R:'revenue/gain',X:'expense/loss',O:'other comprehensive income'};
const FN_LABEL = {cos:['Cost of sales','销售成本'],sell:['Selling and distribution expenses','销售及分销费用'],admin:['Administrative expenses','管理费用'],other:['Other operating expenses','其他营业费用']};
const FN_OPTS = [['cos','销售成本 Cost of sales'],['sell','销售费用 Selling'],['admin','管理费用 Administrative'],['other','其他营业费用 Other']];
const normFn = (a, fn) => ACC[a].pl !== 'opx' ? null : (FN_LABEL[fn] ? fn : (ACC[a].fn || 'other'));

const OP_LABEL = {customers:['Cash receipts from customers','从客户收到的现金'],intRec:['Interest received','收到的利息'],suppliers:['Cash paid to suppliers','支付给供应商的现金'],employees:['Cash paid to employees','支付给员工的现金'],otherOpex:['Cash paid for other operating expenses','支付的其他营业费用'],intPaid:['Interest paid','支付的利息'],tax:['Income taxes paid','支付的所得税'],discOps:['Operating cash flows of discontinued operations','终止经营的经营现金流量']};
const OP_ORDER = ['customers','intRec','suppliers','employees','otherOpex','intPaid','tax','discOps'];
const IF_LABEL = {'ppe:out':['Purchase of property, plant and equipment','购置物业、厂房及设备'],'ppe:in':['Proceeds from disposal of property, plant and equipment','处置物业、厂房及设备所得'],'invest:out':['Purchase of investments','购买投资'],'invest:in':['Proceeds from sale of investments','出售投资所得'],'hfs:in':['Proceeds from disposal of discontinued operation','处置终止经营业务所得'],'hfs:out':['Payments relating to assets held for sale','持有待售资产相关支出'],'shares:in':['Proceeds from issue of ordinary shares','发行普通股所得'],'shares:out':['Payments to repurchase shares','回购股份支付'],'borrow:in':['Proceeds from borrowings','取得借款所得'],'borrow:out':['Repayment of borrowings','偿还借款'],'div:out':['Dividends paid','支付的股利'],'div:in':['Dividends received back','退回的股利'],'otherEq:in':['Other contributions from owners','其他所有者投入'],'otherEq:out':['Other distributions to owners','其他对所有者的分配']};
const INV_ORDER = ['ppe:out','ppe:in','invest:out','invest:in','hfs:in','hfs:out'];
const FIN_ORDER = ['shares:in','shares:out','borrow:in','borrow:out','div:out','div:in','otherEq:in','otherEq:out'];
const ADJ_LABEL = {dep:['Depreciation expense','折旧费用'],ppe:['(Gain)/loss on disposal of equipment','处置设备（利得）/损失'],disc:['Impairment and (gain)/loss on disposal – discontinued operations','终止经营减值及处置（利得）/损失'],reval:['Revaluation loss on land','土地重估损失'],other:['Other non-cash items','其他非现金项目']};
const WC_LABEL = {ar:['trade receivables (net)','应收账款（净额）'],'1110':['interest receivable','应收利息'],'1150':['staff advances','员工借支'],'1160':['commission recoverable','应收佣金追回款'],'1200':['inventories','存货'],'1300':['prepaid expenses','预付费用'],'1350':['supplier advances','预付供应商款'],'1360':['prepaid profits tax','预付利得税'],'2000':['accounts payable','应付账款'],'2050':['commissions payable','应付佣金'],'2060':['employee reimbursements payable','应付员工报销'],'2070':['MPF contributions payable','应付强积金'],'2080':['accrued operating expenses','应计营业费用'],'2100':['salaries payable','应付职工薪酬'],'2150':['interest payable','应付利息'],'2200':['income tax payable','应交所得税'],'2300':['unearned revenue','预收收入']};

/* ================= numbers ================= */
function money(v){
  if (v == null) return NaN;
  let s = String(v).trim(); if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/HK\$/gi, '').replace(/[,\s$]/g, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const c = Math.round(parseFloat(s) * 100);
  if (!Number.isSafeInteger(c)) return NaN;
  return neg ? -c : c;
}
const num = v => { const n = parseFloat(String(v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
const pos = v => Number.isFinite(v) && v > 0;
function fmt(c){
  if (c == null || !Number.isFinite(c)) return '';
  const neg = c < 0, a = Math.abs(Math.round(c)), d = a % 100 !== 0;
  const s = (a / 100).toLocaleString('en-US', {minimumFractionDigits: d ? 2 : 0, maximumFractionDigits: 2});
  return neg ? `(${s})` : s;
}
const cur = () => (typeof S !== 'undefined' && S && S.company && S.company.cur) || 'HK$';
const m$ = c => `${cur()}${fmt(c)}`;
const hm$ = c => esc(m$(c));
const ATTACH_LIMIT=2*1024*1024, ATTACH_TYPES=new Set(['application/pdf','image/png','image/jpeg']);
function validateAttachments(items){
  if(!Array.isArray(items)||items.length>3)throw new Error('每张凭证最多保存 3 个附件');
  let total=0;for(const a of items){
    if(!a||typeof a.name!=='string'||!a.name.trim()||a.name.length>180||!ATTACH_TYPES.has(a.type)||!Number.isSafeInteger(a.size)||a.size<1||typeof a.data!=='string')throw new Error('原始单据附件格式无效');
    const prefix=`data:${a.type};base64,`,body=a.data.startsWith(prefix)?a.data.slice(prefix.length):'';
    if(!body||body.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(body)||body.length/4*3-(body.endsWith('==')?2:body.endsWith('=')?1:0)!==a.size)throw new Error('原始单据附件内容无效');
    total+=a.size;if(total>ATTACH_LIMIT)throw new Error('每张凭证附件合计不能超过 2 MB');
  }
}
function clearAttachments(){UI.attachmentEpoch++;UI.attachmentBusy=false;UI.attachments=[];}
function attachmentBox(){
  if(trainingMode)return '';
  return `<details class="entry-more"${UI.attachments.length||UI.attachmentBusy?' open':''}><summary>原始单据附件（选填）</summary><p class="hint">PDF、PNG 或 JPG，最多 3 个、合计不超过 2 MB。附件保存在本浏览器和 JSON 备份中。</p><label class="btn small" for="attachment-file">选择附件</label><input id="attachment-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple hidden><div id="attachment-status" role="status" aria-live="polite">${UI.attachmentBusy?'正在读取附件…':''}</div>${UI.attachments.length?`<ul class="attachment-list">${UI.attachments.map((a,i)=>`<li>${esc(a.name)} <small>${Math.ceil(a.size/1024)} KB</small> <button class="text-button" data-act="attachmentRemove" data-i="${i}">移除</button></li>`).join('')}</ul>`:''}</details>`;
}
function amtHTML(c){
  if (c == null) return '';
  if (c === 0) return '–<span class="rp ghost">)</span>';
  const neg = c < 0;
  return `${neg ? '(' : ''}${fmt(Math.abs(c))}<span class="rp${neg ? '' : ' ghost'}">)</span>`;
}
function epsHTML(v){
  if (v == null || !isFinite(v)) return '';
  const neg = v < -0.0000001;
  return `${neg ? '(' : ''}${Math.abs(v).toFixed(2)}<span class="rp${neg ? '' : ' ghost'}">)</span>`;
}
function allocate(total, w){
  const W = w.reduce((a, b) => a + b, 0); if (!W) return w.map(() => 0);
  const raw = w.map(x => total * x / W), fl = raw.map(Math.floor);
  let rem = total - fl.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - fl[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < rem; k++) fl[order[k % order.length][1]]++;
  return fl;
}
function monthsOut(date){
  const [y, m, d] = date.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  return 12 - (m - 1) - (d - 1) / dim;
}
const fmtMo = m => (Math.round(m * 100) / 100).toString();

/* ================= journal helpers ================= */
const D = (a, v, fn) => ({a, s: v, fn});
const C = (a, v, fn) => ({a, s: -v, fn});
const ok = (groups, o = {}) => ({groups, ...o});
const bad = msg => ({err: msg || '请填写金额'});
const F = {
  amt: (label = '金额', k = 'amt') => ({k, t: 'money', label}),
  pay: (def = 'cash', credit = '赊账') => ({k: 'pay', t: 'sel', label: '结算方式', opts: [['cash', '现金'], ['credit', credit]], def}),
  fn: (def = 'admin', auto = false, show) => ({k: 'fn', t: 'sel', label: '费用功能（按功能列报时归入）', opts: (auto ? [['auto', '按费用类型默认']] : []).concat(FN_OPTS), def, show}),
};
const FNZ = f => (FN_LABEL[f] || FN_LABEL.other)[1];
const EXPENSE_ACCOUNTS = new Map([
  ...['租金','租金费用','房租','房租费','房屋租金','办公室租金','rent','rent expense'].map(n=>[n,'6100']),
  ...['广告','广告费','广告费用','advertising','advertising expense'].map(n=>[n,'6200']),
  ...['水电','水电费','水电费用','utilities','utilities expense'].map(n=>[n,'6300']),
  ...['保险','保险费','保险费用','insurance','insurance expense'].map(n=>[n,'6400']),
  ...['重组','重组费','重组费用','restructuring','restructuring costs'].map(n=>[n,'6700']),
]);
function expenseSpec(p){
  const entered = Object.prototype.hasOwnProperty.call(p,'expenseName');
  const legacy = !entered && ACC[p.acct]?.pl==='opx' ? p.acct : null;
  const name = entered && typeof p.expenseName==='string' ? p.expenseName.trim() : legacy ? ACC[legacy].zh : '';
  const key = name.normalize('NFKC').toLowerCase();
  // The company's own expense accounts are matched by name or code, e.g. "Electric and Water" or "5811".
  const own = key && COA.find(a => a.pl === 'opx' && a.fn !== 'cos' && !a.hidden && !a.off && (a.zh.normalize('NFKC').toLowerCase() === key || a.code.toLowerCase() === key));
  const acct = legacy || EXPENSE_ACCOUNTS.get(key) || own?.c || '6900';
  return {name:own && own.code.toLowerCase() === key ? own.zh : name,acct,entered};
}

/* ================= transaction templates ================= */
const TPL_CATS = [['op','日常经营 Operating'],['member','会员卡与返佣'],['customer','客户往来'],['supplier','供应商往来'],['staff','员工借支与报销'],['hk','香港工资与税务'],['stock','商品存货'],['inv','投资活动 Investing'],['fin','筹资活动 Financing'],['adj','期末调整 Adjusting'],['oci','其他综合收益 OCI'],['disc','终止经营 Discontinued operations']];
const TEMPLATES = [
  // New sale vouchers recognize any confirmed commission in a second group.
  {id:'memberCardSale',cat:'member',zh:'会员卡售卡 / 充值收款',
    fields:[F.amt('客户购卡实收金额'),{k:'cardNo',t:'text',label:'会员卡号',max:80},{k:'customer',t:'text',label:'客户姓名',max:80},
      {k:'rate',t:'num',label:'确认佣金比例（%，无佣金填 0）',def:'0'}],
    memo:p=>`会员卡 ${p.cardNo || ''} 售卡 / 充值 ${m$(money(p.amt))}`,
    note:'收款计入合同负债。本笔有佣金时，售卡入账同时确认应付佣金；实际支付时关联原售卡凭证。税费另行处理。',
    build(p,ctx){
      const a=money(p.amt), cardNo=String(p.cardNo || '').trim(), customer=String(p.customer || '').trim();
      if(!pos(a))return bad('请输入客户购卡实收金额');
      if(!cardNo || cardNo.length>80 || !customer || customer.length>80)return bad('请填写会员卡号和客户姓名');
      const rateBps=Member.rate(String(p.rate ?? '').trim() || '0'), amount=Member.commission(a,rateBps);
      const groups=[[D('1000',a),C('2300',a)]];
      const old=memberSale(ctx.book,ctx.excludeId);
      if(old && !Member.inline(old)){
        return ok(groups,{member:{...old.member,cardNo,customer,rateBps},party:customer,
          calc:amount?`旧版购卡预计佣金 ${m$(amount)}；编辑不会回填应付佣金。`:'本笔无佣金。'});
      }
      if(amount)groups.push([D('6250',amount,'sell'),C('2050',amount)]);
      return ok(groups,{member:{v:2,kind:'sale',cardNo,customer,rateBps},party:customer,
        calc:amount?`本笔应付佣金 = ${m$(a)} × ${rateBps/100}% = ${m$(amount)}；随售卡确认，尚未支付。`:'本笔无佣金。'});}},
  {id:'memberCardUse',cat:'member',zh:'会员卡消费确认收入',fields:[{k:'cardNo',t:'memberCard',label:'选择会员卡'},F.amt('本次已履约服务金额')],
    hint:(p,ctx)=>memberHint('card',p,ctx),
    memo:p=>`会员卡 ${p.cardNo || ''} 消费，确认服务收入 ${m$(money(p.amt))}`,
    note:'仅在服务实际履行时确认收入。本次消费计入所选会员卡明细；税费、赠送和折扣另行处理。',
    build(p,ctx){const a=money(p.amt),card=memberCards(ctx.book,ctx.excludeId).find(c=>Member.key(c.cardNo)===Member.key(p.cardNo));
      if(!card)return bad('请选择已有购卡凭证的会员卡');if(!pos(a))return bad('请输入本次已履约服务金额');
      return ok([[D('2300',a),C('4100',a)]],{member:{v:1,kind:'use',cardNo:card.cardNo},party:card.customer});}},
  {id:'memberCommissionAccrue',cat:'member',legacyOnly:true,zh:'补录旧售卡应付佣金',fields:[{k:'saleId',t:'memberSale',label:'关联购卡凭证'},F.amt('按协议调整后的佣金（选填）','override')],
    hint:(p,ctx)=>memberHint('sale',p,ctx),
    memo:p=>`补录旧购卡凭证 ${p.saleId || ''} 的应付佣金`,
    note:'仅用于旧版售卡凭证中尚未入账的预计佣金。新售卡凭证已直接确认应付，无需补录。',
    build(p,ctx){const sale=memberSale(ctx.book,p.saleId);if(!sale)return bad('请选择关联购卡凭证');if(Member.inline(sale))return bad('新售卡凭证已随售卡确认佣金，无需另行计提');const expected=Member.expected(sale),a=String(p.override||'').trim()?money(p.override):expected;
      if(!pos(a)||a>expected)return bad('实际佣金须大于零且不超过购卡预计佣金');
      return ok([[D('6250',a,'sell'),C('2050',a)]],{member:{v:1,kind:'accrue',saleId:sale.id,amount:a},
        calc:`原预计 ${m$(sale.groups[0].find(l=>l.a==='1000').s)} × ${sale.member.rateBps/100}% = ${m$(expected)}；本次计提 ${m$(a)}`});}},
  {id:'memberCommissionPay',cat:'member',zh:'会员卡返佣支付',fields:[{k:'saleId',t:'memberSale',label:'关联购卡凭证'},F.amt('本次支付佣金')],
    hint:(p,ctx)=>memberHint('sale',p,ctx),
    memo:p=>`支付购卡凭证 ${p.saleId || ''} 的佣金 ${m$(money(p.amt))}`,
    note:'支付前请核对原购卡凭证。允许分次支付，不能超过该笔购卡的未付佣金。',
    build(p,ctx){const sale=memberSale(ctx.book,p.saleId),a=money(p.amt);if(!sale)return bad('请选择关联购卡凭证');if(!pos(a))return bad('请输入本次支付佣金');
      return ok([[D('2050',a),C('1000',a)]],{member:{v:1,kind:'pay',saleId:sale.id}});}},
  {id:'memberCardRefund',cat:'member',zh:'会员卡未消费余额退款',fields:[{k:'saleId',t:'memberPurchase',label:'关联购卡凭证'},F.amt('退款金额')],
    hint:(p,ctx)=>memberHint('sale',p,ctx),memo:p=>`会员卡购卡凭证 ${p.saleId||''} 未消费余额退款 ${m$(money(p.amt))}`,
    note:'只退还未消费的储值余额。退款不自动冲回佣金，需按协议决定是否冲回；已履约收入、赠送、税费和手续费需另行处理。',
    build(p,ctx){const sale=memberSale(ctx.book,p.saleId),a=money(p.amt);if(!sale)return bad('请选择关联购卡凭证');if(!pos(a))return bad('请输入退款金额');
      return ok([[D('2300',a),C('1000',a)]],{member:{v:1,kind:'refund',saleId:sale.id},party:sale.member.customer});}},
  {id:'memberCommissionReverse',cat:'member',zh:'会员卡返佣冲回',fields:[{k:'saleId',t:'memberSale',label:'关联购卡凭证'},F.amt('冲回尚未支付佣金','unpaid'),F.amt('已支付且有权追回的佣金','paid')],
    hint:(p,ctx)=>memberHint('sale',p,ctx),memo:p=>`冲回购卡凭证 ${p.saleId||''} 的佣金`,
    note:'仅在协议及事实支持冲回时使用。未付部分冲减应付；已付部分须确认企业有权追回，记为应收佣金追回款。税费和跨期调整另行判断。',
    build(p,ctx){const sale=memberSale(ctx.book,p.saleId);if(!sale)return bad('请选择关联购卡凭证');
      const unpaid=String(p.unpaid||'').trim()?money(p.unpaid):0,paid=String(p.paid||'').trim()?money(p.paid):0,total=unpaid+paid;
      if(!Number.isSafeInteger(unpaid)||!Number.isSafeInteger(paid)||unpaid<0||paid<0||!Number.isSafeInteger(total)||!total)return bad('请输入有效的佣金冲回金额');
      const g=[];if(unpaid)g.push(D('2050',unpaid));if(paid)g.push(D('1160',paid));g.push(C('6250',total,'sell'));
      return ok([g],{member:{v:1,kind:'reverse',saleId:sale.id,unpaid,paid}});}},
  {id:'memberCommissionRecover',cat:'member',zh:'收回已付佣金',fields:[{k:'saleId',t:'memberSale',label:'关联购卡凭证'},F.amt('本次收回金额')],
    hint:(p,ctx)=>memberHint('sale',p,ctx),memo:p=>`收回购卡凭证 ${p.saleId||''} 的佣金 ${m$(money(p.amt))}`,
    note:'收回此前确认的应收佣金追回款；可以分次收回。',
    build(p,ctx){const sale=memberSale(ctx.book,p.saleId),a=money(p.amt);if(!sale)return bad('请选择关联购卡凭证');if(!pos(a))return bad('请输入收回金额');
      return ok([[D('1000',a),C('1160',a)]],{member:{v:1,kind:'recover',saleId:sale.id}});}},
  // ---- operating
  {id:'sale',cat:'op',zh:'销售商品',
    fields:[F.amt('售价（确认收入）','price'),F.amt('商品成本（结转成本）','cost'),F.pay('credit','赊销（应收账款）')],
    memo:p=>`${p.pay==='cash'?'现销':'赊销'}商品，售价 ${m$(money(p.price))}，成本 ${m$(money(p.cost))}`,
    note:'永续盘存制下一次销售记两笔分录：① 确认收入；② 结转销售成本。收入在商品控制权转移时确认（IFRS 15），与是否收到现金无关，这就是权责发生制。',
    build(p){const pr=money(p.price),c=money(p.cost);if(!pos(pr))return bad('请输入售价');if(c<0)return bad('商品成本不能为负数');const g=[[D(p.pay==='cash'?'1000':'1100',pr),C('4000',pr)]];if(pos(c))g.push([D('5000',c,'cos'),C('1200',c)]);return ok(g);}},
  {id:'purchaseInv',cat:'op',zh:'采购存货',
    fields:[F.amt('采购成本'),F.pay('credit','赊购（应付账款）')],
    memo:p=>`${p.pay==='cash'?'现购':'赊购'}存货 ${m$(money(p.amt))}`,
    note:'存货是资产。买进时不是费用，卖出时才通过「销售成本」转为费用（配比）。',
    build(p){const a=money(p.amt);if(!pos(a))return bad('请输入采购金额');return ok([[D('1200',a),C(p.pay==='cash'?'1000':'2000',a)]]);}},
  {id:'collectAR',cat:'op',zh:'收回应收账款',fields:[F.amt('收款金额')],
    hint:(p,ctx)=>`应收账款当前余额 ${m$(ctx.bal('1100'))}`,
    memo:p=>`收回客户欠款 ${m$(money(p.amt))}`,
    note:'只是资产形式的转换（应收 → 现金），不影响利润。收入早在赊销时已经确认。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('1000',a),C('1100',a)]]);}},
  {id:'payAP',cat:'op',zh:'支付应付账款',fields:[F.amt('付款金额')],
    hint:(p,ctx)=>`应付账款当前余额 ${m$(-ctx.bal('2000'))}`,
    memo:p=>`支付供应商货款 ${m$(money(p.amt))}`,
    note:'资产和负债同时减少，不影响利润。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('2000',a),C('1000',a)]]);}},
  {id:'advance',cat:'op',zh:'预收客户款项',fields:[F.amt('预收金额')],
    memo:p=>`预收客户服务款 ${m$(money(p.amt))}`,
    note:'还没有履行履约义务，不能确认收入，先记为合同负债（IFRS 15）。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('1000',a),C('2300',a)]]);}},
  {id:'service',cat:'op',zh:'提供服务',fields:[F.amt('服务收入'),F.pay('cash','赊账（应收账款）')],
    memo:p=>`提供服务，收入 ${m$(money(p.amt))}${p.pay==='cash'?'（已收现）':'（赊账）'}`,
    note:'履约义务完成即确认收入。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D(p.pay==='cash'?'1000':'1100',a),C('4100',a)]]);}},
  {id:'paySalaries',cat:'op',zh:'支付工资',
    fields:[{k:'what',t:'sel',label:'支付内容',opts:[['expense','本期工资（直接计入费用）'],['payable','以前期间已计提的应付工资']],def:'expense'},F.amt('支付金额'),F.fn('admin',false,p=>p.what!=='payable')],
    hint:(p,ctx)=>p.what==='payable'?`应付职工薪酬当前余额 ${m$(-ctx.bal('2100'))}`:'',
    memo:p=>p.what==='payable'?`支付上期应计工资 ${m$(money(p.amt))}`:`支付${FNZ(p.fn).replace('费用','')}人员工资 ${m$(money(p.amt))}`,
    note:p=>p.what==='payable'?'这笔工资的费用在上一期已经计提，本期付款只减少负债，不再确认费用。':'工资按员工所属部门归入「功能」：销售人员 → 销售费用，行政人员 → 管理费用。按性质列报时它们都叫「员工福利费用」。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[p.what==='payable'?D('2100',a):D('6000',a,p.fn),C('1000',a)]]);}},
  {id:'payExpense',cat:'op',zh:'支付营业费用',
    fields:[{k:'expenseName',t:'text',label:'这是什么费用？',placeholder:'例如：交通费、办公用品、软件订阅费',max:60,full:true},F.amt('金额'),F.pay('cash','赊账（应付账款）'),F.fn('auto',true)],
    memo:p=>`${p.pay==='cash'?'支付':'赊欠'}${expenseSpec(p).name || '费用'} ${m$(money(p.amt))}`,
    note:p=>expenseSpec(p).acct==='6700'?'重组费用列在营业利润内，但未必会重复发生，分析盈利质量时要留意。':expenseSpec(p).entered?'费用名称可自由填写；在损益表选择「按性质」可按名称汇总。':'营业费用按功能归类后列在「营业费用」下。',
    build(p){const e=expenseSpec(p);if(!e.name)return bad('请填写费用名称，例如交通费');if(e.name.length>60)return bad('费用名称最多 60 个字符');const a=money(p.amt);if(!pos(a))return bad();const fn=p.fn==='auto'?ACC[e.acct].fn:p.fn;const d=D(e.acct,a,fn);if(e.entered)d.expenseName=e.name;return ok([[d,C(p.pay==='cash'?'1000':'2000',a)]]);}},
  {id:'prepay',cat:'op',zh:'预付费用',fields:[{k:'what',t:'sel',label:'预付内容',opts:[['insurance','保险费'],['rent','租金']],def:'insurance'},F.amt('预付金额')],
    memo:p=>`预付${p.what==='rent'?'租金':'保险费'} ${m$(money(p.amt))}`,
    note:'预付款是资产（未来受益）。期末再用调整分录把已耗用部分转为费用。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('1300',a),C('1000',a)]]);}},
  {id:'interestRecv',cat:'op',zh:'收到利息',fields:[F.amt('利息金额')],
    memo:p=>`收到利息 ${m$(money(p.amt))}`,
    note:'利息收入列在「其他收益」，不属于营业利润。IFRS 允许收到的利息列为经营或投资活动现金流量，本账本列为经营活动。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('1000',a),C('4500',a)]]);}},
  {id:'payInterest',cat:'op',zh:'支付利息',fields:[{k:'what',t:'sel',label:'支付内容',opts:[['expense','本期利息（直接计入费用）'],['payable','以前期间已计提的应付利息']],def:'expense'},F.amt('利息金额')],
    memo:p=>p.what==='payable'?`支付已计提利息 ${m$(money(p.amt))}`:`支付借款利息 ${m$(money(p.amt))}`,
    note:'利息费用是非经营项目，列在营业利润之后。IFRS 允许支付的利息列为经营或筹资活动，本账本列为经营活动。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D(p.what==='payable'?'2150':'7000',a),C('1000',a)]]);}},
  {id:'payTax',cat:'op',zh:'缴纳所得税',fields:[F.amt('缴税金额')],
    hint:(p,ctx)=>`应交所得税当前余额 ${m$(-ctx.bal('2200'))}（不含本年末自动计提）`,
    memo:p=>`缴纳所得税 ${m$(money(p.amt))}`,
    note:'缴税只是清偿负债。本年的所得税费用在年末按税前利润自动计提。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('2200',a),C('1000',a)]]);}},
  {id:'writeOff',cat:'op',zh:'核销坏账',fields:[F.amt('核销金额')],
    hint:(p,ctx)=>`坏账准备当前余额 ${m$(-ctx.bal('1105'))}`,
    memo:p=>`核销无法收回的应收账款 ${m$(money(p.amt))}`,
    note:'备抵法下，核销只同时冲减坏账准备和应收账款：应收账款净额不变，也不产生费用。费用在计提准备时已经确认。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('1105',a),C('1100',a)]]);}},
  // ---- investing
  {id:'buyPPE',cat:'inv',zh:'购置设备或土地',
    fields:[{k:'acct',t:'sel',label:'资产',opts:[['1510','设备 Equipment'],['1500','土地 Land']],def:'1510'},F.amt('成本'),{k:'pay',t:'sel',label:'支付方式',opts:[['cash','现金'],['note','签发长期应付票据（非现金）']],def:'cash'}],
    memo:p=>`${p.pay==='note'?'签发长期票据':'以现金'}购置${ACC[p.acct].zh} ${m$(money(p.amt))}`,
    note:p=>p.pay==='note'?'没有现金流动，这是「非现金投资及筹资活动」：不进入现金流量表正文，在附注中披露。':'购置长期资产的现金流出属于投资活动。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D(p.acct,a),C(p.pay==='note'?'2500':'1000',a)]]);}},
  {id:'sellPPE',cat:'inv',zh:'出售设备',
    fields:[F.amt('设备原始成本','cost'),F.amt('已提累计折旧','accDep'),F.amt('出售所得现金','proceeds')],
    hint:(p,ctx)=>`账上设备成本 ${m$(ctx.bal('1510'))}，累计折旧 ${m$(-ctx.bal('1515'))}`,
    memo:p=>`出售旧设备，售价 ${m$(money(p.proceeds)||0)}`,
    note:'出售所得全部列为投资活动现金流入。利得或损失不是现金，间接法下要从净利润中剔除。',
    build(p){const c=money(p.cost),d=money(p.accDep)||0,pr=money(p.proceeds)||0;if(!pos(c))return bad('请输入设备成本');if(d<0||pr<0)return bad('金额不能为负');if(d>c)return bad('累计折旧不能超过成本');const bv=c-d,g=pr-bv,L=[];if(pr)L.push(D('1000',pr));if(d)L.push(D('1515',d));if(g<0)L.push(D('7100',-g));L.push(C('1510',c));if(g>0)L.push(C('4600',g));return ok([L],{calc:`账面价值 = ${m$(c)} − ${m$(d)} = ${m$(bv)}；${g>=0?'利得':'损失'} = 售价 ${m$(pr)} − 账面价值 ${m$(bv)} = ${m$(Math.abs(g))}`});}},
  {id:'buyInvest',cat:'inv',zh:'购买 FVOCI 股权投资',fields:[F.amt('投资成本')],
    memo:p=>`购买股权投资（指定为 FVOCI）${m$(money(p.amt))}`,
    note:'指定为 FVOCI 的股权投资，以后的公允价值变动计入 OCI，而且不会重分类到损益。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('1600',a),C('1000',a)]]);}},
  // ---- financing
  {id:'issueShares',cat:'fin',zh:'发行普通股',fields:[{k:'shares',t:'int',label:'发行股数',def:'10000'},F.amt('每股发行价','price')],
    memo:p=>`发行 ${Math.round(num(p.shares)).toLocaleString('en-US')} 股普通股，每股 ${m$(money(p.price))}`,
    note:'股东投入资本记入股本（香港公司股份无面值，全部计入股本）。股数会用来计算加权平均股数和 EPS。',
    build(p){const sh=Math.round(num(p.shares)),pr=money(p.price);if(!(sh>0))return bad('请输入股数');if(!pos(pr))return bad('请输入发行价');const a=sh*pr;return ok([[D('1000',a),C('3000',a)]],{shares:sh,calc:`${sh.toLocaleString('en-US')} 股 × ${m$(pr)} = ${m$(a)}`});}},
  {id:'borrow',cat:'fin',zh:'取得长期借款',fields:[F.amt('借款本金')],
    memo:p=>`取得银行长期借款 ${m$(money(p.amt))}`,note:'借款本金的收付属于筹资活动。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('1000',a),C('2500',a)]]);}},
  {id:'repayLoan',cat:'fin',zh:'偿还借款本金',fields:[F.amt('还款金额')],
    hint:(p,ctx)=>`长期借款当前余额 ${m$(-ctx.bal('2500'))}`,
    memo:p=>`偿还借款本金 ${m$(money(p.amt))}`,note:'偿还本金是筹资活动；利息另记，列为利息费用。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('2500',a),C('1000',a)]]);}},
  {id:'declareDiv',cat:'fin',zh:'宣告现金股利',fields:[F.amt('股利总额')],
    memo:p=>`宣告现金股利 ${m$(money(p.amt))}`,
    note:'股利是对股东的分配，不是费用：不进损益表，而在权益变动表中减少留存收益。宣告当天就产生负债。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('3300',a),C('2400',a)]]);}},
  {id:'payDiv',cat:'fin',zh:'支付股利',fields:[F.amt('支付金额')],
    hint:(p,ctx)=>`应付股利当前余额 ${m$(-ctx.bal('2400'))}`,
    memo:p=>`支付股利 ${m$(money(p.amt))}`,note:'支付股利是筹资活动（IFRS 也允许列为经营活动，本账本列为筹资活动）。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('2400',a),C('1000',a)]]);}},
  // ---- adjusting
  {id:'depreciation',cat:'adj',zh:'计提折旧',
    fields:[{k:'method',t:'sel',label:'计算方式',opts:[['sl','直线法计算'],['manual','直接输入金额']],def:'sl'},
      {k:'cost',t:'money',label:'资产成本',show:p=>p.method==='sl'},{k:'residual',t:'money',label:'预计残值',def:'0',show:p=>p.method==='sl'},
      {k:'life',t:'num',label:'使用年限（年）',def:'5',show:p=>p.method==='sl'},{k:'months',t:'int',label:'本次计提月数',def:'12',show:p=>p.method==='sl'},
      {k:'amt',t:'money',label:'折旧金额',show:p=>p.method==='manual'},F.fn('admin')],
    memo:p=>`计提折旧（${FNZ(p.fn)}）`,
    note:'折旧把资产成本分摊到各受益期间（配比），不涉及现金，所以间接法里要加回。修改使用年限或残值属于会计估计变更，未来适用。',
    build(p){let a,calc='';if(p.method==='manual'){a=money(p.amt);}else{const c=money(p.cost),r=money(p.residual)||0,l=num(p.life),m=num(p.months);if(!pos(c))return bad('请输入资产成本');if(!(l>0))return bad('请输入使用年限');if(!(m>0&&m<=12))return bad('计提月数应在 1–12 之间');a=Math.round((c-r)/l*m/12);calc=`(${m$(c)} − ${m$(r)}) ÷ ${l} 年 × ${m}/12 = ${m$(a)}`;}if(!pos(a))return bad('请输入折旧金额');return ok([[D('6500',a,p.fn),C('1515',a)]],{calc});}},
  {id:'accrueSalaries',cat:'adj',zh:'计提应付工资',fields:[F.amt('已发生未支付的工资'),F.fn('admin')],
    memo:p=>`计提应付工资 ${m$(money(p.amt))}`,
    note:'员工已经提供服务，费用必须计入本期（权责发生制），哪怕下期才付款。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('6000',a,p.fn),C('2100',a)]]);}},
  {id:'accrueInterest',cat:'adj',zh:'计提应付利息',
    fields:[{k:'method',t:'sel',label:'计算方式',opts:[['calc','本金 × 利率 × 时间'],['manual','直接输入金额']],def:'calc'},
      {k:'principal',t:'money',label:'借款本金',show:p=>p.method==='calc'},{k:'rate',t:'num',label:'年利率 %',def:'8',show:p=>p.method==='calc'},{k:'months',t:'int',label:'应计月数',def:'3',show:p=>p.method==='calc'},
      {k:'amt',t:'money',label:'利息金额',show:p=>p.method==='manual'}],
    memo:p=>`计提应付利息`,
    note:'利息随时间发生，期末把已发生、未支付的部分计入费用和负债。',
    build(p){let a,calc='';if(p.method==='manual')a=money(p.amt);else{const pr=money(p.principal),r=num(p.rate),m=num(p.months);if(!pos(pr))return bad('请输入本金');if(!(r>0))return bad('请输入利率');if(!(m>0))return bad('请输入月数');a=Math.round(pr*r/100*m/12);calc=`${m$(pr)} × ${r}% × ${m}/12 = ${m$(a)}`;}if(!pos(a))return bad();return ok([[D('7000',a),C('2150',a)]],{calc});}},
  {id:'accrueIntIncome',cat:'adj',zh:'计提应收利息',fields:[F.amt('已赚取未收到的利息')],
    memo:p=>`计提应收利息 ${m$(money(p.amt))}`,note:'利息已经赚取但还没收到现金：确认收入和应收款。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('1110',a),C('4500',a)]]);}},
  {id:'expirePrepaid',cat:'adj',zh:'预付费用摊销',
    fields:[{k:'acct',t:'sel',label:'转为哪项费用',opts:[['6400','保险费 Insurance'],['6100','租金 Rent']],def:'6400'},
      {k:'method',t:'sel',label:'计算方式',opts:[['ratio','按月份比例'],['manual','直接输入金额']],def:'ratio'},
      {k:'total',t:'money',label:'预付总额',show:p=>p.method==='ratio'},{k:'covered',t:'int',label:'覆盖月数',def:'12',show:p=>p.method==='ratio'},{k:'used',t:'int',label:'本年已耗用月数',def:'8',show:p=>p.method==='ratio'},
      {k:'amt',t:'money',label:'本期费用',show:p=>p.method==='manual'},F.fn('auto',true)],
    hint:(p,ctx)=>`预付费用当前余额 ${m$(ctx.bal('1300'))}`,
    memo:p=>`预付${ACC[p.acct].zh.replace('费用','')}到期部分转为费用`,
    note:'预付款随时间耗用：已耗用部分从资产转为费用，剩余部分仍是资产。',
    build(p){let a,calc='';if(p.method==='manual')a=money(p.amt);else{const t=money(p.total),c=num(p.covered),u=num(p.used);if(!pos(t))return bad('请输入预付总额');if(!(c>0)||!(u>0))return bad('请输入月数');if(u>c)return bad('已耗用月数不能超过覆盖月数');a=Math.round(t*u/c);calc=`${m$(t)} × ${u}/${c} = ${m$(a)}`;}if(!pos(a))return bad();const fn=p.fn==='auto'?ACC[p.acct].fn:p.fn;return ok([[D(p.acct,a,fn),C('1300',a)]],{calc});}},
  {id:'earnUnearned',cat:'adj',zh:'确认已赚取的预收收入',fields:[F.amt('已完成履约的部分')],
    hint:(p,ctx)=>`预收收入当前余额 ${m$(-ctx.bal('2300'))}`,
    memo:p=>`履约完成，预收款转为服务收入 ${m$(money(p.amt))}`,
    note:'履约义务完成时，合同负债转为收入（IFRS 15）。现金早就收到了，这一步不涉及现金。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([[D('2300',a),C('4100',a)]]);}},
  {id:'badDebt',cat:'adj',zh:'计提坏账准备',
    fields:[{k:'method',t:'sel',label:'估计方法',opts:[['pct','应收账款余额百分比法'],['manual','直接输入本期费用']],def:'pct'},
      {k:'pct',t:'num',label:'估计无法收回 %',def:'5',show:p=>p.method==='pct'},{k:'amt',t:'money',label:'本期坏账费用',show:p=>p.method==='manual'},F.fn('admin')],
    hint:(p,ctx)=>`应收账款 ${m$(ctx.bal('1100'))}，坏账准备现有余额 ${m$(-ctx.bal('1105'))}`,
    memo:p=>p.method==='pct'?`按应收账款 ${p.pct}% 计提坏账准备`:'计提坏账准备',
    note:'坏账率是会计估计。估计改变属于会计估计变更，未来适用，不追溯调整。',
    build(p,ctx){let x,calc='';if(p.method==='manual'){x=money(p.amt);if(!pos(x))return bad();}else{const pc=num(p.pct);if(!(pc>=0))return bad('请输入百分比');const ar=ctx.bal('1100'),al=-ctx.bal('1105'),tg=Math.round(ar*pc/100);x=tg-al;calc=`目标准备 = 应收 ${m$(ar)} × ${pc}% = ${m$(tg)}；已有准备 ${m$(al)}；本期应${x>=0?'计提':'冲回'} ${m$(Math.abs(x))}`;if(!x)return bad('准备余额已经等于目标，无需调整');}return ok([x>0?[D('6600',x,p.fn),C('1105',x)]:[D('1105',-x),C('6600',-x,p.fn)]],{calc});}},
  // ---- OCI
  {id:'revalueLand',cat:'oci',adj:true,zh:'土地重估（重估模型）',fields:[F.amt('重估后公允价值','fv')],
    hint:(p,ctx)=>`土地当前账面价值 ${m$(ctx.bal('1500'))}`,
    memo:p=>`土地重估至公允价值 ${m$(money(p.fv))}`,
    note:'IAS 16 重估模型：增值计入 OCI 并累积在「重估盈余」；减值先冲减已有重估盈余，不足部分计入损益。这里 OCI 按税后金额列示，简化处理，不另算递延所得税。',
    build(p,ctx){const fv=money(p.fv);if(!Number.isFinite(fv)||fv<0)return bad('请输入公允价值');const ca=ctx.bal('1500');if(ca<=0)return bad('账上没有土地');const d=fv-ca;if(!d)return bad('公允价值等于账面价值，无需调整');if(d>0)return ok([[D('1500',d),C('9000',d)]],{calc:`重估增值 = ${m$(fv)} − 账面 ${m$(ca)} = ${m$(d)} → 计入 OCI`});const sur=Math.max(-(ctx.bal('3200')+ctx.bal('9000')),0),x=Math.min(-d,sur),y=-d-x,L=[];if(x)L.push(D('9000',x));if(y)L.push(D('6800',y,'other'));L.push(C('1500',-d));return ok([L],{calc:`重估减值 ${m$(-d)}：先冲减已有重估盈余 ${m$(x)}（OCI），其余 ${m$(y)} 计入损益`});}},
  {id:'fvociChange',cat:'oci',adj:true,zh:'FVOCI 投资公允价值变动',fields:[F.amt('期末公允价值','fv')],
    hint:(p,ctx)=>`FVOCI 投资当前账面价值 ${m$(ctx.bal('1600'))}`,
    memo:p=>`FVOCI 投资按期末公允价值 ${m$(money(p.fv))} 计量`,
    note:'未实现持有利得或损失计入 OCI，累积在「公允价值储备」，不影响净利润。这里按税后金额列示。',
    build(p,ctx){const fv=money(p.fv);if(!Number.isFinite(fv)||fv<0)return bad('请输入公允价值');const ca=ctx.bal('1600'),d=fv-ca;if(!d)return bad('公允价值没有变化');return ok([d>0?[D('1600',d),C('9100',d)]:[D('9100',-d),C('1600',-d)]],{calc:`公允价值变动 = ${m$(fv)} − 账面 ${m$(ca)} = ${fmt(d)} → OCI`});}},
  // ---- discontinued operations
  {id:'discOps',cat:'disc',zh:'终止经营部门本期经营损益',
    fields:[{k:'kind',t:'sel',label:'本期结果',opts:[['loss','经营亏损'],['profit','经营利润']],def:'loss'},F.amt('税前金额')],
    memo:p=>`终止经营部门年初至处置日经营${p.kind==='profit'?'利润':'亏损'} ${m$(money(p.amt))}`,
    note:'部门从年初到处置日（或年末）的经营损益，记入终止经营，与持续经营分开。简化：假设以现金结算。',
    build(p){const a=money(p.amt);if(!pos(a))return bad();return ok([p.kind==='profit'?[D('1000',a),C('8500',a)]:[D('8500',a),C('1000',a)]]);}},
  {id:'heldForSale',cat:'disc',zh:'部门资产划分为持有待售',fields:[F.amt('部门设备成本','cost'),F.amt('已提累计折旧','accDep')],
    hint:(p,ctx)=>`账上设备成本 ${m$(ctx.bal('1510'))}，累计折旧 ${m$(-ctx.bal('1515'))}`,
    memo:p=>`管理层决定出售部门，资产转为持有待售`,
    note:'IFRS 5：符合条件的部门资产单独列为「持有待售资产」，按账面价值与公允价值减出售成本孰低计量，并停止计提折旧。',
    build(p){const c=money(p.cost),d=money(p.accDep)||0;if(!pos(c))return bad('请输入成本');if(d>c||d<0)return bad('累计折旧应在 0 与成本之间');return ok([[D('1450',c-d),D('1515',d),C('1510',c)]],{calc:`账面价值 = ${m$(c)} − ${m$(d)} = ${m$(c-d)}`});}},
  {id:'hfsImpair',cat:'disc',adj:true,zh:'持有待售资产减值（年末未售出）',fields:[F.amt('公允价值减出售成本','fvlcs')],
    hint:(p,ctx)=>`持有待售资产当前账面价值 ${m$(ctx.bal('1450'))}`,
    memo:p=>`持有待售资产减记至公允价值减出售成本 ${m$(money(p.fvlcs))}`,
    note:'年末还没卖出：终止经营损益 = 本年经营损益 + 减值损失。',
    build(p,ctx){const f=money(p.fvlcs);if(!Number.isFinite(f)||f<0)return bad('请输入金额');const ca=ctx.bal('1450');if(ca<=0)return bad('没有持有待售资产：请先做「部门资产划分为持有待售」');if(f>=ca)return bad(`公允价值减出售成本 ${m$(f)} ≥ 账面价值 ${m$(ca)}：按孰低计量，不确认减值，也不确认利得（课件的课堂练习就是这种情况）。`);const x=ca-f;return ok([[D('8500',x),C('1450',x)]],{calc:`减值 = 账面 ${m$(ca)} − ${m$(f)} = ${m$(x)}`});}},
  {id:'hfsSell',cat:'disc',zh:'出售终止经营部门资产',fields:[F.amt('出售所得现金','proceeds')],
    hint:(p,ctx)=>`持有待售资产当前账面价值 ${m$(ctx.bal('1450'))}`,
    memo:p=>`出售终止经营部门资产，所得 ${m$(money(p.proceeds))}`,
    note:'已出售：终止经营损益 = 经营损益 + 处置利得/损失，扣税后以单一金额列在持续经营利润之下。',
    build(p,ctx){const pr=money(p.proceeds);if(!Number.isFinite(pr)||pr<0)return bad('请输入出售所得');const ca=ctx.bal('1450');if(ca<=0)return bad('没有持有待售资产：请先做「部门资产划分为持有待售」');const g=pr-ca,L=[];if(pr)L.push(D('1000',pr));if(g<0)L.push(D('8500',-g));L.push(C('1450',ca));if(g>0)L.push(C('8500',g));return ok([L],{calc:`处置${g>=0?'利得':'损失'} = 售价 ${m$(pr)} − 账面价值 ${m$(ca)} = ${m$(Math.abs(g))}（并入终止经营损益）`});}},
];
const partyFields=label=>[{k:'partyId',t:'text',label:`${label}编号`,max:80},{k:'partyName',t:'text',label:`${label}名称`,max:80},{k:'dueDate',t:'date',label:'到期日（选填）'}];
const allocField=(ledger,k='allocations',label='核销分配金额')=>({k,t:'alloc',ledger,label,def:'{}'});
function openBusiness(p,ledger,groups){
  const amount=money(p.amt),partyId=String(p.partyId||'').trim(),partyName=String(p.partyName||'').trim(),dueDate=String(p.dueDate||'').trim();
  if(!pos(amount))return bad('请输入金额');
  if(!partyId||!partyName||partyId.length>80||partyName.length>80)return bad('请填写往来对象编号和名称');
  return ok(groups(amount),{biz:{v:1,events:[{kind:'open',ledger,partyId,partyName,amount,dueDate}]},party:partyName});
}
function applyBusiness(p,ctx,ledger,dr,cr,fn){
  const allocations=Business.parseAlloc(p.allocations);if(!allocations.length)return bad('请为待核销单据填写金额');
  const items=Business.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items;
  const first=items.find(x=>x.id===allocations[0].id&&x.ledger===ledger);if(!first)return bad('关联单据不存在或晚于当前日期');
  const amount=allocations.reduce((n,a)=>n+a.amount,0);if(!Number.isSafeInteger(amount))return bad('金额合计过大');
  return ok([[D(dr,amount,fn),C(cr,amount)]],{biz:{v:1,events:[{kind:'apply',ledger,allocations}]},party:first.partyName,calc:`本次核销 ${allocations.length} 笔单据，合计 ${m$(amount)}`});
}
function returnBusiness(p,ctx,ledger){
  const item=Business.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items.find(x=>x.id===p.sourceId&&x.ledger===ledger);
  if(!item)return bad('请选择关联的原单据');
  if(ledger==='receivable'&&!['customerInvoice','customerCashSale'].includes(item.source.tpl)&&!(item.source.tpl==='salesInvoice'&&item.source.inv?.account==='4100') || ledger==='payable'&&item.source.tpl!=='supplierInvoice')return bad('此原单据类型暂不支持该退款模板');
  const cancel=String(p.cancel||'').trim()?money(p.cancel):0,cash=String(p.cash||'').trim()?money(p.cash):0,total=cancel+cash;
  if(!Number.isSafeInteger(cancel)||!Number.isSafeInteger(cash)||cancel<0||cash<0||!Number.isSafeInteger(total)||!total)return bad('请输入有效的冲减或退款金额');
  const g=[];
  if(ledger==='receivable'){g.push(D('4100',total));if(cancel)g.push(C('1100',cancel));if(cash)g.push(C('1000',cash));}
  else{const original=item.source.groups.flat().find(l=>l.a!=='2000'&&l.s>0);if(!original)return bad('原供应商账单的费用或存货科目无效');if(cancel)g.push(D('2000',cancel));if(cash)g.push(D('1000',cash));g.push(C(original.a,total,original.fn));}
  return ok([g],{biz:{v:1,events:[{kind:'return',ledger,id:item.id,cancel,cash}]},party:item.partyName,calc:`冲减未结 ${m$(cancel)}；现金退款 ${m$(cash)}`});
}
function offsetBusiness(p,ctx,assetLedger,liabilityLedger,assetField,liabilityField,assetAccount,liabilityAccount){
  const a=Business.parseAlloc(p[assetField]),b=Business.parseAlloc(p[liabilityField]);if(!a.length||!b.length)return bad('请分别填写两侧待抵扣单据金额');
  const x=a.reduce((n,v)=>n+v.amount,0),y=b.reduce((n,v)=>n+v.amount,0);if(!Number.isSafeInteger(x)||x!==y)return bad('两侧抵扣金额必须相等');
  const first=Business.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items.find(v=>v.id===a[0].id);if(!first)return bad('预付款单据不存在');
  return ok([[D(liabilityAccount,x),C(assetAccount,x)]],{biz:{v:1,events:[{kind:'apply',ledger:assetLedger,allocations:a},{kind:'apply',ledger:liabilityLedger,allocations:b}]},party:first.partyName,calc:`本次抵扣 ${m$(x)}`});
}
const expenseChoice={k:'expenseAcct',t:'sel',label:'费用或资产科目',opts:[['6900','其他营业费用'],['6100','租金费用'],['6200','广告费用'],['6300','水电费用'],['6400','保险费用'],['1200','存货']],def:'6900'};
const fnChoice=()=>F.fn('admin',false,p=>p.expenseAcct!=='1200');
TEMPLATES.push(
  {id:'customerInvoice',cat:'customer',zh:'客户赊账 / 服务收入',fields:[F.amt('应收服务金额'),...partyFields('客户')],
    memo:p=>`客户 ${p.partyName||''} 赊账服务 ${m$(money(p.amt))}`,note:'在服务已履行时确认收入；按客户和单据跟踪尚未收回的金额。',
    build:p=>openBusiness(p,'receivable',a=>[[D('1100',a),C('4100',a)]])},
  {id:'salesInvoice',cat:'customer',dialogOnly:true,zh:'销售发票（自动记应收与收入）',
    fields:[{k:'invNo',t:'text',label:'发票号',max:40},{k:'account',t:'sel',label:'收入科目',opts:Object.entries(Invoices.REVENUE),def:'4100'},{k:'lines',t:'text',label:'发票明细',def:'[]'},...partyFields('客户')],
    memo:p=>`销售发票 ${p.invNo||''} · ${p.partyName||''}`,note:'开出发票即确认收入并建立客户应收；收款时用「客户收款并核销」冲减。',
    build(p,ctx){
      const no=String(p.invNo||'').trim(),partyId=String(p.partyId||'').trim(),partyName=String(p.partyName||'').trim(),dueDate=String(p.dueDate||'').trim();
      if(!partyId||!partyName||partyId.length>80||partyName.length>80)return bad('请填写客户编号和名称');
      if(!no||no.length>40)return bad('请填写发票号（最多 40 个字符）');
      if(!Object.hasOwn(Invoices.REVENUE,p.account))return bad('请选择收入科目');
      if(Invoices.numberTaken(ctx.book,no,ctx.excludeId))return bad(`发票号 ${no} 已存在，请更换`);
      if(dueDate&&dueDate<p.date)return bad('到期日不能早于开票日期');
      let parsed;try{parsed=Invoices.parseLines(p.lines);}catch(e){return bad(e.message);}
      return ok([[D('1100',parsed.total),C(p.account,parsed.total)]],{biz:{v:1,events:[{kind:'open',ledger:'receivable',partyId,partyName,amount:parsed.total,dueDate}]},
        inv:{v:1,no,account:p.account,...Invoices.invoiceHeader(p),lines:parsed.lines},party:partyName,calc:`${parsed.lines.length} 行明细，合计 ${m$(parsed.total)}`});}},
  {id:'customerCashSale',cat:'customer',zh:'客户服务现收款',fields:[F.amt('服务实收金额'),...partyFields('客户')],
    memo:p=>`客户 ${p.partyName||''} 服务现收 ${m$(money(p.amt))}`,note:'服务已经履行并收到款项，保留客户和原单据以便后续退款追溯。',
    build(p){const a=money(p.amt),partyId=String(p.partyId||'').trim(),partyName=String(p.partyName||'').trim();if(!pos(a)||!partyId||!partyName)return bad('请填写金额、客户编号和名称');
      return ok([[D('1000',a),C('4100',a)]],{biz:{v:1,events:[{kind:'open',ledger:'receivable',partyId,partyName,amount:a,dueDate:p.dueDate||''},{kind:'apply',ledger:'receivable',allocations:[{id:'$self:0',amount:a}]}]},party:partyName});}},
  {id:'customerReceipt',cat:'customer',zh:'客户收款并核销',fields:[allocField('receivable'),{k:'paymentMethod',t:'text',max:60,label:'付款方式（选填）'}],
    memo:()=>`收取并核销客户应收款`,note:'一笔收款可分配到同一客户的多张应收单据；允许部分核销。',
    build:(p,ctx)=>applyBusiness(p,ctx,'receivable','1000','1100')},
  {id:'customerRefund',cat:'customer',zh:'客户服务退款 / 冲减应收',fields:[{k:'sourceId',t:'businessDoc',ledger:'receivable',label:'关联原销售凭证'},F.amt('冲减尚未收回的应收','cancel'),F.amt('实际退回客户款项','cash')],
    memo:()=>`客户服务退款或冲减应收`,note:'根据原销售、收款及退款单据填写；涉及税费或已确认服务的具体处理须另行审核。',
    build:(p,ctx)=>returnBusiness(p,ctx,'receivable')},
  {id:'customerDeposit',cat:'customer',zh:'预收客户款并建明细',fields:[F.amt('预收金额'),...partyFields('客户')],
    memo:p=>`预收客户 ${p.partyName||''} 款项 ${m$(money(p.amt))}`,note:'服务尚未履行时先记录合同负债。',
    build:p=>openBusiness(p,'customerAdvance',a=>[[D('1000',a),C('2300',a)]])},
  {id:'customerDepositUse',cat:'customer',zh:'预收款转服务收入',fields:[allocField('customerAdvance')],
    memo:()=>`客户预收款履约转收入`,note:'服务实际履行时，选择对应预收单据冲减合同负债。',
    build:(p,ctx)=>applyBusiness(p,ctx,'customerAdvance','2300','4100')},
  {id:'supplierInvoice',cat:'supplier',zh:'供应商账单 / 赊购',fields:[F.amt('应付金额'),expenseChoice,fnChoice(),...partyFields('供应商')],
    memo:p=>`供应商 ${p.partyName||''} 账单 ${m$(money(p.amt))}`,note:'按实际收到的货物或服务确认存货或费用，并建立应付明细。',
    build:p=>openBusiness(p,'payable',a=>[[D(p.expenseAcct,a,p.expenseAcct==='1200'?undefined:p.fn),C('2000',a)]])},
  {id:'supplierPayment',cat:'supplier',zh:'供应商付款并核销',fields:[allocField('payable')],
    memo:()=>`支付并核销供应商应付款`,note:'一笔付款可分配到同一供应商的多张账单；允许部分核销。',
    build:(p,ctx)=>applyBusiness(p,ctx,'payable','2000','1000')},
  {id:'supplierRefund',cat:'supplier',zh:'供应商退款 / 冲减应付',fields:[{k:'sourceId',t:'businessDoc',ledger:'payable',label:'关联原供应商账单'},F.amt('冲减尚未支付的应付','cancel'),F.amt('实际收到供应商退款','cash')],
    memo:()=>`供应商退款或冲减应付`,note:'按原账单费用或存货科目冲回，现金退款不超过该单据已直接支付的金额。',
    build:(p,ctx)=>returnBusiness(p,ctx,'payable')},
  {id:'supplierDeposit',cat:'supplier',zh:'预付供应商款',fields:[F.amt('预付金额'),...partyFields('供应商')],
    memo:p=>`预付供应商 ${p.partyName||''} 款项 ${m$(money(p.amt))}`,note:'预付货款先列为资产，后续与相关账单核对。',
    build:p=>openBusiness(p,'supplierAdvance',a=>[[D('1350',a),C('1000',a)]])},
  {id:'supplierDepositOffset',cat:'supplier',zh:'供应商预付款抵应付',fields:[allocField('supplierAdvance','advances','选择预付款金额'),allocField('payable','bills','选择应付账单金额')],
    memo:()=>`供应商预付款抵应付账单`,note:'选择同一供应商的预付款和账单，两边核销金额应一致。',
    build(p,ctx){const a=Business.parseAlloc(p.advances),b=Business.parseAlloc(p.bills);if(!a.length||!b.length)return bad('请分别填写预付款和应付账单的核销金额');
      const x=a.reduce((n,v)=>n+v.amount,0),y=b.reduce((n,v)=>n+v.amount,0);if(!Number.isSafeInteger(x)||x!==y)return bad('预付款与账单核销金额必须相等');
      const first=Business.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items.find(v=>v.id===a[0].id);if(!first)return bad('预付款单据不存在');
      return ok([[D('2000',x),C('1350',x)]],{biz:{v:1,events:[{kind:'apply',ledger:'supplierAdvance',allocations:a},{kind:'apply',ledger:'payable',allocations:b}]},party:first.partyName,calc:`预付款抵应付 ${m$(x)}`});}},
  {id:'staffAdvance',cat:'staff',zh:'员工预借款',fields:[F.amt('借支金额'),...partyFields('员工')],
    memo:p=>`员工 ${p.partyName||''} 预借款 ${m$(money(p.amt))}`,note:'借支先形成员工往来款，后续报销抵扣或退回。',
    build:p=>openBusiness(p,'staffAdvance',a=>[[D('1150',a),C('1000',a)]])},
  {id:'staffAdvanceReturn',cat:'staff',zh:'员工退回借支',fields:[allocField('staffAdvance')],
    memo:()=>`员工退回未使用借支`,note:'关联员工借支单据，可部分退回。',
    build:(p,ctx)=>applyBusiness(p,ctx,'staffAdvance','1000','1150')},
  {id:'staffAdvanceExpense',cat:'staff',zh:'报销抵扣员工借支',fields:[allocField('staffAdvance'),expenseChoice,fnChoice()],
    memo:()=>`员工报销抵扣借支`,note:'按已审核报销金额冲减原借支；超过借支的部分另行记录员工报销。',
    build:(p,ctx)=>applyBusiness(p,ctx,'staffAdvance',p.expenseAcct,'1150',p.expenseAcct==='1200'?undefined:p.fn)},
  {id:'staffClaimWithAdvance',cat:'staff',zh:'员工报销并结算借支差额',fields:[F.amt('已审核报销总额'),allocField('staffAdvance'),expenseChoice,fnChoice()],
    memo:()=>`员工报销并结算借支`,note:'报销金额超过抵扣借支的部分，自动形成应付员工报销款；未使用借支可另行退回。',
    build(p,ctx){const gross=money(p.amt),allocations=Business.parseAlloc(p.allocations);if(!pos(gross)||!allocations.length)return bad('请填写报销总额和借支抵扣金额');
      const used=allocations.reduce((n,v)=>n+v.amount,0);if(!Number.isSafeInteger(used)||used>gross)return bad('借支抵扣金额不能超过报销总额');
      const first=Business.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items.find(v=>v.id===allocations[0].id);if(!first)return bad('借支单据不存在');
      const due=gross-used,events=[{kind:'apply',ledger:'staffAdvance',allocations}],g=[D(p.expenseAcct,gross,p.expenseAcct==='1200'?undefined:p.fn),C('1150',used)];
      if(due){events.push({kind:'open',ledger:'staffPayable',partyId:first.partyId,partyName:first.partyName,amount:due,dueDate:''});g.push(C('2060',due));}
      return ok([g],{biz:{v:1,events},party:first.partyName,calc:`报销 ${m$(gross)} − 抵扣借支 ${m$(used)} = 应付员工 ${m$(due)}`});}},
  {id:'staffClaim',cat:'staff',zh:'员工垫付 / 报销登记',fields:[F.amt('已审核报销金额'),expenseChoice,fnChoice(),...partyFields('员工')],
    memo:p=>`员工 ${p.partyName||''} 垫付报销 ${m$(money(p.amt))}`,note:'确认费用或资产，并记为应付该员工的报销款。',
    build:p=>openBusiness(p,'staffPayable',a=>[[D(p.expenseAcct,a,p.expenseAcct==='1200'?undefined:p.fn),C('2060',a)]])},
  {id:'staffClaimPay',cat:'staff',zh:'支付员工报销',fields:[allocField('staffPayable')],
    memo:()=>`支付员工报销款`,note:'关联报销单，可部分支付，付款时不重复确认费用。',
    build:(p,ctx)=>applyBusiness(p,ctx,'staffPayable','2060','1000')},
  {id:'cashTransfer',cat:'op',zh:'资金账户内部转账',fields:[F.amt('转账金额'),{k:'fromCash',t:'cashAccount',label:'转出账户'},{k:'toCash',t:'cashAccount',label:'转入账户'}],
    memo:p=>`资金账户内部转账 ${m$(money(p.amt))}`,note:'两个账户均属于本企业现金及现金等价物时，内部转账不产生收入或费用。',
    build(p,ctx){const a=money(p.amt),ids=Bank.accounts(ctx.book).map(x=>x.id);if(!pos(a)||!ids.includes(p.fromCash)||!ids.includes(p.toCash)||p.fromCash===p.toCash)return bad('请输入金额，并选择不同的转出和转入账户');
      return ok([[{...D('1000',a),cashAccount:p.toCash},{...C('1000',a),cashAccount:p.fromCash}]]);}},
  {id:'bankFee',cat:'op',zh:'银行 / 支付平台手续费',fields:[F.amt('手续费金额'),F.fn('admin')],
    memo:p=>`支付银行或支付平台手续费 ${m$(money(p.amt))}`,note:'按手续费单据确认费用；应收平台结算款等不属于本模板。',
    build(p){const a=money(p.amt);if(!pos(a))return bad('请输入手续费金额');return ok([[D('6900',a,p.fn),C('1000',a)]]);}},
  {id:'hkPayroll',cat:'hk',zh:'香港工资及强积金计提',fields:[F.amt('本期工资总额'),...partyFields('员工'),F.fn('admin'),
    {k:'mpfMode',t:'sel',label:'强积金处理',opts:[['manual','手工核定'],['monthly','一般按月雇员（标准规则）'],['holiday','供款假期（仅雇主部分）'],['none','不适用 / 无供款']],def:'manual'},
    {...F.amt('强积金相关入息','mpfBase'),show:p=>['monthly','holiday'].includes(p.mpfMode)},
    {...F.amt('雇主供款','employerMpf'),show:p=>p.mpfMode==='manual'}, {...F.amt('员工供款','employeeMpf'),show:p=>p.mpfMode==='manual'}],
    memo:p=>`香港员工 ${p.partyName||''} 工资与强积金计提`,
    note:'标准计算仅适用于符合条件的按月雇员；入职供款假期、非月薪、豁免及自愿供款等须按实际选择或手工核定。香港薪俸税不默认从月薪代扣。',
    build(p){const gross=money(p.amt),partyId=String(p.partyId||'').trim(),partyName=String(p.partyName||'').trim();if(!pos(gross)||!partyId||!partyName)return bad('请填写工资总额和员工编号、姓名');
      let er=0,ee=0;if(['monthly','holiday'].includes(p.mpfMode)){const base=money(p.mpfBase);if(!Number.isSafeInteger(base)||base<0)return bad('请填写有效的强积金相关入息');const mpf=Business.monthlyMpf(base,p.mpfMode==='holiday');er=mpf.employer;ee=mpf.employee;}
      else if(p.mpfMode==='manual'){er=String(p.employerMpf||'').trim()?money(p.employerMpf):0;ee=String(p.employeeMpf||'').trim()?money(p.employeeMpf):0;}
      if(!Number.isSafeInteger(er)||!Number.isSafeInteger(ee)||er<0||ee<0||ee>gross||!Number.isSafeInteger(gross+er)||!Number.isSafeInteger(er+ee))return bad('强积金金额无效，员工供款不得超过工资总额');
      const net=gross-ee,events=[],g=[D('6000',gross+er,p.fn)];if(net){g.push(C('2100',net));events.push({kind:'open',ledger:'payroll',partyId,partyName,amount:net,dueDate:p.dueDate||''});}
      if(er+ee){g.push(C('2070',er+ee));events.push({kind:'open',ledger:'mpfPayable',partyId,partyName,amount:er+ee,dueDate:p.dueDate||''});}
      return ok([g],{biz:{v:1,events},party:partyName,calc:`工资 ${m$(gross)}；员工强积金 ${m$(ee)}；雇主强积金 ${m$(er)}；应付工资 ${m$(net)}。`});}},
  {id:'hkPayrollPay',cat:'hk',zh:'支付香港员工工资',fields:[allocField('payroll')],memo:()=>`支付已计提员工工资`,note:'关联应付工资单据；按实际支付金额核销。',build:(p,ctx)=>applyBusiness(p,ctx,'payroll','2100','1000')},
  {id:'hkMpfPay',cat:'hk',zh:'缴付强积金',fields:[allocField('mpfPayable')],memo:()=>`缴付已计提强积金`,note:'按员工和供款单据核销；缴付金额及日期须与平台记录核对。',build:(p,ctx)=>applyBusiness(p,ctx,'mpfPayable','2070','1000')},
  {id:'hkProfitsTaxAccrue',cat:'hk',zh:'香港利得税计提',fields:[F.amt('已核定 / 审核的本期利得税金额'),{k:'taxYear',t:'text',label:'课税年度（例如 2026/27）',max:20},{k:'dueDate',t:'date',label:'到期日（选填）'}],
    memo:p=>`香港利得税 ${p.taxYear||''} 计提 ${m$(money(p.amt))}`,
    note:'填写经税务调整并核定的金额；会计利润不等于应评税利润。适用税率、宽减、暂缴税及递延税须另行核对。',
    build(p,ctx){const a=money(p.amt),year=String(p.taxYear||'').trim();if(ctx.book.settings.autoTax)return bad('请先关闭账本年末自动计税，避免重复计提');if(!pos(a)||!/^\d{4}\/\d{2}$/.test(year))return bad('请填写利得税金额和课税年度，例如 2026/27');
      return ok([[D('8000',a),C('2200',a)]],{biz:{v:1,events:[{kind:'open',ledger:'profitsTax',partyId:'HK-IRD',partyName:'香港税务局',amount:a,dueDate:p.dueDate||''}]},party:'香港税务局'});}},
  {id:'hkProfitsTaxPay',cat:'hk',zh:'缴付已计提香港利得税',fields:[allocField('profitsTax')],memo:()=>`缴付已计提香港利得税`,note:'按税单关联应付金额；暂缴税及预付款不应误当作本模板中的应付税。',build:(p,ctx)=>applyBusiness(p,ctx,'profitsTax','2200','1000')},
  {id:'hkProfitsTaxEstimate',cat:'hk',zh:'按应评税利润估算香港公司利得税',fields:[F.amt('经核对的应评税利润'),{k:'taxYear',t:'text',label:'课税年度（例如 2026/27）',max:20},{k:'regime',t:'sel',label:'适用税率（需自行确认资格）',opts:[['standard','公司标准税率 16.5%'],['two','符合两级制：首 200 万 8.25%，其余 16.5%']],def:'standard'},{k:'dueDate',t:'date',label:'到期日（选填）'}],
    memo:p=>`香港利得税 ${p.taxYear||''} 估算计提`,note:'仅按输入的应评税利润和所选公司税率估算，未处理宽减、暂缴、抵免、亏损或特殊税率；资格及税单须人工核对。',
    build(p,ctx){const profit=money(p.amt),year=String(p.taxYear||'').trim();if(ctx.book.settings.autoTax)return bad('请先关闭账本年末自动计税，避免重复计提');if(!pos(profit)||!/^\d{4}\/\d{2}$/.test(year))return bad('请填写应评税利润和课税年度');
      const first=p.regime==='two'?Math.min(profit,200000000):0,a=Member.commission(first,825)+Member.commission(profit-first,1650);if(!pos(a))return bad('估算税额为零，无需计提');
      return ok([[D('8000',a),C('2200',a)]],{biz:{v:1,events:[{kind:'open',ledger:'profitsTax',partyId:'HK-IRD',partyName:'香港税务局',amount:a,dueDate:p.dueDate||''}]},party:'香港税务局',calc:`应评税利润 ${m$(profit)}；估算利得税 ${m$(a)}，须核对税单及适用资格。`});}},
  {id:'hkTaxPrepay',cat:'hk',zh:'缴付香港暂缴利得税',fields:[F.amt('暂缴金额'),{k:'dueDate',t:'date',label:'到期日（选填）'}],
    memo:()=>`缴付香港暂缴利得税`,note:'按实际税单记为预付税款，待最终应付税额核定后再关联抵扣。',
    build:p=>openBusiness({...p,partyId:'HK-IRD',partyName:'香港税务局'},'taxPrepayment',a=>[[D('1360',a),C('1000',a)]])},
  {id:'hkTaxOffset',cat:'hk',zh:'暂缴利得税抵应付税',fields:[allocField('taxPrepayment','prepaidTax','预付税款抵扣'),allocField('profitsTax','taxBills','应付税款抵扣')],
    memo:()=>`暂缴利得税抵应付税款`,note:'按最终税单及抵扣结果核对，两侧金额应一致。',build:(p,ctx)=>offsetBusiness(p,ctx,'taxPrepayment','profitsTax','prepaidTax','taxBills','1360','2200')},
  {id:'prepaidExpenseDetail',cat:'op',zh:'预付费用并建明细',fields:[F.amt('预付金额'),...partyFields('供应商')],memo:p=>`预付 ${p.partyName||''} 费用`,note:'先记预付费用，再按实际受益期间分次摊销。',build:p=>openBusiness(p,'deferredExpense',a=>[[D('1300',a),C('1000',a)]])},
  {id:'prepaidExpenseUse',cat:'adj',zh:'按单摊销预付费用',fields:[allocField('deferredExpense'),expenseChoice,fnChoice()],memo:()=>`摊销已耗用预付费用`,note:'按受益期间和已核对金额冲减预付费用。',build:(p,ctx)=>applyBusiness(p,ctx,'deferredExpense',p.expenseAcct,'1300',p.expenseAcct==='1200'?undefined:p.fn)},
  {id:'accruedExpenseDetail',cat:'adj',zh:'计提尚未支付的营业费用',fields:[F.amt('本期应计金额'),expenseChoice,fnChoice(),...partyFields('供应商')],memo:p=>`计提 ${p.partyName||''} 未付费用`,note:'按已发生未支付的费用和单据确认应计负债。',build:p=>openBusiness(p,'accruedExpense',a=>[[D(p.expenseAcct,a,p.expenseAcct==='1200'?undefined:p.fn),C('2080',a)]])},
  {id:'accruedExpensePay',cat:'op',zh:'支付已计提营业费用',fields:[allocField('accruedExpense')],memo:()=>`支付已计提营业费用`,note:'关联已计提费用，不再重复确认费用。',build:(p,ctx)=>applyBusiness(p,ctx,'accruedExpense','2080','1000')},
  {id:'loanDrawDetail',cat:'fin',zh:'取得长期借款并建明细',fields:[F.amt('借款本金'),...partyFields('贷款方')],memo:p=>`取得 ${p.partyName||''} 长期借款`,note:'按借款合同及到账记录建明细；短期借款或其他金融负债需另行分类。',build:p=>openBusiness(p,'borrowing',a=>[[D('1000',a),C('2500',a)]])},
  {id:'loanPrincipalPay',cat:'fin',zh:'偿还借款本金并核销',fields:[allocField('borrowing')],memo:()=>`偿还已关联借款本金`,note:'按借款合同和还款记录核销本金，利息另行处理。',build:(p,ctx)=>applyBusiness(p,ctx,'borrowing','2500','1000')},
  {id:'loanInterestAccrue',cat:'adj',zh:'按借款合同计提利息',fields:[{k:'sourceId',t:'businessDoc',ledger:'borrowing',label:'关联借款合同'},F.amt('本期核定利息')],memo:p=>`借款合同 ${p.sourceId||''} 计提利息`,note:'利息按合同、实际利率和计息期间核对后填写；本金与利息分别管理。',
    build(p,ctx){const item=Business.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items.find(x=>x.id===p.sourceId&&x.ledger==='borrowing'),a=money(p.amt);if(!item||!pos(a))return bad('请选择借款合同并填写利息');return ok([[D('7000',a),C('2150',a)]],{biz:{v:1,contractId:item.id,events:[{kind:'open',ledger:'loanInterest',partyId:item.partyId,partyName:item.partyName,amount:a,dueDate:''}]},party:item.partyName});}},
  {id:'loanInterestPay',cat:'fin',zh:'支付已计提借款利息',fields:[allocField('loanInterest')],memo:()=>`支付已计提借款利息`,note:'按已计提利息单据核销；现金流分类沿用本账本的经营活动口径。',build:(p,ctx)=>applyBusiness(p,ctx,'loanInterest','2150','1000')},
  {id:'stockPurchase',cat:'stock',zh:'商品采购入库',fields:[F.amt('入库总成本'),{k:'sku',t:'text',label:'商品编号',max:80},{k:'itemName',t:'text',label:'商品名称',max:80},{k:'qty',t:'num',label:'入库数量'},F.pay('cash','赊购（应付供应商）'),...partyFields('供应商')],
    memo:p=>`商品 ${p.sku||''} 采购入库`,note:'按实收货物入库；赊购时同时建立供应商应付单据。',
    build(p){const a=money(p.amt),qty=Stock.quantity(p.qty),sku=String(p.sku||'').trim(),name=String(p.itemName||'').trim(),partyId=String(p.partyId||'').trim(),partyName=String(p.partyName||'').trim();
      if(!pos(a)||!sku||!name)return bad('请填写入库成本、商品编号和名称');if(p.pay==='credit'&&(!partyId||!partyName))return bad('赊购请填写供应商编号和名称');
      const extra={stock:{v:1,kind:'purchase',sku,name,qty,cost:a},party:partyName};if(p.pay==='credit')extra.biz={v:1,events:[{kind:'open',ledger:'payable',partyId,partyName,amount:a,dueDate:p.dueDate||''}]};
      return ok([[D('1200',a),C(p.pay==='credit'?'2000':'1000',a)]],extra);}},
  {id:'stockSale',cat:'stock',zh:'商品销售出库',fields:[{k:'sku',t:'stockItem',label:'商品'}, {k:'qty',t:'num',label:'销售数量'},F.amt('销售金额'),F.pay('cash','赊销（应收客户）'),...partyFields('客户')],
    memo:p=>`商品 ${p.sku||''} 销售出库`,note:'按移动加权平均成本结转；现收或赊销均关联客户单据。',
    build(p,ctx){const a=money(p.amt),qty=Stock.quantity(p.qty),item=Stock.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items.find(x=>Stock.key(x.sku)===Stock.key(p.sku)),partyId=String(p.partyId||'').trim(),partyName=String(p.partyName||'').trim();
      if(!item||qty>item.qty)return bad('请选择有足够库存的商品');if(!pos(a)||!partyId||!partyName)return bad('请填写销售金额、客户编号和名称');const cost=Stock.portion(item.cost,qty,item.qty);
      const events=[{kind:'open',ledger:'receivable',partyId,partyName,amount:a,dueDate:p.dueDate||''}];if(p.pay==='cash')events.push({kind:'apply',ledger:'receivable',allocations:[{id:'$self:0',amount:a}]});
      const groups=[[D(p.pay==='cash'?'1000':'1100',a),C('4000',a)]];if(cost)groups.push([D('5000',cost,'cos'),C('1200',cost)]);
      return ok(groups,{stock:{v:1,kind:'sale',sku:item.sku,name:item.name,qty,cost},biz:{v:1,events},party:partyName,calc:`本次结转商品成本 ${m$(cost)}`});}},
  {id:'stockReturn',cat:'stock',zh:'商品销售退货',fields:[{k:'saleId',t:'stockSale',label:'关联原销售凭证'},{k:'qty',t:'num',label:'退回数量'},F.amt('冲减未收款','cancel'),F.amt('实际退回现金','cash')],
    memo:p=>`商品销售凭证 ${p.saleId||''} 退货`,note:'按原销售成本比例恢复存货；退款和应收冲减须按原单核对。',
    build(p,ctx){const state=Stock.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date),sale=state.sales.find(x=>x.txn.id===p.saleId);if(!sale)return bad('请选择原销售凭证');const qty=Stock.quantity(p.qty),cumulative=sale.returned+qty;if(cumulative>sale.qty)return bad('退货数量超过原销售数量');
      const cost=Stock.portion(sale.cost,cumulative,sale.qty)-sale.returnedCost,cancel=String(p.cancel||'').trim()?money(p.cancel):0,cash=String(p.cash||'').trim()?money(p.cash):0,total=cancel+cash;
      if(!Number.isSafeInteger(cancel)||!Number.isSafeInteger(cash)||cancel<0||cash<0||!Number.isSafeInteger(total)||!total)return bad('请填写有效的应收冲减或现金退款');
      const g=[D('4000',total)];if(cancel)g.push(C('1100',cancel));if(cash)g.push(C('1000',cash));const groups=[g];if(cost)groups.push([D('1200',cost),C('5000',cost,'cos')]);
      return ok(groups,{stock:{v:1,kind:'return',sku:sale.txn.stock.sku,name:sale.txn.stock.name,qty,cost,saleId:sale.txn.id},biz:{v:1,events:[{kind:'return',ledger:'receivable',id:sale.txn.id+':0',cancel,cash}]},party:sale.txn.party,calc:`退货恢复存货成本 ${m$(cost)}`});}},
  {id:'stockGain',cat:'stock',zh:'商品盘盈入库',fields:[{k:'sku',t:'stockItem',label:'商品'}, {k:'qty',t:'num',label:'盘盈数量'},F.amt('经核定的入库成本')],
    memo:p=>`商品 ${p.sku||''} 盘盈`,note:'根据盘点与审批资料，使用经核定的成本；税务及特殊损益分类须另行审核。',
    build(p,ctx){const item=Stock.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items.find(x=>Stock.key(x.sku)===Stock.key(p.sku)),qty=Stock.quantity(p.qty),cost=money(p.amt);if(!item||!pos(cost))return bad('请选择商品并填写核定成本');return ok([[D('1200',cost),C('4700',cost)]],{stock:{v:1,kind:'gain',sku:item.sku,name:item.name,qty,cost}});}},
  {id:'stockLoss',cat:'stock',zh:'商品盘亏出库',fields:[{k:'sku',t:'stockItem',label:'商品'},{k:'qty',t:'num',label:'盘亏数量'}],
    memo:p=>`商品 ${p.sku||''} 盘亏`,note:'按移动加权平均成本结转盘亏；赔偿、保险及税费另行处理。',
    build(p,ctx){const item=Stock.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).items.find(x=>Stock.key(x.sku)===Stock.key(p.sku)),qty=Stock.quantity(p.qty);if(!item||qty>item.qty)return bad('请选择有足够库存的商品');const cost=Stock.portion(item.cost,qty,item.qty);if(!cost)return bad('盘亏成本为零，请人工核对');return ok([[D('6900',cost,'other'),C('1200',cost)]],{stock:{v:1,kind:'loss',sku:item.sku,name:item.name,qty,cost},calc:`盘亏成本 ${m$(cost)}`});}},
  {id:'assetPurchase',cat:'inv',zh:'固定资产购置并建卡',fields:[F.amt('资产原价'),{k:'assetCode',t:'text',label:'资产编号',max:80},{k:'assetName',t:'text',label:'资产名称',max:80},{k:'life',t:'int',label:'预计使用月数'},F.amt('预计残值（可填 0）','residual'),{k:'firstMonth',t:'text',label:'首次计提折旧月份（YYYY-MM）',placeholder:'例如 2026-02'},F.pay('cash','赊购（应付供应商）'),...partyFields('供应商')],
    memo:p=>`固定资产 ${p.assetName||''} 购置建卡`,note:'按已核定原价和折旧政策建卡。首次折旧月份由会计确认；土地、特殊折旧及税费另行处理。',
    build(p){const cost=money(p.amt),residual=money(p.residual),life=Number(p.life),code=String(p.assetCode||'').trim(),name=String(p.assetName||'').trim(),firstMonth=String(p.firstMonth||'').trim(),partyId=String(p.partyId||'').trim(),partyName=String(p.partyName||'').trim();
      if(!pos(cost)||!Number.isSafeInteger(residual)||residual<0||residual>cost||!Number.isInteger(life)||life<1||life>1200||!code||!name||!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstMonth))return bad('请填写有效的资产编号、原价、残值、月数和折旧起算月份');
      if(p.pay==='credit'&&(!partyId||!partyName))return bad('赊购请填写供应商编号和名称');
      const extra={asset:{v:1,kind:'purchase',code,name,cost,residual,life,firstMonth},party:partyName};if(p.pay==='credit')extra.biz={v:1,events:[{kind:'open',ledger:'payable',partyId,partyName,amount:cost,dueDate:p.dueDate||''}]};
      return ok([[D('1510',cost),C(p.pay==='credit'?'2000':'1000',cost)]],extra);}},
  {id:'assetDepreciation',cat:'inv',zh:'固定资产按月计提折旧',fields:[{k:'sourceId',t:'assetItem',label:'资产卡片'},F.fn('admin')],
    memo:p=>`固定资产 ${p.sourceId||''} 本月折旧`,note:'按资产卡片的原价、预计残值和使用月数计算直线法折旧；请按月份依次计提。',
    build(p,ctx){const asset=Assets.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).assets.find(x=>x.txn.id===p.sourceId);if(!asset||asset.disposal)return bad('请选择尚未处置的资产');
      const start=Number(asset.firstMonth.slice(0,4))*12+Number(asset.firstMonth.slice(5,7))-1,now=Number(p.date.slice(0,4))*12+Number(p.date.slice(5,7))-1,n=now-start+1;if(!Number.isInteger(n)||n<1||n>asset.life)return bad('此日期不在资产折旧期间');
      const a=Assets.monthly(asset,n);if(!pos(a))return bad('本期折旧为零，无需凭证');return ok([[D('6500',a,p.fn),C('1515',a)]],{asset:{v:1,kind:'depreciation',sourceId:asset.txn.id,amount:a},calc:`第 ${n} / ${asset.life} 月折旧 ${m$(a)}`});}},
  {id:'assetDisposal',cat:'inv',zh:'固定资产出售 / 报废',fields:[{k:'sourceId',t:'assetItem',label:'资产卡片'},F.amt('处置收款（报废可填 0）','proceeds')],
    memo:p=>`固定资产 ${p.sourceId||''} 处置`,note:'按资产卡片的累计折旧计算处置损益；入账前请核对截至处置日的折旧、税费及相关费用。',
    build(p,ctx){const asset=Assets.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date).assets.find(x=>x.txn.id===p.sourceId),proceeds=money(p.proceeds);if(!asset||asset.disposal)return bad('请选择尚未处置的资产');if(!Number.isSafeInteger(proceeds)||proceeds<0)return bad('请输入有效处置收款');
      const gain=proceeds-(asset.cost-asset.depreciation),g=[];if(proceeds)g.push(D('1000',proceeds));if(asset.depreciation)g.push(D('1515',asset.depreciation));if(gain<0)g.push(D('7100',-gain));g.push(C('1510',asset.cost));if(gain>0)g.push(C('4600',gain));
      return ok([g],{asset:{v:1,kind:'disposal',sourceId:asset.txn.id,proceeds},calc:`处置前账面价值 ${m$(asset.cost-asset.depreciation)}；${gain>=0?'利得':'损失'} ${m$(Math.abs(gain))}`});}},
);
const TPL = {}; TEMPLATES.forEach(t => TPL[t.id] = t);
const isAdjTpl = t => t.cat === 'adj' || t.adj === true;
const noteOf = (t, p) => typeof t.note === 'function' ? t.note(p) : (t.note || '');

/* ================= state ================= */
let S, R, TRACES = [], storedLedger = null;
const REPORT_PAGES = {
  reports:['财报总览','先看收入、利润、现金和资产负债，再打开明细报表。'],
  pl:['利润表','核对收入、成本、费用及其他综合收益，可点数字追溯凭证。'],
  sfp:['资产负债表','查看期末资产、负债和权益，与上年末余额对照。'],
  scf:['现金流量表','查看经营、投资和筹资现金流，并与期末现金余额核对。'],
  soce:['权益变动表','查看股本、留存收益和各项储备如何从期初变到期末。'],
  analysis:['月度分析','按月比较营收、净利润、净现金变动与月末现金。'],
  custom:['管理报表草稿','从账本生成经营损益草稿，也可以独立编辑项目和口径。'],
};
const OTHER_PAGES = {
  home:['财务工作台','处理日常账务和待办。'],
  bookkeeping:['录入凭证','使用业务模板、手工分录或 AI 草稿；同类凭证可用 CSV 批量录入。'],
  members:['会员卡与返佣明细','查看每张卡的余额，以及各笔售卡的应付佣金和支付情况。'],
  invoices:['销售发票','开具发票后自动记入销售收入和应收账款，并跟踪收款与逾期。'],
  business:['客户、供应商与员工往来','按往来对象、单据和到期日查看余额，核销收付款或借支。'],
  cash:['资金账户','管理现金、银行和支付平台账户，并查看各账户资金余额。'],
  inventory:['商品存货','按商品查看库存数量、成本，以及采购、销售、退货和盘点凭证。'],
  assets:['固定资产卡片','查看设备原价、累计折旧、账面价值及处置凭证。'],
  journal:['凭证查询','按日期、单据、往来对象或会计科目查找和导出凭证。'],
  ledger:['总账与试算','检查期初余额、科目发生额和调整前后的试算平衡。'],
  bank:['银行流水对账','导入对账单，确认与已有凭证的匹配，核对余额差额。'],
  payroll:['薪酬与出粮','编制工資表、核对糧单、匹配实际付款。'],
  close:['月结工作台','复核本期账务，锁定已复核期间，需要更正时登记原因并反结账。'],
  tutorial:['操作教程','按业务查看记账、出账、审核与出报步骤。'],
  training:['财务实训','按岗位选择练习关卡。'],
  salesPractice:['销售实训','按题目资料提交和跟进发票申请。'],
};
const STATEMENTS = ['pl','sfp','scf','soce'];
const LEDGER_TABS = ['chart','opening','ledger','tb','closing'];
const isReport = page => Object.hasOwn(REPORT_PAGES,page);
const hasPeriod = page => isReport(page) && page !== 'custom';
const TRAINING_NAV={
  accountant:['training','bank','journal','bookkeeping','invoices','close'],
  sales:['training','salesPractice'],
  owner:['training','reports','pl','bank','invoices'],
};
function trainingPages(level) {
  if(!level)return ['training'];
  const role=TrainingContent.roleOf(level);
  const navigation=TRAINING_NAV[role];
  return role==='accountant'?[...navigation,'ledger','reports','pl','sfp','scf','soce']:
    role==='owner'?[...navigation,'journal','sfp','scf','soce']:navigation;
}
const UI = {mode:'tpl', tpl:'sale', params:null, editing:null, sel:null, custom:null, lf:'all',
  showSettings:false, lastDate:null, ai:{text:'',status:'idle',res:null,err:'',ctl:null},
  aiConnected:false, aiMessage:'正在检查 AI 连接…', login:{state:'idle'}, undo:null, lastEq:null,
  filters:{query:'',from:'',to:'',kind:'all'}, tplQuery:'', storageError:'', draftDirty:false, draftRestored:false, pendingImport:null, attachments:[], attachmentBusy:false, attachmentEpoch:0,
  section:routeSection(), journalPage:1, reportMonth:12, memberMonth:12, businessMonth:12, inventoryMonth:12, assetMonth:12, businessLedger:'receivable', closeMonth:null, closeChecks:new Set(), ledgerMonth:12, ledgerTab:null, guide:null, guideTab:null};
let reportEditor, bankWorkspace, invoiceWorkspace, payrollWorkspace, tutorial;
function routeSection(){
  const name = location.hash.slice(1);
  if(trainingMode)return trainingPages(trainingCaseFromURL()).includes(name)?name:'training';
  if(['training','salesPractice'].includes(name))return accountMode?'home':'reports';
  if(name==='payroll'&&!accountMode)return 'reports';
  if (isReport(name) || Object.hasOwn(OTHER_PAGES,name)) return name;
  return accountMode?'home':'reports';
}
function trainingURL(section){
  const url=new URL(location.href);
  url.hash=section;
  if(section==='training')url.searchParams.delete('case');
  else url.searchParams.set('case',trainingStore.level.id);
  return url.href;
}
function navigateSection(section, updateURL = true){
  if (workspace && !workspace.ready) return;
  if(!trainingMode && ['training','salesPractice'].includes(section))return;
  if(trainingMode && !trainingPages(trainingStore.level).includes(section))return;
  if (['home','payroll'].includes(section) && !workspace) section='reports';
  if(section==='bookkeeping'&&readOnly())section='journal';
  if (!isReport(section) && !Object.hasOwn(OTHER_PAGES,section)) return;
  if (updateURL) {
    if(trainingMode && section!=='training' && !trainingStore.level)return;
    const url = new URL(trainingMode?trainingURL(section):'index.html#'+section, location.href);
    if(!trainingMode)url.search=location.search;
    // file: storage can be scoped to each physical file; keep local navigation in one document.
    if (location.protocol === 'file:') { url.pathname=location.pathname; url.hash=section; }
    if (url.href !== location.href) try { history.pushState(null,'',url); } catch(e) {}
  }
  if (UI.section==='bank' && section!=='bank') bankWorkspace.closeReviewMonth=null;
  const tutorialTransition = UI.section !== section && [UI.section, section].includes('tutorial');
  UI.section = section;
  $('#trace').hidden = true; renderAll(); revealCurrentNav(); window.scrollTo(0,0);
  if (tutorialTransition) $('#pageTitle').focus({preventScroll:true});
  if (['invoices','home'].includes(section)) loadRequests();
  if(section==='payroll')payrollWorkspace?.load();
  refreshManagement();
}
// Management sessions never write the shared ledger, so it can be refreshed without losing an edit.
let managementRefresh;
function refreshManagement(){
  if(!workspace?.user?.readOnly||!workspace.ready||managementRefresh)return;
  managementRefresh=workspace.request('state').then(result=>{
    if(result.revision<=workspace.revision)return;
    workspace.data=result.state;workspace.revision=result.revision;workspace.updatedAt=result.updatedAt;
    S=load();renderAll();
    if(['invoices','home'].includes(UI.section))loadRequests();
    if(UI.section==='payroll')payrollWorkspace?.load();
  }).catch(()=>{}).finally(()=>{managementRefresh=null;});
}
/* Sales invoice requests waiting for an accountant (company accounts only). */
const reviewer = () => !!workspace && ['owner','accountant'].includes(workspace.user?.role);
async function loadRequests(){
  if (!reviewer()) return;
  try { const {requests,authors}=await workspace.request('requests'); UI.requests = {list:requests,authors,error:''}; }
  catch (e) { UI.requests = {...(UI.requests || {list:[]}), error:e.message || '无法读取待审核的发票申请。'}; }
  if (UI.section==='invoices') invoiceWorkspace?.render();
  else if (UI.section==='home') renderAll();
  else if (S && ['bookkeeping','journal','ledger','close'].includes(UI.section)) renderTaskEntry();
}
async function rejectRequest(id, note){
  try { await workspace.request(`requests/${id}/reject`,'POST',{note}); }
  catch (e) { return e.message || '退回未成功，请重试。'; }
  await loadRequests(); return '';
}
let aiLoginTimer = null, aiLoginEpoch = 0;
const aiLabel = () => window.AccountingAI.status.label || 'GPT';

function blankState(){
  return {v:1, seq:0, company:{name:'New Company Limited', year:2026, cur:'HK$'},
    settings:{tax:20, autoTax:true, lang:'both', plMethod:'function', plPres:'single', cfMethod:'indirect', tab:'pl'},
    openingShares:0, opening:{}, txns:[]};
}
function recordState(){
  const s = blankState(); s.company.name = '我的企业账本'; s.company.year = +today().slice(0,4);
  s.settings = {...s.settings, autoTax:false, lang:'zh', tab:'journal'}; return s;
}
function balancesOf(s, excludeId, through){
  const b = {...s.opening};
  for (const t of s.txns) { if (t.id === excludeId || through && t.date > through) continue; for (const g of t.groups) for (const l of g) b[l.a] = (b[l.a] || 0) + l.s; }
  return b;
}
const withoutMemberEdit = (book,id) => id ? {...book,txns:book.txns.filter(t=>t.id!==id)} : book;
const memberSale = (book,id) => book.txns.find(t=>t.id===id && Member.linked(t) && t.member.kind==='sale');
const memberCards = (book,id) => Member.summary(withoutMemberEdit(book,id)).cards;
function memberCandidate(book,tx,excludeId){
  const old=book.txns.find(t=>t.id===excludeId);
  const item={...tx,id:old?.id || 'T'+(book.seq+1),seq:old?.seq || book.seq+1};
  return {...book,txns:old ? book.txns.map(t=>t.id===old.id ? item : t) : [...book.txns,item]};
}
function memberHint(kind,p,ctx){
  if (!validDate(p.date,ctx.book.company.year)) return '';
  const detail=Member.summary(withoutMemberEdit(ctx.book,ctx.excludeId),p.date);
  if (kind==='card') {
    const c=detail.cards.find(x=>Member.key(x.cardNo)===Member.key(p.cardNo));
    return c ? `截至 ${p.date}，会员卡 ${c.cardNo} 可用余额 ${m$(c.balance)}。` : '选择会员卡后显示该日期的可用余额。';
  }
  const sale=detail.purchases.find(x=>x.txn.id===p.saleId);
  return sale ? `购卡凭证 ${sale.txn.id} · 会员卡 ${sale.card.cardNo} · 已退款 ${m$(sale.refunded)} · 已确认佣金 ${m$(sale.accrued)}${sale.unaccrued?` · 旧账未补录 ${m$(sale.unaccrued)}`: ''} · 未付 ${m$(sale.unpaid)} · 应收追回 ${m$(sale.recoverable)}。`
    : '请选择该日期之前的购卡凭证。';
}
function runTpl(s, id, p, excludeId){
  const t = TPL[id]; if (!t) return {err:'未知的交易类型'};
  for (const f of t.fields.filter(f=>!f.show || f.show(p))) {
    const v=String(p[f.k] ?? '').trim(); if (!v) continue;
    if (f.t==='money' && !Number.isFinite(money(v))) return {err:`${f.label}：金额格式不正确或过大`};
    if (['num','int'].includes(f.t) && !Number.isFinite(Number(v.replace(/[,\s]/g,'')))) return {err:`${f.label}：请填写有效数字`};
  }
  const b = balancesOf(s, excludeId, p.date);
  const ctx = {bal: a => b[a] || 0, year: s.company.year, book:s, excludeId};
  let r;
  try { r = t.build(p, ctx) || {err:'无法生成分录'}; } catch (e) { r = {err:'输入有误：' + e.message}; }
  if (r.err) return r;
  const cashIds=new Set(Bank.accounts(s).map(a=>a.id));
  if(r.groups.some(g=>g.some(l=>l.a==='1000'&&!cashIds.has(l.cashAccount||p.cashAccount||Bank.MAIN))))return {err:'资金账户不存在'};
  r.groups = r.groups.map(g => g.filter(l => l.s).map(l => { const fn = normFn(l.a, l.fn); const out=fn ? {a:l.a, s:Math.round(l.s), fn} : {a:l.a, s:Math.round(l.s)}; if(l.expenseName)out.expenseName=l.expenseName; if(l.a==='1000'){const id=l.cashAccount||p.cashAccount||Bank.MAIN;if(id!==Bank.MAIN)out.cashAccount=id;} return out; })).filter(g => g.length);
  if (!r.groups.length) return {err:'金额为零，不需要记账'};
  if (r.groups.some(g => g.some(l=>!Number.isSafeInteger(l.s)))) return {err:'金额过大或格式不正确，请检查输入'};
  for (const g of r.groups) if (g.reduce((x, l) => x + l.s, 0) !== 0) return {err:'分录借贷不平衡'};
  if (r.member && validDate(p.date,s.company.year)) {
    try { Member.validate(memberCandidate(s,{date:p.date,tpl:id,groups:r.groups,member:r.member,party:r.party},excludeId)); }
    catch(e) { return {err:e.message}; }
  }
  if (r.biz && validDate(p.date,s.company.year)) {
    try { Business.validate(memberCandidate(s,{date:p.date,tpl:id,groups:r.groups,biz:r.biz,party:r.party},excludeId)); }
    catch(e) { return {err:e.message}; }
  }
  if (r.inv && validDate(p.date,s.company.year)) {
    try { Invoices.validate(memberCandidate(s,{date:p.date,tpl:id,groups:r.groups,biz:r.biz,inv:r.inv,party:r.party},excludeId)); }
    catch(e) { return {err:e.message}; }
  }
  if (r.stock && validDate(p.date,s.company.year)) {
    try { Stock.validate(memberCandidate(s,{date:p.date,tpl:id,groups:r.groups,stock:r.stock,biz:r.biz,party:r.party},excludeId)); }
    catch(e) { return {err:e.message}; }
  }
  if (r.asset && validDate(p.date,s.company.year)) {
    try { Assets.validate(memberCandidate(s,{date:p.date,tpl:id,groups:r.groups,asset:r.asset,party:r.party},excludeId)); }
    catch(e) { return {err:e.message}; }
  }
  return r;
}
function normalize(s){
  applyChart(s.chart);
  const b = blankState();
  const out = {...b, ...s, company:{...b.company, ...(s.company || {})}, settings:{...b.settings, ...(s.settings || {})}};
  out.opening = s.opening && typeof s.opening === 'object' ? s.opening : {};
  out.txns = (Array.isArray(s.txns) ? s.txns : []).filter(t => t && Array.isArray(t.groups) && t.date && t.groups.every(g => Array.isArray(g) && g.every(l => ACC[l.a] && Number.isFinite(l.s))));
  out.seq = Math.max(out.seq || 0, ...out.txns.map(t => Math.max(t.seq || 0, /^T\d+$/.test(t.id || '') ? +t.id.slice(1) : 0)), 0);
  out.txns.forEach((t, i) => { if (!t.id) t.id = 'T' + (++out.seq); if (!t.seq) t.seq = ++out.seq; });
  return out;
}
function load(){
  storedLedger = null;
  try { const raw = storedLedger = store().getItem(RECORD_KEY); if (raw) { const s = JSON.parse(raw); validateBackup(s); return normalize(s); } } catch (e) {
    UI.storageError = trainingMode?'已保存的练习数据无法读取，请重置本关。':'已保存的数据暂时无法读取。原备份仍保留，请先导出原始数据或恢复备份。';
    UI.loadBlocked = true;
  }
  if(trainingMode && trainingStore.level)return normalize(TrainingContent.seed(trainingStore.level));
  return recordState();
}
function save(){
  if(readOnly())return false;
  return persistBook();
}
function persistBook(){
  if (UI.loadBlocked) { renderSaveStatus(); return false; }
  const oldTime = S.savedAt; S.savedAt = Date.now();
  try {
    if (store().getItem(RECORD_KEY) !== storedLedger) {
      S.savedAt = oldTime; UI.storageError = '同一账本已在另一个页面更新。请先备份此页的改动，刷新后核对，避免覆盖已保存的数据。'; renderSaveStatus(); return false;
    }
    const next=JSON.stringify(S); store().setItem(RECORD_KEY,next); storedLedger=next;
    UI.storageError = ''; UI.closeChecks.clear(); renderSaveStatus(); renderTrainingCoach(); return true;
  }
  catch (e) { S.savedAt = oldTime; UI.storageError = '保存失败：当前改动还在页面中，请立即导出备份，避免刷新后丢失。'; renderSaveStatus(); return false; }
}

function renderSaveStatus(){
  const el = $('#saveStatus'); if (!el || !S) return;
  const error=UI.storageError || workspace?.error;
  const formatTime=at=>new Date(at).toLocaleTimeString(Locale.current,{hour:'2-digit',minute:'2-digit'});
  const status=error?uiEsc(error):trainingMode?(S.savedAt?'✓ 练习进度已保存到此浏览器':'练习进度会自动保存到此浏览器'):workspace
    ? workspace.pending?'正在保存到个人空间…':workspace.updatedAt?'✓ 已保存到个人空间 · '+formatTime(workspace.updatedAt):'个人空间已连接'
    : S.savedAt?'✓ 已保存到此浏览器 · '+formatTime(S.savedAt):'数据保存在此浏览器，记账后自动保存';
  el.classList.toggle('failed', !!error);
  el.innerHTML=Locale.markup(`<span class="save-state">${status}</span><span class="actions">${trainingMode?'':'<button class="btn small" data-act="backup">账本备份 / 恢复</button>'}${error && !UI.loadBlocked?'<button class="btn small" data-act="retrySave">重试保存</button>':''}${error && workspace?'<button class="btn small" data-space="space-export">导出未保存资料</button>':''}</span>`);
  const badge=$('#spaceSync');
  if(badge){badge.dataset.status=error?'error':workspace?.pending?'pending':'ready';badge.textContent=Locale.text(error?'未保存':workspace?.pending?'保存中':'已连接');}
}
function saveDraft(){
  if (!UI.draftDirty||readOnly()) return;
  try {
    const next=JSON.stringify({mode:UI.mode,tpl:UI.tpl,params:UI.params,custom:UI.custom,editing:UI.editing,lastDate:UI.lastDate,attachments:UI.attachments});
    if (store().getItem(DRAFT_KEY)!==next) store().setItem(DRAFT_KEY,next);
  }
  catch (e) { UI.storageError = '草稿未能保存，请先完成记账或导出数据，避免刷新后丢失。'; renderSaveStatus(); }
}
function clearDraft(){
  clearTimeout(saveDraft._t); UI.draftDirty = false; UI.draftRestored = false;
  try { store().removeItem(DRAFT_KEY); } catch (e) {}
}
function loadDraft(){
  try {
    const d = JSON.parse(store().getItem(DRAFT_KEY) || 'null');
    if (!d || !TPL[d.tpl] || TPL[d.tpl].dialogOnly || !d.params || !d.custom || !Array.isArray(d.custom.rows) || !d.custom.rows.every(r => ACC[r.a])) return;
    UI.mode = d.mode === 'custom' ? 'custom' : 'tpl'; UI.tpl = d.tpl; UI.params = d.params; UI.custom = d.custom;
    if(d.attachments) { validateAttachments(d.attachments);UI.attachments=d.attachments; }
    if(UI.tpl==='payExpense' && !Object.prototype.hasOwnProperty.call(UI.params,'expenseName')) { UI.params.expenseName=expenseSpec(UI.params).name; delete UI.params.acct; }
    UI.editing = S.txns.some(t => t.id === d.editing) ? d.editing : null;
    UI.lastDate = d.lastDate || UI.lastDate; UI.draftRestored = true; UI.draftDirty = true;
  } catch (e) {}
}
function resetEntryUI(){
  UI.sel = null; UI.editing = null; UI.tplQuery = ''; UI.mode = 'tpl';
  clearAttachments();
  UI.filters = {query:'',from:'',to:'',kind:'all'};
  UI.journalPage=1;
  UI.closeMonth = null; UI.closeChecks.clear(); UI.ledgerMonth = 12; UI.memberMonth = 12; UI.businessMonth=12;UI.inventoryMonth=12;UI.assetMonth=12; UI.businessLedger='receivable'; UI.ledgerTab = null; bankWorkspace?.reset(); invoiceWorkspace?.reset();
  UI.ai.ctl?.abort(); UI.ai={text:'',status:'idle',res:null,err:'',ctl:null};
  UI.lastDate = S.txns.length ? [...S.txns].sort((a,b) => b.date.localeCompare(a.date))[0].date : null;
  startTpl('service'); UI.custom = blankCustom();
}
function monthOptions(selected){
  return Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}"${m===selected?' selected':''}>${m===12?'12 月（全年）':m+' 月'}</option>`).join('');
}
const sectionLink = (page, label, cls = 'btn') => `<a class="${cls}" href="index.html#${page}" data-act="section" data-v="${page}">${label}</a>`;
/* Work that is not finished yet: shown on the home page and above the voucher pages. Entries can't be
   unbalanced (every voucher must balance to save), so what remains is unbooked bank rows, approvals and overdue invoices. */
function pendingWork(){
  const out=[];
  const waiting=reviewer()?(UI.requests?.list||[]).filter(r=>r.status==='pending'&&!r.mine).length:0;
  if(waiting) out.push({page:'invoices',filter:'review',text:`${waiting} 张销售发票申请等待审核`,detail:'审核通过后才会记账'});
  let rows=0, books=0, firstRow, firstBook;
  for (const a of Bank.accounts(S)) for (let m=1;m<=12;m++) {
    if (!Bank.get(S,m,a.id)) continue;
    const r=Bank.summary(S,m,a.id);
    if(r.bankUnmatched && (!firstRow || m<firstRow.month)) firstRow={account:a.id,month:m};
    if(r.unmatchedVouchers.length && (!firstBook || m<firstBook.month)) firstBook={account:a.id,month:m};
    rows+=r.bankUnmatched; books+=r.unmatchedVouchers.length;
  }
  if(rows) out.push({page:'bank',filter:'bank',...firstRow,text:`${rows} 条银行流水还没有对应凭证`,detail:`从 ${firstRow.month} 月开始核对流水`});
  if(books) out.push({page:'bank',filter:'books',...firstBook,text:`${books} 笔现金凭证在对账单里找不到`,detail:`从 ${firstBook.month} 月开始核对凭证`});
  const overdue=Invoices.summary(S,`${S.company.year}-12-31`,today()).totals;
  if(overdue.overdueCount) out.push({page:'invoices',filter:'overdue',text:`${overdue.overdueCount} 张发票已逾期未收`,detail:`未收 ${cur()} ${fmt(overdue.overdue)}`});
  return out;
}
const taskLink = (task, content) => `<a href="index.html#${task.page}" data-act="openTask" data-v="${task.page}" data-kind="${task.filter}"${task.account ? ` data-account="${esc(task.account)}" data-month="${task.month}"` : ''}>${content}</a>`;
function renderTaskEntry(){
  const page = UI.section;
  const info = REPORT_PAGES[page] || OTHER_PAGES[page];
  const control = hasPeriod(page) ? `<div class="field period-select"><label for="report-month">截至月末 · ${R.yr} 年</label><select id="report-month">${monthOptions(R.month)}</select></div>${page!=='reports' ? '<button class="btn" data-act="reportCsv">导出 CSV</button><button class="btn" data-act="reportPrint">打印 / PDF</button>' : sectionLink('pl','查看利润表 →','btn primary')}`
    : page === 'bookkeeping' ? '<button class="btn" data-act="batchOpen">批量导入 CSV</button>' + `<details class="bookkeeping-links"><summary>查看业务明细</summary><div class="actions">${sectionLink('business','客户 / 供应商 / 员工往来') + sectionLink('cash','资金账户') + sectionLink('members','会员卡与返佣明细') + sectionLink('inventory','商品存货') + sectionLink('assets','固定资产')}</div></details>`
    : page === 'members' ? sectionLink('bookkeeping','＋ 录入凭证','btn primary')
    : page === 'business' ? sectionLink('invoices','销售发票') + sectionLink('bookkeeping','＋ 录入凭证','btn primary')
    : page === 'invoices' ? sectionLink('business','客户应收明细') + sectionLink('bank','银行流水对账') + sectionLink('journal','查凭证 →')
    : page === 'cash' ? sectionLink('bookkeeping','＋ 录入凭证','btn primary') + sectionLink('bank','资金账户对账')
    : page === 'inventory' ? sectionLink('bookkeeping','＋ 录入凭证','btn primary')
    : page === 'assets' ? sectionLink('bookkeeping','＋ 录入凭证','btn primary')
    : page === 'journal' ? sectionLink('bookkeeping','＋ 录入凭证','btn primary')
    : page === 'ledger' ? (!['closing','opening'].includes(ledgerTab()) ? `<div class="field period-select"><label for="ledger-month">账务截止月</label><select id="ledger-month">${monthOptions(R.month)}</select></div>` : '')
      + `<button type="button" class="btn guide-open" id="guide-open" data-act="ledgerGuide" aria-expanded="${UI.guide != null}" aria-controls="ledgerGuide">？ 使用教程</button>` : '';
  const todo = ['bookkeeping','journal','ledger','close'].includes(page) ? pendingWork() : [];
  const reminder = todo.length ? `<p class="task-todo" role="status"><strong>还有未完成：</strong>${todo.map(x=>taskLink(x,x.text)).join('<span aria-hidden="true"> · </span>')}</p>` : '';
  $('#taskBar').innerHTML = Locale.markup(`<div><h2>${info[0]}</h2><p>${info[1]}</p>${reminder}</div><div class="actions">${control}</div>`);
  renderSaveStatus();
}
function renderOverview(){
  const checksGood = R.checks.every(c => c.ok);
  const close = EBook.closedThrough(S);
  const metrics = [
    ['营业收入',R.P.revTot,'年初至所选月末','pl'],
    ['净利润',R.P.np,'年初至所选月末','pl'],
    ['现金及现金等价物',R.bal('1000'),'所选月末余额','scf'],
    ['资产总额',R.totA,'所选月末余额','sfp'],
    ['应收账款净额',R.bal('1100')+R.bal('1105'),'所选月末余额','sfp'],
    ['应付账款',-R.bal('2000'),'所选月末余额','sfp'],
  ];
  $('#overview').innerHTML = Locale.markup(metrics.map(([label,n,detail,page])=>`<a class="metric report-metric" href="index.html#${page}" data-act="section" data-v="${page}"><div class="metric-top">${label}<span aria-hidden="true">↗</span></div><div class="metric-value">${fmt(n)} <small>${esc(cur())}</small></div><div class="metric-foot">${detail}</div></a>`).join('') +
    `<div class="overview-status"><span>${R.start} 至 ${R.end} · ${R.entries.filter(e=>!e.auto).length} 笔凭证</span><button class="text-button${checksGood?'':' err'}" data-act="toggleChecks" aria-expanded="${!!UI.showChecks}">${checksGood?'勾稽检查通过':'查看勾稽差异'} ↗</button>${sectionLink('close',close?`已锁至 ${close} 月末`:'尚未锁账','text-button')}</div>`);
}
function ledgerReportRows(){
  const rows = new Map();
  for (const p of R.POST) {
    const a = ACC[p.a]; if (!a.pl || ['disc','discTax'].includes(a.pl)) continue;
    const fn = p.fn || a.fn || 'other';
    const kind = a.pl === 'rev' ? 'income' : a.pl === 'opx' ? (fn === 'cos' ? 'cost' : 'expense') : a.pl === 'tax' ? 'tax' : 'other';
    const name = lineName(p), key = kind+'|'+p.a+'|'+name;
    if (!rows.has(key)) rows.set(key,{kind,name,amount:0});
    rows.get(key).amount += ['income','other'].includes(kind) ? -p.s : p.s;
  }
  return [...rows.values()].filter(r => r.amount);
}
function entryDate(){
  const date = UI.lastDate || (+today().slice(0,4) === +S.company.year ? today() : `${S.company.year}-01-01`);
  const locked = EBook.closedThrough(S);
  return EBook.locked(S,date) && locked < 12 ? `${S.company.year}-${String(locked+1).padStart(2,'0')}-01` : date;
}
function validDate(value,year){
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value && +value.slice(0,4) === +year;
}
function dateError(value){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(Date.parse(value)) || new Date(value+'T00:00:00Z').toISOString().slice(0,10) !== value) return '请选择有效日期';
  if (+value.slice(0,4) !== +S.company.year) return `日期必须在当前会计年度 ${S.company.year} 内，请检查日期或账本设置`;
  return '';
}

/* ================= engine ================= */
function taxEntry(entries, period, settings){
  const rate = (+settings.tax || 0) / 100;
  let pbt = 0, disc = 0;
  for (const e of entries) for (const g of e.groups) for (const l of g) {
    const p = ACC[l.a].pl;
    if (p === 'rev' || p === 'oth' || p === 'opx') pbt -= l.s; else if (p === 'disc') disc -= l.s;
  }
  const t1 = Math.round(pbt * rate), t2 = Math.round(disc * rate);
  if (!t1 && !t2) return null;
  const g = [];
  if (t1) g.push({a:'8000', s:t1});
  if (t2) g.push({a:'8510', s:t2});
  if (t1 + t2) g.push({a:'2200', s:-(t1 + t2)});
  const pct = settings.tax;
  return {id:'TAX', auto:true, adj:true, date:period.end, seq:1e9,
    memo:`计提本年所得税（税率 ${pct}%，系统自动）`, groups:[g],
    calc:`持续经营税前利润 ${m$(pbt)} × ${pct}% = ${m$(t1)}${disc?`；终止经营税前损益 ${fmt(disc)} × ${pct}% = ${fmt(t2)}（${t2<0?'所得税利益':'所得税费用'}）`:''}`,
    note:'「期间内所得税分配」：持续经营的税列为所得税费用；终止经营的税并入终止经营，最终以税后单一金额列报。可在「设置」里关闭自动计提。'};
}

function compute(book, month = 12){
  const period = EBook.periodFor(book,month), yr = period.year;
  const txs = book.txns.filter(t => t.date <= period.end).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq);
  const entries = txs.map(t => ({...t}));
  const taxE = month === 12 && book.settings.autoTax ? taxEntry(entries,period,book.settings) : null;
  if (taxE) entries.push(taxE);
  entries.forEach((e, i) => e.no = i + 1);
  const byId = {}; entries.forEach(e => byId[e.id] = e);
  const POST = [];
  entries.forEach(e => e.groups.forEach((g, gi) => g.forEach(l => POST.push({id:e.id, g:gi, a:l.a, s:l.s, fn:l.fn || null, adj:!!e.adj,...(l.expenseName?{expenseName:l.expenseName}:{}),...(l.a==='1000'?{cash:l.cashAccount||Bank.MAIN}:{})}))));
  const OB = book.opening, MV = {};
  POST.forEach(p => { MV[p.a] = (MV[p.a] || 0) + p.s; });
  const bal = a => (OB[a] || 0) + (MV[a] || 0);
  const col = (pred, sign = 1) => { let amt = 0; const ids = new Map(); for (const p of POST) if (pred(p)) { const v = p.s * sign; amt += v; ids.set(p.id, (ids.get(p.id) || 0) + v); } return {amt, ids}; };
  const acol = (c, sign) => col(p => p.a === c, sign);
  const X = {...period, yr, entries, byId, POST, OB, MV, bal, col, acol, taxE};

  // ---- profit or loss
  const P = {};
  const fnOf = p => p.fn || ACC[p.a].fn || 'other';
  P.rev = COA.filter(a => a.pl === 'rev').map(a => ({a, ...acol(a.c, -1)}));
  P.revTot = P.rev.reduce((x, y) => x + y.amt, 0);
  for (const f of ['cos', 'sell', 'admin', 'other']) P[f] = col(p => ACC[p.a].pl === 'opx' && fnOf(p) === f, 1);
  P.opx = COA.filter(a => a.pl === 'opx').map(a => ({a, ...acol(a.c, 1)}));
  P.opxTot = P.sell.amt + P.admin.amt + P.other.amt;
  P.gp = P.revTot - P.cos.amt;
  P.opProfit = P.gp - P.opxTot;
  P.oth = COA.filter(a => a.pl === 'oth').map(a => ({a, ...acol(a.c, -1)}));
  P.othTot = P.oth.reduce((x, y) => x + y.amt, 0);
  P.pbt = P.opProfit + P.othTot;
  P.tax = acol('8000', 1);
  P.cont = P.pbt - P.tax.amt;
  P.disc = acol('8500', -1); P.discTax = acol('8510', -1);
  P.discNet = P.disc.amt + P.discTax.amt;
  P.hasDisc = P.disc.ids.size > 0 || P.discTax.ids.size > 0;
  P.np = P.cont + P.discNet;
  P.oci = COA.filter(a => a.t === 'O').map(a => ({a, ...acol(a.c, -1)}));
  P.ociOf = c => P.oci.find(x => x.a.c === c);
  P.ociTot = P.oci.reduce((x, y) => x + y.amt, 0);
  P.tci = P.np + P.ociTot;
  P.plHits = new Set(POST.filter(p => ACC[p.a].pl).map(p => p.id));
  P.ociHits = new Set(POST.filter(p => ACC[p.a].t === 'O').map(p => p.id));
  // EPS
  let w = +book.openingShares || 0;
  const parts = [`期初 ${w.toLocaleString('en-US')} 股 × ${month}/${month}`];
  for (const t of txs) if (t.shares > 0 && String(t.date).slice(0, 4) === String(yr)) {
    const mo = monthsOut(t.date) - (12-month); w += t.shares * mo / month;
    parts.push(`${t.date.slice(5)} 发行 ${t.shares.toLocaleString('en-US')} 股 × ${fmtMo(mo)}/${month}`);
  }
  P.wSh = w; P.wParts = parts;
  P.eps = v => w > 0 ? v / 100 / w : null;
  X.P = P;

  // ---- financial position
  const assetCodes = COA.filter(a => a.t === 'A' || a.t === 'XA').map(a => a.c);
  const liabCodes = COA.filter(a => a.t === 'L').map(a => a.c);
  const sumB = cs => cs.reduce((x, c) => x + bal(c), 0);
  const sumO = cs => cs.reduce((x, c) => x + (OB[c] || 0), 0);
  X.totA = sumB(assetCodes); X.totL = -sumB(liabCodes);
  X.scEnd = -bal('3000');
  X.reEnd = -(bal('3100') + bal('3300')) + P.np;
  X.revalEnd = -bal('3200') + P.ociOf('9000').amt;
  X.fvrEnd = -bal('3210') + P.ociOf('9100').amt;
  X.totE = X.scEnd + X.reEnd + X.revalEnd + X.fvrEnd;
  X.oA = sumO(assetCodes); X.oL = -sumO(liabCodes); X.oE = -sumO(['3000', '3100', '3200', '3210', '3300']);
  let obDr = 0, obCr = 0; for (const k in OB) { if (!ACC[k]) continue; if (OB[k] > 0) obDr += OB[k]; else obCr -= OB[k]; }
  X.obDr = obDr; X.obCr = obCr;
  let tbDr = 0, tbCr = 0; for (const a of COA) { const b = bal(a.c); if (b > 0) tbDr += b; else tbCr -= b; }
  X.tbDr = tbDr; X.tbCr = tbCr;

  X.CF = computeCF(X);
  X.CL = computeClosing(X);
  X.checks = [
    {k:'ob', ok: obDr === obCr, zh:'期初平衡', why:`期初余额：借方合计 ${m$(obDr)}，贷方合计 ${m$(obCr)}。${obDr===obCr?'两者相等。':'两者不等，请在「期初余额」页修正，否则财务状况表不会平衡。'}`},
    {k:'tb', ok: tbDr === tbCr, zh:'试算平衡', why:`调整后试算平衡表：借方 ${m$(tbDr)}，贷方 ${m$(tbCr)}。每笔分录借贷相等，所以只要期初平衡，试算表一定平衡。`},
    {k:'eq', ok: X.totA === X.totL + X.totE, zh:'资产 = 负债 + 权益', why:`资产 ${m$(X.totA)} = 负债 ${m$(X.totL)} + 权益 ${m$(X.totE)}。`},
    {k:'np', ok: true, zh:'净利润 → 留存收益', why:`损益表的净利润 ${m$(P.np)} 进入权益变动表的留存收益栏：期初 ${m$(-(OB['3100']||0))} + 净利润 ${m$(P.np)} − 股利 ${m$(bal('3300'))} + 其他 ${m$(-(MV['3100']||0))} = 期末 ${m$(X.reEnd)}，再列入财务状况表。`},
    {k:'cash', ok: X.CF.closeCash === bal('1000') && X.CF.openCash + X.CF.net === X.CF.closeCash, zh:'现金对得上', why:`现金流量表：期初现金 ${m$(X.CF.openCash)} + 现金净增加 ${m$(X.CF.net)} = 期末现金 ${m$(X.CF.openCash + X.CF.net)}；财务状况表的现金 ${m$(bal('1000'))}。`},
    {k:'cfm', ok: X.CF.opTot === X.CF.indirectTot, zh:'间接法 = 直接法', why:`经营活动现金流量：直接法 ${m$(X.CF.opTot)}，间接法 ${m$(X.CF.indirectTot)}。两种方法只是呈现方式不同，结果必须相同。`},
  ];
  return X;
}

function computeCF(X){
  const items = [], adjs = [], nonCash = [];
  for (const e of X.entries) e.groups.forEach(g => {
    let invfin = 0;
    const cashL = g.filter(l => ACC[l.a].cf === 'cash');
    const s=cashL.reduce((n,l)=>n+l.s,0);
    if(s) {
      const opp = g.filter(l => ACC[l.a].cf !== 'cash' && Math.sign(l.s) === -Math.sign(s));
      const nc = opp.filter(l => ACC[l.a].cf === 'inv' || ACC[l.a].cf === 'fin');
      const pool = nc.length ? nc : opp;
      if(pool.length){
        const parts = allocate(Math.abs(s), pool.map(l => Math.abs(l.s)));
        pool.forEach((l, i) => {
          const amt = Math.sign(s) * parts[i]; if (!amt) return;
          const A = ACC[l.a];
          if (A.cf === 'inv' || A.cf === 'fin') { items.push({id:e.id, cat:A.cf, key:A.k + ':' + (amt > 0 ? 'in' : 'out'), amt}); invfin += amt; }
          else items.push({id:e.id, cat:'op', key:A.op || 'otherOpex', amt});
        });
      }
    }
    let sNC = 0, sOCI = 0;
    for (const l of g) { const cf = ACC[l.a].cf; if (cf === 'inv' || cf === 'fin') sNC += l.s; else if (cf === 'oci') sOCI += l.s; }
    const adj = -invfin - sNC - sOCI;
    if (adj) {
      const pls = g.filter(l => ACC[l.a].pl && ACC[l.a].adj).sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
      adjs.push({id:e.id, key: pls.length ? ACC[pls[0].a].adj : 'other', amt:adj});
    }
    if (!cashL.length && !g.some(l => ['pl', 'oci', 'wc'].includes(ACC[l.a].cf))) {
      const cats = new Set(g.map(l => ACC[l.a].cf)), keys = new Set(g.map(l => ACC[l.a].k));
      if (!keys.has('div') && ((cats.has('inv') && cats.has('fin')) || (cats.size === 1 && cats.has('fin') && keys.size > 1)))
        nonCash.push({id:e.id, amt:g.filter(l => l.s > 0).reduce((x, l) => x + l.s, 0)});
    }
  });
  const agg = (list, order) => {
    const m = new Map();
    for (const it of list) { if (!m.has(it.key)) m.set(it.key, {key:it.key, amt:0, ids:new Map()}); const o = m.get(it.key); o.amt += it.amt; o.ids.set(it.id, (o.ids.get(it.id) || 0) + it.amt); }
    const arr = [...m.values()];
    arr.sort((a, b) => { const ia = order.indexOf(a.key), ib = order.indexOf(b.key); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return arr;
  };
  const opD = agg(items.filter(i => i.cat === 'op'), OP_ORDER);
  const inv = agg(items.filter(i => i.cat === 'inv'), INV_ORDER);
  const fin = agg(items.filter(i => i.cat === 'fin'), FIN_ORDER);
  const adjAgg = agg(adjs, ['dep', 'reval', 'ppe', 'disc', 'other']);
  // working capital
  const groups = {};
  COA.filter(a => a.cf === 'wc').forEach(a => (groups[a.wc] = groups[a.wc] || []).push(a.c));
  const wc = [];
  for (const [k, codes] of Object.entries(groups)) {
    const open = codes.reduce((x, c) => x + (X.OB[c] || 0), 0), close = codes.reduce((x, c) => x + X.bal(c), 0);
    const ids = new Map();
    for (const p of X.POST) if (codes.includes(p.a)) ids.set(p.id, (ids.get(p.id) || 0) - p.s);
    if (open === close) continue;
    wc.push({k, codes, open, close, amt:-(close - open), ids, isAsset: ACC[codes[0]].t === 'A'});
  }
  const sum = a => a.reduce((x, y) => x + y.amt, 0);
  const opTot = sum(opD), invTot = sum(inv), finTot = sum(fin);
  const indirectTot = X.P.np + sum(adjAgg) + sum(wc);
  const pick = k => -(opD.find(x => x.key === k)?.amt || 0);
  return {items, opD, inv, fin, adjAgg, wc, nonCash, nonCashIds:new Set(nonCash.map(n => n.id)), opTot, invTot, finTot, indirectTot,
    net: opTot + invTot + finTot, openCash: X.OB['1000'] || 0, closeCash: X.bal('1000'), intPaid: pick('intPaid'), taxPaid: pick('tax'), intRec: -pick('intRec')};
}

function computeClosing(X){
  const plA = COA.filter(a => a.pl), E = [];
  const crb = plA.filter(a => X.bal(a.c) < 0), drb = plA.filter(a => X.bal(a.c) > 0);
  if (crb.length) { const tot = crb.reduce((x, a) => x - X.bal(a.c), 0); E.push({id:'C1', no:'C1', memo:'结转贷方余额的收入、利得类账户 → 本年利润汇总', groups:[[...crb.map(a => ({a:a.c, s:-X.bal(a.c)})), {a:'3900', s:-tot}]]}); }
  if (drb.length) { const tot = drb.reduce((x, a) => x + X.bal(a.c), 0); E.push({id:'C2', no:'C2', memo:'结转借方余额的费用、损失类账户 → 本年利润汇总', groups:[[{a:'3900', s:tot}, ...drb.map(a => ({a:a.c, s:-X.bal(a.c)}))]]}); }
  const np = X.P.np;
  if (np) E.push({id:'C3', no:'C3', memo: np > 0 ? '本年利润汇总的贷方余额（净利润）→ 留存收益' : '本年利润汇总的借方余额（净亏损）→ 留存收益', groups:[np > 0 ? [{a:'3900', s:np}, {a:'3100', s:-np}] : [{a:'3100', s:-np}, {a:'3900', s:np}]]});
  const dv = X.bal('3300');
  if (dv) E.push({id:'C4', no:'C4', memo:'结转股利账户 → 留存收益（股利不经过本年利润汇总）', groups:[[{a:'3100', s:dv}, {a:'3300', s:-dv}]]});
  const oc = [];
  for (const a of COA.filter(a => a.t === 'O')) { const b = X.bal(a.c); if (b) oc.push({a:a.c, s:-b}, {a:a.res, s:b}); }
  if (oc.length) E.push({id:'C5', no:'C5', memo:'结转 OCI → 权益中的储备（累计其他综合收益）', groups:[oc]});
  const pc = {};
  for (const a of COA) pc[a.c] = X.bal(a.c);
  for (const e of E) for (const g of e.groups) for (const l of g) pc[l.a] = (pc[l.a] || 0) + l.s;
  return {E, pc};
}

/* ================= labels ================= */
const lang = () => S.settings.lang;
function lab(en, zh){
  const l = lang();
  if(en===zh)return `<span class="en">${esc(en)}</span>`;
  if (l === 'en') return `<span class="en">${esc(en)}</span>`;
  if (l === 'zh') return `<span class="en">${uiEsc(zh)}</span>`;
  return `<span class="en">${esc(en)}</span><span class="zh">${uiEsc(zh)}</span>`;
}
const acctLab = a => lab(ACC[a].en, ACC[a].zh);
const acctZh = a => ACC[a].zh;
// What people see: the company's code, the bank's code for cash lines, and names typed by the company kept verbatim.
const acode = a => ACC[a]?.code || a;
const cashCode = id => S.chart?.cash?.[id || Bank.MAIN]?.code || '';
const lineCode = l => (l.a === '1000' && cashCode(l.cashAccount)) || acode(l.a);
const acctName = a => ACC[a].user ? esc(ACC[a].zh) : uiEsc(ACC[a].zh);
const plainName = a => ACC[a].user ? ACC[a].zh : Locale.text(ACC[a].zh);
const cashOption = a => `${a.code ? esc(a.code) + ' ' : ''}${a.user ? esc(a.name) : uiEsc(a.name)}`;
/* Rows for the ledger and trial balance: with a company chart the cash account splits into its banks. */
function ledgerItems(list){
  const out = [];
  for (const a of list) {
    if (a.c === '1000' && S.chart) for (const c of Chart.cashAccounts(S)) out.push({a, key:'1000:'+c.id, code:c.code || a.code, zh:c.name, en:c.name, user:c.user, ob:c.opening, match:p => p.a === '1000' && p.cash === c.id});
    else out.push({a, key:a.c, code:a.code, zh:a.zh, en:a.en, user:a.user, ob:R.OB[a.c] || 0, match:p => p.a === a.c});
  }
  return out;
}
const itemLab = x => x.user ? `<span class="en">${esc(x.zh)}</span>` : lab(x.en, x.zh);
const lineName = l => l.expenseName || acctZh(l.a);
// Exports: a cash line names its bank when the company chart lists banks.
const lineName2 = l => l.a === '1000' && S.chart ? cashName(l) : plainName(l.a);
const cashLabel = a => a.id===Bank.MAIN ? uiEsc(a.name) : esc(a.name);
const cashName = l => l.a==='1000' ? (Bank.accounts(S).find(a=>a.id===(l.cashAccount||Bank.MAIN))?.name || '未知资金账户') : '';
const lineAcctLab = l => l.expenseName ? `<span class="en">${esc(l.expenseName)}</span>${l.expenseName!==acctZh(l.a)?`<span class="zh">${uiEsc(lang()==='en'?ACC[l.a].en:acctZh(l.a))}</span>`:''}` : acctLab(l.a);
function expenseNatureRows(x){
  const posts=R.POST.filter(p=>p.a===x.a.c);
  if(!posts.some(p=>p.expenseName))return [x];
  const names=[...new Set(posts.map(p=>p.expenseName || x.a.natZh || x.a.zh))];
  return names.map(name=>({a:{...x.a,natEn:name,natZh:name},...R.col(p=>p.a===x.a.c && (p.expenseName || x.a.natZh || x.a.zh)===name,1)}));
}

/* ================= trace objects ================= */
function T(ids, why, o = {}){
  const hits = new Set();
  if (ids) for (const [k, v] of ids) if (v !== 0 && k !== 'OB' && k !== 'NP') hits.add(k);
  if (o.hits) for (const k of o.hits) hits.add(k);
  return {...o, ids, why, hits};
}
function Tsum(why, ...trs){
  const hits = new Set();
  trs.forEach(t => t && t.hits && t.hits.forEach(k => hits.add(k)));
  return {ids:null, why, hits};
}
const withOB = (ids, ob) => { const m = new Map(); if (ob) m.set('OB', ob); for (const [k, v] of ids) m.set(k, v); return m; };

/* ================= statement row builder ================= */
function RB(){
  const rows = [];
  const last = () => { for (let i = rows.length - 1; i >= 0; i--) { const r = rows[i]; if (r.k === 'l' || r.k === 's' || r.k === 'g') return r; if (r.k === 'h') return null; } return null; };
  return {rows,
    h(en, zh, ind = 0){ rows.push({k:'h', en, zh, ind}); },
    l(en, zh, v, tr, col = 'out', ind = 1, o = {}){ rows.push({k:'l', en, zh, v, tr, col, ind, ...o}); },
    s(en, zh, v, tr, col = 'out', ind = 0, o = {}){ const p = last(); if (p) p.ul = true; rows.push({k:'s', en, zh, v, tr, col, ind, ...o}); },
    g(en, zh, v, tr, col = 'out', o = {}){ const p = last(); if (p) p.ul = true; rows.push({k:'g', en, zh, v, tr, col, ind:0, ...o}); },
    sp(){ rows.push({k:'sp'}); },
  };
}
const nz = x => x && (x.amt !== 0 || (x.ids && x.ids.size > 0));
const acctWhy = (a, what = '本期发生额') => `${ACC[a].zh}（${acode(a)}）${what}合计。下面是构成这个数字的每一笔分录。`;

/* ---------- P&L ---------- */
function plRows(part){
  if (S.chart) return part === 'oci' ? [] : chartPlRows();
  const P = R.P, b = RB(), method = S.settings.plMethod;
  const trNP = T(null, '', {hits:P.plHits});
  const trNPw = Tsum(`净利润 = 持续经营利润 ${m$(P.cont)}${P.hasDisc ? ` + 终止经营税后损益 ${m$(P.discNet)}` : ''} = ${m$(P.np)}`, trNP);
  if (part !== 'oci') {
    let trRev, trPBT;
    if (method === 'function') {
      const revs = P.rev.filter(nz);
      if (revs.length <= 1) {
        const x = revs[0] || P.rev[0];
        trRev = T(x.ids, acctWhy(x.a.c, '贷方发生额'));
        b.l(x.a.en, x.a.zh, x.amt, trRev, 'out', 0);
      } else {
        const trs = revs.map(x => T(x.ids, acctWhy(x.a.c, '贷方发生额')));
        revs.forEach((x, i) => b.l(x.a.en, x.a.zh, x.amt, trs[i], 'in', 1));
        trRev = Tsum(`营业收入 = ${revs.map(x => `${x.a.zh} ${m$(x.amt)}`).join(' + ')} = ${m$(P.revTot)}`, ...trs);
        b.s('Revenue', '营业收入合计', P.revTot, trRev, 'out', 0);
      }
      const trCos = T(P.cos.ids, '按功能归入「销售成本」的所有费用分录（主要是结转的商品成本）。');
      b.l('Cost of sales', '销售成本', P.cos.amt, trCos, 'out', 0);
      const trGP = Tsum(`毛利 = 营业收入 ${m$(P.revTot)} − 销售成本 ${m$(P.cos.amt)} = ${m$(P.gp)}`, trRev, trCos);
      b.s('Gross profit', '毛利', P.gp, trGP, 'out', 0);
      b.h('Operating expenses:', '营业费用：');
      const fx = ['sell', 'admin', 'other'].filter(f => nz(P[f]));
      const fts = fx.map(f => T(P[f].ids, `按功能归入「${FN_LABEL[f][1]}」的所有费用分录。同一个费用账户（例如工资、折旧）可以按部门分别归入不同功能。`));
      fx.forEach((f, i) => b.l(FN_LABEL[f][0], FN_LABEL[f][1], P[f].amt, fts[i], 'in', 1));
      const trOpx = Tsum(`营业费用合计 = ${fx.map(f => `${FN_LABEL[f][1]} ${m$(P[f].amt)}`).join(' + ') || '0'} = ${m$(P.opxTot)}`, ...fts);
      b.s('Total operating expenses', '营业费用合计', P.opxTot, trOpx, 'out', 1);
      const trOP = Tsum(`营业利润 = 毛利 ${m$(P.gp)} − 营业费用 ${m$(P.opxTot)} = ${m$(P.opProfit)}`, trGP, trOpx);
      b.s('Operating profit', '营业利润', P.opProfit, trOP, 'out', 0);
      const oth = P.oth.filter(nz);
      let trOth = null;
      if (oth.length) {
        b.h('Other income (expense):', '其他收益（费用）：');
        const ots = oth.map(x => T(x.ids, acctWhy(x.a.c) + '（收益为正，费用在括号内）'));
        oth.forEach((x, i) => b.l(x.a.en, x.a.zh, x.amt, ots[i], 'in', 1));
        trOth = Tsum(`其他收益净额 = ${oth.map(x => `${x.a.zh} ${fmt(x.amt)}`).join(' + ')} = ${m$(P.othTot)}。这些是非经营项目，盈利质量分析时通常看得比营业利润轻。`, ...ots);
        b.s('Total other income (expense), net', '其他收益净额', P.othTot, trOth, 'out', 1);
      }
      trPBT = Tsum(`持续经营税前利润 = 营业利润 ${m$(P.opProfit)} + 其他收益净额 ${m$(P.othTot)} = ${m$(P.pbt)}`, trOP, trOth);
    } else {
      b.h('Revenue and other income:', '收入及其他收益：');
      const inc = [...P.rev.filter(nz), ...P.oth.filter(x => x.a.t === 'R' && nz(x))];
      const its = inc.map(x => T(x.ids, acctWhy(x.a.c, '贷方发生额')));
      inc.forEach((x, i) => b.l(x.a.en, x.a.zh, x.amt, its[i], 'in', 1));
      const incTot = inc.reduce((s, x) => s + x.amt, 0);
      const trInc = Tsum(`收入及其他收益 = ${inc.map(x => `${x.a.zh} ${m$(x.amt)}`).join(' + ')} = ${m$(incTot)}`, ...its);
      b.s('Total revenue and other income', '收入及其他收益合计', incTot, trInc, 'out', 1);
      b.h('Expenses:', '费用：');
      const exps = [...P.opx.flatMap(expenseNatureRows).filter(nz), ...P.oth.filter(x => x.a.t === 'X' && nz(x)).map(x => ({...x, amt:-x.amt, ids:new Map([...x.ids].map(([k, v]) => [k, -v]))}))];
      const ets = exps.map(x => T(x.ids, `按性质列报：${x.a.natZh || x.a.zh}，不管属于哪个部门都合并在这一行。`));
      exps.forEach((x, i) => b.l(x.a.natEn || x.a.en, x.a.natZh || x.a.zh, x.amt, ets[i], 'in', 1));
      const expTot = exps.reduce((s, x) => s + x.amt, 0);
      const trExp = Tsum(`费用合计 = ${m$(expTot)}`, ...ets);
      b.s('Total expenses', '费用合计', expTot, trExp, 'out', 1);
      trPBT = Tsum(`持续经营税前利润 = 收入及其他收益 ${m$(incTot)} − 费用 ${m$(expTot)} = ${m$(P.pbt)}`, trInc, trExp);
    }
    b.s('Profit from continuing operations before income tax', '持续经营税前利润', P.pbt, trPBT, 'out', 0);
    const trTax = T(P.tax.ids, `所得税费用（持续经营部分）。${R.taxE ? R.taxE.calc : ''}`);
    b.l('Income tax expense', '所得税费用', P.tax.amt, trTax, 'out', 0);
    const trCont = Tsum(`持续经营利润 = 税前利润 ${m$(P.pbt)} − 所得税 ${m$(P.tax.amt)} = ${m$(P.cont)}`, trPBT, trTax);
    b.s('Profit from continuing operations', '持续经营利润', P.cont, trCont, 'out', 0);
    if (P.hasDisc) {
      b.h('Discontinued operations:', '终止经营：');
      const td = T(P.disc.ids, '终止经营部门的税前损益：已出售时 = 经营损益 + 处置利得/损失；年末持有待售时 = 经营损益 + 减值损失。');
      const tt = T(P.discTax.ids, `终止经营应承担的所得税（亏损时是税收利益）。${R.taxE ? R.taxE.calc : ''}`);
      b.l('Profit/(loss) from operations of discontinued component (incl. gain/loss on disposal or impairment)', '终止经营部门税前损益（含处置损益或减值）', P.disc.amt, td, 'in', 1);
      b.l(P.discTax.amt >= 0 ? 'Income tax benefit' : 'Income tax expense', P.discTax.amt >= 0 ? '所得税利益' : '所得税费用', P.discTax.amt, tt, 'in', 1);
      b.s(`${P.discNet < 0 ? 'Loss' : 'Profit'} on discontinued operations, net of tax`, '终止经营税后损益（单一金额）', P.discNet, Tsum(`终止经营税后 = ${fmt(P.disc.amt)} + ${fmt(P.discTax.amt)} = ${fmt(P.discNet)}`, td, tt), 'out', 1);
    }
    const npEn = `Net ${P.np < 0 ? 'loss' : 'profit'} for the period`;
    if (part === 'pl') b.g(npEn, '本期净利润', P.np, trNPw); else b.s(npEn, '本期净利润', P.np, trNPw, 'out', 0);
    if (part === 'pl') epsRows(b);
  }
  if (part !== 'pl') {
    if (part === 'oci') b.l(`Net ${P.np < 0 ? 'loss' : 'profit'} for the period`, '本期净利润（来自损益表）', P.np, trNPw, 'out', 0);
    b.h('Other comprehensive income:', '其他综合收益：');
    b.h('Items that will not be reclassified to profit or loss:', '不会重分类至损益的项目：', 1);
    const ocis = P.oci.filter(nz);
    const ots = ocis.map(x => T(x.ids, `${x.a.zh}：${x.a.c === '9000' ? '土地重估增值，累积在权益的「重估盈余」' : 'FVOCI 股权投资的公允价值变动，累积在「公允价值储备」'}，不进净利润。`));
    const ociName = {'9000':['Revaluation surplus on land','土地重估盈余'], '9100':['Fair value gain/(loss) on investments at FVOCI','FVOCI 投资公允价值变动']};
    ocis.forEach((x, i) => b.l(ociName[x.a.c][0], ociName[x.a.c][1], x.amt, ots[i], 'in', 2));
    if (!ocis.length) b.l('None this year', '本年没有', 0, null, 'in', 2);
    const trOCI = Tsum(`本期 OCI 合计 = ${m$(P.ociTot)}（税后）`, ...ots);
    b.s('Other comprehensive income for the period, net of tax', '本期其他综合收益（税后）', P.ociTot, trOCI, 'out', 1);
    b.g('Total comprehensive income for the period', '本期综合收益总额', P.tci, Tsum(`综合收益总额 = 净利润 ${m$(P.np)} + OCI ${m$(P.ociTot)} = ${m$(P.tci)}`, trNP, trOCI));
    if (part === 'all') epsRows(b);
  }
  return b.rows;
}
function epsRows(b){
  const P = R.P; if (!(P.wSh > 0)) return;
  const wtxt = `加权平均股数 = ${P.wParts.join(' + ')} = ${Math.round(P.wSh).toLocaleString('en-US')} 股`;
  const tr = v => T(null, `EPS = ${m$(v)} ÷ ${Math.round(P.wSh).toLocaleString('en-US')} 股 = ${(v / 100 / P.wSh).toFixed(4)}，四舍五入到两位小数。${wtxt}`);
  b.sp();
  b.h('Earnings per share (basic)', '每股收益（基本）');
  if (P.hasDisc) {
    b.l('Profit from continuing operations', '持续经营', P.eps(P.cont), tr(P.cont), 'out', 1, {fmt:'eps'});
    b.l(`${P.discNet < 0 ? 'Loss' : 'Profit'} from discontinued operations`, '终止经营', P.eps(P.discNet), tr(P.discNet), 'out', 1, {fmt:'eps'});
    b.s(`Net ${P.np < 0 ? 'loss' : 'profit'}`, '净利润', P.eps(P.np), tr(P.np), 'out', 1, {fmt:'eps'});
  } else b.l(`Net ${P.np < 0 ? 'loss' : 'profit'}`, '净利润', P.eps(P.np), tr(P.np), 'out', 1, {fmt:'eps'});
}

/* ---------- financial position ---------- */
function sfpRows(){
  if (S.chart) return chartSfpRows();
  const b = RB(), P = R.P;
  const line = (codes, sign, en, zh, ind = 2) => {
    const open = codes.reduce((x, c) => x + (R.OB[c] || 0), 0) * sign;
    const close = codes.reduce((x, c) => x + R.bal(c), 0) * sign;
    const c = R.col(p => codes.includes(p.a), sign);
    if (!open && !close && !c.ids.size) return null;
    let dr = 0, cr = 0; for (const p of R.POST) if (codes.includes(p.a)) { if (p.s > 0) dr += p.s; else cr -= p.s; }
    const tr = T(withOB(c.ids, open), `期末余额 = 期初 ${m$(open)} + 本期借方 ${m$(dr)} − 本期贷方 ${m$(cr)}${sign < 0 ? '（贷方余额账户，所以取相反符号）' : ''} = ${m$(close)}`);
    b.l(en, zh, close, tr, 'out', ind, {v2:open});
    return {close, open, tr};
  };
  const tot = (arr, en, zh, ind, grand) => {
    const xs = arr.filter(Boolean);
    const close = xs.reduce((s, x) => s + x.close, 0), open = xs.reduce((s, x) => s + x.open, 0);
    const tr = Tsum(`${zh} = ${xs.length ? '上面各项之和' : '0'} = ${m$(close)}（上年 ${m$(open)}）`, ...xs.map(x => x.tr));
    if (grand) b.g(en, zh, close, tr, 'out', {v2:open}); else b.s(en, zh, close, tr, 'out', ind, {v2:open});
    return {close, open, tr};
  };
  b.h('ASSETS', '资产');
  b.h('Non-current assets', '非流动资产', 1);
  const land = line(['1500'], 1, 'Land', '土地');
  const eqp = line(['1510'], 1, 'Equipment, at cost', '设备（成本）');
  const ad = line(['1515'], 1, 'Less: accumulated depreciation', '减：累计折旧');
  let ppe;
  if (eqp && ad) ppe = tot([eqp, ad], 'Equipment, net', '设备净额', 2); else ppe = eqp || ad;
  const inv = line(['1600'], 1, 'Investments at FVOCI', 'FVOCI 股权投资');
  const nca = tot([land, ppe, inv], 'Total non-current assets', '非流动资产合计', 1);
  b.h('Current assets', '流动资产', 1);
  const invt = line(['1200'], 1, 'Inventories', '存货');
  const ar = line(['1100'], 1, 'Accounts receivable', '应收账款');
  const al = line(['1105'], 1, 'Less: allowance for doubtful accounts', '减：坏账准备');
  let arN; if (ar && al) arN = tot([ar, al], 'Accounts receivable, net', '应收账款净额', 2); else arN = ar || al;
  const ir = line(['1110'], 1, 'Interest receivable', '应收利息');
  const staffAdv = line(['1150'], 1, 'Staff advances', '员工借支');
  const commissionRec = line(['1160'], 1, 'Commission recoverable', '应收佣金追回款');
  const pp = line(['1300'], 1, 'Prepaid expenses', '预付费用');
  const supAdv = line(['1350'], 1, 'Supplier advances', '预付供应商款');
  const taxPrepaid = line(['1360'], 1, 'Prepaid profits tax', '预付利得税');
  const cash = line(['1000'], 1, 'Cash and cash equivalents', '现金及现金等价物');
  const hfs = line(['1450'], 1, 'Assets held for sale', '持有待售资产');
  const ca = tot([invt, arN, ir, staffAdv, commissionRec, pp, supAdv, taxPrepaid, cash, hfs], 'Total current assets', '流动资产合计', 1);
  const ta = tot([nca, ca], 'TOTAL ASSETS', '资产总计', 0, true);
  b.sp();
  b.h('EQUITY AND LIABILITIES', '权益及负债');
  b.h('Equity', '权益', 1);
  const sc = line(['3000'], -1, 'Share capital', '股本');
  // retained earnings (pre-closing: opening + profit − dividends)
  const reOpen = -((R.OB['3100'] || 0) + (R.OB['3300'] || 0));
  const reIds = new Map(); if (reOpen) reIds.set('OB', reOpen); reIds.set('NP', P.np);
  for (const p of R.POST) if (p.a === '3100' || p.a === '3300') reIds.set(p.id, (reIds.get(p.id) || 0) - p.s);
  const reTr = T(reIds, `期末留存收益 = 期初 ${m$(reOpen)} + 本期净利润 ${m$(P.np)} − 宣告股利 ${m$(R.bal('3300'))}${R.MV['3100'] ? ` + 其他直接变动 ${m$(-R.MV['3100'])}` : ''} = ${m$(R.reEnd)}。结账前，净利润还停留在收入费用账户里，所以这里要把它加进来。`, {hits:P.plHits});
  b.l('Retained earnings', '留存收益', R.reEnd, reTr, 'out', 2, {v2:reOpen});
  const re = {close:R.reEnd, open:reOpen, tr:reTr};
  const resv = (code, ociCode, en, zh) => {
    const open = -(R.OB[code] || 0), oc = P.ociOf(ociCode), close = -R.bal(code) + oc.amt;
    if (!open && !close && !oc.ids.size && !(R.MV[code])) return null;
    const ids = new Map(); if (open) ids.set('OB', open);
    for (const [k, v] of oc.ids) ids.set(k, (ids.get(k) || 0) + v);
    for (const p of R.POST) if (p.a === code) ids.set(p.id, (ids.get(p.id) || 0) - p.s);
    const tr = T(ids, `期末 = 期初 ${m$(open)} + 本期 OCI ${m$(oc.amt)} = ${m$(close)}。这就是「累计其他综合收益」。`);
    b.l(en, zh, close, tr, 'out', 2, {v2:open});
    return {close, open, tr};
  };
  const rv = resv('3200', '9000', 'Revaluation surplus', '重估盈余');
  const fv = resv('3210', '9100', 'Fair value reserve', '公允价值储备');
  const te = tot([sc, re, rv, fv], 'Total equity', '权益合计', 1);
  b.h('Non-current liabilities', '非流动负债', 1);
  const ltb = line(['2500'], -1, 'Long-term borrowings', '长期借款');
  const ncl = tot([ltb], 'Total non-current liabilities', '非流动负债合计', 1);
  b.h('Current liabilities', '流动负债', 1);
  const cls = [['2000','Accounts payable','应付账款'],['2050','Commissions payable','应付佣金'],['2060','Employee reimbursements payable','应付员工报销'],['2070','MPF contributions payable','应付强积金'],['2080','Accrued operating expenses','应计营业费用'],['2100','Salaries payable','应付职工薪酬'],['2150','Interest payable','应付利息'],['2200','Income tax payable','应交所得税'],['2300','Unearned revenue (contract liability)','预收收入（合同负债）'],['2400','Dividends payable','应付股利']].map(([c, en, zh]) => line([c], -1, en, zh));
  const cl = tot(cls, 'Total current liabilities', '流动负债合计', 1);
  const tl = tot([ncl, cl], 'Total liabilities', '负债合计', 1);
  const tel = tot([te, tl], 'TOTAL EQUITY AND LIABILITIES', '权益及负债总计', 0, true);
  return {rows:b.rows, ta, tel};
}

/* ---------- statements grouped by the company's chart (Manager.io style) ----------
   Every account of a section is its own line, ordered by the company's code, followed by the section total.
   The figures are the same report data as the standard statements, so net profit and the balance check agree. */
const chartHead = id => { const s = S.chart?.sections?.[id] || {}, d = Chart.SECTION[id]; return s.name ? [s.name, s.name] : [d.en, d.zh]; };
const chartTotal = id => { const s = S.chart?.sections?.[id] || {}, [en, zh] = chartHead(id); return s.total ? [s.total, s.total] : [`Total ${en.toLowerCase()}`, `${zh}合计`]; };
const chartLine = key => { const o = S.chart?.lines?.[key], d = Chart.LINES[key]; return o?.name ? [o.name, o.name] : [d.en, d.zh]; };
const sectionAccounts = id => COA.filter(a => !a.hidden && Chart.sectionOf(a) === id);
function chartPlRows(){
  const P = R.P, b = RB();
  const section = (id, sign) => {
    const xs = sectionAccounts(id).map(a => ({a, ...R.acol(a.c, sign)})).filter(nz);
    if (!xs.length) return {amt:0, tr:null};
    const [en, zh] = chartHead(id); b.h(en, zh);
    const trs = xs.map(x => { const t = T(x.ids, acctWhy(x.a.c, sign < 0 ? '贷方发生额' : '借方发生额')); b.l(x.a.en, x.a.zh, x.amt, t, 'in', 1); return t; });
    const amt = xs.reduce((n, x) => n + x.amt, 0), [ten, tzh] = chartTotal(id);
    const tr = Tsum(`${tzh} = ${xs.map(x => `${x.a.zh} ${m$(x.amt)}`).join(' + ')} = ${m$(amt)}`, ...trs);
    b.s(ten, tzh, amt, tr, 'out', 0);
    return {amt, tr};
  };
  const rev = section('rev', -1), cos = section('cos', 1);
  const gp = rev.amt - cos.amt, [gen, gzh] = chartLine('gp');
  const trGP = Tsum(`${gzh} = ${m$(rev.amt)} − ${m$(cos.amt)} = ${m$(gp)}`, rev.tr, cos.tr);
  if (rev.tr || cos.tr) b.s(gen, gzh, gp, trGP, 'out', 0);
  const oi = section('oi', -1), opx = section('opx', 1), oe = section('oe', 1);
  const pbt = gp + oi.amt - opx.amt - oe.amt;
  const trPBT = Tsum(`${gzh} ${m$(gp)} + ${chartHead('oi')[1]} ${m$(oi.amt)} − ${chartHead('opx')[1]} ${m$(opx.amt)} − ${chartHead('oe')[1]} ${m$(oe.amt)} = ${m$(pbt)}`, trGP, oi.tr, opx.tr, oe.tr);
  const taxed = sectionAccounts('tax').some(a => nz(R.acol(a.c, 1)));
  let trNP = trPBT;
  if (taxed) {
    const [pen, pzh] = chartLine('pbt'); b.s(pen, pzh, pbt, trPBT, 'out', 0);
    const tax = section('tax', 1);
    trNP = Tsum(`${chartLine('np')[1]} = ${pzh} ${m$(pbt)} − ${chartHead('tax')[1]} ${m$(tax.amt)} = ${m$(pbt - tax.amt)}`, trPBT, tax.tr);
  }
  const [nen, nzh] = chartLine('np');
  b.g(nen, nzh, P.np, trNP);
  const ocis = P.oci.filter(nz);
  if (ocis.length) {
    b.h('Other comprehensive income', '其他综合收益');
    const ots = ocis.map(x => { const t = T(x.ids, acctWhy(x.a.c)); b.l(x.a.en, x.a.zh, x.amt, t, 'in', 1); return t; });
    b.g('Total comprehensive income', '综合收益总额', P.tci, Tsum(`${nzh} ${m$(P.np)} + 其他综合收益 ${m$(P.ociTot)} = ${m$(P.tci)}`, trNP, ...ots));
  }
  return b.rows;
}
function chartSfpRows(){
  const b = RB(), P = R.P;
  const item = (x, sign) => {
    const open = x.ob * sign, posts = R.POST.filter(x.match), close = open + posts.reduce((n, p) => n + p.s, 0) * sign;
    if (!open && !close && !posts.length) return null;
    const ids = new Map(); for (const p of posts) ids.set(p.id, (ids.get(p.id) || 0) + p.s * sign);
    let dr = 0, cr = 0; for (const p of posts) { if (p.s > 0) dr += p.s; else cr -= p.s; }
    const tr = T(withOB(ids, open), `${x.zh}（${x.code}）期末余额 = 期初 ${m$(open)} + 本期借方 ${m$(dr)} − 本期贷方 ${m$(cr)}${sign < 0 ? '（贷方余额科目，取相反符号）' : ''} = ${m$(close)}`);
    b.l(x.en, x.zh, close, tr, 'out', 1, {v2:open});
    return {close, open, tr};
  };
  const tot = (xs, en, zh, grand) => {
    xs = xs.filter(Boolean);
    const close = xs.reduce((n, x) => n + x.close, 0), open = xs.reduce((n, x) => n + x.open, 0);
    const tr = Tsum(`${zh} = ${xs.length ? '上面各项之和' : '0'} = ${m$(close)}（上年末 ${m$(open)}）`, ...xs.map(x => x.tr));
    if (grand) b.g(en, zh, close, tr, 'out', {v2:open}); else b.s(en, zh, close, tr, 'out', 0, {v2:open});
    return {close, open, tr};
  };
  const section = (id, sign) => {
    const items = ledgerItems(sectionAccounts(id));
    if (!items.some(x => x.ob || R.POST.some(x.match))) return null;
    const [en, zh] = chartHead(id); b.h(en, zh);
    const xs = items.map(x => item(x, sign));
    return tot(xs, ...chartTotal(id));
  };
  const nca = section('nca', 1), ca = section('ca', 1);
  const ta = tot([nca, ca], ...chartLine('assets'), true);
  b.sp();
  const cl = section('cl', -1), ncl = section('ncl', -1);
  const tl = tot([cl, ncl], ...chartLine('liabilities'));
  // Equity: share capital, then accumulated profit including this year's profit (before closing), then reserves.
  b.h(...chartHead('eq'));
  const eqItems = [];
  for (const a of sectionAccounts('eq')) {
    if (['3300', '3900'].includes(a.c)) continue;
    if (a.c === '3100') {
      const reOpen = -((R.OB['3100'] || 0) + (R.OB['3300'] || 0));
      const ids = new Map(); if (reOpen) ids.set('OB', reOpen); ids.set('NP', P.np);
      for (const p of R.POST) if (p.a === '3100' || p.a === '3300') ids.set(p.id, (ids.get(p.id) || 0) - p.s);
      const tr = T(ids, `期末 = 期初 ${m$(reOpen)} + 本期净利润 ${m$(P.np)} − 股利 ${m$(R.bal('3300'))}${R.MV['3100'] ? ` + 其他直接变动 ${m$(-R.MV['3100'])}` : ''} = ${m$(R.reEnd)}。结账前本期利润还在收入费用科目里，所以这里加上。`, {hits:P.plHits});
      b.l(a.en, a.zh, R.reEnd, tr, 'out', 1, {v2:reOpen});
      eqItems.push({close:R.reEnd, open:reOpen, tr});
    } else if (a.c === '3200' || a.c === '3210') {
      const oc = P.ociOf(a.c === '3200' ? '9000' : '9100'), open = -(R.OB[a.c] || 0), close = -R.bal(a.c) + oc.amt;
      if (!open && !close && !oc.ids.size) continue;
      const ids = new Map(oc.ids); if (open) ids.set('OB', open); for (const p of R.POST) if (p.a === a.c) ids.set(p.id, (ids.get(p.id) || 0) - p.s);
      const tr = T(ids, `期末 = 期初 ${m$(open)} + 本期其他综合收益 ${m$(oc.amt)} = ${m$(close)}`);
      b.l(a.en, a.zh, close, tr, 'out', 1, {v2:open}); eqItems.push({close, open, tr});
    } else eqItems.push(item(ledgerItems([a])[0], -1));
  }
  const te = tot(eqItems, ...chartTotal('eq'));
  const tel = tot([tl, te], ...chartLine('le'), true);
  return {rows:b.rows, ta, tel};
}

/* ---------- cash flows ---------- */
function scfRows(){
  const b = RB(), CF = R.CF, P = R.P, method = S.settings.cfMethod;
  const netLab = (v, act, zh) => [`Net cash ${v < 0 ? 'used in' : 'from'} ${act} activities`, `${zh}活动产生的现金流量净额`];
  b.h('Cash flows from operating activities', '经营活动现金流量');
  let trOp;
  if (method === 'indirect') {
    const trNP = T(new Map([['NP', P.np]]), '间接法从净利润（包括终止经营）出发，再把权责发生制下的非现金项目和营运资本变动调整掉。', {hits:P.plHits});
    b.l(`Net ${P.np < 0 ? 'loss' : 'profit'} for the period`, '本期净利润', P.np, trNP, 'in', 1);
    const trs = [trNP];
    if (CF.adjAgg.length) {
      b.h('Adjustments for non-cash and investing items:', '调整非现金及投资类项目：', 1);
      for (const a of CF.adjAgg) { const L = ADJ_LABEL[a.key] || ADJ_LABEL.other; const t = T(a.ids, `${L[1]}：影响了净利润但没有经营现金流动（或者现金已经整笔列入投资活动），所以${a.amt > 0 ? '加回' : '减去'}。`); trs.push(t); b.l(L[0], L[1], a.amt, t, 'in', 2); }
    }
    if (CF.wc.length) {
      b.h('Changes in working capital:', '营运资本变动：', 1);
      for (const w of CF.wc) {
        const L = WC_LABEL[w.k] || (ACC[w.k] ? [ACC[w.k].en, ACC[w.k].zh] : [w.k, w.k]);
        const d = w.close - w.open, up = w.isAsset ? d > 0 : d < 0;
        const en = `${up ? 'Increase' : 'Decrease'} in ${L[0]}`, zh = `${L[1]}${up ? '增加' : '减少'}`;
        const openS = w.isAsset ? w.open : -w.open, closeS = w.isAsset ? w.close : -w.close;
        const t = T(w.ids, `${L[1]}：期初 ${m$(openS)} → 期末 ${m$(closeS)}。${w.isAsset ? (up ? '经营性资产增加，说明收入/费用里有一部分还没收到现金或已提前付出现金，所以减去' : '经营性资产减少，释放出现金，所以加回') : (up ? '经营性负债增加，说明费用已确认但现金还没付，所以加回' : '经营性负债减少，说明本期多付了现金，所以减去')}。`);
        trs.push(t); b.l(en, zh, w.amt, t, 'in', 2);
      }
    }
    trOp = Tsum(`间接法：净利润 ${m$(P.np)} + 调整项 ${m$(CF.adjAgg.reduce((s, x) => s + x.amt, 0))} + 营运资本变动 ${m$(CF.wc.reduce((s, x) => s + x.amt, 0))} = ${m$(CF.indirectTot)}；和直接法 ${m$(CF.opTot)} ${CF.indirectTot === CF.opTot ? '相等 ✓' : '不相等 ✗'}`, ...trs);
    const [en, zh] = netLab(CF.indirectTot, 'operating', '经营');
    b.s(en, zh, CF.indirectTot, trOp, 'out', 0);
  } else {
    const trs = CF.opD.map(x => { const L = OP_LABEL[x.key] || OP_LABEL.otherOpex; const t = T(x.ids, `直接法：${L[1]}。把现金账户里所有属于这一类的收付款加总。`); b.l(L[0], L[1], x.amt, t, 'in', 1); return t; });
    if (!CF.opD.length) b.l('No operating cash flows', '没有经营现金流量', 0, null, 'in', 1);
    trOp = Tsum(`直接法经营现金流量 = ${m$(CF.opTot)}`, ...trs);
    const [en, zh] = netLab(CF.opTot, 'operating', '经营');
    b.s(en, zh, CF.opTot, trOp, 'out', 0);
  }
  const sec = (list, labels, act, en0, zh0) => {
    b.h(en0, zh0);
    const trs = list.map(x => { const L = IF_LABEL[x.key] || [x.key, x.key]; const t = T(x.ids, `${L[1]}：投资和筹资活动总是用直接法，并且流入、流出分别列示（不能互相抵销）。`); b.l(L[0], L[1], x.amt, t, 'in', 1); return t; });
    if (!list.length) b.l('None', '无', 0, null, 'in', 1);
    const tot = list.reduce((s, x) => s + x.amt, 0);
    const [en, zh] = netLab(tot, act, labels);
    const tr = Tsum(`${zh} = ${m$(tot)}`, ...trs);
    b.s(en, zh, tot, tr, 'out', 0);
    return tr;
  };
  const trInv = sec(R.CF.inv, '投资', 'investing', 'Cash flows from investing activities', '投资活动现金流量');
  const trFin = sec(R.CF.fin, '筹资', 'financing', 'Cash flows from financing activities', '筹资活动现金流量');
  b.s(`Net ${CF.net < 0 ? 'decrease' : 'increase'} in cash and cash equivalents`, '现金及现金等价物净增加额', CF.net, Tsum(`经营 ${m$(CF.opTot)} + 投资 ${m$(CF.invTot)} + 筹资 ${m$(CF.finTot)} = ${m$(CF.net)}`, trOp, trInv, trFin), 'out', 0);
  b.l(`Cash and cash equivalents at 1 January ${R.yr}`, '年初现金及现金等价物', CF.openCash, T(new Map([['OB', CF.openCash]]), '来自期初余额（上年末财务状况表）。'), 'out', 0);
  b.g(`Cash and cash equivalents at ${R.end}`, '期末现金及现金等价物', CF.closeCash, Tsum(`期初 ${m$(CF.openCash)} + 净增加 ${m$(CF.net)} = ${m$(CF.openCash + CF.net)}，与财务状况表中的现金 ${m$(R.bal('1000'))} ${CF.openCash + CF.net === R.bal('1000') ? '一致 ✓' : '不一致 ✗'}`, trOp, trInv, trFin));
  return b.rows;
}

/* ---------- changes in equity ---------- */
function soceData(){
  const P = R.P;
  const colsAll = [{c:'3000', en:'Share capital', zh:'股本'}, {c:'3100', en:'Retained earnings', zh:'留存收益'}, {c:'3200', en:'Revaluation surplus', zh:'重估盈余', oci:'9000'}, {c:'3210', en:'Fair value reserve', zh:'公允价值储备', oci:'9100'}];
  const cols = colsAll.filter(c => c.c === '3000' || c.c === '3100' || R.OB[c.c] || R.MV[c.c] || (c.oci && P.ociOf(c.oci).ids.size));
  const cell = (v, tr) => ({v, tr});
  const rows = [];
  const open = cols.map(c => { const v = -((R.OB[c.c] || 0) + (c.c === '3100' ? (R.OB['3300'] || 0) : 0)); return cell(v, T(new Map(v ? [['OB', v]] : []), `${c.zh}期初余额（上年末财务状况表）。`)); });
  rows.push({k:'l', en:`Balance at 1 January ${R.yr}`, zh:`${R.yr} 年 1 月 1 日余额`, cells:open});
  const npRow = cols.map(c => c.c === '3100' ? cell(P.np, T(new Map([['NP', P.np]]), '本期净利润（来自损益表）进入留存收益。', {hits:P.plHits})) : cell(null));
  rows.push({k:'l', en:`${P.np < 0 ? 'Loss' : 'Profit'} for the period`, zh:'本期净利润', cells:npRow, ind:1});
  const ociRow = cols.map(c => { if (!c.oci) return cell(null); const o = P.ociOf(c.oci); return cell(o.amt, T(o.ids, `本期 OCI 进入${c.zh}。`)); });
  rows.push({k:'l', en:'Other comprehensive income', zh:'其他综合收益', cells:ociRow, ind:1});
  const tciRow = cols.map((c, i) => { const a = npRow[i].v || 0, o = ociRow[i].v || 0; return cell(npRow[i].v == null && ociRow[i].v == null ? null : a + o, Tsum('净利润 + OCI', npRow[i].tr, ociRow[i].tr)); });
  rows.push({k:'s', en:'Total comprehensive income for the period', zh:'本期综合收益总额', cells:tciRow});
  rows.push({k:'h', en:'Transactions with owners:', zh:'与所有者的交易：'});
  const own = [];
  const shc = R.acol('3000', -1);
  if (shc.ids.size) own.push({k:'l', en:'Issue of ordinary shares', zh:'发行普通股', ind:1, cells:cols.map(c => c.c === '3000' ? cell(shc.amt, T(shc.ids, '本年发行股份，股本增加。')) : cell(null))});
  const dv = R.acol('3300', -1);
  if (dv.ids.size) own.push({k:'l', en:'Dividends declared', zh:'宣告股利', ind:1, cells:cols.map(c => c.c === '3100' ? cell(dv.amt, T(dv.ids, '宣告股利减少留存收益。股利是分配，不是费用。')) : cell(null))});
  const oth = cols.map(c => { const x = R.acol(c.c, -1); return x.ids.size && c.c !== '3000' ? cell(x.amt, T(x.ids, `直接记入${c.zh}的其他分录。`)) : cell(null); });
  if (oth.some(x => x.v != null)) own.push({k:'l', en:'Other movements', zh:'其他变动', ind:1, cells:oth});
  if (!own.length) own.push({k:'l', en:'None this year', zh:'本年没有', ind:1, cells:cols.map(() => cell(null))});
  rows.push(...own);
  const close = cols.map((c, i) => { let v = 0; const trs = []; for (const r of rows) if (r.cells && r.k === 'l') { v += r.cells[i].v || 0; trs.push(r.cells[i].tr); } return cell(v, Tsum(`${c.zh}期末 = 期初 + 本年各项变动 = ${m$(v)}，与财务状况表一致。`, ...trs)); });
  rows.push({k:'g', en:`Balance at ${R.end}`, zh:`${R.end} 余额`, cells:close});
  // total column
  for (const r of rows) if (r.cells) { const vs = r.cells.filter(x => x.v != null); r.cells.push(cell(vs.length ? vs.reduce((s, x) => s + x.v, 0) : null, Tsum('各栏合计', ...r.cells.map(x => x.tr)))); }
  return {cols:[...cols, {c:'tot', en:'Total equity', zh:'权益合计'}], rows};
}

/* ================= rendering: statements ================= */
function pushTrace(o){ TRACES.push(o); return TRACES.length - 1; }
function amtCell(v, format){
  return v == null ? '<td class="amt"></td>' : `<td class="amt has">${format==='eps' ? epsHTML(v) : amtHTML(v)}</td>`;
}
function rowHTML(r, yy){
  if (r.k === 'sp') return `<tr class="r-sp"><td colspan="3" style="height:8px"></td></tr>`;
  const ti = r.tr ? pushTrace({en:r.en, zh:r.zh, v:r.v, fmt:r.fmt, tr:r.tr}) : -1;
  const hit = UI.sel && r.tr && r.tr.hits && r.tr.hits.has(UI.sel);
  const clickable = ti >= 0;
  const cls = ['r-' + r.k, r.ul ? 'ul' : '', hit ? 'hit' : '', clickable ? 'tr' : ''].filter(Boolean).join(' ');
  const labCell = `<td class="lab ind${r.ind || 0}">${lab(r.en, r.zh)}</td>`;
  let cells;
  if (r.k === 'h') cells = '<td class="amt"></td><td class="amt"></td>';
  else if (yy) cells = amtCell(r.v, r.fmt) + (r.v2 === undefined ? '<td class="amt prior"></td>' : amtCell(r.v2, r.fmt).replace('class="amt has"', 'class="amt has prior"'));
  else { const inn = r.col === 'in'; cells = (inn ? amtCell(r.v, r.fmt) : '<td class="amt"></td>') + (!inn ? amtCell(r.v, r.fmt) : '<td class="amt"></td>'); }
  return `<tr class="${cls}"${clickable ? ` data-t="${ti}" tabindex="0"` : ''}>${labCell}${cells}</tr>`;
}
function perLine(){ return lab(`${R.start} to ${R.end}`, `${R.start} 至 ${R.end}`); }
function stmtHTML(en, zh, per, rows, opt = {}){
  const yy = !!opt.yy;
  const head = yy ? `<tr><th></th><th>${R.end}<br>${esc(cur())}</th><th>${R.yr - 1}-12-31<br>${esc(cur())}</th></tr>` : `<tr><th></th><th colspan="2">${esc(cur())}</th></tr>`;
  return `<div class="paper"><header class="st-head"><div class="st-co">${esc(S.company.name)}</div><h3>${lab(en, zh)}</h3><div class="st-per">${per}</div></header>
    <div class="scroll"><table class="st"><thead>${head}</thead><tbody>${rows.map(r => rowHTML(r, yy)).join('')}</tbody></table></div>${opt.notes ? `<div class="st-notes">${opt.notes}</div>` : ''}</div>`;
}
/* ---------- panes ---------- */
const TABS = [['opening','0','期初余额'],['journal','1','日记账'],['ledger','2','分类账'],['tb','3','试算平衡表'],['pl','4','损益及OCI表'],['soce','5','权益变动表'],['sfp','6','财务状况表'],['scf','7','现金流量表'],['closing','8','结账'],['chart','9','科目表']];
const TIPS = {
  opening:'<b>做什么：</b>填开始用系统前一天（上年 12 月 31 日）每个科目的余额，通常照上年的资产负债表抄，也是今年报表的比较数字。<b>什么时候用：</b>只在开账时填一次。资产填借方；负债、权益和备抵账户填贷方，借贷合计必须相等。',
  journal:'每笔交易自动生成借贷相等的分录。可从凭证查看受影响的报表项目。',
  ledger:'<b>做什么：</b>按科目查看每一笔：每张卡片左边是借方，右边是贷方，底下是余额。<b>什么时候用：</b>想知道某个科目「为什么是这个数」时。点 J 编号可以打开那张凭证。',
  chart:'科目表：每个科目的代码、名称和报表分组。',
  tb:'<b>做什么：</b>把所有科目的余额排在一起，检查借方合计是否等于贷方合计。<b>什么时候用：</b>每月出报表前。未调整 ＋ 调整分录 ＝ 调整后，报表用调整后的数字。平衡只说明算术没错，记错科目或漏记整笔交易它发现不了。',
  pl:'持续经营与终止经营分开，终止经营以税后单一金额列报；OCI 不进净利润，但进综合收益。点任意数字可以查看它由哪些分录构成。',
  soce:'权益变动表把损益表和财务状况表连起来：净利润流入留存收益，OCI 流入储备，与股东的交易（发股、分红）单独列示。',
  sfp:'IFRS 常见排列：非流动资产在前，权益在负债之前。右栏的比较数字就是期初余额。',
  scf:'现金流量表要把权责发生制还原为现金收付。投资、筹资活动一律用直接法；经营活动可以用直接法或间接法，两种方法的结果必须相同。',
  closing:'<b>做什么：</b>预览年底如何把收入、费用、股利和 OCI 清零，转入留存收益和储备，下一年从零开始。<b>什么时候用：</b>年底核对。这里只是预览，不会记账；报表已经自动把本年利润计入留存收益。',
};
function paneBar(tab, ctl = ''){
  return `<div class="pane-bar"><p class="tip">${TIPS[tab]}</p><div class="pane-ctl">${ctl}</div></div>`;
}
const seg = (act, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;

function panePL(){
  const P = R.P, st = S.settings;
  if (S.chart) {
    const [en, zh] = chartLine('pl');
    return paneBar('pl') + stmtHTML(en, zh, perLine(), plRows('pl'), {notes:`<p>按公司科目表的分组列示，每个科目一行，同组按代码排列。分组和名称在「总账与试算 → 科目表」修改。</p>`});
  }
  const ctl = seg('plMethod', st.plMethod, [['function', '按功能'], ['nature', '按性质']]) + seg('plPres', st.plPres, [['single', '单一报表'], ['two', '两张报表']]);
  const notes = [];
  notes.push(`<p><b>${st.plMethod === 'function' ? '按功能（function of expense）' : '按性质（nature of expense）'}：</b>${st.plMethod === 'function' ? '费用按用途归入销售成本、销售费用、管理费用，所以能看到毛利和营业利润。切换为「按性质」：同样的费用改按工资、折旧、租金等性质排列，没有毛利这一行，但税前利润完全相同。' : '费用按工资、折旧、租金等性质列示，没有「毛利」和「营业利润」小计。两种方式下，持续经营税前利润都是 ' + hm$(P.pbt) + '。'}</p>`);
  if (P.hasDisc) notes.push(`<p><b>盈利质量：</b>持续经营利润 ${hm$(P.cont)} 比净利润 ${hm$(P.np)} 更能预测未来，因为终止经营以后不会再发生。</p>`);
  notes.push(`<p><b>综合收益 = 净利润 + OCI：</b>${hm$(P.np)} + ${hm$(P.ociTot)} = ${hm$(P.tci)}。</p>`);
  let body;
  if (st.plPres === 'single') body = stmtHTML('Statement of Profit or Loss and Other Comprehensive Income', '损益及其他综合收益表', perLine(), plRows('all'), {notes:notes.join('')});
  else body = stmtHTML('Statement of Profit or Loss', '损益表', perLine(), plRows('pl')) + stmtHTML('Statement of Comprehensive Income', '综合收益表', perLine(), plRows('oci'), {notes:notes.join('')});
  return paneBar('pl', ctl) + body;
}
function paneSFP(){
  const d = sfpRows();
  const okb = d.ta.close === d.tel.close;
  const notes = `<p><span class="okbad${okb ? '' : ' bad'}">${okb ? '✓' : '✗'} 资产总计 ${hm$(d.ta.close)} ${okb ? '=' : '≠'} 权益及负债总计 ${hm$(d.tel.close)}</span></p>
    <p><b>为什么留存收益不等于试算表里的数？</b>结账前，本期净利润还在收入和费用账户里，留存收益账户只有期初余额。编表时要用「期初 + 净利润 − 股利」。到「结账」页看结账分录做完之后的余额。</p>`;
  const [ten, tzh] = S.chart ? chartLine('bs') : ['Statement of Financial Position', '财务状况表'];
  return paneBar('sfp') + stmtHTML(ten, tzh, lab(`As at ${R.end}`, `截至 ${R.end}`), d.rows, {yy:true, notes});
}
function paneSCF(){
  const CF = R.CF, st = S.settings;
  const ctl = seg('cfMethod', st.cfMethod, [['indirect', '间接法'], ['direct', '直接法']]);
  const notes = [];
  const same = CF.opTot === CF.indirectTot;
  notes.push(`<p><span class="okbad${same ? '' : ' bad'}">${same ? '✓' : '✗'} 经营活动现金流量：直接法 ${hm$(CF.opTot)} ${same ? '=' : '≠'} 间接法 ${hm$(CF.indirectTot)}</span></p>`);
  if (st.cfMethod === 'indirect') notes.push(`<p><b>补充披露：</b>支付的利息 ${hm$(CF.intPaid)}，支付的所得税 ${hm$(CF.taxPaid)}${CF.intRec ? `，收到的利息 ${hm$(CF.intRec)}` : ''}。间接法看不到这些金额，所以要另外披露。</p>`);
  if (CF.nonCash.length) notes.push(`<p><b>附注：非现金投资及筹资活动</b></p><ul style="margin:0;padding-left:18px">${CF.nonCash.map(n => { const e = R.byId[n.id]; return `<li>${esc(e.memo)}（J${e.no}）${e.memo.includes(fmt(n.amt)) ? '' : '：' + hm$(n.amt)}</li>`; }).join('')}</ul>`);
  notes.push(`<p><b>分类口径：</b>收到和支付的利息、支付的所得税列为经营活动；支付的股利列为筹资活动。</p>`);
  return paneBar('scf', ctl) + stmtHTML('Statement of Cash Flows', '现金流量表', perLine(), scfRows(), {notes:notes.join('')});
}
function paneSOCE(){
  const d = soceData();
  const head = `<tr><th></th>${d.cols.map(c => `<th>${uiEsc(lang() === 'zh' ? c.zh : c.en)}${lang() === 'both' ? `<span class="zh">${uiEsc(c.zh)}</span>` : ''}</th>`).join('')}</tr>`;
  const body = d.rows.map((r, ri) => {
    if (r.k === 'h') return `<tr class="r-h"><td class="lab">${lab(r.en, r.zh)}</td>${d.cols.map(() => '<td class="amt"></td>').join('')}</tr>`;
    const cls = ['r-' + r.k, (d.rows[ri + 1] && d.rows[ri + 1].k !== 'h' && (d.rows[ri + 1].k === 's' || d.rows[ri + 1].k === 'g')) ? 'ul' : ''].filter(Boolean).join(' ');
    const cells = r.cells.map((c, ci) => {
      if (c.v == null) return '<td class="amt"></td>';
      const hit = UI.sel && c.tr && c.tr.hits && c.tr.hits.has(UI.sel);
      const ti = c.tr ? pushTrace({en:`${r.en} · ${d.cols[ci].en}`, zh:`${r.zh} · ${d.cols[ci].zh}`, v:c.v, tr:c.tr}) : -1;
      const inner = amtCell(c.v).replace(/^<td class="amt has">|<\/td>$/g, '');
      return `<td class="amt has${hit ? ' hitc' : ''}"${ti >= 0 ? ` data-t="${ti}" tabindex="0" style="cursor:pointer"` : ''}${hit ? ' style="background:var(--hl)"' : ''}>${inner}</td>`;
    }).join('');
    return `<tr class="${cls}"><td class="lab ind${r.ind || 0}">${lab(r.en, r.zh)}</td>${cells}</tr>`;
  }).join('');
  const reOk = d.rows[d.rows.length - 1].cells[1].v === R.reEnd;
  return paneBar('soce') + `<div class="paper" style="max-width:940px"><header class="st-head"><div class="st-co">${esc(S.company.name)}</div><h3>${lab('Statement of Changes in Equity', '权益变动表')}</h3><div class="st-per">${perLine()} · ${esc(cur())}</div></header>
    <div class="scroll"><table class="st soce"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="st-notes"><p><span class="okbad${reOk ? '' : ' bad'}">${reOk ? '✓' : '✗'} 期末留存收益 ${hm$(R.reEnd)} 与财务状况表一致</span></p><p><b>看点：</b>净利润和 OCI 合起来是「本期综合收益总额」${hm$(R.P.tci)}；发股和分红是与所有者的交易，不属于综合收益。点击任一单元格查看来源。</p></div></div>`;
}
function jeHTML(e, opt = {}){
  const tags = opt.closing ? '' : tagsOf(e).map(([t, c]) => `<span class="tag ${c}">${t}</span>`).join(' ');
  const hit = !opt.closing && UI.sel === e.id;
  const lines = e.groups.map((g, gi) => {
    const ordered = [...g.filter(l => l.s > 0), ...g.filter(l => l.s < 0)];
    return ordered.map(l => `<tr><td class="${l.s < 0 ? 'cra' : ''}">${lineAcctLab(l)}${l.a==='1000'&&Bank.accounts(S).length>1?`<span class="fn">${(l.cashAccount||Bank.MAIN)===Bank.MAIN ? uiEsc(cashName(l)) : esc(cashName(l))}</span>`:''}${l.fn ? `<span class="fn">${FNZ(l.fn)}</span>` : ''}</td><td class="ref">${esc(lineCode(l))}</td><td class="amt dr-amt">${l.s > 0 ? fmt(l.s) : ''}</td><td class="amt cr-amt">${l.s < 0 ? fmt(-l.s) : ''}</td></tr>`).join('') + (gi < e.groups.length - 1 ? '<tr class="gs"><td colspan="4"></td></tr>' : '');
  }).join('');
  const destinations = opt.closing ? '' : `<button class="text-button voucher-report-link" data-act="voucherReport" data-id="${esc(e.id)}">查看报表影响 ↗</button>`;
  const meta = [e.party ? '往来：'+esc(e.party) : '', e.ref ? '单据：'+esc(e.ref) : ''].filter(Boolean);
  const sale=e.member?.saleId && memberSale(S,e.member.saleId), cardNo=e.member?.cardNo || sale?.member.cardNo;
  const linkedInfo=cardNo ? `<p class="je-meta">会员卡：${esc(cardNo)}${sale?` · 关联购卡凭证：<button class="text-button" data-act="jump" data-id="${esc(sale.id)}">${esc(sale.id)}</button>`:''}</p>` : '';
  const attachments=e.attachments?.length?`<p class="je-meta">原始单据： ${e.attachments.map(a=>`<a download="${esc(a.name)}" href="${esc(a.data)}">${esc(a.name)}</a>`).join(' · ')}</p>`:'';
  return `<article class="je${hit ? ' hit' : ''}" id="je-${e.id}"><div class="je-h"><span class="je-no">${opt.closing ? e.no : 'J' + e.no}</span>${opt.closing ? '' : `<span class="je-date">${e.date}</span>`}<span class="je-memo">${esc(e.memo)}</span>${tags}${!e.auto && !opt.closing ? `<span class="tx-tools">${EBook.locked(S,e.date)?'<span class="period-tag">已锁定</span>':Bank.hasMatch(S,e.id)?'<span class="period-tag">已银行对账</span>':`<button class="btn small" data-act="edit" data-id="${esc(e.id)}">编辑</button><button class="btn small" data-act="del" data-id="${esc(e.id)}">删除</button>`}<button class="btn small" data-act="duplicate" data-id="${esc(e.id)}">复制</button></span>` : ''}</div>${meta.length ? `<p class="je-meta">${meta.join(' · ')}</p>` : ''}${linkedInfo}${attachments}<table class="jt"><tbody>${lines}</tbody></table>${destinations}</article>`;
}
function eqDelta(groups){
  let dA = 0, dL = 0, dE = 0;
  for (const g of groups) for (const l of g) { const t = ACC[l.a].t; if (t === 'A' || t === 'XA') dA += l.s; else if (t === 'L') dL -= l.s; else dE -= l.s; }
  const sg = v => v > 0 ? '+' + fmt(v) : v < 0 ? '−' + fmt(-v) : '0';
  return `资产 ${sg(dA)} = 负债 ${sg(dL)} + 权益 ${sg(dE)}`;
}
function tagsOf(e){
  const t = [];
  if (e.auto) t.push(['自动', 'auto']);
  if (e.adj) t.push(['调整', 'adj']);
  const acs = e.groups.flat().map(l => ACC[l.a]);
  if (acs.some(a => a.t === 'O')) t.push(['OCI', 'oci']);
  if (acs.some(a => a.pl === 'disc')) t.push(['终止经营', 'disc']);
  if (R && R.CF && R.CF.nonCashIds.has(e.id)) t.push(['非现金', 'nc']);
  if (e.src === 'ai') t.push(['AI', 'ai']);
  return t;
}
function paneJournal(){
  if (!R.entries.length) return paneBar('journal') + `<p class="empty">还没有交易。前往「录入凭证」记录第一笔业务。</p>`;
  const entries = [...filteredEntries()].reverse(), pages = Math.max(1,Math.ceil(entries.length/6));
  UI.journalPage = Math.min(Math.max(1,UI.journalPage),pages);
  const shown = entries.slice((UI.journalPage-1)*6,UI.journalPage*6);
  const paging = pages > 1 ? `<div class="journal-pagination"><button class="btn" data-act="journalPage" data-v="${UI.journalPage-1}"${UI.journalPage===1?' disabled':''}>上一页</button><span>${UI.journalPage} / ${pages} 页 · ${entries.length} 笔</span><button class="btn" data-act="journalPage" data-v="${UI.journalPage+1}"${UI.journalPage===pages?' disabled':''}>下一页</button></div>` : '';
  const lines = UI.filters.query.trim() ? matchedLines(entries, UI.filters.query) : [];
  return paneBar('journal', `${lines.length?`<button class="btn small" data-act="exportLines">只导出「${esc(UI.filters.query.trim())}」明细</button>`:''}<button class="btn small" data-act="exportCsv">导出 CSV</button>`) + `<div class="journal-scope">最近分录在前 · 共 ${entries.length} 笔${hasFilters() ? '（已筛选）' : ''}${lines.length?` · 匹配明细 ${lines.length} 行，借方合计 ${fmt(lines.reduce((n,x)=>n+Math.max(x.l.s,0),0))}`:''}</div><div class="jlegend"><span>会计科目</span><span>代码</span><span>借方</span><span>贷方</span></div>` + (shown.map(e => jeHTML(e)).join('') || '<p class="empty">没有符合条件的分录。<button class="btn small" data-act="resetFilters">清除筛选</button></p>') + paging;
}
function paneLedger(){
  const groups = {all:() => true, A:a => a.t === 'A' || a.t === 'XA', L:a => a.t === 'L', E:a => a.t === 'E' || a.t === 'XE', PL:a => !!a.pl, O:a => a.t === 'O'};
  const ctl = seg('lf', UI.lf, [['all', '全部'], ['A', '资产'], ['L', '负债'], ['E', '权益'], ['PL', '损益'], ['O', 'OCI']]);
  const accts = ledgerItems(VISIBLE.filter(a => groups[UI.lf](a))).filter(x => x.ob !== 0 || R.POST.some(x.match));
  const cards = accts.map(x => {
    const a = x.a, ob = x.ob, ps = R.POST.filter(x.match);
    const drR = [], crR = [];
    if (ob > 0) drR.push({ob:true, amt:ob}); if (ob < 0) crR.push({ob:true, amt:-ob});
    ps.forEach(p => { const e = R.byId[p.id]; (p.s > 0 ? drR : crR).push({id:p.id, no:e.no, amt:Math.abs(p.s)}); });
    const row = r => `<div class="trow${r.id && r.id === UI.sel ? ' hit' : ''}">${r.ob ? '<span class="r ob">期初</span>' : `<button class="r" data-act="jump" data-id="${r.id}">J${r.no}</button>`}<span>${fmt(r.amt)}</span></div>`;
    const b = ob + ps.reduce((n, p) => n + p.s, 0), hit = UI.sel && ps.some(p => p.id === UI.sel);
    const drT = drR.reduce((s, r) => s + r.amt, 0), crT = crR.reduce((s, r) => s + r.amt, 0);
    return `<div class="tacc${hit ? ' hit' : ''}" data-key="${esc(x.key)}"><h4><span class="code">${esc(x.code)}</span>${esc(lang() === 'en' ? x.en : x.zh)}</h4><span class="en2">${esc(lang() === 'en' ? TYPE_EN[a.t] : lang() === 'zh' ? TYPE_ZH[a.t] : a.en + ' · ' + TYPE_ZH[a.t])}</span>
      <div class="tsides"><div class="tside">${drR.map(row).join('')}</div><div class="tside">${crR.map(row).join('')}</div></div>
      <div class="tfoot"><div>${b >= 0 ? `<span class="lbl">余额 Bal</span><span>${fmt(b)}</span>` : `<span class="lbl">合计</span><span>${fmt(drT)}</span>`}</div><div>${b < 0 ? `<span class="lbl">余额 Bal</span><span>${fmt(-b)}</span>` : `<span class="lbl">合计</span><span>${fmt(crT)}</span>`}</div></div></div>`;
  }).join('');
  return paneBar('ledger', ctl) + (accts.length ? `<div class="lgrid">${cards}</div>` : '<p class="empty">这一类没有有余额的账户。</p>');
}
// Trial balance lines: unadjusted, adjustments and adjusted balance per account (cash split per bank with a chart).
function tbLines(){
  const lines = [], tot = {ud:0, uc:0, ad:0, ac:0, fd:0, fc:0};
  for (const x of ledgerItems(VISIBLE)) {
    let un = x.ob, ad = 0, ac = 0;
    for (const p of R.POST) if (x.match(p)) { if (p.adj) { if (p.s > 0) ad += p.s; else ac -= p.s; } else un += p.s; }
    const fin = un + ad - ac;
    if (!un && !ad && !ac && !fin) continue;
    tot.ud += Math.max(un, 0); tot.uc += Math.max(-un, 0); tot.ad += ad; tot.ac += ac; tot.fd += Math.max(fin, 0); tot.fc += Math.max(-fin, 0);
    lines.push({x, un, ad, ac, fin});
  }
  return {lines, tot, ok:[tot.ud === tot.uc, tot.ad === tot.ac, tot.fd === tot.fc]};
}
function paneTB(){
  const {lines, tot, ok:[okU, okA, okF]} = tbLines(), c = v => v ? fmt(v) : '';
  const rows = lines.map(({x, un, ad, ac, fin}) => {
    const hit = UI.sel && R.POST.some(p => x.match(p) && p.id === UI.sel);
    return `<tr${hit ? ' class="hit"' : ''}><td class="a"><span class="c">${esc(x.code)}</span>${itemLab(x)}</td><td class="gl">${c(Math.max(un, 0))}</td><td>${c(Math.max(-un, 0))}</td><td class="gl adjc">${c(ad)}</td><td class="adjc">${c(ac)}</td><td class="gl">${c(Math.max(fin, 0))}</td><td>${c(Math.max(-fin, 0))}</td></tr>`;
  });
  return paneBar('tb') + `<div class="scroll"><table class="wk"><thead><tr><th class="a"></th><th colspan="2" class="gl">未调整试算表<br>Unadjusted</th><th colspan="2" class="gl">调整分录<br>Adjustments</th><th colspan="2" class="gl">调整后试算表<br>Adjusted</th></tr>
    <tr><th class="a">账户 Account</th><th class="gl">借方 Dr</th><th>贷方 Cr</th><th class="gl">借方 Dr</th><th>贷方 Cr</th><th class="gl">借方 Dr</th><th>贷方 Cr</th></tr></thead><tbody>${rows.join('')}</tbody>
    <tfoot><tr><td class="a">合计 Totals</td><td class="gl">${fmt(tot.ud)}</td><td>${fmt(tot.uc)}</td><td class="gl">${fmt(tot.ad)}</td><td>${fmt(tot.ac)}</td><td class="gl">${fmt(tot.fd)}</td><td>${fmt(tot.fc)}</td></tr></tfoot></table></div>
    <p class="tb-checks" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><span class="okbad${okU ? '' : ' bad'}">${okU ? '✓' : '✗'} 未调整平衡</span><span class="okbad${okA ? '' : ' bad'}">${okA ? '✓' : '✗'} 调整分录平衡</span><span class="okbad${okF ? '' : ' bad'}">${okF ? '✓' : '✗'} 调整后平衡</span></p>
    <p class="tip" style="margin-top:8px">「调整分录」列包括带「调整」标签的交易和系统自动计提的所得税。</p>`;
}
function paneClosing(){
  const CL = R.CL;
  const pcRows = COA.filter(a => !a.temp && !a.pl && a.t !== 'O' && (CL.pc[a.c] || 0) !== 0).map(a => { const v = CL.pc[a.c]; return `<tr><td class="a"><span class="c">${esc(a.code)}</span>${acctLab(a.c)}</td><td class="gl">${v > 0 ? fmt(v) : ''}</td><td>${v < 0 ? fmt(-v) : ''}</td></tr>`; });
  let d = 0, c = 0; for (const a of COA) { const v = CL.pc[a.c] || 0; if (v > 0) d += v; else c -= v; }
  const leftover = COA.filter(a => (a.temp || a.pl || a.t === 'O') && (CL.pc[a.c] || 0) !== 0);
  return paneBar('closing') + `<h3 class="subh">结账分录 Closing entries</h3>${CL.E.length ? CL.E.map(e => jeHTML(e, {closing:true})).join('') : '<p class="empty">没有需要结转的临时账户。</p>'}
    <h3 class="subh">结账后试算表 Post-closing trial balance</h3>
    <div class="scroll"><table class="wk" style="min-width:420px"><thead><tr><th class="a">账户 Account</th><th class="gl">Dr</th><th>Cr</th></tr></thead><tbody>${pcRows.join('')}</tbody><tfoot><tr><td class="a">合计 Totals</td><td class="gl">${fmt(d)}</td><td>${fmt(c)}</td></tr></tfoot></table></div>
    <p style="margin-top:12px"><span class="okbad${d === c && !leftover.length ? '' : ' bad'}">${d === c && !leftover.length ? '✓ 临时账户已全部清零；留存收益 ' + m$(-(CL.pc['3100'] || 0)) + ' 与财务状况表一致' : '✗ 仍有未结清的临时账户'}</span></p>`;
}
// Accounts that already carry amounts can be hidden but not deleted or moved to another section.
function usedAccounts(){
  const used = new Set(Object.entries(S.opening || {}).filter(([, v]) => v).map(([a]) => a));
  for (const t of S.txns) for (const g of t.groups) for (const l of g) used.add(l.a);
  return used;
}
const paneChart = () => Chart.paneHTML({book:S, accounts:COA, used:usedAccounts(), writable:!UI.loadBlocked});
function commitChart(chart, newCash, message){
  if (UI.loadBlocked) return false;
  const snap = snapshot();
  if (chart === undefined) delete S.chart; else S.chart = chart;
  if (newCash.length) S.cashAccounts = [...(S.cashAccounts || []), ...newCash];
  applyChart(S.chart);
  if (!save()) { S = normalize(JSON.parse(snap)); renderAll(); toast('保存失败，科目表没有更改。'); return false; }
  // Undo resets the entry UI like any restore, but keeps the user on the chart tab they were editing.
  renderAll(); toast(message, () => { restore(snap); UI.ledgerTab = 'chart'; renderAll(); });
  return true;
}
function checkChart(chart, newCash){
  const next = {...S, cashAccounts:newCash.length ? [...(S.cashAccounts || []), ...newCash] : S.cashAccounts, chart};
  if (chart === undefined) delete next.chart;
  if (!next.cashAccounts) delete next.cashAccounts;
  const acc = (Chart.validate(next, BASE_COA), Chart.lookup(BASE_COA, next.chart));
  const missing = [...usedAccounts()].find(a => !acc[a]);
  if (missing) throw new Error(`科目 ${acode(missing)} ${ACC[missing]?.zh || ''} 已有凭证或期初余额，不能从科目表删除`);
  validateBackup(next);
}
function paneOpening(){
  const frozen = disabled(EBook.closedThrough(S));
  const amount = v => v ? (v < 0 ? '-' : '') + esc(fmt(Math.abs(v))) : '';
  // With a company chart, cash is entered per bank; account 1000 keeps their total.
  const bankRows = () => Chart.cashAccounts(S).map(c => `<tr><td class="a"><span class="c">${esc(c.code || '1000')}</span>${c.user ? `<span class="en">${esc(c.name)}</span>` : uiEsc(c.name)}</td><td class="gl"><input class="ob-in" id="ob-cash-${esc(c.id)}" data-ob-cash="${esc(c.id)}"${frozen} value="${amount(c.opening)}" inputmode="decimal" autocomplete="off" aria-label="${esc(c.name)} 期初余额" placeholder="0"></td><td></td></tr>`).join('');
  const rows = VISIBLE.filter(a => ['A', 'XA', 'L', 'E'].includes(a.t) && (!a.off || S.opening[a.c])).map(a => {
    if (a.c === '1000' && S.chart) return bankRows();
    const debitSide = a.t === 'A';
    const raw = S.opening[a.c] || 0, v = debitSide ? raw : -raw;
    const inp = `<input class="ob-in" id="ob-${a.c}" data-ob="${a.c}"${frozen} value="${v ? (v<0?'-':'')+esc(fmt(Math.abs(v))) : ''}" inputmode="decimal" autocomplete="off" aria-label="${uiEsc(a.zh)} 期初余额" placeholder="0">`;
    return `<tr><td class="a"><span class="c">${esc(a.code)}</span>${acctLab(a.c)}</td><td class="gl">${debitSide ? inp : ''}</td><td>${debitSide ? '' : inp}</td></tr>`;
  }).join('');
  const okb = R.obDr === R.obCr;
  return paneBar('opening', `<button class="btn small" data-act="zeroOB"${frozen}>全部清零</button>`) + `<div class="scroll"><table class="wk" style="min-width:460px"><thead><tr><th class="a">账户 Account</th><th class="gl">期初借方 Dr</th><th>期初贷方 Cr</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td class="a">合计 Totals</td><td class="gl">${fmt(R.obDr)}</td><td>${fmt(R.obCr)}</td></tr></tfoot></table></div>
    <p style="margin:12px 0"><span class="okbad${okb ? '' : ' bad'}">${okb ? '✓ 期初借贷平衡' : `✗ 借贷相差 ${hm$(Math.abs(R.obDr - R.obCr))}`}</span></p>
    <div class="fields" style="max-width:420px"><div class="field"><label for="ob-shares">期初已发行普通股股数（算 EPS 用）</label><input id="ob-shares" data-obs="1"${frozen} value="${esc(String(S.openingShares || ''))}" inputmode="numeric" autocomplete="off"></div></div>
    <p class="tip" style="margin-top:10px">按表头的借方 / 贷方填余额；反方向余额用负数表示。收入、费用、股利和 OCI 是临时账户，上年结账后已经清零，所以这里不用填。</p>`;
}

// Steps through the tutorial: each step opens its tab; the last step's button or Esc ends it.
function moveGuide(v){
  if (UI.guide == null) return;
  if (v === 'close' || (v === 'next' && UI.guide === Guide.LAST)) {
    UI.guide = null; renderAll(); $('#guide-open')?.focus();
    if (v === 'next') toast('教程完成。随时可以点「使用教程」再看一遍。');
    return;
  }
  UI.guide = Math.max(0, Math.min(Guide.LAST, UI.guide + (v === 'next' ? 1 : -1)));
  if (Guide.tabOf(UI.guide)) UI.ledgerTab = Guide.tabOf(UI.guide);
  renderAll();
  // renderAll puts focus back on the same button; the introduction has no 上一步, so fall back to 下一步.
  if (!$('#ledgerGuide').contains(document.activeElement)) $('#guide-next')?.focus({preventScroll:true});
  $('#ledgerGuide').scrollIntoView({block:'nearest'});
}
// Figures the 总账与试算 tutorial quotes, taken from the same calculations the tabs show.
function guideFacts(){
  const yr = +S.company.year, tb = tbLines();
  // The ledger example: the main bank if it moved this year, otherwise the busiest account.
  const items = ledgerItems(VISIBLE).map(x => ({x, ps:R.POST.filter(x.match)})).filter(o => o.x.ob || o.ps.length);
  const pick = items.find(o => o.x.a.c === '1000' && o.ps.length) || [...items].sort((a, b) => b.ps.length - a.ps.length)[0];
  let sample = null;
  if (pick) {
    const {x, ps} = pick, dr = ps.reduce((n, p) => n + Math.max(p.s, 0), 0), cr = ps.reduce((n, p) => n + Math.max(-p.s, 0), 0);
    sample = {key:x.key, code:esc(x.code), name:x.user ? esc(x.zh) : uiEsc(x.zh), cash:x.a.c === '1000', ob:hm$(x.ob), dr:hm$(dr), cr:hm$(cr), bal:hm$(x.ob + dr - cr), n:ps.length};
  }
  return {
    chart:!!S.chart, accounts:VISIBLE.filter(a => !a.off && a.c !== '1000').length, banks:Chart.cashAccounts(S).length,
    openingDate:`${yr - 1}-12-31`, obDr:hm$(R.obDr), obCr:hm$(R.obCr), obOk:R.obDr === R.obCr, obDiff:hm$(Math.abs(R.obDr - R.obCr)), frozen:!!EBook.closedThrough(S),
    sample, month:R.month === 12 ? '截至年底' : `截至 ${R.month} 月底`, tbDr:hm$(tb.tot.fd), tbCr:hm$(tb.tot.fc), tbOk:tb.ok.every(Boolean),
    np:hm$(Math.abs(R.P.np)), npLoss:R.P.np < 0, reName:acctName('3100'),
  };
}

/* ================= bench (left) ================= */
function defaults(id){
  const t = TPL[id], p = {};
  t.fields.forEach(f => p[f.k] = f.def != null ? String(f.def) : '');
  const date=entryDate();
  p.date = isAdjTpl(t) ? EBook.monthEnd(+S.company.year,EBook.monthOf(date)) : date;
  if (['depreciation','accrueInterest'].includes(id)) p.months='1';
  p.memo = ''; p.party = ''; p.ref = '';p.cashAccount=Bank.MAIN;
  return p;
}
function blankCustom(){ return {date:entryDate(), memo:'', party:'', ref:'', adj:false, rows:[{a:'1000', dr:'', cr:''}, {a:'4000', dr:'', cr:''}]}; }
function acctOptions(sel){
  const g = [['资产', ['A', 'XA']], ['负债', ['L']], ['权益', ['E', 'XE']], ['收入/利得', ['R']], ['费用/损失', ['X']], ['其他综合收益', ['O']]];
  return g.map(([n, ts]) => `<optgroup label="${n}">${VISIBLE.filter(a => ts.includes(a.t) && (!a.off || a.c === sel)).map(a => `<option value="${a.c}"${a.c === sel ? ' selected' : ''}>${esc(a.code)} ${acctName(a.c)}</option>`).join('')}</optgroup>`).join('');
}
function fieldHTML(f, p){
  const id = 'f-' + f.k, v = p[f.k] ?? '';
  let ctl;
  if (f.t === 'sel') ctl = `<select id="${id}" data-f="${f.k}">${f.opts.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${uiEsc(l)}</option>`).join('')}</select>`;
  else if(f.t==='cashAccount')ctl=`<select id="${id}" data-f="${f.k}"><option value="">请选择资金账户</option>${Chart.cashAccounts(S).map(a=>`<option value="${esc(a.id)}"${a.id===v?' selected':''}>${cashOption(a)}</option>`).join('')}</select>`;
  else if (f.t === 'memberCard') {
    const cards=memberCards(S,UI.editing);
    ctl=`<select id="${id}" data-f="${f.k}"><option value="">请选择会员卡</option>${cards.map(c=>`<option value="${esc(c.cardNo)}"${Member.key(c.cardNo)===Member.key(v)?' selected':''}>${esc(c.cardNo)} · ${esc(c.customer)}</option>`).join('')}</select>`;
  } else if (f.t === 'memberSale' || f.t === 'memberPurchase') {
    const purchases=Member.summary(withoutMemberEdit(S,UI.editing)).purchases.filter(x=>f.t==='memberPurchase'||x.expected>0 && (UI.tpl!=='memberCommissionAccrue' || !Member.inline(x.txn)));
    ctl=`<select id="${id}" data-f="${f.k}"><option value="">请选择购卡凭证</option>${purchases.map(x=>`<option value="${esc(x.txn.id)}"${x.txn.id===v?' selected':''}>${esc(x.txn.id)} · ${esc(x.card.cardNo)} · ${esc(x.card.customer)} · ${esc(m$(x.amount))}</option>`).join('')}</select>`;
  } else if(f.t==='businessDoc'){
    const items=Business.summary(withoutMemberEdit(S,UI.editing),p.date).items.filter(x=>x.ledger===f.ledger);
    ctl=`<select id="${id}" data-f="${f.k}"><option value="">请选择原单据</option>${items.map(x=>`<option value="${esc(x.id)}"${x.id===v?' selected':''}>${esc(x.source.id)} · ${esc(x.partyName)} · 原额 ${esc(m$(x.amount))} · 未结 ${esc(m$(x.balance))} · 已收付 ${esc(m$(x.cashSettled-x.cashReturned))}</option>`).join('')}</select>`;
  } else if(f.t==='stockItem'){
    const items=Stock.summary(withoutMemberEdit(S,UI.editing),p.date).items;
    ctl=`<select id="${id}" data-f="${f.k}"><option value="">请选择商品</option>${items.map(x=>`<option value="${esc(x.sku)}"${Stock.key(x.sku)===Stock.key(v)?' selected':''}>${esc(x.sku)} · ${esc(x.name)} · 库存 ${x.qty/1000}</option>`).join('')}</select>`;
  } else if(f.t==='stockSale'){
    const sales=Stock.summary(withoutMemberEdit(S,UI.editing),p.date).sales;
    ctl=`<select id="${id}" data-f="${f.k}"><option value="">请选择原销售</option>${sales.map(x=>`<option value="${esc(x.txn.id)}"${x.txn.id===v?' selected':''}>${esc(x.txn.id)} · ${esc(x.txn.stock.name)} · 可退 ${(x.qty-x.returned)/1000}</option>`).join('')}</select>`;
  } else if(f.t==='assetItem'){
    const assets=Assets.summary(withoutMemberEdit(S,UI.editing),p.date).assets.filter(x=>!x.disposal);
    ctl=`<select id="${id}" data-f="${f.k}"><option value="">请选择资产卡片</option>${assets.map(x=>`<option value="${esc(x.txn.id)}"${x.txn.id===v?' selected':''}>${esc(x.code)} · ${esc(x.name)} · 账面 ${esc(m$(x.bookValue))}</option>`).join('')}</select>`;
  } else if (f.t==='alloc') {
    let values={};try{values=JSON.parse(v||'{}');}catch(e){}
    const list=Business.summary(withoutMemberEdit(S,UI.editing),p.date).items.filter(x=>x.ledger===f.ledger && x.balance>0);
    return `<fieldset class="field full biz-alloc"><legend>${uiEsc(f.label)}</legend>${list.length?list.map((x,i)=>`<div class="biz-alloc-row"><span><b>${esc(x.partyName)}</b> · ${esc(x.source.id)} · 未结 ${hm$(x.balance)}${x.dueDate?' · 到期 '+esc(x.dueDate):''}</span><label for="alloc-${esc(f.k)}-${i}">分配金额</label><input id="alloc-${esc(f.k)}-${i}" data-alloc="${esc(x.id)}" data-field="${esc(f.k)}" value="${esc(values[x.id]||'')}" inputmode="decimal" autocomplete="off"></div>`).join(''):'<p class="hint">当前日期没有可核销的已关联单据。</p>'}</fieldset>`;
  }
  else ctl = `<input id="${id}" data-f="${f.k}" type="${f.t==='date'?'date':'text'}"${f.t==='date'?'':` inputmode="${f.t==='text'?'text':'decimal'}"`} value="${esc(v)}"${f.placeholder?` placeholder="${uiEsc(f.placeholder)}"`:''}${f.max?` maxlength="${f.max}"`:''}${f.k==='expenseName'&&S.chart?' list="expense-accounts"':''} autocomplete="off">`
    + (f.k==='expenseName'&&S.chart ? `<datalist id="expense-accounts">${PICK.filter(a=>a.pl==='opx'&&a.fn!=='cos').map(a=>`<option value="${esc(a.zh)}">${esc(a.code)}</option>`).join('')}</datalist>` : '');
  return `<div class="field${f.full ? ' full' : ''}"><label for="${id}">${uiEsc(f.label)}</label>${f.t === 'money' ? `<div class="affix"><span class="pre">${esc(cur())}</span>${ctl}</div>` : ctl}</div>`;
}
function miniEntry(groups){
  return `<table class="mini"><tbody>${groups.map((g, gi) => [...g.filter(l => l.s > 0), ...g.filter(l => l.s < 0)].map(l => `<tr><td class="${l.s < 0 ? 'ca' : ''}">${l.s > 0 ? '<span class="dr">借</span>' : '<span class="cr">贷</span>'} ${(l.expenseName?esc(l.expenseName):uiEsc(acctZh(l.a)))}${l.a==='1000'&&Bank.accounts(S).length>1?`<span class="fn">${(l.cashAccount||Bank.MAIN)===Bank.MAIN ? uiEsc(cashName(l)) : esc(cashName(l))}</span>`:''}${l.fn ? `<span class="fn">${FNZ(l.fn)}</span>` : ''}</td><td class="amt dr-amt">${l.s > 0 ? fmt(l.s) : ''}</td><td class="amt cr-amt">${l.s < 0 ? fmt(-l.s) : ''}</td></tr>`).join('') + (gi < groups.length - 1 ? '<tr class="gs"><td colspan="3"></td></tr>' : '')).join('')}</tbody></table>`;
}
function previewBlock(r, note){
  if (r.err) return `<div class="preview"><span class="ph">分录预览</span><p class="err">${uiEsc(r.err)}</p>${note ? `<p class="note">${uiEsc(note)}</p>` : ''}</div>`;
  return `<div class="preview"><span class="ph">自动生成的分录</span>${miniEntry(r.groups)}<div class="eqline">${eqDelta(r.groups)}</div>${r.calc ? `<p class="calc">${uiEsc(r.calc)}</p>` : ''}${note ? `<p class="note">${uiEsc(note)}</p>` : ''}</div>`;
}
function tplPreviewHTML(){
  const t = TPL[UI.tpl], r = runTpl(S, UI.tpl, UI.params, UI.editing);
  const err = dateError(UI.params.date); if (err) return previewBlock({err}, '');
  const hasAmount = t.fields.some(f => ['money','memberSale','memberPurchase','businessDoc','stockItem','stockSale','assetItem'].includes(f.t) && String(UI.params[f.k] || '').trim() || f.t==='alloc' && UI.params[f.k] && UI.params[f.k]!=='{}');
  if (r.err && !hasAmount) return `<div class="preview"><span class="ph">分录预览</span><p class="tdesc">填写金额后显示借贷明细。</p></div>`;
  return previewBlock(r, noteOf(t, UI.params));
}
function tplHintHTML(){
  const t=TPL[UI.tpl], p=UI.params, b=balancesOf(S,UI.editing,p.date);
  const hint=t.hint ? t.hint(p,{bal:a=>b[a] || 0,book:S,excludeId:UI.editing}) : '';
  return hint ? `<p class="hint">${uiEsc(hint)}</p>` : '';
}
function filteredTemplates(){
  const q = UI.tplQuery.trim().toLowerCase();
  return TEMPLATES.filter(t => {
    if (t.dialogOnly || t.legacyOnly && t.id!==UI.tpl) return false;
    if (!q) return true;
    const label=t.zh+' '+t.id+' '+TPL_CATS.find(c=>c[0]===t.cat)[1]+' '+t.fields.map(f=>f.label).join(' ');
    return label.toLowerCase().includes(q) || (Locale.current==='zh-HK' && Locale.text(label).toLowerCase().includes(q));
  });
}
function templateOptions(){
  const list = filteredTemplates();
  return `<option value="" disabled${list.some(t=>t.id===UI.tpl)?'':' selected'}>${list.length ? '请选择交易类型…' : '没有匹配的模板'}</option>` + TPL_CATS.map(([cat,l]) => {
    const ts = list.filter(t=>t.cat===cat); return ts.length ? `<optgroup label="${l}">${ts.map(t=>`<option value="${t.id}"${t.id===UI.tpl?' selected':''}>${uiEsc(t.zh)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}
function metadataFields(p, attr, member=false){
  return `${member?'':`<div class="field"><label for="${attr}-party">往来对象（选填）</label><input id="${attr}-party" data-${attr}="party" value="${esc(p.party || '')}" placeholder="客户 / 供应商" autocomplete="off"></div>`}<div class="field"><label for="${attr}-ref">单据编号（选填）</label><input id="${attr}-ref" data-${attr}="ref" value="${esc(p.ref || '')}" placeholder="发票 / 收据编号" autocomplete="off"></div>`;
}
function benchTpl(){
  const t = TPL[UI.tpl], p = UI.params;
  const opts = templateOptions();
  const vis = t.fields.filter(f => !f.show || f.show(p));
  const quick=[['service','服务收入'],['payExpense','日常支出'],['customerReceipt','客户收款'],['supplierPayment','供应商付款'],['memberCardSale','会员卡业务']];
  const expenseOption=UI.tpl==='payExpense' ? vis.find(f=>f.k==='fn') : null;
  return `<div class="quick-tpls" role="group" aria-label="常用业务">${quick.map(([k,l])=>`<button class="btn${UI.tpl===k?' primary':''}" data-act="quickTpl" data-v="${k}" aria-pressed="${UI.tpl===k}">${l}</button>`).join('')}</div>
    <details class="entry-more"${UI.editing || UI.tplQuery ? ' open' : ''}><summary>查找其他交易类型</summary>
    <div class="field full"><label for="tplSearch">查找交易模板（${TEMPLATES.length} 种）</label><input id="tplSearch" type="search" value="${esc(UI.tplQuery)}" placeholder="输入：工资、存货、借款…" autocomplete="off"></div>
    <div class="field full"><label for="tplSel">交易类型</label><select id="tplSel" data-act-change="tpl">${opts}</select></div></details>
    <h3 class="entry-type">${uiEsc(t.zh)}</h3>
    ${UI.tpl==='customerReceipt'?`<p class="hint">按未收款单据登记。${sectionLink('invoices','按发票登记收款','text-button')} 或 ${sectionLink('bank','从银行流水核销','text-button')}</p>`:''}
    <div class="fields"><div class="field"><label for="f-date">交易日期</label><input id="f-date" data-f="date" type="date" value="${esc(p.date)}"></div>${vis.filter(f=>f!==expenseOption).map(f => fieldHTML(f, p)).join('')}${Bank.accounts(S).length>1&&UI.tpl!=='cashTransfer'&&p.pay!=='credit'?fieldHTML({k:'cashAccount',t:'cashAccount',label:'收付款账户'},p):''}
    </div><details class="entry-more"${t.cat==='member' || p.memo || p.party || p.ref ? ' open' : ''}><summary>${t.cat==='member'?'摘要与单据（选填）':'摘要、往来对象与单据（选填）'}</summary><div class="fields"><div class="field full"><label for="f-memo">摘要（留空则自动生成）</label><input id="f-memo" data-f="memo" type="text" value="${esc(p.memo)}" placeholder="${esc(safeMemo(t, p))}" autocomplete="off"></div>${metadataFields(p,'f',t.cat==='member')}</div></details>
    ${expenseOption?`<details class="entry-more"${p.fn!=='auto'?' open':''}><summary>调整费用分类（选填）</summary><div class="fields">${fieldHTML(expenseOption,p)}</div></details>`:''}${attachmentBox()}
    ${t.cat==='member' ? '<p class="hint">每笔购卡按实收金额和比例计算佣金，入账时确认应付；实际支付时关联售卡凭证。 <a href="index.html#members" data-act="section" data-v="members">查看会员卡与返佣明细 →</a></p>' : ''}
    <div id="tplHint">${tplHintHTML()}</div>
    <div id="tplPreview">${tplPreviewHTML()}</div>
    <div class="actions entry-post"><button class="btn primary" data-act="addTpl">${UI.editing ? '保存修改' : '确认记账'}</button>${UI.editing ? '<button class="btn" data-act="cancelEdit">取消</button>' : ''}</div>`;
}
function safeMemo(t, p){ try { return t.memo(p); } catch (e) { return t.zh; } }
function customTotals(){
  let d = 0, c = 0; for (const r of UI.custom.rows) { const x = money(r.dr), y = money(r.cr); if (Number.isFinite(x)) d += x; if (Number.isFinite(y)) c += y; }
  return {d, c};
}
function buildCustom(c){
  const g = []; let dr = 0, cr = 0;
  for (const r of c.rows) {
    const d = money(r.dr), k = money(r.cr);
    const hd = Number.isFinite(d) && d !== 0, hk = Number.isFinite(k) && k !== 0;
    if ((String(r.dr).trim() && !Number.isFinite(d)) || (String(r.cr).trim() && !Number.isFinite(k))) return {err:`${acctZh(r.a)}：金额格式不对`};
    if (!hd && !hk) continue;
    if (hd && hk) return {err:`${acctZh(r.a)}：同一行只能填借方或贷方`};
    if ((hd && d < 0) || (hk && k < 0)) return {err:'金额请填正数'};
    const fn = normFn(r.a, r.fn), cash=r.cashAccount||Bank.MAIN;
    if(r.a==='1000'&&!Bank.accounts(S).some(a=>a.id===cash))return {err:'资金账户不存在'};
    const line=fn?{a:r.a,s:hd?d:-k,fn}:{a:r.a,s:hd?d:-k};if(r.a==='1000'&&cash!==Bank.MAIN)line.cashAccount=cash;
    g.push(line);if(hd)dr+=d;else cr+=k;
  }
  if (!g.some(l => l.s > 0) || !g.some(l => l.s < 0)) return {err:'至少要有一个借方和一个贷方'};
  if (dr !== cr) return {err:`借方合计 ${fmt(dr)} ≠ 贷方合计 ${fmt(cr)}，相差 ${fmt(Math.abs(dr - cr))}`};
  return {groups:[g]};
}
function benchCustom(){
  const c = UI.custom;
  const rows = c.rows.map((r, i) => {
    const isOpx = ACC[r.a].pl === 'opx';
    return `<div class="crow"><select id="cr-a-${i}" data-c="a" data-i="${i}" aria-label="账户">${acctOptions(r.a)}</select><input id="cr-dr-${i}" data-c="dr" data-i="${i}" value="${esc(r.dr)}" placeholder="借" inputmode="decimal" autocomplete="off" aria-label="借方金额"><input id="cr-cr-${i}" data-c="cr" data-i="${i}" value="${esc(r.cr)}" placeholder="贷" inputmode="decimal" autocomplete="off" aria-label="贷方金额"><button class="x" data-act="custDel" data-i="${i}" aria-label="删除这一行" title="删除这一行">×</button>
      ${isOpx ? `<select class="fnsel" id="cr-fn-${i}" data-c="fn" data-i="${i}" aria-label="费用功能">${FN_OPTS.map(([k, l]) => `<option value="${k}"${(r.fn || ACC[r.a].fn) === k ? ' selected' : ''}>功能：${uiEsc(l)}</option>`).join('')}</select>` : ''}${r.a==='1000'&&Bank.accounts(S).length>1?`<select class="fnsel" id="cr-cash-${i}" data-c="cashAccount" data-i="${i}" aria-label="资金账户">${Chart.cashAccounts(S).map(a=>`<option value="${esc(a.id)}"${(r.cashAccount||Bank.MAIN)===a.id?' selected':''}>${cashOption(a)}</option>`).join('')}</select>`:''}</div>`;
  }).join('');
  const t = customTotals();
  return `<p class="tdesc">用于业务模板未覆盖的交易。选择科目并填入借贷金额，核对预览后入账。</p>
    <div class="fields"><div class="field"><label for="c-date">日期</label><input id="c-date" data-cm="date" type="date" value="${esc(c.date)}"></div>
    <div class="field" style="justify-content:flex-end"><label class="checkline"><input type="checkbox" id="c-adj" data-cm="adj"${c.adj ? ' checked' : ''}> 期末调整分录</label></div>
    <div class="field full"><label for="c-memo">摘要</label><input id="c-memo" data-cm="memo" value="${esc(c.memo)}" autocomplete="off" placeholder="例如：以现金支付广告费"></div>${metadataFields(c,'cm')}</div>
    <div class="chead"><span>账户</span><span>借 Dr</span><span>贷 Cr</span><span></span></div>${rows}
    <div class="ctot" id="cTot"><span>合计</span><span>${fmt(t.d)}</span><span>${fmt(t.c)}</span><span></span></div>
    <div class="actions"><button class="btn small" data-act="custAdd">＋ 添加一行</button></div>
    <div id="custMsg">${custMsg()}</div>
    <div class="actions"><button class="btn primary" data-act="addCustom">${UI.editing ? '保存修改' : '记入日记账'}</button>${UI.editing ? '<button class="btn" data-act="cancelEdit">取消</button>' : ''}</div>`;
}
function custMsg(){
  const r = buildCustom(UI.custom), t = customTotals();
  const err = dateError(UI.custom.date); if (err) return `<p class="err">${uiEsc(err)}</p>`;
  if (r.err) return (t.d || t.c) ? `<p class="err">${uiEsc(r.err)}</p>` : '';
  return `<div class="preview"><span class="ph">借贷平衡 ✓</span><div class="eqline">${eqDelta(r.groups)}</div>${miniEntry(r.groups)}</div>`;
}
function benchAI(){
  const a = UI.ai;
  let out = '';
  if (a.status === 'busy') out = `<p class="tdesc"><span class="spin"></span>${esc(aiLabel())} 正在分析这笔交易…</p>`;
  else if (a.status === 'error') out = `<p class="err">${uiEsc(a.err)}</p>`;
  else if (a.status === 'done' && a.res) {
    const r = a.res;
    if (r.empty) out = `<div class="preview"><span class="ph">不需要记账</span><p class="tdesc">${esc(r.explain)}</p></div>`;
    else out = `<div class="preview"><span class="ph">AI 生成的分录 · ${esc(r.date)}${r.adj ? ' · 调整' : ''}</span><p class="je-memo" style="margin:0">${esc(r.memo)}</p>${miniEntry(r.groups)}<div class="eqline">${eqDelta(r.groups)}</div><p class="note">${esc(r.explain)}</p>${r.assumptions ? `<p class="calc">假设：${esc(r.assumptions)}</p>` : ''}</div>
      <div class="actions"><button class="btn primary" data-act="aiAccept">记入日记账</button><button class="btn" data-act="aiEdit">在自定义分录中修改</button></div>
      <p class="hint">AI 也会出错。入账前请核对日期、科目、金额和原始单据。</p>`;
  }
  return `${aiConnectionHTML()}<p class="tdesc">描述一笔交易，由 ${esc(aiLabel())} 按预设科目生成待复核分录。生成时会发送本次描述、年度、币种及预设科目；不会自动发送公司名称、凭证或余额。</p>
    <div class="field full"><label for="ai-text">交易描述</label><textarea id="ai-text" data-ai="1" rows="3" placeholder="例：9 月 1 日签发两年期票据 30,000 购入一台送货车">${esc(a.text)}</textarea></div>
    <div class="actions"><button class="btn primary" data-act="aiGo"${a.status === 'busy' || !UI.aiConnected ? ' disabled' : ''}>生成分录</button>${a.status === 'busy' ? '<button class="btn" data-act="aiStop">停止</button>' : ''}</div>${out}`;
}
function journalLineText(l){
  return [l.a,lineCode(l),ACC[l.a].zh,plainName(l.a),Locale.text(ACC[l.a].zh),ACC[l.a].en,l.expenseName||'',l.a==='1000'?cashName(l):''].join(' ').toLowerCase();
}
function setupJournalLookup(){
  const input=$('#txQuery'), toggle=$('#txBrowse'), menu=$('#txAccounts'), wrap=input.parentElement;
  const items=ledgerItems(PICK).map(x=>({code:String(x.code),name:x.user?x.zh:Locale.text(x.zh),en:x.en}));
  function close(){menu.hidden=true;toggle.setAttribute('aria-expanded','false');}
  function open(query){
    const term=query.trim().toLowerCase();
    const matches=items.filter(x=>[x.code,x.name,x.en].some(v=>String(v).toLowerCase().includes(term)));
    menu.innerHTML=matches.map(x=>`<button type="button" data-code="${esc(x.code)}"><b>${esc(x.code)}</b> ${esc(x.name)}</button>`).join('');
    menu.hidden=!matches.length;toggle.setAttribute('aria-expanded',String(!menu.hidden));menu.scrollTop=0;
  }
  input.addEventListener('click',()=>open(input.value));
  input.addEventListener('input',()=>{delete UI.filters.accountCode;open(input.value);});
  toggle.onclick=()=>{if(menu.hidden)open('');else close();};
  menu.onclick=e=>{
    const choice=e.target.closest('[data-code]');if(!choice)return;
    UI.filters.accountCode=UI.filters.query=input.value=choice.dataset.code;
    UI.journalPage=1;close();input.focus();renderEntryList();renderBoard();
  };
  wrap.addEventListener('focusout',e=>{if(!wrap.contains(e.relatedTarget))close();});
  wrap.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();input.focus();e.preventDefault();return;}
    if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
    if(menu.hidden)open(input.value);
    const options=[...menu.querySelectorAll('button')];if(!options.length)return;
    const i=options.indexOf(document.activeElement);
    options[i<0?(e.key==='ArrowDown'?0:options.length-1):(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();
    e.preventDefault();
  });
}
function filteredEntries(entries = R.entries){
  const f = UI.filters, q = f.query.trim().toLowerCase();
  return entries.filter(e => (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to) && (f.kind==='all' || (f.kind==='regular' ? !e.adj : e.adj)) && (f.accountCode ? e.groups.flat().some(l=>lineCode(l)===f.accountCode) : !q || [e.memo,e.party,e.ref,e.date,'J'+e.no,e.id,e.member?.cardNo,memberSale(S,e.member?.saleId)?.member.cardNo,...e.groups.flat().map(journalLineText)].join(' ').toLowerCase().includes(q)));
}
function hasFilters(){ const f=UI.filters; return !!(f.query || f.from || f.to || f.kind!=='all'); }
function renderEntryList(){
  const entries = filteredEntries(), count=$('#entryCount'), summary=$('#entrySummary');
  if (count) count.textContent = Locale.text(entries.length + ' / ' + R.entries.length);
  let incoming=0,outgoing=0;
  entries.forEach(e=>e.groups.flat().filter(l=>l.a==='1000').forEach(l=>l.s>0?incoming+=l.s:outgoing-=l.s));
  if (summary) summary.innerHTML = Locale.markup(`<span>匹配记录收现 <b>${fmt(incoming)}</b></span><span>付现 <b>${fmt(outgoing)}</b></span><span>净现金变动 <b>${fmt(incoming-outgoing)}</b> ${esc(cur())}</span>${UI.filters.from && UI.filters.to && UI.filters.from>UI.filters.to ? '<span class="err">开始日期不能晚于结束日期</span>' : ''}`);
}
function renderBench(){
  if (UI.section !== 'bookkeeping') return;
  const canUseAI=!trainingMode&&!demoMode&&window.AccountingAI;
  const modes = [['tpl','业务模板'],['custom','手工分录']].concat(canUseAI ? [['ai','AI 描述']] : []);
  const body = UI.mode === 'custom' ? benchCustom() : UI.mode === 'ai' && canUseAI ? benchAI() : benchTpl();
  const closing = EBook.closedThrough(S);
  $('#bench').innerHTML = Locale.markup(`<section class="bsec"><div class="bhead"><h2 class="h2">${UI.editing ? `编辑 J${R.byId[UI.editing]?.no || ''}` : '新建记账凭证'}</h2>${seg('mode', UI.mode, modes)}</div>
    ${closing ? `<p class="period-notice">已锁至 ${closing} 月末。${closing===12?'全年已锁定。':'请使用未锁定期间的日期。'}</p>` : ''}${UI.mode==='tpl'?'':attachmentBox()}${body}</section>
    ${UI.draftRestored ? '<div class="bsec draft-note">已恢复未记账的草稿。<button class="btn small" data-act="discardDraft">丢弃草稿</button></div>' : ''}`);
}
function renderRegister(){
  $('#registerTools').innerHTML = Locale.markup(`
    <section class="bsec" id="recordTools"><h3>筛选凭证 <span class="count" id="entryCount"></span></h3>
    <div class="record-filters"><div class="field full"><label for="txQuery">搜索记录</label><div class="journal-lookup"><input id="txQuery" type="search" data-filter="query" value="${esc(UI.filters.query)}" placeholder="输入科目编号、名称、摘要或单据编号" autocomplete="off"><button type="button" class="btn small" id="txBrowse" aria-controls="txAccounts" aria-expanded="false">选择科目 ▾</button><div id="txAccounts" class="journal-options" role="group" aria-label="科目选项" hidden></div></div></div><div class="field"><label for="txFrom">开始日期</label><input id="txFrom" type="date" data-filter="from" value="${esc(UI.filters.from)}"></div><div class="field"><label for="txTo">结束日期</label><input id="txTo" type="date" data-filter="to" value="${esc(UI.filters.to)}"></div><div class="field full"><label for="txKind">分录类型</label><select id="txKind" data-filter="kind"><option value="all"${UI.filters.kind==='all'?' selected':''}>全部分录</option><option value="regular"${UI.filters.kind==='regular'?' selected':''}>日常分录</option><option value="adjust"${UI.filters.kind==='adjust'?' selected':''}>调整分录（含自动计税）</option></select></div></div><div id="entrySummary" class="record-summary" aria-live="polite"></div><div class="actions"><button class="btn small" data-act="exportCsv">导出匹配分录 CSV</button>${UI.sel ? '<button class="btn small" data-act="clearSel">取消追踪</button>' : ''}</div>
    <div class="actions"><button class="btn small subtle" data-act="resetFilters">清除筛选</button></div></section>`);
  setupJournalLookup();
  renderEntryList();
}

/* ================= header, board ================= */
function revealCurrentNav(){
  const nav = $('.primary-nav'), active = $('[aria-current="page"]', nav);
  if (!active || nav.scrollWidth <= nav.clientWidth) return;
  const area = nav.getBoundingClientRect(), link = active.getBoundingClientRect();
  if (link.left < area.left) nav.scrollLeft += link.left-area.left;
  else if (link.right > area.right) nav.scrollLeft += link.right-area.right;
}
function primaryRoute(page){
  if(workspace && isReport(page))return 'reports';
  return ['members','business','cash','inventory','assets'].includes(page)?'bookkeeping':page;
}
function renderAccountNav(){
  if(!workspace)return;
  const nav=$('.primary-nav');
  if(nav.dataset.locale===Locale.current)return;
  nav.dataset.locale=Locale.current;
  const entry=demoMode?'index.html?demo=1':'index.html';
  const link=(id,label,glyph)=>`<a href="${entry}#${id}" data-act="section" data-v="${id}">${Account.icon(glyph)}<span>${label}</span></a>`;
  nav.innerHTML=Locale.markup(`<div class="nav-label">工作空间</div>${link('home','工作台','home')}<div class="nav-label">日常账务</div>${readOnly()?'':link('bookkeeping','录入凭证','plus')}${link('invoices','销售发票','file')}${link('bank','银行对账','bank')}${link('journal','凭证查询','file')}<div class="nav-label">复核与报表</div>${link('ledger','总账与试算','book')}${link('close','月结工作台','check')}${link('payroll','薪酬与出粮','file')}${link('reports','财报编辑','chart')}<div class="nav-label">帮助</div>${link('tutorial','操作教程','book')}`);
  const brand=$('.rail-brand');brand.dataset.v='home';brand.href=entry+'#home';
  const logout=demoMode?'':`<button type="button" data-space="logout" title="退出账号" aria-label="退出账号">${Account.icon('arrow')}</button>`;
  $('.rail-bottom').innerHTML=Locale.markup(`<span class="space-avatar">${esc([...workspace.user.name][0])}</span><span class="rail-account"><strong>${esc(workspace.user.name)}</strong><small>${demoMode?'演示账号':'个人空间'}</small></span>${logout}`);
  $('.workspace-footer span:last-child').textContent=Locale.text('财务与报表管理');
}
const trainingNavPages=()=>UI.section==='training'?['training']:TRAINING_NAV[trainingRole()];
function renderTrainingNav(){
  const nav=$('.primary-nav'), pages=trainingNavPages(), signature=`${Locale.current}:${pages.length}:${trainingStore.level?.id}`;
  if(nav.dataset.trainingNav===signature)return;
  nav.dataset.trainingNav=signature;
  const glyphs={training:'book',bank:'bank',journal:'file',bookkeeping:'plus',invoices:'file',close:'check',
    salesPractice:'file',reports:'chart',pl:'chart'};
  nav.innerHTML=Locale.markup(`<div class="nav-label">练习工作台</div>${pages.map(id=>
    `<a href="${esc(trainingURL(id))}" data-act="section" data-v="${id}">${Account.icon(glyphs[id])}<span>${id==='bank'?'银行对账':(REPORT_PAGES[id]||OTHER_PAGES[id])[0]}</span></a>`).join('')}`);
  const brand=$('.rail-brand');
  brand.dataset.v='training';brand.href=trainingURL('training');
  $('.rail-bottom').innerHTML=Locale.markup('<span class="online-dot"></span> 实训数据独立保存');
  $('.workspace-footer span:last-child').textContent=Locale.text('虚构业务资料 · 练习专用');
}
function renderReportNav(page){
  const el=$('#reportNav');
  el.hidden=!workspace || !isReport(page);
  if(el.hidden)return;
  const file=page==='custom'?workspace.currentReport():null;
  const tabs=Object.entries(REPORT_PAGES).map(([key,[label]])=>`<a href="index.html#${key}" data-act="section" data-v="${key}"${key===page?' aria-current="page"':''}>${key==='custom'?'管理报表':label}</a>`).join('');
  el.innerHTML=Locale.markup(`<div class="editor-context"><a href="index.html#home" data-act="section" data-v="home">我的财报</a><span aria-hidden="true">/</span><strong>${file?esc(file.draft.title||Locale.text('未命名财报')):'账本报表'}</strong>
    ${page==='custom'&&!file?'<button type="button" class="btn small" data-space="report-copy">保存为财报文件</button>':''}</div><div class="editor-tabs">${tabs}</div>`);
  const strip=$('.editor-tabs',el), active=$('[aria-current="page"]',strip);
  if(active && strip.scrollWidth>strip.clientWidth){
    const tab=active.getBoundingClientRect(), track=strip.getBoundingClientRect();
    if(tab.right>track.right)strip.scrollLeft+=tab.right-track.right;
  }
}
function renderSpaceHome(){
  workspace.renderHome([
    {label:'资产总额',value:`${cur()} ${fmt(R.totA)}`,hint:'当前账本'},
    {label:'现金及现金等价物',value:`${cur()} ${fmt(R.bal('1000'))}`,hint:'期末余额'},
    {label:'净利润',value:`${cur()} ${fmt(R.P.np)}`,hint:'本年度累计'},
    {label:'财报文件',value:String(workspace.data.reports.length),hint:`${workspace.data.folders.length} 个文件夹`},
  ],pendingWork().map(t=>taskLink(t,`<strong>${t.text}</strong><small>${t.detail}</small>`)));
}
function renderHeader(){
  const st = S.settings;
  renderAccountNav();
  if(trainingMode){
    renderTrainingNav();
    $('#mobileJump').setAttribute('aria-label',Locale.text('实训快捷导航'));
    $('#mobileJump button').textContent=Locale.text('回到引导步骤');
  }
  const mobile = $('#mobile-nav');
  const menuKey=Locale.current+(trainingMode?trainingNavPages().join(','):'');
  if (!mobile.options.length || mobile.dataset.locale!==menuKey) {
    mobile.dataset.locale=menuKey;
    const menu = trainingMode ? [['对账实训',trainingNavPages()]]
      : workspace ? [['工作空间',['home']],['日常账务',[...(readOnly()?[]:['bookkeeping']),'invoices','bank','journal']],['复核与报表',['ledger','close','payroll','reports']]]
      : [['财务报告',Object.keys(REPORT_PAGES)],['账务处理',['bookkeeping','invoices','journal','ledger','bank','close']]];
    if(!trainingMode)menu.push(['帮助',['tutorial']]);
    mobile.innerHTML = Locale.markup(menu.map(([title,pages])=>`<optgroup label="${title}">${pages.map(key=>`<option value="${key}">${({home:'工作台',bank:'银行对账'})[key] || (workspace && key==='reports'?'财报编辑':(REPORT_PAGES[key] || OTHER_PAGES[key])[0])}</option>`).join('')}</optgroup>`).join(''));
  }
  mobile.value=primaryRoute(UI.section);
  const title = workspace&&isReport(UI.section)?'财报编辑':(REPORT_PAGES[UI.section] || OTHER_PAGES[UI.section])[0];
  $('#pageTitle').textContent = Locale.text(title);
  $('#pageEyebrow').textContent = Locale.text(trainingMode?'练习模式':UI.section==='home'?'WORKSPACE':isReport(UI.section) ? 'FINANCIAL REPORTING' : 'ACCOUNTING OPERATIONS');
  document.title = Locale.text('企业财务工作台 · '+title);
  document.body.dataset.section = UI.section;
  document.querySelectorAll('.primary-nav a').forEach(a => {
    const selected = a.dataset.v === primaryRoute(UI.section);
    if (selected) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
  $('#coLine').innerHTML = Locale.markup(trainingMode&&UI.section==='training'?'虚构业务资料 · 进度仅保存在此浏览器':`<b>${esc(S.company.name)}</b> · ${esc(S.company.year)} 年度 · ${esc(cur())}`);
  const aiArea = !trainingMode&&!demoMode&&!readOnly()&&(UI.section === 'bookkeeping' && UI.mode === 'ai' || UI.showSettings);
  const trainingExit = `index.html${Locale.current==='zh-HK'?'?lang=zh-HK':''}${entryParams.get('from')==='login'?'':'#tutorial'}`;
  const accountTools=workspace?'<span id="spaceSync" class="space-sync" role="status"></span>':'';
  const mobileLogout=workspace&&!demoMode?'<button type="button" class="btn mobile-account-logout" data-space="logout">退出账号</button>':'';
  $('#toolbar').innerHTML = Locale.markup(`${accountTools}${mobileLogout}<button class="btn" data-act="interfaceLocale" data-v="${Locale.current==='zh-HK'?'zh-CN':'zh-HK'}" aria-label="切换界面字形">${esc(Locale.current==='zh-HK'?'简体':'繁體')}</button>${trainingMode?`<a class="btn" href="${trainingExit}">退出练习</a>`:`<button class="btn" data-act="settings" aria-expanded="${UI.showSettings}">账本设置</button>`}
     ${aiArea ? `<button class="btn" data-act="aiConnection">AI 连接</button>${UI.aiConnected ? `<span class="ai-badge">${esc(aiLabel())} 已登录</span>` : `<button class="btn" data-act="aiLogin">登录 ChatGPT</button>`}` : ''}`);
  const frozen = EBook.closedThrough(S) ? ' disabled' : '';
  const bankFrozen = Object.keys(S.bankReconciliation || {}).length || Object.keys(S.bankReconciliationByAccount || {}).length ? ' disabled' : frozen;
  $('#settingsBar').innerHTML = Locale.markup(UI.showSettings ? `<div class="settings">
    <div class="field wide"><label for="set-name">公司名称</label><input id="set-name" data-set="name" value="${esc(S.company.name)}" autocomplete="off"></div>
    <div class="field narrow"><label for="set-year">会计年度</label><input id="set-year" data-set="year"${bankFrozen} value="${esc(S.company.year)}" inputmode="numeric"></div>
    <div class="field narrow"><label for="set-cur">货币符号</label><input id="set-cur" data-set="cur"${bankFrozen} value="${esc(S.company.cur)}"></div>
    <div class="field narrow"><label for="set-tax">所得税率 %</label><input id="set-tax" data-set="tax"${frozen} value="${esc(st.tax)}" inputmode="decimal"></div>
    <label class="checkline"><input type="checkbox" id="set-auto" data-set="autoTax"${frozen}${st.autoTax ? ' checked' : ''}> 年末自动计提所得税</label>
    ${seg('lang',st.lang,[['both','中英'],['en','EN'],['zh','中文']])}
    <p class="hint">${frozen ? '锁定期间存在时，年度、币种、税务参数和期初余额不可更改。' : bankFrozen ? '已有银行对账单，年度和币种不可更改。' : '自动计税为年末估算。企业账本默认关闭，可通过调整凭证录入已核对的税额。'}</p>
    <div class="actions" style="margin-left:auto"><button class="btn" data-act="blank">新建空账本</button></div></div>` : '');
  const E = R;
  const prev = UI.lastEq; const nowEq = [E.totA, E.totL, E.totE].join('|');
  const flash = prev && prev !== nowEq;
  UI.lastEq = nowEq;
  const okAll = E.checks.every(c => c.ok);
  $('#eqBox').innerHTML = Locale.markup(`<div class="eq-terms">
      <div class="eq-term${flash ? ' eq-flash' : ''}"><span class="k">资产 Assets</span><span class="v">${fmt(E.totA)}</span></div><span class="eq-op">=</span>
      <div class="eq-term${flash ? ' eq-flash' : ''}"><span class="k">负债 Liabilities</span><span class="v">${fmt(E.totL)}</span></div><span class="eq-op">+</span>
      <div class="eq-term${flash ? ' eq-flash' : ''}"><span class="k">权益 Equity</span><span class="v">${fmt(E.totE)}</span></div></div>
    <div class="chips" aria-label="${okAll ? '全部勾稽关系成立' : '有勾稽关系不成立'}">${E.checks.map(c => `<button class="chip${c.ok ? '' : ' bad'}" data-act="chip" data-k="${c.k}"><span class="dot">${c.ok ? '✓' : '✗'}</span>${c.zh}</button>`).join('')}</div>`);
}
const ledgerTab = () => UI.ledgerTab || (LEDGER_TABS.includes(S.settings.tab) ? S.settings.tab : 'tb');
function renderBoard(){
  const page = UI.section;
  const tab = page === 'ledger' ? ledgerTab() : page;
  const shownTabs = page === 'ledger' ? LEDGER_TABS : [];
  $('#tabs').hidden = !shownTabs.length;
  $('#tabs').innerHTML = Locale.markup(shownTabs.map((k, i) => {
    const [, , label] = TABS.find(t => t[0] === k);
    return `<button id="tab-${k}" role="tab" type="button" data-act="tab" data-v="${k}" aria-controls="pane" tabindex="${tab===k?0:-1}" aria-selected="${tab===k}"><span class="n" aria-hidden="true">${i + 1}</span>${k==='closing'?'年结分录预览':label}</button>`;
  }).join(''));
  // When the open tab changes, however the user got there, the tutorial moves to that tab's step;
  // opening the tutorial itself starts at the introduction whatever tab is showing.
  if (UI.guide != null && UI.guideTab && UI.guideTab !== tab) UI.guide = Guide.stepOf(tab);
  UI.guideTab = UI.guide == null ? null : tab;
  const guide = $('#ledgerGuide'), facts = UI.guide == null ? null : guideFacts();
  guide.hidden = !facts;
  guide.innerHTML = facts ? Locale.markup(Guide.cardHTML(UI.guide, facts)) : '';
  const e = UI.sel && R.byId[UI.sel];
  $('#fpBar').innerHTML = Locale.markup(e ? `<div class="fp">正在追踪 <b>J${e.no} ${esc(e.memo)}</b><span>高亮显示该凭证影响的项目。</span><button class="btn small" data-act="clearSel">取消追踪</button></div>` : '');
  TRACES = [];
  const render = {chart:paneChart, opening:paneOpening, journal:paneJournal, ledger:paneLedger, tb:paneTB, pl:panePL, soce:paneSOCE, sfp:paneSFP, scf:paneSCF, closing:paneClosing}[tab];
  const pane = $('#pane');
  if (shownTabs.length) { pane.setAttribute('role','tabpanel'); pane.setAttribute('aria-labelledby','tab-'+tab); }
  else { pane.removeAttribute('role'); pane.removeAttribute('aria-labelledby'); }
  pane.className = 'pane' + (lang() === 'zh' ? ' lang-zh' : '');
  pane.innerHTML = Locale.markup(render ? render() : '');
  // Point at what the current tutorial step talks about.
  const step = facts && Guide.tabOf(UI.guide);
  const focus = step === 'ledger' ? [...pane.querySelectorAll('.tacc')].filter(c => c.dataset.key === facts.sample?.key)
    : step ? pane.querySelectorAll({chart:'.pane-ctl', opening:'.okbad', tb:'table.wk tfoot tr, .tb-checks', closing:'.subh + .je'}[step]) : [];
  for (const el of focus) el.classList.add('guide-focus');
}
function renderAll(){
  const act = document.activeElement, fid = act && act.id;
  let caret = null; try { caret = act && act.selectionStart; } catch (e) {}
  const page = UI.section;
  const statements = STATEMENTS.includes(page);
  const book = page === 'bookkeeping', board = statements || ['journal','ledger'].includes(page);
  const enterprise = page === 'analysis' || page === 'close';
  // The 总账与试算 tutorial ends when the user leaves that page.
  if (page !== 'ledger' && UI.guide != null) { UI.guide = null; $('#ledgerGuide').hidden = true; }
  syncChart();
  R = compute(S, page==='close' ? selectedCloseMonth() : hasPeriod(page) ? UI.reportMonth : page==='ledger' && ledgerTab()!=='closing' ? UI.ledgerMonth : 12);
  $('#eqBox').hidden = !(page==='reports' && UI.showChecks);
  $('#work').hidden = !(book || board);
  $('#bench').hidden = !book; $('#board').hidden = !board;
  $('#registerTools').hidden = page !== 'journal';
  if (page !== 'journal') $('#registerTools').replaceChildren();
  $('#reportEditor').hidden = page !== 'custom';
  $('#bankPane').hidden = page !== 'bank';
  $('#payrollWorkspace').hidden = page !== 'payroll';
  $('#memberPane').hidden = page !== 'members';
  $('#businessPane').hidden = page !== 'business';
  $('#invoicePane').hidden = page !== 'invoices';
  $('#cashPane').hidden = page !== 'cash';
  $('#inventoryPane').hidden = page !== 'inventory';
  $('#assetPane').hidden = page !== 'assets';
  $('#overview').hidden = page !== 'reports';
  $('#mobileJump').hidden = !book; $('#enterprisePane').hidden = !enterprise;
  $('#spaceHome').hidden=page!=='home';
  $('#tutorialPane').hidden=page!=='tutorial';
  $('#taskBar').hidden=['home','payroll','tutorial','training','salesPractice'].includes(page);
  renderHeader(); renderTaskEntry(); renderReportNav(page);
  if(trainingMode){
    document.body.dataset.trainingRole=trainingRole();
    document.body.toggleAttribute('data-training-import',!!trainingStore.level?.allowImport);
    document.body.toggleAttribute('data-ledger-readonly',readOnly());
    $('#trainingCatalog').hidden=page!=='training';
    $('#trainingCoach').hidden=page==='training';
    $('#trainingWork').hidden=page==='training';
    $('#mobileJump').hidden=page==='training';
    $('#trainingSales').hidden=page!=='salesPractice';
    if(page==='training')trainingView.renderCatalog(trainingStore);
    else renderTrainingCoach();
  }
  if(page==='home') renderSpaceHome();
  else if(page==='salesPractice'){
    trainingSalesPortal.data=Training.salesRequest(S,null,validDate,'sales');
    trainingSalesPortal.render();
  }
  else if (page === 'tutorial') tutorial.render({role:workspace?.user.role, readOnly:readOnly(), catalog:tutorialCatalog});
  else if (page === 'custom') reportEditor.render();
  else if (page === 'reports') renderOverview();
  else if (page === 'bank') bankWorkspace.render();
  else if (page === 'members') renderMembers();
  else if (page === 'business') renderBusiness();
  else if (page === 'invoices') invoiceWorkspace.render();
  else if (page === 'cash') renderCash();
  else if (page === 'inventory') renderStock();
  else if (page === 'assets') renderAssets();
  else if (enterprise) $('#enterprisePane').innerHTML = Locale.markup(page === 'analysis' ? renderAnalysis() : renderClose());
  else if (book) renderBench();
  else if (board) { if(page==='journal') renderRegister(); renderBoard(); }
  renderSaveStatus();
  if (fid) { const el = document.getElementById(fid); if (el && !el.closest('[hidden]') && el !== document.activeElement) { el.focus({preventScroll:true}); try { if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); } catch (e) {} } }
}

/* ================= membership details ================= */
function renderMembers(){
  const through=EBook.periodFor(S,UI.memberMonth).end, d=Member.summary(S,through);
  const moneyCell=n=>`${esc(cur())} ${fmt(n)}`;
  const voucher=t=>`<button class="text-button" data-act="jump" data-id="${esc(t.id)}">${esc(t.id)}${R.byId[t.id]?' · J'+R.byId[t.id].no:''}</button>`;
  const action=(type,label,attrs='')=>`<button class="btn small" data-act="memberStart" data-v="${type}" ${attrs}>${label}</button>`;
  const saleAction=(p,type,label)=>action(type,label,`data-id="${esc(p.txn.id)}"`);
  const purchaseLine=p=>`<li><span>${esc(p.txn.date)} · 购卡 ${voucher(p.txn)} · ${moneyCell(p.amount)} · 已退款 ${moneyCell(p.refunded)}</span><div class="actions">${p.card.balance>0&&p.refunded<p.amount?saleAction(p,'memberCardRefund','退余额'):''}</div></li>`;
  const cardRows=d.cards.map(c=>`<tr><th scope="row"><strong>${esc(c.cardNo)}</strong><small>${esc(c.customer)}</small></th><td>${fmt(c.received)}</td><td>${fmt(c.used)}</td><td><strong>${fmt(c.balance)}</strong></td><td>${fmt(c.refunded)}</td><td>${action('memberCardUse','记录消费',`data-card="${esc(c.cardNo)}"`)}<details class="member-detail"><summary>购卡、消费及退款凭证 · ${c.sales.length+c.uses.length+c.refunds.length} 笔</summary><ul>${c.sales.map(purchaseLine).join('')}${c.uses.map(t=>`<li>消费 ${voucher(t)} · ${esc(t.date)} · ${moneyCell(t.groups[0].find(l=>l.a==='2300').s)}</li>`).join('')}${c.refunds.map(t=>`<li>退款 ${voucher(t)} · ${esc(t.date)} · ${moneyCell(t.groups[0].find(l=>l.a==='2300').s)}</li>`).join('')}</ul></details></td></tr>`).join('');
  const commissionRows=d.purchases.filter(p=>p.expected>0).map(p=>{
    const legacy=p.accrual && p.accrual!==p.txn ? `<li>旧版计提 ${voucher(p.accrual)}</li>` : '';
    const events=[...p.payments.map(t=>['支付',t]),...p.reversals.map(t=>['冲回',t]),...p.recoveries.map(t=>['追回',t])];
    const history=legacy+events.map(([label,t])=>`<li>${label} ${voucher(t)} · ${esc(t.date)}</li>`).join('');
    const controls=[
      p.unaccrued && saleAction(p,'memberCommissionAccrue','补录旧账佣金'),
      p.unpaid>0 && saleAction(p,'memberCommissionPay','支付佣金'),
      p.accrual && (p.unpaid>0||p.paid>p.reversedPaid) && saleAction(p,'memberCommissionReverse','冲回佣金'),
      p.recoverable>0 && saleAction(p,'memberCommissionRecover','收回佣金'),
    ].filter(Boolean).join('');
    return `<tr data-sale-id="${esc(p.txn.id)}"><th scope="row">${voucher(p.txn)}<small>${esc(p.txn.date)} · ${esc(p.card.cardNo)} · ${esc(p.card.customer)}</small>${p.unaccrued?`<small>旧账未确认 ${moneyCell(p.unaccrued)}</small>`:''}</th><td>${fmt(p.accrued)}</td><td>${fmt(p.paid)}</td><td><strong>${fmt(p.unpaid)}</strong></td><td>${fmt(p.recoverable)}</td><td><div class="actions">${controls}</div>${history?`<details class="member-detail"><summary>关联凭证</summary><ul>${history}</ul></details>`:''}</td></tr>`;
  }).join('');
  $('#memberPane').innerHTML=Locale.markup(`<article class="enterprise-card member-intro"><div class="enterprise-heading"><div><h3>会员卡与佣金</h3><p>按凭证日期汇总 · 金额单位 ${esc(cur())}</p></div><div class="field period-select"><label for="member-month">查看截至月末 · ${esc(S.company.year)} 年</label><select id="member-month">${monthOptions(UI.memberMonth)}</select></div></div>
    <div class="member-metrics"><div><span>会员卡数量</span><strong>${d.cards.length}</strong></div><div><span>会员卡余额</span><strong>${moneyCell(d.totals.balance)}</strong></div><div><span>应付佣金余额</span><strong>${moneyCell(d.totals.unpaid)}</strong></div><div><span>应收佣金追回款</span><strong>${moneyCell(d.totals.recoverable)}</strong></div></div>
    <p class="hint">截至 ${esc(through)}。新售卡的佣金随售卡确认应付。明细只包含已关联的会员卡凭证，不含期初余额、手工凭证及未关联的旧凭证。</p>
    ${d.totals.unaccrued?`<p class="period-notice">旧售卡预计佣金尚未入账：${moneyCell(d.totals.unaccrued)}。旧账不会自动补记。</p>`:''}
    ${d.legacy?`<p class="period-notice">有 ${d.legacy} 笔旧会员卡模板凭证尚未关联，未计入以下明细。未锁定期间可在凭证查询中编辑并补全关联信息。</p>`:''}
    <div class="actions">${action('memberCardSale','＋ 售卡 / 充值')}</div></article>
    <article class="enterprise-card"><div class="enterprise-heading"><div><h3>会员卡余额</h3><p>同一卡号的多次购卡 / 充值合并计算；消费按会员卡扣减。</p></div></div>
    ${cardRows?`<div class="scroll"><table class="enterprise-table member-table"><thead><tr><th scope="col">会员卡 / 客户</th><th scope="col">累计实收</th><th scope="col">已消费</th><th scope="col">可用余额</th><th scope="col">已退款</th><th scope="col">凭证与操作</th></tr></thead><tbody>${cardRows}</tbody></table></div>`:'<p class="empty">此期间尚无已关联的会员卡购卡凭证。</p>'}</article>
    <article class="enterprise-card"><div class="enterprise-heading"><div><h3>售卡佣金明细</h3><p>按原售卡凭证查看应付、支付和追回余额。</p></div></div>
    ${commissionRows?`<div class="scroll"><table class="enterprise-table member-table"><thead><tr><th scope="col">售卡凭证 / 会员卡</th><th scope="col">已确认佣金</th><th scope="col">已支付</th><th scope="col">应付余额</th><th scope="col">应收追回</th><th scope="col">凭证与操作</th></tr></thead><tbody>${commissionRows}</tbody></table></div>`:'<p class="empty">此期间尚无含佣金的售卡凭证。</p>'}</article>`);
}

function renderBusiness(){
  const through=EBook.periodFor(S,UI.businessMonth).end, detail=Business.summary(S,through), ledger=UI.businessLedger;
  const spec=Business.LEDGERS[ledger], items=detail.items.filter(x=>x.ledger===ledger), parties=detail.parties.filter(x=>x.ledger===ledger);
  const actions={receivable:'customerReceipt',payable:'supplierPayment',staffAdvance:'staffAdvanceReturn',staffPayable:'staffClaimPay',supplierAdvance:'supplierDepositOffset',customerAdvance:'customerDepositUse',payroll:'hkPayrollPay',mpfPayable:'hkMpfPay',profitsTax:'hkProfitsTaxPay',taxPrepayment:'hkTaxOffset',deferredExpense:'prepaidExpenseUse',accruedExpense:'accruedExpensePay',borrowing:'loanPrincipalPay',loanInterest:'loanInterestPay'};
  const age=x=>{if(!x.dueDate)return '未设到期日';const days=Math.floor((Date.parse(through)-Date.parse(x.dueDate))/86400000);return days>0?`逾期 ${days} 天`:'未到期';};
  const voucher=x=>`<button class="text-button" data-act="jump" data-id="${esc(x.source.id)}">${esc(x.source.id)}${R.byId[x.source.id]?' · J'+R.byId[x.source.id].no:''}</button>`;
  const rows=items.map(x=>`<tr><th scope="row"><strong>${esc(x.partyName)}</strong><small>${esc(x.partyId)}</small></th><td>${voucher(x)}<small>${esc(x.source.date)}${x.source.ref?' · '+esc(x.source.ref):''}</small></td><td>${fmt(x.amount)}</td><td>${fmt(x.amount-x.balance)}</td><td><strong>${fmt(x.balance)}</strong></td><td>${x.dueDate?esc(x.dueDate):'—'}<small>${age(x)}</small></td><td>${x.balance&&actions[ledger]?`<button class="btn small" data-act="businessStart" data-v="${actions[ledger]}" data-id="${esc(x.id)}" data-amount="${x.balance}">核销</button>`:''}<details class="member-detail"><summary>相关凭证 · ${x.applications.length} 笔</summary><ul>${x.applications.map(a=>`<li><button class="text-button" data-act="jump" data-id="${esc(a.txn.id)}">${esc(a.txn.id)}</button> · ${esc(a.txn.date)} · ${hm$(a.amount)}</li>`).join('')||'<li>尚无核销凭证。</li>'}</ul></details></td></tr>`).join('');
  const partyRows=parties.map(p=>`<tr><th scope="row">${esc(p.name)}<small>编号 ${esc(p.id)}</small></th><td>${fmt(p.opened)}</td><td>${fmt(p.opened-p.balance)}</td><td><strong>${fmt(p.balance)}</strong></td></tr>`).join('');
  $('#businessPane').innerHTML=Locale.markup(`<article class="enterprise-card"><div class="enterprise-heading"><div><h3>${uiEsc(spec.label)}明细</h3><p>截至 ${esc(through)} · ${esc(cur())}</p></div><div class="actions"><div class="field period-select"><label for="business-ledger">往来类别</label><select id="business-ledger">${Object.entries(Business.LEDGERS).map(([k,v])=>`<option value="${k}"${k===ledger?' selected':''}>${esc(v.label)}</option>`).join('')}</select></div><div class="field period-select"><label for="business-month">截至月末</label><select id="business-month">${monthOptions(UI.businessMonth)}</select></div></div></div>
    <p class="hint">此处只汇总已关联的业务凭证；期初余额和旧版手工凭证不会自动进入明细。账龄按单据到期日与所选月末计算。</p>
    ${partyRows?`<div class="scroll"><table class="enterprise-table member-table"><thead><tr><th scope="col">往来对象</th><th scope="col">发生金额</th><th scope="col">已核销</th><th scope="col">未结余额</th></tr></thead><tbody>${partyRows}</tbody></table></div>`:'<p class="empty">此期间尚无已关联的往来单据。</p>'}</article>
    <article class="enterprise-card"><div class="enterprise-heading"><div><h3>逐笔单据与核销</h3><p>可点击凭证查看来源；每笔核销只允许同一往来对象。</p></div></div>
    ${rows?`<div class="scroll"><table class="enterprise-table member-table"><thead><tr><th scope="col">往来对象</th><th scope="col">原凭证</th><th scope="col">原金额</th><th scope="col">已核销</th><th scope="col">未结余额</th><th scope="col">到期 / 账龄</th><th scope="col">凭证与操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="empty">暂无单据。</p>'}</article>`);
}
function renderCash(){
  const rows=Bank.accounts(S).map(a=>{const r=Bank.summary(S,12,a.id);return `<tr><th scope="row">${cashLabel(a)}<small>编号 ${esc(a.id)}</small></th><td>${fmt(a.opening)}</td><td>${fmt(r.bookEnding-a.opening)}</td><td><strong>${fmt(r.bookEnding)}</strong></td><td><button class="btn small" data-act="cashBank" data-id="${esc(a.id)}">账户对账</button></td></tr>`;}).join('');
  $('#cashPane').innerHTML=Locale.markup(`<article class="enterprise-card"><div class="enterprise-heading"><div><h3>资金账户余额</h3><p>各账户合计对应总账 1000 现金及现金等价物；金额单位 ${esc(cur())}。</p></div></div>
    <div class="scroll"><table class="enterprise-table member-table"><thead><tr><th scope="col">账户</th><th scope="col">期初余额</th><th scope="col">本年净变动</th><th scope="col">期末余额</th><th scope="col">操作</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">仅将符合现金及现金等价物定义的账户放在这里。新增账户的期初余额从总账 1000 期初中拆分，不改变总额；已有对账单或锁账后只能新增零期初账户。</p>
    <div class="fields"><div class="field"><label for="cash-new-id">新账户编号</label><input id="cash-new-id" maxlength="40" placeholder="如 BANK2" autocomplete="off"></div><div class="field"><label for="cash-new-name">账户名称</label><input id="cash-new-name" maxlength="80" placeholder="如 银行二号账户" autocomplete="off"></div><div class="field"><label for="cash-new-opening">该账户期初余额</label><input id="cash-new-opening" inputmode="decimal" placeholder="0" autocomplete="off"></div></div><div class="actions"><button class="btn primary" data-act="cashAdd">新增资金账户</button><button class="btn" data-act="cashTransferStart">内部转账</button></div></article>`);
}
function renderStock(){
  const through=EBook.periodFor(S,UI.inventoryMonth).end,d=Stock.summary(S,through),qty=n=>(n/1000).toLocaleString('en-US',{maximumFractionDigits:3});
  const rows=d.items.map(x=>`<tr><th scope="row"><strong>${esc(x.name)}</strong><small>${esc(x.sku)}</small></th><td>${qty(x.qty)}</td><td>${fmt(x.cost)}</td><td>${x.qty?fmt(Math.round(x.cost*1000/x.qty)):'—'}</td><td><div class="actions">${['stockSale','stockGain','stockLoss'].map((v,i)=>`<button class="btn small" data-act="stockStart" data-v="${v}" data-id="${esc(x.sku)}">${['销售','盘盈','盘亏'][i]}</button>`).join('')}</div><details class="member-detail"><summary>相关凭证 · ${x.txns.length} 笔</summary><ul>${x.txns.map(t=>`<li><button class="text-button" data-act="jump" data-id="${esc(t.id)}">${esc(t.id)}</button> · ${esc(t.date)} · ${uiEsc(TPL[t.tpl]?.zh||t.tpl)}${t.stock.kind==='sale'?` <button class="btn small" data-act="stockStart" data-v="stockReturn" data-id="${esc(t.id)}">退货</button>`:''}</li>`).join('')}</ul></details></td></tr>`).join('');
  $('#inventoryPane').innerHTML=Locale.markup(`<article class="enterprise-card"><div class="enterprise-heading"><div><h3>商品存货</h3><p>截至 ${esc(through)} · 移动加权平均成本 · 金额单位 ${esc(cur())}</p></div><div class="field period-select"><label for="inventory-month">截至月末</label><select id="inventory-month">${monthOptions(UI.inventoryMonth)}</select></div></div>
    <p class="hint">仅汇总通过商品存货模板记录的数量及成本；旧存货凭证和期初总账不自动分配到商品。退货、盘点和历史修改必须与相关单据一致。</p><div class="actions"><button class="btn primary" data-act="stockStart" data-v="stockPurchase">＋ 商品入库</button></div>
    ${rows?`<div class="scroll"><table class="enterprise-table member-table"><thead><tr><th scope="col">商品</th><th scope="col">库存数量</th><th scope="col">库存成本</th><th scope="col">平均单位成本</th><th scope="col">凭证与操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="empty">此期间尚无商品存货凭证。</p>'}</article>`);
}
function renderAssets(){
  const through=EBook.periodFor(S,UI.assetMonth).end,d=Assets.summary(S,through);
  const rows=d.assets.map(a=>`<tr><th scope="row"><strong>${esc(a.name)}</strong><small>${esc(a.code)}</small></th><td>${fmt(a.cost)}</td><td>${fmt(a.depreciation)}</td><td><strong>${fmt(a.bookValue)}</strong></td><td>${a.disposal?'已处置':`自 ${esc(a.firstMonth)} 起 · ${a.life} 月`}</td><td><div class="actions">${a.disposal?'':`<button class="btn small" data-act="assetStart" data-v="assetDepreciation" data-id="${esc(a.txn.id)}">计提折旧</button><button class="btn small" data-act="assetStart" data-v="assetDisposal" data-id="${esc(a.txn.id)}">出售 / 报废</button>`}</div><details class="member-detail"><summary>资产凭证 · ${1+a.deps.length+(a.disposal?1:0)} 笔</summary><ul>${[a.txn,...a.deps,...(a.disposal?[a.disposal]:[])].map(t=>`<li><button class="text-button" data-act="jump" data-id="${esc(t.id)}">${esc(t.id)}</button> · ${esc(t.date)} · ${uiEsc(TPL[t.tpl]?.zh||t.tpl)}</li>`).join('')}</ul></details></td></tr>`).join('');
  $('#assetPane').innerHTML=Locale.markup(`<article class="enterprise-card"><div class="enterprise-heading"><div><h3>固定资产卡片</h3><p>截至 ${esc(through)} · 直线法折旧 · 金额单位 ${esc(cur())}</p></div><div class="field period-select"><label for="asset-month">截至月末</label><select id="asset-month">${monthOptions(UI.assetMonth)}</select></div></div>
    <p class="hint">仅包含通过资产卡片模板录入的设备；期初及旧版凭证不自动建卡。首次折旧月份、使用年限、残值和处置前折旧应按企业政策核对。</p><div class="actions"><button class="btn primary" data-act="assetStart" data-v="assetPurchase">＋ 购置并建卡</button></div>
    ${rows?`<div class="scroll"><table class="enterprise-table member-table"><thead><tr><th scope="col">资产</th><th scope="col">原价</th><th scope="col">累计折旧</th><th scope="col">账面价值</th><th scope="col">状态</th><th scope="col">凭证与操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="empty">此期间尚无固定资产卡片。</p>'}</article>`);
}

/* ================= enterprise workspaces ================= */
const monthLabel = m => m ? `${m} 月末` : '无锁定期间';
const monthRange = (from,to) => from===to ? `${to} 月` : `${from}–${to} 月`;
const disabled = test => test ? ' disabled' : '';
const pastMonth = () => {
  if(trainingMode)return TrainingContent.month;
  const date = today(), year = +date.slice(0,4);
  return +S.company.year < year ? 12 : +S.company.year > year ? 0 : EBook.monthOf(date)-1;
};
function selectedCloseMonth(){
  return UI.closeMonth ?? Math.min(12,Math.max(1,EBook.closedThrough(S)+1,pastMonth()));
}
function renderAnalysis(){
  const months = EBook.monthlySeries(R, ACC);
  const maximum = Math.max(1,...months.flatMap(m=>[Math.abs(m.revenue),Math.abs(m.profit)]));
  const bar = (value, type) => `<div class="month-track"><i class="${type} ${value<0?'negative':''}" style="width:${Math.abs(value)/maximum*50}%"></i></div>`;
  return `<article class="enterprise-card"><div class="enterprise-heading"><div><h3>${R.yr} 年月度表现</h3><p>收入、利润和现金变动均为单月发生额；现金余额为当月期末值。币种：${esc(cur())}</p></div></div>
    <div class="scroll"><table class="enterprise-table"><thead><tr><th scope="col">月份</th><th scope="col">凭证数</th><th scope="col">营业收入</th><th scope="col">净利润</th><th scope="col">现金净变动</th><th scope="col">月末现金</th></tr></thead>
    <tbody>${months.map(m=>`<tr><th scope="row">${m.month} 月</th><td>${m.count}</td><td>${fmt(m.revenue)}${bar(m.revenue,'revenue')}</td><td>${fmt(m.profit)}${bar(m.profit,'profit')}</td><td>${fmt(m.cashMove)}</td><td>${fmt(m.cashEnd)}</td></tr>`).join('')}</tbody></table></div></article>`;
}
function closeBankStatus(month){
  const through=EBook.closedThrough(S);
  return Bank.closeStatus(S,month<=through?month-1:through,month);
}
function closeItems(bankStatus){
  return EBook.CLOSE_ITEMS.flatMap(([key,label]) => key!=='cash' ? [[key,label]] : bankStatus.missing.length
    ? [[key,`已在外部核对尚未导入对账单的资金账户及月份（${bankStatus.missing.join('、')} 月），并处理差异`]] : []);
}
function canClose(month, bankStatus = closeBankStatus(month)){
  return !UI.loadBlocked && month>EBook.closedThrough(S) && month<=pastMonth() &&
    R.checks.every(c=>c.ok) && !bankStatus.pending.length && closeItems(bankStatus).every(([key])=>UI.closeChecks.has(key));
}
function closeNextStep(issues, bankStatus, remaining){
  if(UI.loadBlocked)return '请先恢复账本，再继续月结。';
  if(issues.length)return `请先处理 ${issues.length} 项勾稽异常。点击上方异常项目查看原因。`;
  if(bankStatus.pending.length)return `请先处理 ${bankStatus.pending.join('、')} 月的银行对账差异。`;
  if(remaining)return `还有 ${remaining} 项人工复核待确认。`;
  return '复核已完成，可以锁账。';
}
function renderCloseBank(month, status){
  const r=Bank.summary(S,month), message=status.pending.length?'有账户待核对':r.ready?'已对账':r.statement?'有待核对差异':'未导入对账单';
  const to=status.pending[0] || month;
  const target=Bank.accounts(S).find(a=>Bank.get(S,to,a.id)&&!Bank.summary(S,to,a.id).ready)?.id||Bank.MAIN;
  return `<section class="close-bank-status${status.pending.length?' has-issues':''}" aria-label="银行对账状态"><div>
    <strong>2. 银行对账 · ${month} 月${message}</strong>
    <p>${Bank.accounts(S).length>1?'默认资金账户：':''}${r.statement?`未匹配流水 ${r.bankUnmatched} 条 · 未匹配凭证 ${r.unmatchedVouchers.length} 笔 · 期末差额 ${esc(cur())} ${fmt(r.endingDifference)}`:'可导入对账单，或在外部核对后勾选人工复核。'}</p>
    ${status.pending.length?`<p class="err">${status.pending.join('、')} 月仍有未处理的银行对账差异，不能锁账。</p>`:''}</div>
    <a class="btn" href="index.html#bank" data-act="closeBank" data-v="${to}" data-id="${esc(target)}">${status.pending.length?'处理对账差异':'打开银行流水对账'} ↗</a></section>`;
}
function renderClose(){
  const through = EBook.closedThrough(S), m = R.month;
  const closed = m<=through, eligible = m<=pastMonth(), issues = R.checks.filter(c=>!c.ok);
  const bankStatus=closeBankStatus(m), range = monthRange(through+1,m);
  const history = (S.periodHistory || []).slice().reverse(), checks=closeItems(bankStatus);
  const remaining=checks.filter(([key])=>!UI.closeChecks.has(key)).length;
  return `<div class="close-layout"><article class="enterprise-card"><div class="enterprise-heading"><div><h3>期间复核</h3><p>${S.company.year} 年 · ${through ? '已锁至 '+monthLabel(through) : '尚未锁账'}</p></div><div class="field period-select"><label for="close-month">选择月末</label><select id="close-month">${monthOptions(m)}</select></div></div>
    <div class="close-status${issues.length?' has-issues':''}"><strong>1. ${issues.length ? `处理 ${issues.length} 项勾稽异常` : '系统勾稽通过'}</strong><span>核对口径：${R.start} 至 ${R.end}</span></div>
    <div class="chips">${R.checks.map(c=>`<button class="chip${c.ok?'':' bad'}" data-act="chip" data-k="${c.k}"><span class="dot"></span>${c.zh}</button>`).join('')}</div>
    ${renderCloseBank(m,bankStatus)}
    <div class="actions close-links"><button class="btn" data-act="closeLedger">查看本期试算平衡</button><button class="btn" data-act="closeJournal">查看 ${m} 月凭证</button><button class="btn" data-act="closeReports">查看截至 ${m} 月报表</button></div>
    ${closed ? `<p class="period-notice">${m} 月已锁定。反结账将重新开放从 ${m} 月到 ${through} 月的凭证与银行对账编辑。</p><button class="btn" data-act="reopenPeriod">反结账并登记原因</button>`
    : eligible ? `<fieldset class="close-checklist"><legend>3. 人工复核 · ${range}</legend>${checks.map(([key,label])=>`<label class="checkline"><input type="checkbox" data-close-check="${key}"${UI.closeChecks.has(key)?' checked':''}> ${label}</label>`).join('')}</fieldset><p id="close-next-step" class="period-notice" role="status">${closeNextStep(issues,bankStatus,remaining)}</p><button class="btn primary" id="lock-period" data-act="closePeriod" aria-describedby="close-next-step"${disabled(!canClose(m,bankStatus))}>4. 锁定至 ${monthLabel(m)}</button>`
    : '<p class="period-notice">所选月份还未结束。可以查看数据，月末之后再锁定。</p>'}</article>
    <article class="enterprise-card close-history"><h3>结账记录</h3><p>当前账本的操作记录随备份一起保存。</p>${history.length ? `<ol>${history.map(e=>`<li><strong>${e.to>e.from?'锁定至 '+monthLabel(e.to):'重新开放 '+monthRange(e.to+1,e.from)}</strong><time datetime="${esc(e.at)}">${esc(new Date(e.at).toLocaleString(Locale.current))}</time>${e.reason?`<p>${esc(e.reason)}</p>`:''}</li>`).join('')}</ol>` : '<p class="empty">还没有锁账或反结账记录。</p>'}</article></div>`;
}
function preparePeriodChange(reopen){
  if(readOnly())return;
  const m = selectedCloseMonth(), from = EBook.closedThrough(S);
  if (UI.loadBlocked || (S.periodHistory?.length || 0)>=1000) return toast('当前账本不能登记更多结账操作，请先备份并检查账本。');
  if (reopen ? m>from : !canClose(m)) return;
  const to = reopen ? m-1 : m;
  UI.periodPending = {book:S,from,to,reopen};
  $('#modal').innerHTML = Locale.markup(`<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="period-title"><h3 id="period-title">${reopen?`重新开放 ${monthRange(m,from)}`:`锁定至 ${monthLabel(to)}`}</h3>
    ${reopen?'<div class="field"><label for="reopen-reason">反结账原因（必填）</label><textarea id="reopen-reason" rows="3" maxlength="200" required></textarea></div><p id="period-error" class="err" role="alert"></p>':`<p class="tdesc">将锁定截至 ${R.end} 的全部凭证，并保护银行对账、期初余额及影响报表计算的账本设置。该操作不会生成分录。</p>`}
    <div class="actions"><button class="btn primary" data-act="confirmPeriod">${reopen?'确认反结账':'确认锁定'}</button><button class="btn" data-act="closeModal">取消</button></div></div>`);
  $('#modal').hidden=false; ($('#reopen-reason') || $('#modal [data-act="closeModal"]')).focus();
}
function applyPeriodChange(){
  const p = UI.periodPending;
  if (!p || p.book!==S || EBook.closedThrough(S)!==p.from || UI.section!=='close' || UI.loadBlocked) return;
  if (!p.reopen && (p.to!==R.month || !canClose(p.to))) return;
  const reason = $('#reopen-reason')?.value.trim() || '';
  if (p.reopen && !reason) { $('#period-error').textContent=Locale.text('请填写反结账原因。'); return; }
  const history = S.periodHistory;
  S.periodHistory = [...(history || []),{from:p.from,to:p.to,at:new Date().toISOString(),reason}];
  if (!save()) { if (history) S.periodHistory=history; else delete S.periodHistory; toast('保存失败，期间状态没有改变。'); return; }
  UI.periodPending=null; UI.closeChecks.clear(); $('#modal').hidden=true;
  renderAll(); toast(p.reopen?'已反结账，原因已记录。':`已锁定至 ${monthLabel(p.to)}。`);
}
function openCloseJournal(){
  const end = EBook.monthEnd(+S.company.year,selectedCloseMonth());
  UI.filters = {query:'',from:end.slice(0,8)+'01',to:end,kind:'all'};
  UI.journalPage=1; navigateSection('journal');
}
function denyLocked(date){
  if (!EBook.locked(S,date)) return false;
  toast(`${date} 所在期间已锁定。请先在「月结工作台」反结账。`);
  return true;
}
function exportReport(){
  const page = UI.section, t=Locale.text;
  let rows;
  const entries = (source, positions = false) => source.filter(row=>row.k!=='sp').map(row=>[row.en===row.zh?row.zh:t(row.zh),
    row.v == null ? '' : row.fmt==='eps' ? Number(row.v.toFixed(2)) : row.v/100,
    ...(positions ? [row.v2 == null ? '' : row.v2/100] : [])]);
  if (page==='analysis') rows = [['月份','凭证数','营业收入','净利润','现金净变动','月末现金'].map(t),...EBook.monthlySeries(R,ACC).map(m=>[m.month,m.count,m.revenue/100,m.profit/100,m.cashMove/100,m.cashEnd/100])];
  if (page==='pl') rows = [[t('项目'),t('年初至期末')],...entries(S.settings.plPres==='single'&&!S.chart?plRows('all'):[...plRows('pl'),...plRows('oci')])];
  if (page==='scf') rows = [[t('项目'),t('年初至期末')],...entries(scfRows())];
  if (page==='sfp') rows = [[t('项目'),R.end,`${R.yr-1}-12-31`],...entries(sfpRows().rows,true)];
  if (page==='soce') { const d=soceData(); rows=[[t('项目'),...d.cols.map(c=>t(c.zh))],...d.rows.map(r=>[t(r.zh),...(r.cells || []).map(c=>c.v==null?'':c.v/100)])]; }
  if (!rows) return;
  const title = REPORT_PAGES[page][0];
  downloadFile(`${title}-${R.end}.csv`,EBook.csv([[t('报表'),t(title)],[t('公司'),S.company.name],[t('起始日'),R.start],[t('截止日'),R.end],[t('币种'),cur()],[],...rows]),'text/csv;charset=utf-8');
}
function batchTemplate(){
  const date = entryDate();
  const info = ['V-001',date,Locale.text('示例：收到服务费'),Locale.text('示例客户')];
  downloadFile('凭证导入模板.csv',EBook.csv([EBook.HEADERS.map(Locale.text),[...info,'1000',1000,'','否'],[...info,'4100','',1000,'否']]),'text/csv;charset=utf-8');
}
function openBatch(){
  UI.batchPreview=null;
  $('#modal').innerHTML = Locale.markup(`<div class="modal-box batch-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-title"><h3 id="batch-title">批量导入凭证</h3><p class="tdesc">同一凭证号的每行组成一笔凭证。请替换模板示例；凭证号不得与账本已有单据编号重复。每批最多 1,000 行。</p>
  <div class="actions"><button class="btn" data-act="batchTemplate">下载 CSV 模板</button><button class="btn" data-act="batchAccounts">下载科目代码</button></div>
  <div class="field"><label for="batch-file">选择 UTF-8 CSV</label><input type="file" id="batch-file" accept=".csv,text/csv"></div>
  <div class="field"><label for="batch-text">或粘贴 CSV</label><textarea id="batch-text" rows="6" maxlength="300000" spellcheck="false"></textarea></div>
  <div id="batch-result" aria-live="polite"></div><div class="actions"><button class="btn" data-act="batchPreview">校验并预览</button><button class="btn primary" id="batch-confirm" data-act="batchCommit" disabled>确认整批入账</button><button class="btn" data-act="closeModal">取消</button></div></div>`);
  $('#modal').hidden=false; $('#batch-file').focus();
}
function previewBatch(){
  const text=$('#batch-text').value, result=$('#batch-result'), confirm=$('#batch-confirm');
  UI.batchPreview=null; confirm.disabled=true;
  try {
    const vouchers = EBook.parseVouchers(text,{book:S,accounts:Chart.codeIndex(VISIBLE,S),validDate});
    const debit = vouchers.reduce((sum,v)=>sum+v.groups[0].reduce((n,l)=>n+Math.max(l.s,0),0),0);
    UI.batchPreview={text,book:S}; confirm.disabled=false;
    result.innerHTML = Locale.markup(`<div class="preview"><strong>${vouchers.length} 笔凭证通过校验，借贷各 ${esc(cur())} ${fmt(debit)}</strong><ol class="batch-preview">${vouchers.map(v=>`<li>${esc(v.date)} · ${esc(v.ref)} · ${esc(v.memo)} · ${v.groups[0].length} 行</li>`).join('')}</ol></div>`);
  } catch (e) { result.innerHTML=Locale.markup(`<p class="err">${uiEsc(e.message)}。本批尚未入账。</p>`); }
}
function commitBatch(){
  const p=UI.batchPreview;
  if (!p || p.book!==S || p.text!==$('#batch-text').value || UI.loadBlocked) return;
  let vouchers;
  try { vouchers=EBook.parseVouchers(p.text,{book:S,accounts:Chart.codeIndex(VISIBLE,S),validDate}); }
  catch(e) { previewBatch(); return; }
  const previous=S.txns, seq=S.seq;
  S.txns=[...previous,...vouchers.map(v=>({...v,id:'T'+(++S.seq),seq:S.seq}))];
  if (!save()) { S.txns=previous; S.seq=seq; toast('保存失败，本批未入账。'); return; }
  UI.batchPreview=null; $('#modal').hidden=true;
  UI.journalPage=1; UI.filters={query:'',from:'',to:'',kind:'all'};
  navigateSection('journal'); toast(`已录入 ${vouchers.length} 笔凭证。`);
}

/* ================= trace panel ================= */
function openTrace(t){
  const tr = t.tr, box = $('#trace');
  const isEps = t.fmt === 'eps';
  let list = '';
  if (tr.ids && tr.ids.size) {
    const pseudo = {OB:'期初余额（上年末）', NP:'本期净利润（来自损益表）'};
    const items = [...tr.ids.entries()].filter(([k, v]) => v !== 0 || pseudo[k]);
    items.sort((a, b) => { const ra = pseudo[a[0]] ? -1 : R.byId[a[0]].no, rb = pseudo[b[0]] ? -1 : R.byId[b[0]].no; return ra - rb; });
    const tot = items.reduce((s, [, v]) => s + v, 0);
    list = `<ul class="tl">${items.map(([k, v]) => pseudo[k] ? `<li class="ps"><span>${pseudo[k]}</span><span class="v">${amtHTML(v)}</span></li>` : `<li><button data-act="jump" data-id="${k}"><span class="no">J${R.byId[k].no}</span><span class="d">${R.byId[k].date.slice(5)}</span><span class="m">${esc(R.byId[k].memo)}</span></button><span class="v">${amtHTML(v)}</span></li>`).join('')}
      <li class="tot"><span>合计</span><span class="v">${amtHTML(tot)}</span></li></ul>`;
  }
  const big = isEps ? epsHTML(t.v) : amtHTML(t.v);
  box.innerHTML = Locale.markup(`<div class="trace-h"><span class="eyebrow">这个数字从哪里来</span><h3>${(t.en===t.zh?esc(t.zh):uiEsc(lang() === 'zh' ? t.zh : t.en))}</h3>${lang() === 'zh' ? '' : `<span class="zh">${t.en===t.zh?esc(t.zh):uiEsc(t.zh)}</span>`}<div class="big">${big}</div><button class="trace-x" data-act="closeTrace" aria-label="关闭">×</button></div>
    <div class="trace-b">${tr.why ? `<p class="why-f">${uiEsc(tr.why)}</p>` : ''}${list}${!list && tr.hits && tr.hits.size ? `<p class="tdesc">这是汇总行，共有 ${tr.hits.size} 笔分录流入这里。点左侧任何一笔交易，就能看到它一路汇总到这一行。</p>` : ''}</div>`);
  box.hidden = false;
  const x = box.querySelector('.trace-x'); if (x) x.focus({preventScroll:true});
}
function openInfo(title, text){
  const box = $('#trace');
  box.innerHTML = Locale.markup(`<div class="trace-h"><span class="eyebrow">勾稽关系</span><h3>${uiEsc(title)}</h3><button class="trace-x" data-act="closeTrace" aria-label="关闭">×</button></div><div class="trace-b"><p class="why-f">${uiEsc(text)}</p></div>`);
  box.hidden = false;
}

function toast(msg, undoFn, detail, voucherId){
  const t = $('#toast');
  t.innerHTML = Locale.markup(`<span>${uiEsc(msg)}${detail ? esc(detail) : ''}</span>${voucherId?`<button data-act="jump" data-id="${esc(voucherId)}">查看凭证</button>`:''}${undoFn ? '<button data-act="undo">撤销</button>' : ''}`);
  t.hidden = false; UI.undo = undoFn || null;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; UI.undo = null; }, 7000);
}
const snapshot = () => JSON.stringify(S);
function restore(json){ S = normalize(JSON.parse(json)); resetEntryUI(); clearDraft(); save(); renderAll(); }
function startTpl(id){ UI.tpl = id; UI.params = defaults(id); }
function commit(tx, {independent=false}={}){
  if(readOnly())return false;
  const editId = independent ? null : UI.editing;
  if(!independent){
    if(UI.attachmentBusy){toast('附件尚在读取，请稍后再记账。');return false;}
    try{validateAttachments(UI.attachments);}catch(e){toast(e.message);return false;}
    if(UI.attachments.length)tx.attachments=UI.attachments.map(a=>({...a}));
  }
  const err = dateError(tx.date); if (err) { toast(err); return false; }
  if (denyLocked(tx.date) || denyLocked(S.txns.find(t=>t.id===editId)?.date) || denyMatched(editId)) return false;
  if (UI.loadBlocked) { toast('请先恢复或导出无法读取的原始数据，再继续记账。'); return false; }
  const old=editId && S.txns.find(t=>t.id===editId);
  if (old?.member?.kind==='sale' && S.txns.some(t=>t.member?.saleId===old.id)) { toast('该购卡凭证已关联佣金，请先处理关联的佣金凭证。'); return false; }
  if (tx.member || old?.member) {
    try { Member.validate(memberCandidate(S,tx,editId)); }
    catch(e) { toast(e.message); return false; }
  }
  if (tx.biz || old?.biz) {
    try { Business.validate(memberCandidate(S,tx,editId)); }
    catch(e) { toast(e.message); return false; }
  }
  if (tx.inv || old?.inv) {
    try { Invoices.validate(memberCandidate(S,tx,editId)); }
    catch(e) { toast(e.message); return false; }
  }
  if (tx.stock || old?.stock) {
    try { Stock.validate(memberCandidate(S,tx,editId)); }
    catch(e) { toast(e.message); return false; }
  }
  if (tx.asset || old?.asset) {
    try { Assets.validate(memberCandidate(S,tx,editId)); }
    catch(e) { toast(e.message); return false; }
  }
  const snap = snapshot();
  if (editId) {
    const i = S.txns.findIndex(t => t.id === editId);
    if (i >= 0) { const old = S.txns[i]; S.txns[i] = {...tx, id:old.id, seq:old.seq}; UI.sel = old.id; }
    UI.editing = null;
  } else { S.seq++; tx.id = 'T' + S.seq; tx.seq = S.seq; S.txns.push(tx); UI.sel = tx.id; }
  UI.lastDate = tx.date; UI.journalPage = 1;
  if(!independent){clearAttachments(); clearDraft();}
  const saved = save(); renderAll();
  toast(saved ? (workspace?'已记账，正在保存到账本。':'已记账并保存。') : '已加入当前账本，但保存失败，请立即备份。', () => {
    if(!independent){restore(snap);return;}
    S=normalize(JSON.parse(snap)); UI.sel=null; save(); renderAll();
  }, null, UI.sel);
  return true;
}
function addTpl(){
  const t = TPL[UI.tpl], p = UI.params;
  const err = dateError(p.date); if (err) { toast(err); return; }
  const r = runTpl(S, UI.tpl, p, UI.editing);
  if (r.err) { toast(r.err); return; }
  const fp = {}; t.fields.forEach(f => fp[f.k] = p[f.k]);
  fp.cashAccount=p.cashAccount||Bank.MAIN;
  if(UI.tpl==='payExpense')fp.expenseName=expenseSpec(p).name;
  if (!commit({date:p.date, tpl:UI.tpl, p:fp, party:r.party ?? (p.party || ''), ref:p.ref || '', memoUser:p.memo || '', memo:p.memo || safeMemo(t, fp), adj:isAdjTpl(t), groups:r.groups, calc:r.calc || '', shares:r.shares || 0,...(r.member?{member:r.member}:{}),...(r.biz?{biz:r.biz}:{}),...(r.stock?{stock:r.stock}:{}),...(r.asset?{asset:r.asset}:{})})) return;
  const keep = {date:p.date}; startTpl(UI.tpl); Object.assign(UI.params, keep);
  renderBench();
}
function addCustom(){
  const c = UI.custom, r = buildCustom(c);
  if (r.err) { toast(r.err); return; }
  const err = dateError(c.date); if (err) { toast(err); return; }
  const old = UI.editing && S.txns.find(t => t.id === UI.editing);
  if (!commit({date:c.date, tpl:'custom', party:c.party || '', ref:c.ref || '', memo:c.memo || '自定义分录', memoUser:c.memo, adj:!!c.adj, groups:r.groups, calc:'', shares:old && old.shares || 0, note:old && old.note || '', src:old && old.src || ''})) return;
  UI.custom = blankCustom(); UI.custom.date = c.date;
  renderBench();
}
// Invoices are captured in their own dialog; this posts or updates the single linked voucher.
function postInvoice(input, editId, request){
  if (UI.loadBlocked) return '请先恢复或导出无法读取的原始数据，再继续记账。';
  const t = TPL.salesInvoice, p = {...defaults('salesInvoice'), ...input};
  const old = editId && S.txns.find(x => x.id === editId && Invoices.linked(x));
  if (editId && !old) return '找不到要修改的发票，请刷新后重试。';
  const err = dateError(p.date); if (err) return err;
  if (EBook.locked(S,p.date) || old && EBook.locked(S,old.date)) return '此期间已锁定，请先在月结工作台反结账。';
  if (old && Bank.hasMatch(S,old.id)) return '这张发票的凭证已确认银行对账，请先解除匹配。';
  const r = runTpl(S, 'salesInvoice', p, editId || null);
  if (r.err) return r.err;
  const fp = {}; t.fields.forEach(f => fp[f.k] = p[f.k]); fp.cashAccount = Bank.MAIN;
  if (request && (!reviewer() || old)) return '只有老板或会计可以审核新的发票申请。';
  // An approved request stays linked when the invoice is edited later.
  const link = request || old?.inv?.request, snap = snapshot();
  clearAttachments(); UI.attachments = (old?.attachments || []).map(a => ({...a}));
  UI.editing = old ? old.id : null;
  const done = commit({date:p.date, tpl:'salesInvoice', p:fp, party:r.party, ref:r.inv.no, memoUser:p.memo || '', memo:p.memo || safeMemo(t, fp), adj:false,
    groups:r.groups, calc:r.calc || '', shares:0, biz:r.biz, inv:link ? {...r.inv, request:link} : r.inv});
  if (!done) { UI.editing = null; clearAttachments(); return '发票未能保存，请查看页面提示后重试。'; }
  if (request) {
    // The server approves the request in the same write as this voucher; if it refuses, take the voucher back out.
    workspace.flush().then(saved => {
      if (saved) toast(`已批准并过账 ${r.inv.no}。`, () => restore(snap));
      else { const why = workspace.error; restore(snap); toast(`审核未成功：${why || '请刷新后重试。'}已撤回这次过账。`); }
      loadRequests();
    });
  }
  return '';
}
// A deposit on the bank statement settles open invoices: post one receipt on that cash account, then match it to the row.
function settleBankInvoices({month, account, index, allocations}){
  if (UI.loadBlocked) return '请先恢复或导出无法读取的原始数据，再继续记账。';
  const row = Bank.get(S, month, account)?.rows[index];
  if (!row || Bank.get(S, month, account).matches[index]) return '这条流水已匹配或不存在，请刷新后重试。';
  const open = new Map(Invoices.summary(S, row.date).invoices.map(x => [x.itemId, x]));
  const picked = allocations.map(a => open.get(a.itemId));
  if (!allocations.length || picked.some(x => !x)) return '所选发票不存在或晚于收款日期，请刷新后重试。';
  const nos = picked.map(x => x.no), party = picked[0].partyName;
  const memo = `收款 · ${party} · ${nos.length > 3 ? nos.slice(0, 3).join('、') + ` 等 ${nos.length} 张发票` : nos.join('、')}`.slice(0, 120);
  const p = {...defaults('customerReceipt'), date:row.date, memo, ref:(row.ref || nos[0]).slice(0, 60), cashAccount:account,
    allocations:JSON.stringify(Object.fromEntries(allocations.map(a => [a.itemId, (a.amount / 100).toFixed(2)])))};
  const r = runTpl(S, 'customerReceipt', p, null);
  if (r.err) return r.err;
  const snap = snapshot(), fp = {allocations:p.allocations, cashAccount:account};
  clearAttachments(); UI.editing = null;
  if (!commit({date:p.date, tpl:'customerReceipt', p:fp, party:r.party, ref:p.ref, memoUser:memo, memo, adj:false, groups:r.groups, calc:r.calc || '', shares:0, biz:r.biz}))
    return '收款凭证未能保存，请查看页面提示后重试。';
  const id = S.txns.at(-1).id;
  try {
    const statement = Bank.changeMatch(S, month, index, id, new Date().toISOString(), account);
    if (account === Bank.MAIN) S.bankReconciliation = {...S.bankReconciliation, [month]:statement};
    else S.bankReconciliationByAccount = {...S.bankReconciliationByAccount, [account]:{...(S.bankReconciliationByAccount?.[account] || {}), [month]:statement}};
  } catch (e) { restore(snap); return e.message; }
  const saved = save(); renderAll();
  toast(saved ? `已记收款 ${id} 并核销 ${nos.join('、')}，流水已匹配。` : '收款已加入当前账本，但保存失败，请立即备份。', () => restore(snap));
  return '';
}
function postInvoiceReceipt(id,{date,amount,cashAccount,paymentMethod}){
  const err=dateError(date);
  if(err)return err;
  if(EBook.locked(S,date))return '收款日期所在期间已锁定，请核对日期或先反结账。';
  if(UI.loadBlocked)return '请先恢复无法读取的账本。';
  const invoice=Invoices.summary(S,date).invoices.find(x=>x.id===id);
  if(!invoice)return '收款日期不能早于开票日期。';
  const cents=money(amount);
  if(!/^\d+(?:\.\d{1,2})?$/.test(amount) || !pos(cents))return '请输入大于零的收款金额，最多两位小数。';
  if(cents>invoice.balance)return `收款金额不能超过收款日未收余额 ${m$(invoice.balance)}。`;
  if(!Bank.accounts(S).some(a=>a.id===cashAccount))return '请选择实际到账账户。';
  const p={...defaults('customerReceipt'),date,cashAccount,allocations:JSON.stringify({[invoice.itemId]:amount})};
  const r=runTpl(S,'customerReceipt',p,null);
  if(r.err)return r.err;
  const memo=`发票收款 · ${invoice.no} · ${invoice.partyName}`.slice(0,120);
  const tx={date,tpl:'customerReceipt',p:{cashAccount,allocations:p.allocations,...(paymentMethod?{paymentMethod}:{})},party:r.party,ref:invoice.no,memo,memoUser:memo,adj:false,groups:r.groups,shares:0,biz:r.biz};
  return commit(tx,{independent:true}) ? '' : '收款凭证未能记账，请查看页面提示。';
}
function editTx(id){
  const t = S.txns.find(x => x.id === id); if (!t) return;
  clearAttachments();UI.attachments=(t.attachments||[]).map(a=>({...a}));
  UI.editing = id; UI.sel = id;
  if (t.tpl && TPL[t.tpl]) { UI.mode = 'tpl'; UI.tpl = t.tpl; UI.params = {...defaults(t.tpl), ...t.p, date:t.date, memo:t.memoUser || '', party:t.party || '', ref:t.ref || ''}; if(t.tpl==='payExpense') { UI.params.expenseName=expenseSpec(t.p || {}).name; delete UI.params.acct; } }
  else {
    UI.mode = 'custom';
    UI.custom = {date:t.date, memo:t.memo, party:t.party || '', ref:t.ref || '', adj:!!t.adj, rows:t.groups.flat().map(l => ({a:l.a, dr:l.s > 0 ? (l.s / 100).toString() : '', cr:l.s < 0 ? (-l.s / 100).toString() : '', fn:l.fn || '',cashAccount:l.cashAccount||Bank.MAIN}))};
  }
  renderAll();
  $('#bench').scrollTop = 0;
  if(trainingMode && trainingStore.level?.id==='correct-amount' && id==='T1')focusTrainingTarget($('#f-amt'));
}
function duplicateTx(id){
  const t = S.txns.find(e=>e.id===id); if (!t) return;
  editTx(id); UI.editing = null; UI.sel = null;clearAttachments();
  const p = UI.mode==='tpl' ? UI.params : UI.custom; p.date = entryDate(); p.ref = '';
  UI.draftDirty = true; saveDraft(); renderAll();
  toast('已复制为未记账草稿，请核对日期、金额和单据编号后保存。');
}
function denyMatched(id){
  if (!Bank.hasMatch(S,id)) return false;
  toast('这笔凭证已确认银行对账。请先解除匹配，再修改或删除。');
  return true;
}
function delTx(id){
  const snap = snapshot(), t = S.txns.find(x => x.id === id); if (!t || denyLocked(t.date) || denyMatched(t.id)) return;
  if (t.member) {
    try { Member.validate({...S,txns:S.txns.filter(x=>x.id!==id)}); }
    catch(e) { toast('不能删除：'+e.message+'。请先处理关联凭证。'); return; }
  }
  if (t.biz) {
    try { Business.validate({...S,txns:S.txns.filter(x=>x.id!==id)}); }
    catch(e) { toast('不能删除：'+e.message+'。请先处理关联凭证。'); return; }
  }
  if (t.stock) {
    try { Stock.validate({...S,txns:S.txns.filter(x=>x.id!==id)}); }
    catch(e) { toast('不能删除：'+e.message+'。请先处理关联凭证。'); return; }
  }
  if (t.asset) {
    try { Assets.validate({...S,txns:S.txns.filter(x=>x.id!==id)}); }
    catch(e) { toast('不能删除：'+e.message+'。请先处理关联凭证。'); return; }
  }
  S.txns = S.txns.filter(x => x.id !== id);
  if (UI.sel === id) UI.sel = null; if (UI.editing === id) { UI.editing = null; }
  save(); renderAll();
  toast('已删除：', () => restore(snap), t.memo);
}
function jump(id){
  if (!R.byId[id]) return;
  const entries = R.month===12 ? R.entries : compute(S).entries;
  if (!filteredEntries(entries).some(e=>e.id===id)) UI.filters = {query:'',from:'',to:'',kind:'all'};
  UI.sel = id; UI.journalPage = Math.floor([...filteredEntries(entries)].reverse().findIndex(e=>e.id===id)/6)+1;
  navigateSection('journal');
  const el = document.getElementById('je-' + id); if (el) el.scrollIntoView({block:'center', behavior:'smooth'});
}

/* ---------- AI ---------- */
function aiConnectionHTML(){
  return `<p class="hint">${UI.aiConnected ? esc(aiLabel()) + ' · ' + 'ChatGPT 登录已配置' : uiEsc(UI.aiMessage)}</p><div class="actions">${UI.aiConnected ? '' : `<button class="btn primary small" data-act="aiLogin">登录 ChatGPT</button>`}<button class="btn small" data-act="aiConnection">AI 连接</button><button class="btn small" data-act="aiRefresh">刷新连接</button></div>`;
}
function aiLoginPanelHTML(){
  const login = UI.login;
  const start = (label, cls = 'btn') => `<button class="${cls}" data-act="aiStartLogin">${label}</button>`;
  if (window.AccountingAI.needsLocal || (location.hostname.endsWith('.github.io') && login.localSetup)) return `<p class="tdesc">像数学助手一样，使用你电脑上的 pi agent 连接 ChatGPT 订阅，无需部署云服务器。</p><p class="hint">首次使用：下载并解压本机版，双击「启动财报助手.command」。已有的 Pi／Codex 登录会自动检测；没有登录时可在网页授权。</p><div class="actions"><a class="btn" href="https://github.com/dns0129/Accounting_Playground/archive/refs/heads/main.zip">下载本机版</a><button class="btn primary" data-act="aiConnectLocal">连接本机 pi</button><a class="btn" href="http://127.0.0.1:8792" target="_blank" rel="noopener noreferrer">打开本机网页版 ↗</a></div>${login.message ? `<p class="err">${uiEsc(login.message)}</p>` : ''}<p class="hint">连接时若浏览器询问本地网络权限，请允许。若连接受限，使用自动打开的本机网页版即可。</p>`;
  if (UI.aiConnected && !['starting','waiting','error','cancelled'].includes(login.state)) return `<p class="note">✓ ${uiEsc(UI.aiMessage)}</p><div class="actions">${start('更换 ChatGPT 登录')}</div>`;
  if (login.state === 'starting') return `<p class="tdesc"><span class="spin"></span>正在获取登录码…</p>`;
  if (login.state === 'waiting') return `<p class="tdesc">点击下面的官方授权页，输入登录码并确认你的 ChatGPT 账户：</p><code class="login-code" id="ai-device-code">${esc(login.userCode)}</code><div class="actions"><a class="btn primary login-link" id="ai-login-link" href="https://auth.openai.com/codex/device" target="_blank" rel="noopener noreferrer">打开 ChatGPT 授权页 ↗</a><button class="btn" data-act="aiCancelLogin">取消登录</button></div><p class="hint">本页会自动检测登录结果。登录码有效至 ${esc(new Date(login.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}。</p>`;
  if (login.state === 'authorized') return `<p class="note" role="status">✓ ChatGPT 登录成功，授权已保存。</p>`;
  return `${login.message ? `<p class="err">${uiEsc(login.message)}</p>` : ''}<p class="tdesc">通过 Pi Agent 接入 ChatGPT，用于生成待复核的记账分录和对比银行流水。请在 OpenAI 官方页面确认授权。</p><div class="actions">${start(['error','cancelled'].includes(login.state) ? '重新登录 ChatGPT' : '使用 ChatGPT 登录', 'btn primary')}</div>`;
}
function stopLoginPolling(){ clearTimeout(aiLoginTimer); aiLoginTimer = null; aiLoginEpoch++; }
function renderLoginPanel(){
  const panel = $('#ai-login-panel');
  if (panel && !$('#modal').hidden) panel.innerHTML = Locale.markup(aiLoginPanelHTML());
}
function openAIConnection(checkLogin = true){
  stopLoginPolling();
  const bridge = window.AccountingAI;
  $('#modal').innerHTML = Locale.markup(`<section class="modal-box" role="dialog" aria-modal="true" aria-labelledby="ai-connection-title"><header class="bhead"><h3 id="ai-connection-title">AI 连接 · ChatGPT</h3><button class="btn" data-act="closeModal">关闭</button></header><div id="ai-login-panel" aria-live="polite">${aiLoginPanelHTML()}</div><details class="login-settings" id="ai-connection-settings"><summary>连接设置</summary><div class="fields"><div class="field full"><label for="ai-base">AI 服务地址</label><input id="ai-base" type="url" value="${esc(bridge.base)}" placeholder="留空使用当前网页的服务" autocomplete="off"></div><div class="field full"><label for="ai-token">连接口令（如有）</label><input id="ai-token" type="password" value="${esc(bridge.token)}" autocomplete="off"></div></div><p class="hint">${uiEsc(UI.aiMessage)}<br>连接口令仅保存在本标签页会话中。</p><div class="actions"><button class="btn" data-act="aiSaveConnection">保存并连接</button></div></details><p class="err" id="ai-connection-error"></p></section>`);
  $('#modal').hidden = false;
  const button = $('#modal [data-act="aiStartLogin"]'); if (button) button.focus();
  if (checkLogin && !bridge.needsLocal) pollAILogin(aiLoginEpoch);
}
async function acceptAILogin(login, epoch){
  if (epoch !== aiLoginEpoch) return;
  UI.login = login; renderLoginPanel();
  if (login.state === 'authorized') await refreshAIConnection();
  if (epoch === aiLoginEpoch && ['starting','waiting'].includes(login.state) && $('#ai-login-panel') && !$('#modal').hidden) {
    aiLoginTimer = setTimeout(() => pollAILogin(epoch), 2000);
  }
}
async function pollAILogin(epoch){
  try { await acceptAILogin(await window.AccountingAI.loginStatus(), epoch); }
  catch (e) {
    if (epoch !== aiLoginEpoch) return;
    UI.login = {state:'error', message:e.code === 'cancelled' ? '检查登录超时，请重新连接。' : e.message}; renderLoginPanel();
  }
}
function saveLoginConnection(){
  try { window.AccountingAI.save($('#ai-base').value, $('#ai-token').value); return true; }
  catch (e) { $('#ai-connection-error').textContent = Locale.text(e.message || 'AI 服务地址不正确。'); $('#ai-connection-settings').open = true; return false; }
}
async function connectLocalPi(){
  stopLoginPolling();
  window.AccountingAI.save('http://127.0.0.1:8792', '');
  $('#ai-base').value = window.AccountingAI.base; $('#ai-token').value = '';
  UI.login = {state:'idle', localSetup:true, message:'正在连接本机 pi…'}; renderLoginPanel();
  await refreshAIConnection();
  UI.login = UI.aiConnected ? {state:'idle'}
    : {state:'idle', localSetup:!window.AccountingAI.status.provider, message:UI.aiMessage};
  renderLoginPanel();
}
async function startAILogin(){
  if (window.AccountingAI.needsLocal) { renderLoginPanel(); return; }
  if (!saveLoginConnection()) return;
  stopLoginPolling(); const epoch = aiLoginEpoch;
  UI.login = {state:'starting'}; renderLoginPanel();
  try { await acceptAILogin(await window.AccountingAI.startLogin(), epoch); }
  catch (e) {
    if (epoch !== aiLoginEpoch) return;
    UI.login = {state:'error', message:e.code === 'cancelled' ? '获取登录码超时，请重试。' : e.message}; renderLoginPanel();
    if (['offline','gateway_auth'].includes(e.code)) $('#ai-connection-settings').open = true;
  }
}
async function cancelAILogin(){
  const id = UI.login.id;
  stopLoginPolling(); const epoch = aiLoginEpoch;
  try { await acceptAILogin(await window.AccountingAI.cancelLogin(id), epoch); }
  catch (e) {
    if (epoch !== aiLoginEpoch) return;
    UI.login = {state:'error', message:e.message}; renderLoginPanel();
  }
}
async function refreshAIConnection(){
  const status = await window.AccountingAI.refresh();
  UI.aiConnected = !!status.configured; UI.aiMessage = status.message;
  renderHeader(); renderSaveStatus(); renderBench();
  if (UI.section === 'bank') bankWorkspace.render();
}
function aiFailureMessage(e, invalidMessage){
  const code = e && e.code;
  if (typeof e === 'string') return e;
  if (code === 'rate_limited') return e.message || '请求太频繁或已达到用量上限，请稍后再试。';
  if (code === 'invalid_json') return invalidMessage;
  if (code === 'refused') return 'AI 没有处理这段描述，请换个说法。';
  if (['not_authenticated','gateway_auth','offline','timeout','model_unavailable','upstream_error','server_error'].includes(code)) return e.message;
  return '连接出了问题，请稍后再试。';
}
function aiPrompt(text){
  const coa = PICK.map(a => `${a.c} | ${a.en}${a.user ? '' : ' | ' + a.zh} | ${TYPE_EN[a.t]}`).join('\n');
  return `Help an accountant record ONE business transaction as a draft for human review.
Financial year: 1 Jan to 31 Dec ${S.company.year}. Currency: ${cur()}. Use a perpetual inventory system.
${S.settings.autoTax ? 'A year-end income tax estimate is enabled. Do not post that estimate again.' : 'No automatic tax provision is enabled. Do not infer tax amounts.'}

Chart of accounts (use ONLY these codes):
code | English | Chinese | type
${coa}

Transaction description:
"""${text}"""

Reply with ONLY one JSON object of this shape:
{"date":"YYYY-MM-DD","memo":"short Chinese memo","adjusting":false,"groups":[[{"acct":"1000","dr":5000,"cr":0,"fn":null},{"acct":"4000","dr":0,"cr":5000,"fn":null}]],"explain":"2-4 sentences in ${Locale.current==='zh-HK'?'Traditional Chinese (Hong Kong)':'Simplified Chinese'}: why each account is debited or credited, which element changes, and any IFRS point","assumptions":"Chinese; assumptions you made, or empty string"}
Rules:
- Write memo, explain and assumptions in ${Locale.current==='zh-HK'?'Traditional Chinese (Hong Kong)':'Simplified Chinese'}, preserving supplied names and references.
- Amounts are plain numbers in currency units (not cents). Each line has either dr or cr greater than 0.
- Each inner array is one balanced journal entry. Use two entries for a sale of goods (revenue entry, then cost-of-sales entry).
- "fn" only on operating expense lines (codes 5000-6900), one of "cos","sell","admin","other"; otherwise null.
- "adjusting" is true for period-end adjusting entries (depreciation, accruals, deferrals, estimates, fair value remeasurement).
- If no date is given, use ${entryDate()} and state the date assumption. If a required amount or classification cannot be determined from the description, return empty groups and explain what information is needed. Never invent monetary amounts.
- If the text does not describe a transaction that changes the accounts, reply {"groups":[],"explain":"<reason in Chinese>"}.`;
}
function parseAI(j){
  if (!j || typeof j !== 'object') throw 'AI 返回的内容无法识别，请换个说法再试。';
  const gs = Array.isArray(j.groups) ? j.groups : [];
  if (!gs.length) return {empty:true, explain:String(j.explain || '这段描述没有需要记账的内容。')};
  const out = [];
  for (const g of gs) {
    if (!Array.isArray(g)) throw 'AI 返回的分录格式不对，请再试一次。';
    const lines = []; let sum = 0;
    for (const l of g) {
      const a = String(l && (l.acct ?? l.account) || '').trim();
      if (!ACC[a] || ACC[a].hidden) throw `AI 用了本页没有的账户代码「${a}」，请换个说法再试。`;
      const dr = Math.round((+l.dr || 0) * 100), cr = Math.round((+l.cr || 0) * 100);
      if (dr < 0 || cr < 0) throw 'AI 返回了负数金额，请再试一次。';
      const s = dr - cr; if (!s) continue;
      const fn = normFn(a, l.fn);
      lines.push(fn ? {a, s, fn} : {a, s}); sum += s;
    }
    if (sum !== 0) throw 'AI 生成的分录借贷不平衡，请再试一次或改用自定义分录。';
    if (lines.length) out.push(lines);
  }
  if (!out.length) throw 'AI 没有生成有效的分录。';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : (UI.lastDate || `${S.company.year}-12-31`);
  return {date, memo:String(j.memo || 'AI 生成的分录').slice(0, 120), adj:!!j.adjusting, groups:out, explain:String(j.explain || ''), assumptions:String(j.assumptions || '')};
}
async function aiGo(){
  if (!UI.aiConnected) { openAIConnection(); return; }
  const text = (UI.ai.text || '').trim();
  if (!text) { toast('先写一句交易描述'); return; }
  const ctl = new AbortController();
  UI.ai = {...UI.ai, status:'busy', res:null, err:'', ctl}; renderBench();
  try {
    const j = await window.AccountingAI.json(aiPrompt(text), {signal:ctl.signal, task:'transaction'});
    if (UI.ai.ctl!==ctl) return;
    UI.ai = {...UI.ai, status:'done', res:parseAI(j), ctl:null};
  } catch (e) {
    if (UI.ai.ctl!==ctl) return;
    const code = e && e.code;
    if (code === 'cancelled') UI.ai = {...UI.ai, status:'idle', ctl:null};
    else {
      const msg = aiFailureMessage(e, 'AI 的回答不是有效格式，请点「生成分录」再试一次。');
      if (['not_authenticated','gateway_auth','offline'].includes(code)) { UI.aiConnected = false; UI.aiMessage = msg; }
      UI.ai = {...UI.ai, status:'error', err:msg, ctl:null};
    }
  }
  renderBench();
}

/* ---------- backup ---------- */
function downloadFile(name, text, mime = 'application/json'){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:mime}));
  a.download = Locale.text(name); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function openBackup(){
  let json = JSON.stringify(S, null, 1); if (UI.loadBlocked) { try { json = store().getItem(RECORD_KEY) || json; } catch(e) {} }
  const recovery = readRecovery();
  $('#modal').innerHTML = Locale.markup(`<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="bkT"><h3 id="bkT">备份与导入</h3>
    <p class="tdesc">当前：<b>企业账本</b> · ${esc(S.company.name)} · ${S.txns.length} 笔交易。备份包含当前账本的期初余额、凭证、银行对账、月结记录和管理报表草稿。未记账草稿单独保存在此浏览器。${UI.loadBlocked?'下方为无法读取的原始数据，请先下载保存。':'换设备前请导出 JSON。'}</p>
    <div class="actions"><button class="btn primary" data-act="dlJson">下载 JSON 文件</button><button class="btn" data-act="copyJson">复制 JSON</button></div>
    <div class="field"><label for="bk-text">JSON 内容（可以粘贴备份后导入）</label><textarea id="bk-text">${esc(json)}</textarea></div>
    <div class="actions"><button class="btn" data-act="importText">预览导入内容</button><label class="btn" for="bk-file">选择 JSON 文件</label><input type="file" id="bk-file" accept=".json,application/json" hidden><button class="btn" data-act="closeModal" style="margin-left:auto">关闭</button></div>
    ${recovery ? `<p class="hint">上次覆盖前的账本：${esc(recovery.title)} · ${new Date(recovery.at).toLocaleString(Locale.current)} <button class="btn small" data-act="recoverPrevious">预览恢复</button></p>` : ''}
    <p class="err" id="bk-msg"></p></div>`);
  $('#modal').hidden = false;
  $('#bk-text').focus();
}
function validateBackup(s){
  if (!s || s.v!==1 || !s.company || !Array.isArray(s.txns)) throw new Error('这不是本页导出的账本备份');
  const y=+s.company.year;
  if (s.seq!=null && (!Number.isSafeInteger(s.seq) || s.seq<0)) throw new Error('账本编号格式不正确');
  if (!Number.isInteger(y) || y<=1900 || y>=2200 || typeof s.company.name!=='string' || typeof s.company.cur!=='string') throw new Error('公司名称、年度或币种格式不正确');
  // Check the book against its own chart: an imported book may carry accounts the open book doesn't have.
  Chart.validate(s, BASE_COA);
  const acc = Chart.lookup(BASE_COA, s.chart);
  if (!s.opening || Array.isArray(s.opening) || typeof s.opening!=='object' || Object.entries(s.opening).some(([a,n])=>!acc[a] || !['A','XA','L','E'].includes(acc[a].t) || !Number.isSafeInteger(n))) throw new Error('期初余额包含无效科目或金额');
  if (s.openingShares != null && (!Number.isSafeInteger(s.openingShares) || s.openingShares<0)) throw new Error('期初股数格式不正确');
  const ids=new Set();
  s.txns.forEach((t,i)=>{
    if (!t || !validDate(t.date,y) || typeof t.memo!=='string' || !Array.isArray(t.groups) || !t.groups.length) throw new Error(`第 ${i+1} 笔交易的日期、摘要或分录格式不正确`);
    if (t.id != null && (typeof t.id!=='string' || !/^T\d+$/.test(t.id) || !Number.isSafeInteger(+t.id.slice(1)) || ids.has(t.id))) throw new Error(`第 ${i+1} 笔交易的编号无效或重复`);
    if (t.id) ids.add(t.id);
    if (t.seq != null && (!Number.isSafeInteger(t.seq) || t.seq<1)) throw new Error(`第 ${i+1} 笔交易的顺序编号无效`);
    if (t.shares != null && !Number.isFinite(t.shares)) throw new Error(`第 ${i+1} 笔交易的股数无效`);
    if(t.attachments!=null)validateAttachments(t.attachments);
    for (const g of t.groups) {
      if (!Array.isArray(g) || !g.length || g.some(l=>!l || !acc[l.a] || !Number.isSafeInteger(l.s) || l.s===0 || (l.fn && !FN_LABEL[l.fn]))) throw new Error(`第 ${i+1} 笔交易包含无效科目或金额`);
      if(g.some(l=>l.expenseName!=null && (acc[l.a].pl!=='opx' || typeof l.expenseName!=='string' || !l.expenseName.trim() || l.expenseName.length>60))) throw new Error(`第 ${i+1} 笔交易的费用名称无效`);
      if (g.reduce((n,l)=>n+l.s,0)!==0) throw new Error(`第 ${i+1} 笔交易借贷不平衡`);
    }
  });
  if (s.settings) {
    if (typeof s.settings!=='object' || Array.isArray(s.settings)) throw new Error('账本设置格式不正确');
    const enums={lang:['both','zh','en'],tab:TABS.map(t=>t[0]),plMethod:['function','nature'],plPres:['single','two'],cfMethod:['direct','indirect']};
    for (const [k,values] of Object.entries(enums)) if (s.settings[k]!=null && !values.includes(s.settings[k])) throw new Error('账本设置包含无效选项：'+k);
    if (s.settings.autoTax!=null && typeof s.settings.autoTax!=='boolean') throw new Error('账本设置包含无效的自动计税选项');
    if (s.settings.tax!=null && (!Number.isFinite(+s.settings.tax) || +s.settings.tax<0 || +s.settings.tax>=100)) throw new Error('税率格式不正确');
    if(s.settings.autoTax&&s.txns.some(t=>['hkProfitsTaxAccrue','hkProfitsTaxEstimate'].includes(t.tpl)))throw new Error('香港利得税凭证不能与年末自动计税同时启用');
  }
  EBook.validateHistory(s);
  Bank.validate(s,validDate);
  Member.validate(s);
  Business.validate(s);
  Invoices.validate(s);
  Stock.validate(s);
  Assets.validate(s);
  if (s.customReport != null) window.AccountingReportEditor.validate(s.customReport);
}
function readRecovery(){ try { return JSON.parse(store().getItem(RECOVERY_KEY) || 'null'); } catch(e) { return null; } }
function stashRecovery(){
  try { store().setItem(RECOVERY_KEY,JSON.stringify({title:S.company.name,at:Date.now(),json:UI.loadBlocked ? store().getItem(RECORD_KEY) : snapshot()})); return true; }
  catch(e) { toast('无法保存覆盖前的恢复副本，请先下载备份，再重试。'); return false; }
}
function previewReplacement(s,title='导入账本'){
  if (EBook.closedThrough(S)) { toast('当前账本有锁定期间。请先备份，并反结账后再替换账本。'); return; }
  UI.pendingImport = s;
  $('#modal').innerHTML = Locale.markup(`<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="importTitle"><h3 id="importTitle">${uiEsc(title)}</h3><p class="tdesc">目标：企业账本。确认后替换当前 ${S.txns.length} 笔交易，覆盖前会保存一份可恢复副本。</p><div class="preview"><strong>${esc(s.company.name)}</strong><span>${s.company.year} 年 · ${esc(s.company.cur)} · ${s.txns.length} 笔交易 · ${Object.values(s.opening).filter(Boolean).length} 个期初余额</span><span>自动计税：${s.settings?.autoTax?'开启':'关闭'}</span></div><div class="actions"><button class="btn primary" data-act="confirmImport">确认替换当前账本</button><button class="btn" data-act="closeModal">取消</button></div></div>`);
  $('#modal').hidden=false; $('#modal [data-act="closeModal"]').focus();
}
function confirmImport(){
  const s=UI.pendingImport; if (!s || EBook.closedThrough(S) || !stashRecovery()) return;
  const snap=snapshot(); S=normalize(s); UI.loadBlocked=false; UI.storageError='';
  UI.pendingImport=null;
  clearDraft(); resetEntryUI(); const saved=save(); $('#modal').hidden=true; renderAll();
  toast(saved ? '账本已替换。覆盖前的数据可在「备份 / 恢复」中恢复。' : '替换已应用到页面，但保存失败，请立即下载备份。',EBook.closedThrough(S)?null:()=>restore(snap));
}
function importJSON(text){
  try {
    const s = JSON.parse(text);
    validateBackup(s); previewReplacement(s);
  } catch (e) { const m = $('#bk-msg'); if (m) m.textContent = Locale.text('导入失败：'+ (e instanceof SyntaxError ? 'JSON 格式不正确' : e.message || '文件无法识别')+'。当前数据未改变。'); }
}
function csvText(entries){
  const cell = value => { let v=String(value ?? ''); if (/^\s*[=+\-@]/.test(v)) v="'"+v; return '"'+v.replace(/"/g,'""')+'"'; };
  const rows=[['会计年度','货币','日期','分录编号','固定交易编号','摘要','往来对象','单据编号','分组','科目代码','科目名称','借方金额','贷方金额','费用功能','分录类型','费用名称','资金账户编号'].map(Locale.text)];
  entries.forEach(e=>e.groups.forEach((g,i)=>g.forEach(l=>rows.push([S.company.year,cur(),e.date,'J'+e.no,e.id,e.memo,e.party||'',e.ref||'',i+1,lineCode(l),lineName2(l),l.s>0?(l.s/100).toFixed(2):'',l.s<0?(-l.s/100).toFixed(2):'',l.fn?Locale.text(FNZ(l.fn)):'',Locale.text(e.auto?'系统自动调整':e.adj?'调整':'日常'),l.expenseName || (ACC[l.a].pl==='opx'?Locale.text(acctZh(l.a)):''),l.a==='1000'?(l.cashAccount||Bank.MAIN):'']))));
  return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
}
// One row per matching line (e.g. every 电费 line), without the bank side of each voucher, plus a total.
function matchedLines(entries, query){
  const q=query.trim().toLowerCase();
  const out=[];
  for (const e of entries) {
    const lines=e.groups.flat(), hit=lines.filter(l=>UI.filters.accountCode?lineCode(l)===UI.filters.accountCode:journalLineText(l).includes(q));
    // Matched on the memo or party only: the voucher's income/expense lines are what the search was about.
    for (const l of hit.length ? hit : lines.filter(l=>ACC[l.a].pl)) out.push({e,l});
  }
  return out;
}
function exportLines(){
  const q=UI.filters.query.trim(); if (!q) { exportCsv(); return; }
  const found=matchedLines(filteredEntries(),q);
  if (!found.length) { toast('没有匹配的科目明细，请检查搜索内容。'); return; }
  const cell = value => { let v=String(value ?? ''); if (/^\s*[=+\-@]/.test(v)) v="'"+v; return '"'+v.replace(/"/g,'""')+'"'; };
  const money2=n=>n?(n/100).toFixed(2):'';
  let debit=0, credit=0;
  const rows=[['日期','分录编号','固定交易编号','摘要','往来对象','单据编号','科目代码','科目名称','费用名称','借方金额','贷方金额'].map(Locale.text)];
  for (const {e,l} of found) { if (l.s>0) debit+=l.s; else credit-=l.s; rows.push([e.date,'J'+e.no,e.id,e.memo,e.party||'',e.ref||'',lineCode(l),lineName2(l),l.expenseName||'',money2(Math.max(l.s,0)),money2(Math.max(-l.s,0))]); }
  rows.push([Locale.text('合计'),'','','',`${found.length} ${Locale.text('行')}`,'','','','',(debit/100).toFixed(2),(credit/100).toFixed(2)]);
  const data='﻿'+rows.map(r=>r.map(cell).join(',')).join('\r\n'), safe=q.replace(/[\\/:*?"<>|\s]+/g,'_').slice(0,30);
  const filename=Locale.text(`明细-${safe}-${S.company.year}.csv`);
  downloadFile(filename,data,'text/csv;charset=utf-8'); toast(`已导出 ${found.length} 行「${q}」明细，借方合计 ${fmt(debit)}。`);
}
function exportCsv(){
  const entries=filteredEntries(); if (!entries.length) { toast('没有可导出的分录，请检查筛选条件。'); return; }
  const data=csvText(entries), filename=Locale.text(`企业账本-${S.company.year}-${hasFilters()?'筛选':'全部'}分录.csv`);
  downloadFile(filename,data,'text/csv;charset=utf-8'); toast(`已导出 ${entries.length} 笔分录，可用 Excel 打开。`);
}

/* ================= events ================= */
function renderTrainingCoach(){
  if(trainingMode && trainingStore.level && UI.section!=='training'){
    // Review the persisted snapshot; an unsaved or failed write must not pass a level.
    const book=UI.loadBlocked?null:storedLedger?JSON.parse(storedLedger):TrainingContent.seed(trainingStore.level);
    trainingView.renderCoach(trainingStore.level,book);
  }
}
function loadTrainingCase(level,{reset=false}={}){
  clearTimeout(saveDraft._t);
  if(!reset)saveDraft();
  trainingStore.level=level;
  UI.storageError=''; UI.loadBlocked=false; UI.undo=null; UI.periodPending=null; UI.batchPreview=null;
  trainingView.reset();
  $('#modal').hidden=true; $('#toast').hidden=true;
  S=load();
  resetEntryUI();loadDraft();
  resetTrainingPageState();
}
function resetTrainingPageState(){
  UI.closeMonth=TrainingContent.month;
  UI.reportMonth=TrainingContent.month;
  invoiceWorkspace.month=TrainingContent.month;
  trainingSalesPortal.filter='all';
  trainingSalesPortal.form=null;
  trainingSalesPortal.error='';
}
function focusTrainingTarget(target){
  if(!target){toast('这里还没有可定位的记录，请先完成上一步，或重置本关。');return;}
  document.querySelector('[data-training-focus]')?.removeAttribute('data-training-focus');
  target.dataset.trainingFocus='';
  if(!target.matches('button,a,input,select,textarea,summary,[tabindex]'))target.tabIndex=-1;
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'center',inline:'nearest'});
}
function locateTraining(action){
  const [kind,id,account=Bank.MAIN]=action.split(':');
  if(kind==='bank'){
    bankWorkspace.account=account;bankWorkspace.select(TrainingContent.month);
    const r=Bank.summary(S,TrainingContent.month,account);
    bankWorkspace.filter=r.statement?.matches[id]?'matched':'bank';
    navigateSection('bank');
    const row=$(`#bankPane [data-bank-row="${Number(id)}"]`);
    const button=row?.querySelector('[data-bank-act="match"],[data-bank-act="settle"]');
    focusTrainingTarget(button || row);
  }else if(kind==='voucher'){
    if(!R.byId[id]){focusTrainingTarget(null);return;}
    jump(id);
    const item=document.getElementById('je-'+id);
    focusTrainingTarget(item?.querySelector('[data-act="edit"]') || item);
  }else if(kind==='expense'||kind==='template'){
    const template=kind==='expense'?'payExpense':id;
    if(UI.tpl!==template||UI.editing||UI.mode!=='tpl'){
      UI.editing=null;UI.mode='tpl';UI.tplQuery='';clearAttachments();
      startTpl(template);
    }
    navigateSection('bookkeeping');
    focusTrainingTarget($('#f-date'));
  }else if(kind==='invoice'){
    invoiceWorkspace.filter='all';invoiceWorkspace.page=1;invoiceWorkspace.month=TrainingContent.month;
    navigateSection('invoices');
    focusTrainingTarget($(`#invoicePane [data-invoice="${id}"] [data-inv-act="view"]`));
  }else if(kind==='bankImport'||kind==='bankTotals'){
    bankWorkspace.account=Bank.MAIN;bankWorkspace.select(TrainingContent.month);
    navigateSection('bank');
    if(kind==='bankImport')focusTrainingTarget($('#bankPane [data-bank-act="import"]'));
    else{
      const balance=$('#bankPane .bank-balance');
      balance.open=true;
      focusTrainingTarget(balance.querySelector('tbody tr:nth-child(2)'));
    }
  }else if(kind==='close'){
    UI.closeMonth=TrainingContent.month;
    navigateSection('close');
    focusTrainingTarget($('.close-checklist') || $('#close-month'));
  }else if(kind==='report'){
    UI.reportMonth=TrainingContent.month;
    navigateSection(id);
    const line=[...$('#pane').querySelectorAll('tr')].find(row=>row.textContent.includes(Locale.text('本期净利润')));
    focusTrainingTarget(line || $('#pane'));
  }else if(kind.startsWith('sales')){
    trainingSalesPortal.filter='all';
    navigateSection('salesPractice');
    if(kind==='salesNew')focusTrainingTarget($('#trainingSales [data-sales="new"]'));
    if(kind==='salesList')focusTrainingTarget($('#trainingSales [aria-label="'+Locale.text('申请状态')+'"]'));
    if(kind==='salesEdit'||kind==='salesWithdraw'){
      const action=kind==='salesEdit'?'edit':'withdraw';
      focusTrainingTarget($(`#trainingSales [data-sales="${action}"][data-id="${id}"]`));
    }
  }
}
function enterTrainingLevel(level){
  bankWorkspace.account=Bank.MAIN;bankWorkspace.select(TrainingContent.month);
  navigateSection(level.page||'bank');
  $('#pageTitle').focus({preventScroll:true});
}
function commitTrainingState(key,value){
  if(!trainingMode||!trainingStore.level)return false;
  const previous=S[key];
  S[key]=value;
  if(persistBook())return true;
  if(previous===undefined)delete S[key];
  else S[key]=previous;
  return false;
}
function handleTrainingAction(act,value){
  if(act==='trainingStart'){
    const level=TrainingContent.find(value);
    if(level){
      if(trainingStore.level!==level)loadTrainingCase(level);
      enterTrainingLevel(level);
    }
  }else if(act==='trainingRole'&&['all',...Object.keys(TrainingContent.roles)].includes(value)){
    trainingView.role=value;
    trainingView.renderCatalog(trainingStore);
    $(`[data-act="trainingRole"][data-v="${value}"]`)?.focus({preventScroll:true});
  }else if(act==='trainingCopyCsv'){
    const csv=$('#trainingCsv');
    if(!csv)return;
    csv.select();
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(csv.value).then(()=>toast('已复制练习 CSV。')).catch(()=>toast('已选中 CSV，可按复制快捷键。'));
    }else toast('已选中 CSV，可按复制快捷键。');
  }else if(act==='trainingLocate'){
    if(trainingStore.level?.steps.some(s=>s.action===value))locateTraining(value);
  }else if(act==='trainingCheck'){
    trainingView.reviewed=true;
    renderTrainingCoach();$('#trainingResult')?.focus({preventScroll:true});
  }else if(act==='trainingSteps'){
    focusTrainingTarget($('#trainingCoachTitle'));
  }else if(act==='trainingReset'&&trainingStore.level){
    $('#modal').innerHTML=Locale.markup('<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="training-reset-title"><h3 id="training-reset-title">重置本关？</h3><p class="tdesc">本关的操作和未保存草稿将清除，题目恢复到初始状态。其他关卡的进度会保留。</p><div class="actions"><button type="button" class="btn" data-act="closeModal">取消</button><button type="button" class="btn primary" data-act="trainingResetConfirm">确认重置本关</button></div></div>');
    $('#modal').hidden=false;
    $('#modal [data-act="closeModal"]').focus();
  }else if(act==='trainingResetConfirm'&&trainingStore.level){
    try { trainingStore.reset(); }
    catch { toast('这台浏览器无法重置实训数据，请检查存储设置。');return; }
    loadTrainingCase(trainingStore.level,{reset:true});
    enterTrainingLevel(trainingStore.level);
    toast('本关已恢复到初始状态。');
  }
}
document.addEventListener('click', ev => {
  if (workspace && !workspace.ready) return;
  const el = ev.target.closest('[data-act], [data-t]');
  if (!el) return;
  if (el.tagName === 'A' && el.dataset.act && !(ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) ev.preventDefault();
  else if (el.tagName === 'A' && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) return;
  if (el.dataset.t != null && !el.dataset.act) { const t = TRACES[+el.dataset.t]; if (t) openTrace(t); return; }
  const act = el.dataset.act, v = el.dataset.v, id = el.dataset.id;
  if(act?.startsWith('training')){
    if(trainingMode)handleTrainingAction(act,v);
    return;
  }
  if(readOnly() && ['batchOpen','addTpl','addCustom','edit','duplicate','del','zeroOB','blank','confirmImport','recoverPrevious','spaceImportLegacy'].includes(act))return;
  switch (act) {
    case 'skipMain': $('#mainContent').focus(); break;
    case 'section': navigateSection(v); break;
    case 'openTask': {
      const {kind,account,month}=el.dataset;
      if(v==='bank'){
        bankWorkspace.account=account;
        bankWorkspace.select(Number(month));
        bankWorkspace.filter=kind;
      } else if(kind==='review'){
        invoiceWorkspace.scope='review';
      } else if(kind==='overdue'){
        invoiceWorkspace.scope='posted';
        invoiceWorkspace.month=12;
        invoiceWorkspace.filter='overdue';
        invoiceWorkspace.page=1;
      }
      navigateSection(v);
      if(kind==='review') $('.invoice-reviews [data-inv-act="review"]')?.focus();
      else $('#pageTitle').focus({preventScroll:true});
      break;
    }
    case 'reportCsv': exportReport(); break;
    case 'reportPrint': window.print(); break;
    case 'batchOpen': openBatch(); break;
    case 'batchTemplate': batchTemplate(); break;
    case 'batchAccounts': downloadFile('会计科目代码.csv',EBook.csv([['科目代码','科目名称'].map(Locale.text),...Object.entries(Chart.codeIndex(PICK,S)).filter(([code,a])=>a.cash || code===a.code).map(([code,a])=>[code,a.cash?Chart.cashAccounts(S).find(c=>c.id===a.cash).name:plainName(a.c)])]),'text/csv;charset=utf-8'); break;
    case 'batchPreview': previewBatch(); break;
    case 'batchCommit': commitBatch(); break;
    case 'closePeriod': preparePeriodChange(false); break;
    case 'reopenPeriod': preparePeriodChange(true); break;
    case 'confirmPeriod': applyPeriodChange(); break;
    case 'closeReports': UI.reportMonth=selectedCloseMonth(); navigateSection('reports'); break;
    case 'closeLedger': UI.ledgerMonth=selectedCloseMonth(); UI.ledgerTab='tb'; navigateSection('ledger'); break;
    case 'closeJournal': openCloseJournal(); break;
    case 'closeBank': {
      bankWorkspace.closeReviewMonth=selectedCloseMonth();
      bankWorkspace.account=id||Bank.MAIN;
      bankWorkspace.select(Number(v));
      const status=Bank.summary(S,Number(v),bankWorkspace.account);
      if(status.statement && !status.bankUnmatched && status.unmatchedVouchers.length)bankWorkspace.filter='books';
      navigateSection('bank');
      break;
    }
    case 'toggleChecks': UI.showChecks = !UI.showChecks; renderAll(); break;
    case 'journalPage': UI.journalPage=+v; renderBoard(); $('#board').scrollIntoView({block:'start',behavior:'smooth'}); break;
    case 'workspaceJump': { const target=document.getElementById(v); if(target) { if(v==='bench') target.scrollTop=0; target.scrollIntoView({block:'start',behavior:'smooth'}); } break; }
    case 'quickTpl': if(UI.editing)clearAttachments();UI.editing=null; UI.tplQuery=''; UI.mode='tpl'; startTpl(v); UI.draftDirty=true; saveDraft(); renderBench(); ($('#f-expenseName') || $('#f-amt') || $('#f-date'))?.focus(); break;
    case 'memberStart': {
      if (!Member.types.has(v)) break;
      clearAttachments();UI.editing=null; UI.tplQuery=''; UI.mode='tpl'; startTpl(v);
      if(v==='memberCardUse') UI.params.cardNo=el.dataset.card || '';
      if(['memberCommissionAccrue','memberCommissionPay','memberCardRefund','memberCommissionReverse','memberCommissionRecover'].includes(v)) UI.params.saleId=id || '';
      UI.draftDirty=true; saveDraft(); navigateSection('bookkeeping'); break;
    }
    case 'businessStart': {
      if(!TPL[v] || !TPL[v].fields.some(f=>f.t==='alloc'))break;
      clearAttachments();UI.editing=null;UI.tplQuery='';UI.mode='tpl';startTpl(v);
      const field=TPL[v].fields.find(f=>f.t==='alloc'&&f.ledger===UI.businessLedger);
      if(field)UI.params[field.k]=JSON.stringify({[id]:String(Number(el.dataset.amount)/100)});
      UI.draftDirty=true;saveDraft();navigateSection('bookkeeping');break;
    }
    case 'cashBank': if(Bank.accounts(S).some(a=>a.id===id)){bankWorkspace.account=id;bankWorkspace.selected=null;navigateSection('bank');}break;
    case 'cashTransferStart': clearAttachments();UI.editing=null;UI.mode='tpl';UI.tplQuery='';startTpl('cashTransfer');navigateSection('bookkeeping');break;
    case 'cashAdd': {
      if(UI.loadBlocked){toast('请先恢复无法读取的账本。');break;}
      const accountId=$('#cash-new-id').value.trim(),name=$('#cash-new-name').value.trim(),raw=$('#cash-new-opening').value.trim(),opening=raw?money(raw):0;
      if(!/^[A-Za-z0-9_-]{1,40}$/.test(accountId)||!name||name.length>80||!Number.isSafeInteger(opening)){toast('请填写有效的账户编号、名称和期初余额。');break;}
      if(opening && (EBook.closedThrough(S)||Object.keys(S.bankReconciliation||{}).length||Object.keys(S.bankReconciliationByAccount||{}).length)){toast('已有锁账或对账单，只能新增零期初账户。');break;}
      const next={...S,cashAccounts:[...(S.cashAccounts||[]),{id:accountId,name,opening}]};
      try{Bank.validate(next,validDate);}catch(e){toast(e.message);break;}
      const old=S.cashAccounts;S.cashAccounts=next.cashAccounts;
      if(!save()){if(old)S.cashAccounts=old;else delete S.cashAccounts;toast('保存失败，资金账户未新增。');break;}
      renderAll();toast('资金账户已新增。');break;
    }
    case 'stockStart': {
      if(!Stock.types.has(v))break;clearAttachments();UI.editing=null;UI.mode='tpl';UI.tplQuery='';startTpl(v);
      if(v==='stockReturn')UI.params.saleId=id||'';else if(v!=='stockPurchase')UI.params.sku=id||'';
      UI.draftDirty=true;saveDraft();navigateSection('bookkeeping');break;
    }
    case 'assetStart': {
      if(!Assets.types.has(v))break;clearAttachments();UI.editing=null;UI.mode='tpl';UI.tplQuery='';startTpl(v);
      if(v!=='assetPurchase')UI.params.sourceId=id||'';
      UI.draftDirty=true;saveDraft();navigateSection('bookkeeping');break;
    }
    case 'resetFilters': UI.filters={query:'',from:'',to:'',kind:'all'}; renderAll(); break;
    case 'duplicate': if(Invoices.linked(S.txns.find(t=>t.id===id))){navigateSection('invoices');invoiceWorkspace.openForm(id,true);break;} if(UI.section !== 'bookkeeping') navigateSection('bookkeeping'); duplicateTx(id); break;
    case 'exportCsv': exportCsv(); break;
    case 'exportLines': exportLines(); break;
    case 'discardDraft': clearDraft(); resetEntryUI(); renderAll(); break;
    case 'spaceImportLegacy': {
      if(!workspace || workspace.data.ledger)break;
      try { const legacy=JSON.parse(localStorage.getItem(RECORD_KEY));validateBackup(legacy);previewReplacement(legacy,'导入本机旧账本'); }
      catch { toast('旧账本无法读取，请使用原页面导出备份后再导入。'); }
      break;
    }
    case 'retrySave': if(workspace?.pending) workspace.flush(); else save(); break;
    case 'confirmImport': confirmImport(); break;
    case 'recoverPrevious': { const r=readRecovery(); if (r?.json) importJSON(r.json); break; }
    case 'tab': if (UI.section==='ledger' && LEDGER_TABS.includes(v)) { UI.ledgerTab = v; renderAll(); $('#tab-'+v)?.focus(); } break;
    case 'ledgerGuide': if (UI.section==='ledger') { if (UI.guide == null) { UI.guide = 0; renderAll(); $('#ledgerGuide').scrollIntoView({block:'nearest'}); $('#guide-title')?.focus({preventScroll:true}); } else moveGuide('close'); } break;
    case 'guide': moveGuide(v); break;
    case 'mode': if (UI.editing && v!==UI.mode) { clearAttachments();UI.editing=null; startTpl(UI.tpl); UI.custom=blankCustom(); } UI.mode = v; if (v === 'custom' && !UI.custom) UI.custom = blankCustom(); UI.draftDirty=true; saveDraft(); renderBench(); renderHeader(); break;
    case 'attachmentRemove': { const i=Number(el.dataset.i);if(Number.isInteger(i)&&i>=0&&i<UI.attachments.length){UI.attachments.splice(i,1);UI.draftDirty=true;saveDraft();renderBench();}break; }
    case 'interfaceLocale':
      Locale.set(v);
      if(demoMode)workspace.renderDemoBar();
      $('#trace').hidden=true; renderAll(); $('[data-act="interfaceLocale"]')?.focus(); break;
    case 'lang': S.settings.lang = v; save(); renderAll(); break;
    case 'settings': UI.showSettings = !UI.showSettings; renderAll(); break;
    case 'aiConnection': openAIConnection(); break;
    case 'aiLogin': openAIConnection(false); if (!UI.aiConnected) startAILogin(); break;
    case 'aiStartLogin': startAILogin(); break;
    case 'aiConnectLocal': connectLocalPi(); break;
    case 'aiCancelLogin': cancelAILogin(); break;
    case 'aiRefresh': refreshAIConnection(); break;
    case 'aiSaveConnection': {
      if (!saveLoginConnection()) break;
      stopLoginPolling(); UI.login = {state:'idle'}; $('#modal').hidden = true; refreshAIConnection(); break;
    }
    case 'backup': openBackup(); break;
    case 'closeModal': stopLoginPolling(); if(invoiceWorkspace)invoiceWorkspace.form=null; UI.pendingImport=null; UI.batchPreview=null; UI.periodPending=null; $('#modal').hidden = true; break;
    case 'dlJson': { const data=$('#bk-text')?.value || JSON.stringify(S,null,1), filename=Locale.text(`企业账本-${S.company.year}-${today()}.json`); downloadFile(filename,data); toast('已下载当前账本备份'); break; }
    case 'copyJson': { const ta = $('#bk-text'); const txt = ta ? ta.value : JSON.stringify(S); try { navigator.clipboard.writeText(txt).then(() => toast('已复制'), () => { ta && ta.select(); toast('请按 Ctrl/⌘ + C 复制已选中的文本'); }); } catch (e) { ta && ta.select(); } break; }
    case 'importText': importJSON(($('#bk-text') || {}).value || ''); break;
    case 'blank': { const s=recordState(); s.settings.lang=S.settings.lang; s.settings.tab='opening'; s.company.year=+S.company.year; previewReplacement(s,'新建空账本'); break; }
    case 'undo': if (UI.undo) { const f = UI.undo; UI.undo = null; $('#toast').hidden = true; f(); } break;
    case 'sel': if (ev.target.closest('.acts')) break; UI.sel = UI.sel === id ? null : id; renderBench(); renderBoard(); break;
    case 'clearSel': UI.sel = null; renderAll(); break;
    case 'edit': { const t=S.txns.find(t=>t.id===id); if (!t || denyLocked(t.date) || denyMatched(t.id)) break; if(Invoices.linked(t)){navigateSection('invoices');invoiceWorkspace.openForm(id);break;} if(UI.section !== 'bookkeeping') navigateSection('bookkeeping'); editTx(id); break; }
    case 'del': delTx(id); break;
    case 'cancelEdit': UI.editing = null;clearAttachments(); clearDraft(); if (UI.mode === 'tpl') startTpl(UI.tpl); else UI.custom = blankCustom(); renderAll(); break;
    case 'addTpl': addTpl(); break;
    case 'addCustom': addCustom(); break;
    case 'custAdd': UI.custom.rows.push({a:'1000', dr:'', cr:''}); UI.draftDirty=true; saveDraft(); renderBench(); break;
    case 'custDel': if (UI.custom.rows.length > 1) { UI.custom.rows.splice(+el.dataset.i, 1); UI.draftDirty=true; saveDraft(); renderBench(); } break;
    case 'jump': jump(id); break;
    case 'voucherReport': { const entry=R.byId[id]; if (!entry) break; UI.sel=id; UI.reportMonth=EBook.monthOf(entry.date); const accounts=entry.groups.flat().map(l=>ACC[l.a]); navigateSection(accounts.some(a=>a.pl || a.t==='O') ? 'pl' : accounts.some(a=>['E','XE'].includes(a.t)) ? 'soce' : 'sfp'); break; }
    case 'closeTrace': $('#trace').hidden = true; break;
    case 'chip': { const c = R.checks.find(x => x.k === el.dataset.k); if (c) openInfo(c.zh, c.why); break; }
    case 'plMethod': S.settings.plMethod = v; save(); renderBoard(); break;
    case 'plPres': S.settings.plPres = v; save(); renderBoard(); break;
    case 'cfMethod': S.settings.cfMethod = v; save(); renderBoard(); break;
    case 'lf': UI.lf = v; renderBoard(); break;
    case 'zeroOB': { if (EBook.closedThrough(S)) break; const snap = snapshot(); S.opening = {}; S.openingShares = 0; save(); renderAll(); toast('期初余额已清零', () => restore(snap)); break; }
    case 'aiGo': aiGo(); break;
    case 'aiStop': if (UI.ai.ctl) UI.ai.ctl.abort(); break;
    case 'aiAccept': { const r = UI.ai.res; if (!r || r.empty) break; UI.editing = null; if(!commit({date:r.date, tpl:'custom', memo:r.memo, memoUser:r.memo, adj:r.adj, groups:r.groups, calc:r.assumptions ? '假设：' + r.assumptions : '', shares:0, note:r.explain, src:'ai'})) break; UI.ai = {text:'', status:'idle', res:null, err:'', ctl:null}; renderBench(); break; }
    case 'aiEdit': { const r = UI.ai.res; if (!r || r.empty) break; UI.custom = {date:r.date, memo:r.memo, adj:r.adj, rows:r.groups.flat().map(l => ({a:l.a, dr:l.s > 0 ? String(l.s / 100) : '', cr:l.s < 0 ? String(-l.s / 100) : '', fn:l.fn || ''}))}; UI.mode = 'custom'; UI.draftDirty=true; saveDraft(); renderBench(); break; }
  }
});
document.addEventListener('keydown', ev => {
  if (workspace && !workspace.ready) return;
  if (ev.key === 'Escape') { if (!$('#modal').hidden) { stopLoginPolling(); $('#modal').hidden = true; UI.pendingImport=null; UI.batchPreview=null; UI.periodPending=null; } else if (!$('#trace').hidden) $('#trace').hidden = true; else if (UI.guide != null) moveGuide('close'); return; }
  if (!$('#modal').hidden && ev.key==='Tab') {
    const nodes=[...$('#modal').querySelectorAll('button:not([disabled]),input:not([hidden]),textarea,select,a[href],summary')].filter(n=>!n.hidden && n.offsetParent);
    const first=nodes[0],last=nodes[nodes.length-1];
    if (first && ev.shiftKey && (ev.target===first || !$('#modal').contains(ev.target))) { ev.preventDefault(); last.focus(); }
    else if (last && !ev.shiftKey && (ev.target===last || !$('#modal').contains(ev.target))) { ev.preventDefault(); first.focus(); }
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key==='Enter' && $('#modal').hidden && UI.section==='bookkeeping') { ev.preventDefault(); if (UI.mode==='tpl') addTpl(); else if (UI.mode==='custom') addCustom(); return; }
  if (ev.target.matches?.('[role="tab"]') && ['ArrowLeft','ArrowRight','Home','End'].includes(ev.key)) {
    ev.preventDefault(); const tabs=[...$('#tabs').querySelectorAll('[role="tab"]')], i=tabs.indexOf(ev.target), n=ev.key==='Home'?0:ev.key==='End'?tabs.length-1:(i+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    UI.ledgerTab=tabs[n].dataset.v; renderAll(); $('#tab-'+UI.ledgerTab).focus(); return;
  }
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const t = ev.target;
  if (t.matches && t.matches('[data-t]')) { ev.preventDefault(); const x = TRACES[+t.dataset.t]; if (x) openTrace(x); }
  else if (t.matches && t.matches('li.tx')) { ev.preventDefault(); const id = t.dataset.id; UI.sel = UI.sel === id ? null : id; renderBench(); renderBoard(); const n = document.querySelector(`li.tx[data-id="${id}"]`); if (n) n.focus(); }
});
document.addEventListener('input', ev => {
  if (workspace && !workspace.ready) return;
  const el = ev.target;
  if (el.id==='batch-text') { UI.batchPreview=null; $('#batch-result').replaceChildren(); $('#batch-confirm').disabled=true; return; }
  if (el.id==='tplSearch') { UI.tplQuery=el.value; $('#tplSel').innerHTML=Locale.markup(templateOptions()); return; }
  if (el.dataset.alloc) {
    let alloc={};try{alloc=JSON.parse(UI.params[el.dataset.field]||'{}');}catch(e){}
    if(el.value.trim())alloc[el.dataset.alloc]=el.value;else delete alloc[el.dataset.alloc];
    UI.params[el.dataset.field]=JSON.stringify(alloc); UI.draftDirty=true;
    const box=$('#tplPreview');if(box)box.innerHTML=Locale.markup(tplPreviewHTML());
    clearTimeout(saveDraft._t);saveDraft._t=setTimeout(saveDraft,250);return;
  }
  if (el.dataset.filter) { UI.filters[el.dataset.filter]=el.value; UI.journalPage=1; renderEntryList(); if(UI.section==='journal') renderBoard(); return; }
  if (el.dataset.f != null) {
    UI.params[el.dataset.f] = el.value;
    const box = $('#tplPreview'); if (box) box.innerHTML = Locale.markup(tplPreviewHTML());
    const hint = $('#tplHint'); if (hint) hint.innerHTML = Locale.markup(tplHintHTML());
    const memo = $('#f-memo'); if (memo && el.id !== 'f-memo') memo.placeholder = safeMemo(TPL[UI.tpl], UI.params);
  } else if (el.dataset.c != null && el.tagName === 'INPUT') {
    UI.custom.rows[+el.dataset.i][el.dataset.c] = el.value;
    const t = customTotals(), tt = $('#cTot'); if (tt) tt.innerHTML = Locale.markup(`<span>合计</span><span>${fmt(t.d)}</span><span>${fmt(t.c)}</span><span></span>`);
    const m = $('#custMsg'); if (m) m.innerHTML = Locale.markup(custMsg());
  } else if (['memo','date','party','ref'].includes(el.dataset.cm)) {
    UI.custom[el.dataset.cm] = el.value;
    if (el.dataset.cm==='date' && $('#custMsg')) $('#custMsg').innerHTML=Locale.markup(custMsg());
  } else if (el.dataset.ai) {
    UI.ai.text = el.value;
  }
  if (el.dataset.f!=null || el.dataset.c!=null || el.dataset.cm!=null) { UI.draftDirty=true; clearTimeout(saveDraft._t); saveDraft._t=setTimeout(saveDraft,250); }
});
document.addEventListener('change', ev => {
  if (workspace && !workspace.ready) return;
  const el = ev.target;
  if(el.id==='attachment-file'){
    const files=Array.from(el.files||[]),used=UI.attachments.reduce((n,a)=>n+a.size,0);
    if(UI.attachmentBusy||!files.length)return;
    const typed=files.map(file=>{const lower=file.name.toLowerCase(),type=ATTACH_TYPES.has(file.type)?file.type:lower.endsWith('.pdf')?'application/pdf':lower.endsWith('.png')?'image/png':/\.jpe?g$/.test(lower)?'image/jpeg':'';return {file,type};});
    if(UI.attachments.length+files.length>3||used+files.reduce((n,f)=>n+f.size,0)>ATTACH_LIMIT||typed.some(x=>!x.type||!x.file.size||x.file.name.length>180)){toast('附件须为 PDF、PNG 或 JPG，最多 3 个且合计不超过 2 MB。');el.value='';return;}
    const epoch=++UI.attachmentEpoch;UI.attachmentBusy=true;const status=$('#attachment-status');if(status)status.textContent=Locale.text('正在读取附件…');
    Promise.all(typed.map(({file,type})=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const raw=String(reader.result||''),comma=raw.indexOf(',');if(comma<0){reject(new Error('附件读取失败'));return;}resolve({name:file.name,type,size:file.size,data:`data:${type};base64,${raw.slice(comma+1)}`});};reader.onerror=()=>reject(new Error('附件读取失败'));reader.readAsDataURL(file);}))).then(items=>{
      if(epoch!==UI.attachmentEpoch)return;const next=[...UI.attachments,...items];validateAttachments(next);UI.attachments=next;UI.attachmentBusy=false;UI.draftDirty=true;saveDraft();renderBench();
    }).catch(e=>{if(epoch!==UI.attachmentEpoch)return;UI.attachmentBusy=false;toast(e.message||'附件读取失败');renderBench();});return;
  }
  if (el.id==='mobile-nav') { navigateSection(el.value); return; }
  if (el.id==='report-month') { const m=+el.value; if (Number.isInteger(m) && m>=1 && m<=12) { UI.reportMonth=m; $('#trace').hidden=true; renderAll(); } return; }
  if (el.id==='member-month') { const m=+el.value; if (Number.isInteger(m) && m>=1 && m<=12) { UI.memberMonth=m; renderAll(); } return; }
  if (el.id==='business-month') { const m=+el.value; if (Number.isInteger(m) && m>=1 && m<=12) { UI.businessMonth=m; renderAll(); } return; }
  if (el.id==='inventory-month') { const m=+el.value; if (Number.isInteger(m) && m>=1 && m<=12) { UI.inventoryMonth=m; renderAll(); } return; }
  if (el.id==='asset-month') { const m=+el.value; if (Number.isInteger(m) && m>=1 && m<=12) { UI.assetMonth=m; renderAll(); } return; }
  if (el.id==='business-ledger') { if(Business.LEDGERS[el.value]) {UI.businessLedger=el.value;renderAll();}return; }
  if (el.id==='ledger-month') { const m=+el.value; if (Number.isInteger(m) && m>=1 && m<=12) { UI.ledgerMonth=m; renderAll(); } return; }
  if (el.id==='close-month') { const m=+el.value; if (Number.isInteger(m) && m>=1 && m<=12) { UI.closeMonth=m; UI.closeChecks.clear(); renderAll(); } return; }
  if (el.dataset.closeCheck) {
    if (el.checked) UI.closeChecks.add(el.dataset.closeCheck); else UI.closeChecks.delete(el.dataset.closeCheck);
    if (!$('#lock-period')) return;
    const month=selectedCloseMonth(), bankStatus=closeBankStatus(month);
    $('#lock-period').disabled = !canClose(month,bankStatus);
    const remaining=closeItems(bankStatus).filter(([key])=>!UI.closeChecks.has(key)).length;
    $('#close-next-step').textContent=Locale.text(closeNextStep(R.checks.filter(c=>!c.ok),bankStatus,remaining));
    return;
  }
  if (el.id==='batch-file') {
    const file=el.files?.[0], field=$('#batch-text');
    if (!file || !field) return;
    UI.batchPreview=null; $('#batch-confirm').disabled=true;
    if (file.size>1_200_000) { $('#batch-result').textContent=Locale.text('CSV 过大，请分批导入。'); return; }
    const reader = new FileReader(), prior = field.value;
    reader.onload = () => { if (!field.isConnected || el.files?.[0]!==file || field.value!==prior) return; field.value=String(reader.result); previewBatch(); };
    reader.onerror = () => { if (field.isConnected) $('#batch-result').textContent=Locale.text('文件读取失败，请重新选择。'); };
    reader.readAsText(file);
    return;
  }
  if (el.dataset.filter) { UI.filters[el.dataset.filter]=el.value; UI.journalPage=1; renderEntryList(); if(UI.section==='journal') renderBoard(); return; }
  if (el.id === 'tplSel') { if (!TPL[el.value]) return; startTpl(el.value); UI.draftDirty=true; saveDraft(); renderBench(); const s = $('#tplSel'); if (s) s.focus(); return; }
  if (el.dataset.f != null && el.tagName === 'SELECT') { UI.params[el.dataset.f] = el.value; UI.draftDirty=true; saveDraft(); renderBench(); return; }
  if (el.dataset.f === 'date') { UI.params.date = el.value; UI.draftDirty=true; saveDraft(); if(TPL[UI.tpl].fields.some(f=>f.t==='alloc')){renderBench();return;} const box = $('#tplPreview'); if (box) box.innerHTML = Locale.markup(tplPreviewHTML()); const hint=$('#tplHint'); if(hint) hint.innerHTML=Locale.markup(tplHintHTML()); return; }
  if (el.dataset.c != null && el.tagName === 'SELECT') { const r = UI.custom.rows[+el.dataset.i]; r[el.dataset.c] = el.value; if (el.dataset.c === 'a') r.fn = ''; UI.draftDirty=true; saveDraft(); renderBench(); return; }
  if (el.dataset.cm === 'adj') { UI.custom.adj = el.checked; UI.draftDirty=true; saveDraft(); return; }
  if (el.dataset.ob) {
    if (EBook.closedThrough(S)) return;
    const c = el.dataset.ob, v = money(el.value);
    if (el.value.trim() && !Number.isFinite(v)) { toast('金额格式不对'); renderBoard(); return; }
    const val = Number.isFinite(v) ? v : 0;
    if (val) S.opening[c] = ACC[c].t === 'A' ? val : -val; else delete S.opening[c];
    save(); renderAll(); return;
  }
  if (el.dataset.obCash) {
    // A bank's opening: extra banks keep their own; the default bank is what is left of the cash total.
    if (EBook.closedThrough(S)) return;
    const v = money(el.value);
    if (el.value.trim() && !Number.isSafeInteger(v)) { toast('金额格式不对'); renderBoard(); return; }
    const val = Number.isSafeInteger(v) ? v : 0, extra = S.cashAccounts || [];
    const bank = extra.find(a => a.id === el.dataset.obCash);
    if (!bank && el.dataset.obCash !== Bank.MAIN) return;
    const others = extra.reduce((n, a) => n + (a === bank ? 0 : a.opening), 0);
    const mainOpening = bank ? Bank.accounts(S).find(a => a.id === Bank.MAIN).opening : val;
    if (bank) bank.opening = val;
    const total = mainOpening + others + (bank ? val : 0);
    if (total) S.opening['1000'] = total; else delete S.opening['1000'];
    save(); renderAll(); return;
  }
  if (el.dataset.obs) { if (EBook.closedThrough(S)) return; const n = Math.round(num(el.value)); if (el.value.trim() && (!Number.isSafeInteger(n) || n<0)) { toast('股数请填写有效的非负整数'); renderBoard(); return; } S.openingShares = n > 0 ? n : 0; save(); renderAll(); return; }
  if (el.dataset.set) {
    const k = el.dataset.set;
    if (k !== 'name' && EBook.closedThrough(S)) return;
    if (['year','cur'].includes(k) && (Object.keys(S.bankReconciliation || {}).length||Object.keys(S.bankReconciliationByAccount || {}).length)) return;
    if (k==='autoTax' && el.checked && S.txns.some(t=>['hkProfitsTaxAccrue','hkProfitsTaxEstimate'].includes(t.tpl))) { toast('已有香港利得税计提凭证，不能同时开启年末自动计税。');renderHeader();return; }
    if (k === 'name') S.company.name = el.value.trim() || 'Company Limited';
    else if (k === 'year') { const y = Math.round(num(el.value)); if (y > 1900 && y < 2200) { if (y!==+S.company.year && (S.periodHistory?.length || S.txns.some(t=>+t.date.slice(0,4)!==y))) { toast('当前账本已有凭证或月结记录。请备份后新建其他年度的账本。'); renderHeader(); return; } S.company.year = y; UI.lastDate=null; UI.params.date=defaults(UI.tpl).date; UI.custom.date=entryDate(); saveDraft(); } }
    else if (k === 'cur') S.company.cur = el.value.trim().slice(0, 6) || '$';
    else if (k === 'tax') { const t = num(el.value); if (t >= 0 && t < 100) S.settings.tax = t; }
    else if (k === 'autoTax') S.settings.autoTax = el.checked;
    save(); renderAll(); return;
  }
  if (el.id === 'bk-file' && el.files && el.files[0]) { const fr = new FileReader(); fr.onload = () => importJSON(String(fr.result || '')); fr.onerror=()=>{ const m=$('#bk-msg'); if(m)m.textContent=Locale.text('文件读取失败，请重新选择。'); }; fr.readAsText(el.files[0]); }
});
/* ================= boot ================= */
const tutorialCatalog = TPL_CATS.map(([category, title]) => ({
  title,
  names:TEMPLATES.filter(template => template.cat === category).map(template => template.zh
    + (template.legacyOnly ? '（仅适用旧凭证）' : template.dialogOnly ? '（使用销售发票表单）' : '')),
}));
function bootPortalTutorial(){
  const main = $('#portalTutorial');
  const tutorial = new Tutorial($('#portalTutorialPane'));
  const title = $('#portalTutorialTitle');
  const back = $('.tutorial-portal-header a', main);
  title.textContent = Locale.text('操作教程');
  back.textContent = Locale.text('返回工作台');
  let previousTitle, entry;
  const sync = () => {
    const open = location.hash === '#tutorial';
    if (open === !main.hidden) return;
    if (open) {
      previousTitle = document.title;
      const portal = $('#payrollPortal').hidden ? '#salesPortal' : '#payrollPortal';
      entry = $('a[data-portal-tutorial]', $(portal));
      tutorial.render({role:workspace.user.role});
      document.title = Locale.text('企业财务工作台 · 操作教程');
    } else {
      document.title = previousTitle;
    }
    main.hidden = !open;
    document.body.toggleAttribute('data-tutorial-portal', open);
    (open ? title : entry)?.focus({preventScroll:true});
    window.scrollTo(0,0);
  };
  window.addEventListener('hashchange', sync);
  sync();
}
function createPayroll(root){
  return new window.AccountingPayroll({
    root,modal:$('#modal'),request:(...args)=>workspace.request(...args),user:()=>workspace.user,download:downloadFile,
    logout:button=>workspace.logout(button),flush:()=>workspace.flush(),reload:()=>location.reload(),
    back:()=>{$('#payrollPortal').hidden=true;$('#salesPortal').hidden=false;},
  });
}
function bootLedger(){
  if(!workspace && !trainingMode) removeRetiredLedger();
  if(trainingMode){
    const main=$('#mainContent'), catalog=$('#trainingCatalog'), coach=$('#trainingCoach'), stage=document.createElement('div');
    stage.id='trainingWork';
    stage.append(...[...main.children].filter(el=>el!==catalog&&el!==coach));
    const sales=document.createElement('section');
    sales.id='trainingSales';
    sales.hidden=true;
    stage.prepend(sales);
    trainingSalesPortal=new Company.SalesPortal({root:sales,practice:true,request:(...args)=>{
      if(trainingRole()!=='sales')throw new Error('请先打开销售实训。');
      return Training.salesRequest(S,data=>commitTrainingState('trainingSales',data),validDate,...args);
    }});
    main.append(stage);
    trainingView=new Training.View(catalog,coach);
    coach.addEventListener('change',event=>{
      const field=event.target.closest('[data-training-answer]');
      if(!field||trainingRole()!=='owner')return;
      const index=Number(field.dataset.trainingAnswer);
      const options=trainingStore.level.steps[index]?.options;
      const answers={...S.trainingAnswers};
      if(field.value==='')delete answers[index];
      else if(options?.[Number(field.value)]!==undefined)answers[index]=Number(field.value);
      else return;
      if(!commitTrainingState('trainingAnswers',answers))renderTrainingCoach();
    });
    const shortcuts=$('#mobileJump');
    shortcuts.innerHTML='<button type="button" class="btn primary" data-act="trainingSteps"></button>';
  }
  tutorial = new Tutorial($('#tutorialPane'));
  if(workspace)payrollWorkspace=createPayroll($('#payrollWorkspace'));
  if(readOnly()){
    document.body.dataset.ledgerReadonly='';
    if(UI.section==='bookkeeping')UI.section='journal';
  }
  S=load();
  reportEditor = new window.AccountingReportEditor({
    root:$('#reportEditor'),readonly:readOnly,getState:()=>S,getLedger:ledgerReportRows,format:fmt,money,toast,
    getSlot:()=>{const report=workspace?.currentReport();return report?{owner:report,key:'draft'}:{owner:S,key:'customReport'};},
    save:()=>{const report=workspace?.currentReport();if(report){report.updatedAt=Date.now();workspace.touch();renderReportNav('custom');return true;}return save();},
  });
  bankWorkspace=new window.AccountingBankWorkspace({
    root:$('#bankPane'),modal:$('#modal'),book:()=>S,save,toast,format:fmt,validDate,download:downloadFile,openVoucher:jump,
    defaultMonth:selectedCloseMonth,canWrite:canWriteLedger,
    ai:trainingMode||demoMode?null:{connected:()=>UI.aiConnected,label:aiLabel,connect:()=>openAIConnection(),json:(prompt,options)=>window.AccountingAI.json(prompt,options),
      failure:e=>aiFailureMessage(e,'AI 的回答不是有效格式，请重新对比。')},
    invoices:through=>Invoices.summary(S,through,through).invoices,settle:settleBankInvoices,
  });
  new Chart.ChartManager({ready:()=>!workspace || workspace.ready, book:()=>S, base:BASE_COA, accounts:()=>COA, used:usedAccounts, writable:canWriteLedger,
    toast, check:checkChart, commit:commitChart, render:()=>renderAll(),
    download:(filename,data)=>downloadFile(filename,data,'text/csv;charset=utf-8')});
  invoiceWorkspace=new Invoices.Workspace({
    accountName:code=>acctName(code), accountLabel:code=>`${esc(acode(code))} ${acctName(code)}`, accountHidden:code=>!!ACC[code]?.off,
    currentMaker:()=>workspace?.user?.name||'',root:$('#invoicePane'),modal:$('#modal'),book:()=>S,post:postInvoice,toast,format:fmt,today,entryDate,openVoucher:jump,
    receive:postInvoiceReceipt,cashAccounts:()=>Chart.cashAccounts(S),cashOption,openBank:()=>navigateSection('bank'),
    canWrite:canWriteLedger,lockedDate:date=>EBook.locked(S,date),
    reviews:reviewer()?{batch:workspace.user.role==='accountant'?async input=>{
      saveDraft();
      if(!await workspace.flush())throw new Error('請先處理未儲存的帳本變更。');
      return workspace.request('requests/batch','POST',input);
    }:null, refreshLedger:async()=>{
      const result=await workspace.request('state');
      workspace.data=result.state;workspace.revision=result.revision;workspace.updatedAt=result.updatedAt;
      S=load();renderAll();await loadRequests();
    },list:()=>UI.requests?.list || [],authors:()=>UI.requests?.authors || [],error:()=>UI.requests?.error || '',reject:rejectRequest,refresh:loadRequests}:null,
  });
  $('#bankPane').addEventListener('bank-close', event=>{
    const month=bankWorkspace.closeReviewMonth ?? event.detail;
    if(month!==selectedCloseMonth())UI.closeChecks.clear();
    UI.closeMonth=month; navigateSection('close');
  });
  resetEntryUI();loadDraft();
  if(trainingMode)resetTrainingPageState();
  if (!trainingMode && ['#learn','#practice'].includes(location.hash)) {
    try { history.replaceState(null,'',workspace?'#home':'#reports'); } catch (e) {}
  }
  renderAll();revealCurrentNav();
  const syncNavigation=()=>{
    if(trainingMode){
      const level=trainingCaseFromURL();
      if(level && level!==trainingStore.level)loadTrainingCase(level);
    }
    navigateSection(routeSection(),false);
  };
  window.addEventListener('popstate',syncNavigation);
  window.addEventListener('hashchange',syncNavigation);
  if(workspace?.user?.readOnly){
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshManagement();});
    setInterval(()=>{if(!document.hidden)refreshManagement();},30000);
  }
  window.addEventListener('pagehide',()=>{clearTimeout(saveDraft._t);saveDraft();});
  window.addEventListener('beforeunload',ev=>{
    saveDraft();if(workspace?.pending || UI.storageError && !UI.loadBlocked){ev.preventDefault();ev.returnValue='';}
  });
  if(trainingMode)return;
  loadRequests();
  if(UI.section==='payroll')payrollWorkspace?.load();
  if(!demoMode)return refreshAIConnection();
}
Locale.applyShell();
if(accountMode){
  let salesPortal=null;
  workspace=new Account.PersonalSpace({
    onReady:bootLedger,
    onPayroll:async mine=>{
      const root=$('#payrollPortal');root.hidden=false;
      payrollWorkspace=createPayroll(root);
      await payrollWorkspace.load(mine);
      bootPortalTutorial();
    },
    onSales:async ()=>{
      const root=$('#payrollPortal');payrollWorkspace=createPayroll(root);
      salesPortal=new Company.SalesPortal({root:$('#salesPortal'),request:(...args)=>workspace.request(...args),user:()=>workspace.user,logout:button=>workspace.logout(button),payroll:()=>{root.hidden=false;$('#salesPortal').hidden=true;return payrollWorkspace.load(true);}});
      await salesPortal.load();
      bootPortalTutorial();
    },
    onStatus:renderSaveStatus,onChange:renderAll,leave:()=>{clearTimeout(saveDraft._t);saveDraft();},download:downloadFile,
    makeDraft:()=>window.AccountingReportEditor.createDraft(S.company),
    copyDraft:()=>structuredClone(reportEditor.draft()),
    legacy:()=>{try{return !workspace.data.ledger && !!localStorage.getItem(RECORD_KEY);}catch{return false;}},
    openReport:id=>{
      const url=new URL(location.href);url.searchParams.set('file',id);url.hash='custom';
      history.pushState(null,'',url);navigateSection('custom',false);
    },
  });
  Company.admin=new Company.CompanyAdmin({request:(...args)=>workspace.request(...args),user:()=>workspace.user,signedOut:()=>location.reload()});
  window.AccountingReady=workspace.start();
}else window.AccountingReady=bootLedger();
})();

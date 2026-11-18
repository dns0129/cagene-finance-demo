import { randomUUID } from './workspace-platform.mjs';
import { Bank, Business, Enterprise } from './ledger-core.mjs';

const ITEMS=['base','attendance','work','commission','deduction','employeeMpf','employerMpf'];
const MAX=999_999_999_999;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const PERSON=/^[A-Za-z0-9_-]{1,40}$/;
const monthOf=date=>Number(date.slice(5,7));
const cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX;
const total=(rows,key)=>rows.reduce((sum,row)=>sum+row[key],0);
const endOf=period=>Enterprise.monthEnd(Number(period.slice(0,4)),monthOf(period));

export function createPayrollStore({db,atomic,fail,record,company,companyWrite,userByLogin}){
  const reject=message=>fail(400,'payroll_invalid',message);
  const conflict=message=>fail(409,'payroll_conflict',message);
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_staff (id TEXT PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payroll_runs (id TEXT PRIMARY KEY, period TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payroll_audit (
      id INTEGER PRIMARY KEY, run_id TEXT NOT NULL, at INTEGER NOT NULL,
      user_id INTEGER NOT NULL, name TEXT NOT NULL, action TEXT NOT NULL, before TEXT NOT NULL, after TEXT NOT NULL
    );
  `);
  const q={
    staff:db.prepare('SELECT data FROM payroll_staff ORDER BY id'),
    employee:db.prepare('SELECT data FROM payroll_staff WHERE id=?'),
    linkedStaff:db.prepare('SELECT id FROM payroll_staff WHERE user_id=?'),
    upsertStaff:db.prepare('INSERT INTO payroll_staff(id,user_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,data=excluded.data'),
    runs:db.prepare('SELECT data FROM payroll_runs ORDER BY period DESC'),
    get:db.prepare('SELECT data FROM payroll_runs WHERE id=?'),
    byPeriod:db.prepare('SELECT data FROM payroll_runs WHERE period=?'),
    insert:db.prepare('INSERT INTO payroll_runs VALUES(?,?,?)'),
    update:db.prepare('UPDATE payroll_runs SET data=? WHERE id=?'),
    audit:db.prepare('INSERT INTO payroll_audit(run_id,at,user_id,name,action,before,after) VALUES(?,?,?,?,?,?,?)'),
    history:db.prepare('SELECT at,name,action,before,after FROM payroll_audit WHERE run_id=? ORDER BY id DESC'),
  };
  const read=row=>row?JSON.parse(row.data):null;
  const list=()=>q.runs.all().map(read);
  const companyName=()=>JSON.parse(company.get().data).ledger?.company?.name||'';
  const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max+1):'';
  function audit(user,runId,action,before,after){
    q.audit.run(runId,Date.now(),Number(user.id),user.name,action,JSON.stringify(before),JSON.stringify(after));
    if(action==='post')record(user,'payroll.post',{period:after.period,vouchers:[after.accrual,...after.payments],net:after.net});
  }
  function staffSave(user,input){
    const id=clean(input?.id,40), name=clean(input?.name,80), title=clean(input?.title,80);
    const bank=clean(input?.bank,80), last4=clean(input?.last4,4);
    const username=clean(input?.username,254).toLowerCase(), account=username&&userByLogin(username);
    const userId=account?Number(account.id):null;
    if(Object.hasOwn(Object.prototype,id)||!PERSON.test(id)||!name||name.length>80||title.length>80||bank.length>80||last4&&!/^\d{4}$/.test(last4))reject('請核對員工編號、姓名、職位和銀行尾號。');
    if(username&&!account)reject('找不到員工登入帳號。請先由管理員建立帳號。');
    const bound=userId!==null&&q.linkedStaff.get(userId);
    if(bound&&bound.id!==id)conflict('此登入帳號已綁定另一位員工。');
    const staff={id,name,title,bank,last4,username,userId,active:input.active!==false};
    const before=read(q.employee.get(id));
    q.upsertStaff.run(id,userId,JSON.stringify(staff)); audit(user,'staff:'+id,'staff',before,staff);
    return {staff};
  }
  function draftSave(user,input){
    const period=input?.period;
    if(typeof period!=='string'||!MONTH.test(period)||!Array.isArray(input.rows)||!input.rows.length||input.rows.length>250)reject('請選擇工資月份並填寫至少一位員工。');
    const current=read(q.byPeriod.get(period));
    if(current && (current.status==='posted'||input.version!==current.version) || !current && input.version!=null)conflict('工資表已更新或鎖定，請重新載入。');
    const issued=current?.status==='published';
    const snapshots=new Map((current?.rows||[]).map(row=>[row.staffId,row]));
    const distinct=new Set();
    const revised=input.rows.map(row=>{
      const staff=typeof row?.staffId==='string'&&read(q.employee.get(row.staffId));
      if(!staff?.active||distinct.has(staff.id))reject('工資表有重複或停用的員工。');
      distinct.add(staff.id);
      if(issued&&(!snapshots.has(staff.id)||Object.hasOwn(current.confirmations,staff.id)))conflict('已確認的糧單已鎖定。只能修正本批次尚未確認的糧單。');
      if(issued&&staff.userId!==snapshots.get(staff.id).userId)conflict('員工登入帳號已有變更，這張糧單需要人事核對。');
      const amounts=Object.fromEntries(ITEMS.map(k=>[k,row[k]??0]));
      if(!ITEMS.every(k=>cents(amounts[k])))reject('薪酬及扣款須為非負金額，最多兩位小數。');
      const {base,attendance,work,commission,deduction}=amounts;
      const gross=base+attendance+work+commission-deduction, mpfMode=row.mpfMode||'manual';
      if(!['manual','monthly','holiday','none'].includes(mpfMode)||!cents(gross)||gross===0)reject('請核對薪酬總額和強積金模式。');
      const mpfIncome=row.mpfIncome??gross;
      if(!cents(mpfIncome))reject('請填寫有效的強積金有關入息。');
      if(mpfMode==='monthly'||mpfMode==='holiday'){
        const contribution=Business.monthlyMpf(mpfIncome,mpfMode==='holiday');
        amounts.employerMpf=contribution.employer; amounts.employeeMpf=contribution.employee;
      }else if(mpfMode==='none'){amounts.employerMpf=0;amounts.employeeMpf=0;}
      const net=gross-amounts.employeeMpf;
      if(gross<=0||net<=0||!cents(gross)||!cents(net))reject('總薪金和實發淨薪須大於零，請核對扣款。');
      const earningsMonth=row.earningsMonth||'';
      if((work||commission)&&(!MONTH.test(earningsMonth)||earningsMonth>period))reject('工錢或佣金有金額時，請填寫所屬月份。');
      const leave=clean(row.leave,300);
      if(leave.length>300)reject('假期資料最多 300 字。');
      return {staffId:staff.id,name:staff.name,title:staff.title,bank:staff.bank,last4:staff.last4,userId:staff.userId,...amounts,gross,net,mpfMode,mpfIncome,earningsMonth,leave};
    });
    const updates=new Map(revised.map(row=>[row.staffId,row]));
    const rows=issued?current.rows.map(row=>updates.get(row.staffId)||row):revised;
    const totals=Object.fromEntries(['gross','net','employeeMpf','employerMpf'].map(key=>[key,total(rows,key)]));
    if(issued)return update(user,current,'correct',{rows,totals,publishedVersion:current.version+1});
    const run={id:current?.id||randomUUID(),period,status:'draft',version:(current?.version||0)+1,rows,confirmations:{},totals};
    if(current)q.update.run(JSON.stringify(run),run.id);else q.insert.run(run.id,period,JSON.stringify(run));
    audit(user,run.id,'draft',current,run);
    return {run};
  }
  const get=id=>typeof id==='string'?read(q.get.get(id)):null;
  function update(user,run,action,changes){
    const next={...run,...changes,version:run.version+1};
    q.update.run(JSON.stringify(next),run.id); audit(user,run.id,action,run,next);
    return {run:next};
  }
  function bankRows(book,period,account){
    const first=period+'-01';
    return Array.from({length:12},(_,i)=>{
      const month=i+1, statement=Bank.get(book,month,account);
      return (statement?.rows||[]).flatMap((row,index)=>row.date>=first&&!Enterprise.locked(book,row.date)&&row.amount<0&&!statement.matches[index]?
        [{month,index,...row}]:[]);
    }).flat();
  }
  function post(user,run,input){
    const stored=company.get(), data=JSON.parse(stored.data), book=data.ledger;
    if(input.revision!==stored.revision)conflict('銀行流水或帳本有更新，請重新載入銀行扣款再核對。');
    if(!book||String(book.company.year)!==run.period.slice(0,4)||!['HK$','HKD','$'].includes(book.company.cur))reject('請先使用同年度的港幣帳本。');
    if(run.status!=='published'||run.rows.some(row=>!run.confirmations[row.staffId]))conflict('每位員工確認糧單後才可過帳。');
    const date=endOf(run.period);
    if(Enterprise.locked(book,date))conflict('工資期間已鎖定，請先在月結工作台反結帳。');
    const account=input?.account;
    if(!Bank.accounts(book).some(a=>a.id===account))reject('請選擇付款銀行帳戶。');
    const selected=input?.rows;
    if(!Array.isArray(selected)||!selected.length||selected.length>250)reject('請勾選銀行實際扣款。');
    const candidates=new Map(bankRows(book,run.period,account).map(row=>[row.month+':'+row.index,row]));
    const matches=selected.map(id=>candidates.get(id));
    if(new Set(selected).size!==selected.length||matches.some(row=>!row||Enterprise.locked(book,row.date)))conflict('銀行流水已匹配、已鎖定或不存在，請重新核對。');
    if(matches.some(row=>row.date<date))reject('請選擇計提日期當日或之後的實際付款。');
    if(matches.reduce((sum,row)=>sum-row.amount,0)!==run.totals.net)reject('銀行實際付款合計與工資表實發淨薪不一致。');
    const next={...book,txns:[...book.txns]};
    next.seq=next.txns.reduce((max,t)=>Math.max(max,t.seq),next.seq||0);
    const make=(date,memo,group)=>{
      const seq=++next.seq,id='T'+seq;
      next.txns.push({id,seq,date,tpl:'custom',memo,ref:'PAY-'+run.period,adj:false,groups:[group]});return id;
    };
    // Aggregate payroll only. Individual payslips stay in the payroll tables.
    const {gross,net,employeeMpf,employerMpf}=run.totals, mpf=employeeMpf+employerMpf;
    const group=[{a:'6000',s:gross+employerMpf,fn:'admin'},{a:'2100',s:-net}];
    if(mpf)group.push({a:'2070',s:-mpf});
    const payable=-group.filter(line=>line.a==='2100').reduce((sum,line)=>sum+line.s,0);
    if(payable!==net||group.reduce((sum,line)=>sum+line.s,0)!==0)reject('薪金計提憑證與工資表不一致。');
    const accrual=make(date,run.period+' 工資及強積金計提',group), payments=[];
    // Keep a payable entry for each batch so the existing MPF payment workflow can clear it.
    const accrualTxn=next.txns.at(-1);
    accrualTxn.biz={v:1,events:[{kind:'open',ledger:'payroll',partyId:'PAYROLL',partyName:'工資批次',amount:net,dueDate:''}]};
    if(mpf)accrualTxn.biz.events.push({kind:'open',ledger:'mpfPayable',partyId:'PAYROLL',partyName:'工資批次',amount:mpf,dueDate:''});
    for(const row of matches){
      const bank={a:'1000',s:row.amount};
      if(account!==Bank.MAIN)bank.cashAccount=account;
      const id=make(row.date,run.period+' 工資付款',[{a:'2100',s:-row.amount},bank]);
      next.txns.at(-1).biz={v:1,events:[{kind:'apply',ledger:'payroll',allocations:[{id:accrual+':0',amount:-row.amount}]}]};
      payments.push(id);
      const statement=Bank.changeMatch(next,row.month,row.index,id,new Date().toISOString(),account);
      if(account===Bank.MAIN)next.bankReconciliation={...next.bankReconciliation,[row.month]:statement};
      else next.bankReconciliationByAccount={...next.bankReconciliationByAccount,[account]:{...next.bankReconciliationByAccount?.[account],[row.month]:statement}};
    }
    Business.validate(next);
    next.savedAt=Date.now();
    if(!companyWrite.run(JSON.stringify({...data,ledger:next}),next.savedAt,stored.revision).changes)conflict('公司帳本有更新，請重新核對。');
    return update(user,run,'post',{status:'posted',accrual,payments,net,bankAccount:account,bankEvidence:matches});
  }
  function own(user){
    return list().filter(run=>run.status!=='draft').flatMap(run=>run.rows.filter(row=>row.userId===Number(user.id)).map(row=>({
      id:run.id,period:run.period,company:run.company,status:run.status,publishedVersion:run.publishedVersion,confirmedAt:run.confirmations[row.staffId]||null,row
    })));
  }
  function checkPosted(before,after){
    if(!before)return;
    const posted=list().filter(run=>run.status==='posted');
    if(!posted.length)return;
    const old=new Map(before.txns.map(t=>[t.id,t])), next=new Map((after?.txns||[]).map(t=>[t.id,t]));
    for(const run of posted){
      if([run.accrual,...run.payments].some(id=>JSON.stringify(old.get(id))!==JSON.stringify(next.get(id))))conflict('已過帳的工資憑證已鎖定。');
      for(const [i,item] of run.bankEvidence.entries()){
        const s=Bank.get(after,item.month,run.bankAccount);
        const match=Object.entries(s?.matches||{}).find(([,match])=>match.id===run.payments[i]);
        const row=match&&s.rows[match[0]];
        if(!row||['date','memo','ref','amount'].some(k=>row[k]!==item[k]))conflict('已過帳工資的銀行流水及匹配已鎖定。');
      }
    }
  }
  function handle({user,method,sub,id,input}){
    const role=user.role, manage=['owner','accountant','hr'].includes(role);
    if(method==='GET'&&sub==='mine')return {slips:own(user),company:companyName()};
    if(method==='POST'&&sub==='confirm')return atomic(()=>{
      const run=get(id);
      const row=run?.rows.find(row=>row.userId===Number(user.id));
      if(!row||run.status==='draft')fail(404,'not_found','找不到此糧單。');
      if(run.confirmations[row.staffId])return {confirmedAt:run.confirmations[row.staffId]};
      if(run.publishedVersion!==input?.publishedVersion)conflict('糧單有更新，請重新載入核對。');
      const confirmedAt=Date.now();
      update(user,run,'confirm',{confirmations:{...run.confirmations,[row.staffId]:confirmedAt}});
      return {confirmedAt};
    });
    if(!manage)fail(403,'role_required','此帳號沒有薪酬管理權限。');
    if(method==='GET'&&!sub)return {staff:q.staff.all().map(read),runs:list(),company:companyName()};
    if(method==='GET'&&sub==='history'&&get(id))return {history:q.history.all(id).map(e=>({...e,before:JSON.parse(e.before),after:JSON.parse(e.after)}))};
    if(method==='GET'&&sub==='bank'&&role==='accountant'){
      const run=get(id), stored=company.get(), book=JSON.parse(stored.data).ledger;
      if(!run||!book)return {accounts:[],rows:[]};
      const accounts=Bank.accounts(book).map(({id,name})=>({id,name}));
      return {accounts,revision:stored.revision,rows:accounts.some(a=>a.id===input.account)?bankRows(book,run.period,input.account):[]};
    }
    if(method!=='POST')fail(404,'not_found','找不到此操作。');
    if(role==='owner')fail(403,'read_only','管理層可查看工資表，請由 HR 或會計處理。');
    return atomic(()=>{
      if(sub==='staff')return staffSave(user,input);
      if(sub==='draft')return draftSave(user,input);
      const run=get(id);
      if(!run)fail(404,'not_found','找不到工資批次。');
      if(input?.version!==run.version)conflict('工資批次已更新，請重新載入。');
      if(sub==='publish'&&run.status==='draft'){
        if(run.rows.some(row=>{const staff=read(q.employee.get(row.staffId));return !staff?.active||row.userId===null||row.userId!==staff.userId;}))reject('每位員工都需要綁定自己的登入帳號。資料有變動時，請先重新儲存草稿。');
        const company=companyName();
        if(!company)reject('請先由會計建立公司帳本，確認糧單的僱主名稱。');
        return update(user,run,'publish',{company,status:'published',publishedAt:Date.now(),publishedVersion:run.version+1});
      }
      if(sub==='withdraw'&&run.status==='published'&&!Object.keys(run.confirmations).length)return update(user,run,'withdraw',{status:'draft',publishedAt:null});
      if(sub==='post'&&role==='accountant')return post(user,run,input);
      conflict('目前狀態或角色不能執行此操作。');
    });
  }
  return {handle,checkPosted};
}

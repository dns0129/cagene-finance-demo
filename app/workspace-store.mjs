import { openDatabase, randomBytes, randomInt, randomUUID, tokenHash, derive, timingSafeEqual, fromHex } from './workspace-platform.mjs';
import { parseLines, invoiceSummary, Invoices, Business, Enterprise } from './ledger-core.mjs';
import { createPayrollStore } from './payroll-store.mjs';

const DAY=86_400_000, SESSION=7*DAY;
const COOKIE='acct_session', MAX_BODY=24*1024*1024;
const empty=()=>({ledger:null,draft:null,recovery:null,folders:[],reports:[]});
// One company per system: the books, folders and reports are shared; each person keeps their own unsaved draft.
const ROLES=['owner','accountant','sales','hr','employee'], BOOK_ROLES=['owner','accountant'];
const companyEmpty=()=>({ledger:null,folders:[],reports:[]});
const companyPart=s=>({ledger:s.ledger,folders:s.folders,reports:s.reports});
const personalPart=s=>({draft:s.draft??null,recovery:s.recovery??null});
const validDay=x=>typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x+'T00:00:00Z')) && new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const object=x=>!!x && typeof x==='object' && !Array.isArray(x);
class WorkspaceError extends Error {
  constructor(status,code,message) { super(message); Object.assign(this,{status,code}); }
}
const fail=(status,code,message)=>{ throw new WorkspaceError(status,code,message); };
const invalid=()=>fail(400,'invalid_state','空间资料格式不正确。');
const validId=x=>typeof x==='string' && /^[a-f0-9-]{36}$/.test(x);
const named=(x,max)=>typeof x==='string' && !!x.trim() && x.length<=max;
const exact=(x,fields)=>Object.keys(x).every(k=>fields.includes(k));
const normalized=x=>typeof x==='string'?x.trim().toLowerCase():'';
const validEmail=x=>x.length<=254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);
const validUsername=x=>/^[a-z0-9][a-z0-9._-]{2,31}$/.test(x);
const validPassword=x=>typeof x==='string' && x.length>=12 && x.length<=128;
const userColumns=`
  id INTEGER PRIMARY KEY,
  email TEXT COLLATE NOCASE UNIQUE, username TEXT COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  CHECK (email IS NOT NULL OR username IS NOT NULL)
`;

function migrateUsers(db) {
  const legacy=()=>!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='username');
  if(!legacy())return;
  // Keep primary keys intact: spaces and active sessions both point to users.id.
  db.exec('PRAGMA foreign_keys=OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    if(legacy()){
      db.exec(`
        CREATE TABLE users_with_login (${userColumns});
        INSERT INTO users_with_login(id,email,name,salt,password_hash)
          SELECT id,email,name,salt,password_hash FROM users;
        DROP TABLE users;
        ALTER TABLE users_with_login RENAME TO users;
      `);
      if(db.prepare('PRAGMA foreign_key_check').get()) throw new Error('账号迁移未通过完整性检查');
    }
    db.exec('COMMIT');
  } catch(error) {
    if(db.isTransaction)db.exec('ROLLBACK');
    throw error;
  } finally {db.exec('PRAGMA foreign_keys=ON');}
}
function validateState(s) {
  if (!object(s) || !exact(s,['ledger','draft','recovery','folders','reports']) ||
      !(s.ledger===null || object(s.ledger) && s.ledger.v===1 && object(s.ledger.company) && Array.isArray(s.ledger.txns) && object(s.ledger.opening)) ||
      !(s.draft===null || object(s.draft)) || !(s.recovery===null || object(s.recovery)) ||
      !Array.isArray(s.folders) || s.folders.length>120 || !Array.isArray(s.reports) || s.reports.length>300) invalid();
  const ids=new Set();
  for (const f of s.folders) {
    if (!object(f) || !exact(f,['id','name','updatedAt']) || !validId(f.id) || ids.has(f.id) || !named(f.name,80) || !Number.isSafeInteger(f.updatedAt)) invalid();
    ids.add(f.id);
  }
  const reportIds=new Set();
  for (const r of s.reports) {
    if (!object(r) || !exact(r,['id','folderId','updatedAt','draft']) || !validId(r.id) || reportIds.has(r.id) ||
        !(r.folderId===null || ids.has(r.folderId)) || !Number.isSafeInteger(r.updatedAt) || !object(r.draft) ||
        !exact(r.draft,['v','title','period','currency','notes','rows']) || r.draft.v!==1 ||
        ![['title',120],['period',120],['currency',6],['notes',5000]].every(([k,max])=>typeof r.draft[k]==='string' && r.draft[k].length<=max) ||
        !Array.isArray(r.draft.rows) || r.draft.rows.length>500) invalid();
    const rows=new Set();
    for(const item of r.draft.rows){
      if(!object(item) || !exact(item,['id','kind','name','amount','note']) || typeof item.id!=='string' || !/^[\w-]{1,80}$/.test(item.id) ||
        rows.has(item.id) || !['income','cost','expense','other','tax'].includes(item.kind) ||
        ![['name',200],['amount',40],['note',200]].every(([k,max])=>typeof item[k]==='string' && item[k].length<=max)) invalid();
      rows.add(item.id);
    }
    reportIds.add(r.id);
  }
}
async function body(req,max) {
  let length=0; const chunks=[];
  for await (const chunk of req) {
    length+=chunk.length;
    if(length>max) fail(413,'too_large','数据超过空间单次保存上限，请先导出备份并减少附件。');
    chunks.push(chunk);
  }
  try { return JSON.parse(await new Blob(chunks).text()); }
  catch { fail(400,'bad_json','请求格式无效。'); }
}

// What changed in the books, for the audit log: voucher ids added, edited and removed, plus other ledger settings.
function ledgerChanges(before,after){
  const old=new Map((before?.txns||[]).map(t=>[t.id,JSON.stringify(t)]));
  const added=[],changed=[];
  for(const t of after?.txns||[]){
    const previous=old.get(t.id);
    if(previous===undefined)added.push(t.id);
    else { if(previous!==JSON.stringify(t))changed.push(t.id); old.delete(t.id); }
  }
  const removed=[...old.keys()];
  const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);
  const settings=[...keys].filter(k=>!['txns','savedAt','seq'].includes(k) && JSON.stringify(before?.[k])!==JSON.stringify(after?.[k]));
  const cap=list=>list.slice(0,100);
  return {count:added.length+changed.length+removed.length+settings.length,
    detail:{added:cap(added),changed:cap(changed),removed:cap(removed),settings,totals:[added.length,changed.length,removed.length]}};
}
const requestRow=r=>({id:r.id,status:r.status,data:JSON.parse(r.data),createdAt:r.created_at,updatedAt:r.updated_at,reviewNote:r.review_note,reviewedAt:r.reviewed_at});
// A salesperson's invoice request. Lines are checked by the same parser the invoice form uses.
function requestInput(input){
  if(!object(input)) fail(400,'invalid_request','发票申请格式不正确。');
  const text=(k,max,label,required=true)=>{
    const v=typeof input[k]==='string'?input[k].trim():'';
    if(required && !v) fail(400,'invalid_request',`请填写${label}。`);
    if(v.length>max) fail(400,'invalid_request',`${label}最多 ${max} 个字符。`);
    return v;
  };
  const partyId=text('partyId',80,'客户编号'), partyName=text('partyName',80,'客户名称'), date=text('date',10,'开票日期');
  const dueDate=text('dueDate',10,'到期日',false), note=text('note',500,'备注',false);
  if(!validDay(date)) fail(400,'invalid_request','开票日期格式不正确。');
  if(dueDate && (!validDay(dueDate) || dueDate<date)) fail(400,'invalid_request','到期日不能早于开票日期。');
  let parsed,header;
  try { header=Invoices.invoiceHeader(input);parsed=parseLines(Array.isArray(input.lines)?input.lines:[]); }
  catch(error){ fail(400,'invalid_request',String(error?.message||'发票明细格式不正确。')); }
  return {partyId,partyName,date,dueDate,note,...header,lines:parsed.lines,total:parsed.total};
}

function populateDemo(db, fixture) {
  const now=Date.now();
  const user=db.prepare('INSERT INTO users(id,username,name,salt,password_hash) VALUES(?,?,?,?,?)');
  const member=db.prepare('INSERT INTO members VALUES(?,?,?)');
  for(const {id,username,name,role} of fixture.members){
    user.run(id,username,name,'','');
    member.run(id,role,now);
  }
  db.prepare('UPDATE company SET revision=?,data=?,updated_at=? WHERE id=1')
    .run(randomInt(1,2**44),JSON.stringify({...companyEmpty(),ledger:fixture.ledger}),now);
  const customer=db.prepare('INSERT INTO sales_customers VALUES(?,?,?)');
  for(const row of fixture.customers)customer.run(row.user_id,row.customer_id,JSON.stringify(row.data));
  const request=db.prepare('INSERT INTO invoice_requests VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(const [index,row] of fixture.requests.entries()){
    const timestamp=now-fixture.requests.length+index;
    request.run(row.id,row.user_id,row.status,JSON.stringify(row.data),timestamp,timestamp,
      row.reviewer_id,row.review_note,row.reviewer_id===null?null:timestamp,row.txn_id);
  }
  const staff=db.prepare('INSERT INTO payroll_staff VALUES(?,?,?)');
  for(const row of fixture.staff)staff.run(row.id,row.userId,JSON.stringify(row));
  const payroll=db.prepare('INSERT INTO payroll_runs VALUES(?,?,?)');
  for(const row of fixture.payroll)payroll.run(row.id,row.period,JSON.stringify(row));
  const audit=db.prepare('INSERT INTO payroll_audit(run_id,at,user_id,name,action,before,after) VALUES(?,?,?,?,?,?,?)');
  for(const row of fixture.payrollAudit)
    audit.run(row.run_id,row.at,row.user_id,row.name,row.action,JSON.stringify(row.before),JSON.stringify(row.after));
}

export function createWorkspace({file=':memory:', publicOrigin='', allowSignup=true, ownerReadOnly=false,demo=null,database=null}={}) {
  const origin=publicOrigin?new URL(publicOrigin).origin:'';
  if (origin && !origin.startsWith('https://')) throw new Error('ACCOUNT_PUBLIC_ORIGIN 必须是 HTTPS 来源');
  if(demo && file!==':memory:')throw new Error('演示样例只能载入独立的内存账套。');
  const db=database ?? openDatabase(file);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS users (${userColumns});
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
    CREATE TABLE IF NOT EXISTS spaces (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  migrateUsers(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('owner','accountant','sales','hr','employee')), created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS company (
      id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoice_requests (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')), data TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL, review_note TEXT NOT NULL DEFAULT '', reviewed_at INTEGER, txn_id TEXT
    );
    CREATE INDEX IF NOT EXISTS request_author ON invoice_requests(user_id);
    CREATE TABLE IF NOT EXISTS sales_customers (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, customer_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(user_id,customer_id)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, at INTEGER NOT NULL, user_id INTEGER, user_name TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL
    );
  `);
  const atomic=fn=>{
    db.exec('BEGIN IMMEDIATE');
    try { const result=fn(); db.exec('COMMIT'); return result; }
    catch(error) { if(db.isTransaction)db.exec('ROLLBACK'); throw error; }
  };
  atomic(()=>{
    const sql=db.prepare("SELECT sql FROM sqlite_master WHERE name='members'").get().sql;
    if(sql.includes("'hr'"))return;
    db.exec(`
      CREATE TABLE members_with_hr (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner','accountant','sales','hr','employee')), created_at INTEGER NOT NULL
      );
      INSERT INTO members_with_hr SELECT * FROM members;
      DROP TABLE members;
      ALTER TABLE members_with_hr RENAME TO members;
    `);
  });
  // Upgrade: the earliest account becomes the owner, and its books become the company books.
  atomic(()=>{
    if(db.prepare('SELECT 1 FROM company WHERE id=1').get())return;
    const owner=db.prepare("SELECT user_id AS id FROM members WHERE role='owner' ORDER BY user_id LIMIT 1").get()?.id ?? db.prepare('SELECT MIN(id) AS id FROM users').get()?.id;
    let revision=0, data=companyEmpty();
    if(owner!=null){
      const space=db.prepare('SELECT revision,data FROM spaces WHERE user_id=?').get(owner);
      if(space){revision=space.revision;data=companyPart(JSON.parse(space.data));}
      db.prepare("INSERT OR IGNORE INTO members VALUES(?,'owner',?)").run(owner,Date.now());
    }
    db.prepare('INSERT INTO company VALUES(1,?,?,?)').run(revision,JSON.stringify(data),Date.now());
  });
  const queries={
    byEmail:db.prepare('SELECT * FROM users WHERE email=?'),
    byUsername:db.prepare('SELECT * FROM users WHERE username=?'),
    byId:db.prepare('SELECT * FROM users WHERE id=?'),
    create:db.prepare('INSERT INTO users(email,username,name,salt,password_hash) VALUES(?,?,?,?,?)'),
    bindUsername:db.prepare('UPDATE users SET username=? WHERE id=? AND username IS NULL'),
    session:db.prepare('SELECT u.id,u.name,u.email,u.username,m.role FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN members m ON m.user_id=u.id WHERE s.hash=? AND s.expires>?'),
    sessionAdd:db.prepare('INSERT INTO sessions VALUES(?,?,?)'),
    revoke:db.prepare('DELETE FROM sessions WHERE hash=?'),
    prune:db.prepare('DELETE FROM sessions WHERE expires<=?'),
    state:db.prepare('SELECT revision,data,updated_at FROM spaces WHERE user_id=?'),
    stateInit:db.prepare('INSERT OR IGNORE INTO spaces VALUES(?,0,?,0)'),
    personalWrite:db.prepare('UPDATE spaces SET data=?,updated_at=? WHERE user_id=?'),
    role:db.prepare('SELECT role FROM members WHERE user_id=?'),
    owners:db.prepare("SELECT COUNT(*) AS n FROM members WHERE role='owner'"),
    memberSet:db.prepare('INSERT INTO members(user_id,role,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role'),
    memberDrop:db.prepare('DELETE FROM members WHERE user_id=?'),
    people:db.prepare('SELECT u.id,u.name,u.email,u.username,m.role FROM users u LEFT JOIN members m ON m.user_id=u.id ORDER BY m.role IS NULL, u.id'),
    company:db.prepare('SELECT revision,data,updated_at FROM company WHERE id=1'),
    companyWrite:db.prepare('UPDATE company SET revision=revision+1,data=?,updated_at=? WHERE id=1 AND revision=?'),
    revokeUser:db.prepare('DELETE FROM sessions WHERE user_id=?'),
    revokeOthers:db.prepare('DELETE FROM sessions WHERE user_id=? AND hash<>?'),
    setPassword:db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?'),
    salesCustomers:db.prepare('SELECT data FROM sales_customers WHERE user_id=? ORDER BY customer_id'),
    customerAdd:db.prepare('INSERT INTO sales_customers VALUES(?,?,?)'),
    requestAdd:db.prepare("INSERT INTO invoice_requests(id,user_id,status,data,created_at,updated_at) VALUES(?,?,'pending',?,?,?)"),
    requestGet:db.prepare('SELECT * FROM invoice_requests WHERE id=?'),
    requestMine:db.prepare('SELECT * FROM invoice_requests WHERE user_id=? ORDER BY created_at DESC'),
    requestOpen:db.prepare("SELECT COUNT(*) AS n FROM invoice_requests WHERE user_id=? AND status<>'approved'"),
    requestQueue:db.prepare(`SELECT r.*,u.name AS requester,v.name AS reviewer FROM invoice_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users v ON v.id=r.reviewer_id
      WHERE r.status='pending' OR r.reviewed_at>? ORDER BY r.status='pending' DESC, r.updated_at DESC LIMIT 200`),
    requestAuthors:db.prepare(`SELECT r.id AS requestId,u.id,u.name FROM invoice_requests r
      JOIN users u ON r.user_id=u.id WHERE r.status='approved'`),
    requestEdit:db.prepare("UPDATE invoice_requests SET data=?,status='pending',updated_at=MAX(?,updated_at+1),review_note='',reviewer_id=NULL,reviewed_at=NULL WHERE id=? AND user_id=? AND status IN ('pending','rejected')"),
    requestDrop:db.prepare("DELETE FROM invoice_requests WHERE id=? AND user_id=? AND status IN ('pending','rejected')"),
    requestReview:db.prepare("UPDATE invoice_requests SET status=?,reviewer_id=?,review_note=?,reviewed_at=?,txn_id=?,updated_at=? WHERE id=? AND status='pending'"),
    audit:db.prepare('INSERT INTO audit(at,user_id,user_name,action,detail) VALUES(?,?,?,?,?)'),
    auditList:db.prepare('SELECT at,user_name,action,detail FROM audit ORDER BY id DESC LIMIT 300'),
  };
  const limits=new Map(), dummy=randomBytes(16);
  let hashing=0;
  async function passwordHash(password,salt) {
    if(hashing>=3) fail(429,'busy','登录请求较多，请稍后重试。');
    hashing++;
    try { return await derive(password,salt,64,{N:2**17,r:8,p:1,maxmem:150*1024*1024}); }
    finally { hashing--; }
  }
  function charge(key,max) {
    const now=Date.now(), current=limits.get(key);
    if(current && current.until>now) {
      if(current.count>=max) fail(429,'rate_limit','尝试次数过多，请稍后再试。');
      current.count++;
    } else {
      if(limits.size>=2000) for(const [k,v] of limits) if(v.until<=now) limits.delete(k);
      if(limits.size>=2000) fail(429,'rate_limit','请求较多，请稍后再试。');
      limits.set(key,{count:1,until:now+15*60*1000});
    }
  }
  const publicUser=({name,email,username,id,role})=>({name,email,username,id:String(id),role:role||null,...(role==='owner'&&ownerReadOnly?{readOnly:true}:{})});
  const record=(user,action,detail={})=>queries.audit.run(Date.now(),user?Number(user.id):null,user?.name||'',action,JSON.stringify(detail));
  const payroll=createPayrollStore({db,atomic,fail,record,company:queries.company,companyWrite:queries.companyWrite,userByLogin:id=>lookup(id)});
  if(demo){
    try { atomic(()=>{if(!db.prepare('SELECT id FROM users LIMIT 1').get())populateDemo(db,demo.fixture);}); }
    catch(error){db.close();throw error;}
  }
  function ownCustomers(user){
    const current=new Map(queries.salesCustomers.all(user.id).map(({data})=>{const customer=JSON.parse(data);return [normalized(customer.id),customer];}));
    for(const own of queries.requestMine.all(user.id)){
      const {partyId:id,partyName:name}=JSON.parse(own.data), key=normalized(id);
      if(!current.has(key))current.set(key,{id,name});
    }
    return [...current.values()];
  }
  function saveCustomer(user,id,name){
    const key=normalized(id), present=ownCustomers(user).find(x=>normalized(x.id)===key);
    if(present && present.name!==name)fail(409,'customer_exists','此客戶編號已對應另一個名稱，請核對編號。');
    if(!present){queries.customerAdd.run(user.id,key,JSON.stringify({id,name}));record(user,'sales.customer',{customer:id,name});}
    return {id:present?.id||id,name};
  }
  async function storePassword(id,password){
    const salt=randomBytes(16), result=await passwordHash(password,salt);
    queries.setPassword.run(salt.toString('hex'),result.toString('hex'),id);
  }
  async function createAccount({email='',username='',name,password}){
    if(registered(email,username))duplicate();
    const salt=randomBytes(16), result=await passwordHash(password,salt);
    try {
      const {lastInsertRowid:id}=queries.create.run(email||null,username||null,name,salt.toString('hex'),result.toString('hex'));
      return {id:Number(id),email:email||null,username:username||null,name};
    } catch(error){ if(registered(email,username))duplicate(); throw error; }
  }
  const lookup=identifier=>identifier.includes('@')?queries.byEmail.get(identifier):queries.byUsername.get(identifier);
  const registered=(email,username)=>!!((email && queries.byEmail.get(email)) || (username && queries.byUsername.get(username)));
  const duplicate=()=>fail(409,'duplicate','用户名或邮箱已被使用。');
  async function verifyPassword(account,password,identifier='') {
    const key=account?'user:'+account.id:'login:'+identifier;
    charge(key,10);
    const result=await passwordHash(password,account?fromHex(account.salt):dummy);
    if(!account || !timingSafeEqual(result,fromHex(account.password_hash)))
      fail(401,'bad_login','账号或密码不正确。');
    limits.delete(key);
  }
  function requireJSON(req) {
    if(!/^application\/json\b/i.test(req.headers['content-type']||'')) fail(400,'bad_json','请求必须使用 JSON。');
  }
  // An invoice that first appears in the books with inv.request approves that request, in the same write.
  function approveRequests(before,after,user,now){
    const links=ledger=>{
      const map=new Map();
      for(const t of ledger?.txns||[]){
        const id=t?.inv?.request;
        if(id===undefined)continue;
        if(!validId(id)) invalid();
        if(map.has(id)) fail(409,'request_duplicate','同一张发票申请不能过账两次。');
        map.set(id,t);
      }
      return map;
    };
    const old=links(before);
    for(const [id,txn] of links(after)){
      if(old.has(id))continue;
      const row=queries.requestGet.get(id);
      if(!row || row.status!=='pending') fail(409,'request_state','这张发票申请已被处理或撤回，请刷新后重试。');
      if(row.user_id===Number(user.id)) fail(403,'self_review','录入和审批须由不同的人完成。');
      queries.requestReview.run('approved',user.id,'',now,String(txn.id),now,id);
      record(user,'request.approve',{request:id,txn:txn.id,no:txn.inv?.no||'',requester:queries.byId.get(row.user_id)?.name||''});
    }
  }
  function postInvoices(user,input){
    const ids=input?.ids, period=input?.period, account=input?.account;
    if(!Array.isArray(ids)||ids.length<1||ids.length>200||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length||
       typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!Object.hasOwn(Invoices.REVENUE,account)||input.wonderChecked!==true||!object(input.versions)||ids.some(id=>!Number.isSafeInteger(input.versions[id])))
      fail(400,'batch_invalid','請選擇當月發票及收入科目，並確認已核對 Wonder。');
    return atomic(()=>{
      const stored=queries.company.get(), data=JSON.parse(stored.data), book=data.ledger;
      if(!book||String(book.company.year)!==period.slice(0,4))fail(400,'batch_period','請先建立同一年度的公司帳本。');
      if(book.chart?.accounts?.[account]?.hidden)fail(400,'batch_account','請選擇啟用中的收入科目。');
      const next={...book,txns:[...book.txns]};
      next.seq=next.txns.reduce((max,t)=>Math.max(max,t.seq),next.seq||0);
      const posted=[];
      for(const id of ids){
        const row=queries.requestGet.get(id);
        if(!row||row.status!=='pending'||row.updated_at!==input.versions[id])fail(409,'request_state','有發票已被處理或修改，整批未過帳。請重新載入。');
        if(row.user_id===Number(user.id))fail(403,'self_review','製單人不能審批自己的發票。');
        const entry=JSON.parse(row.data);
        if(!entry.date.startsWith(period+'-')||Enterprise.locked(book,entry.date))fail(409,'batch_period','有發票不在所選月份或期間已鎖定，整批未過帳。');
        const no=Invoices.nextNumber(next), seq=++next.seq, txnId='T'+seq;
        const {partyId,partyName,date,dueDate,lines,total,note}=entry;
        next.txns.push({id:txnId,seq,date,tpl:'salesInvoice',memo:'銷售發票 '+no+' · '+partyName,ref:no,party:partyName,adj:false,
          p:{invNo:no,account,partyId,partyName,dueDate,lines:JSON.stringify(lines.map(Invoices.formLine))},
          memoUser:'',...(note?{note}:{}),groups:[[{a:'1100',s:total},{a:account,s:-total}]],
          biz:{v:1,events:[{kind:'open',ledger:'receivable',partyId,partyName,amount:total,dueDate}]},
          inv:{v:1,no,account,...Invoices.invoiceHeader(entry),lines,request:id}});
        posted.push({id:txnId,no});
      }
      try { Invoices.validate(next); Business.validate(next); }
      catch(error){ fail(400,'batch_validation',error.message); }
      const now=Date.now(); next.savedAt=now;
      approveRequests(book,next,user,now);
      if(!queries.companyWrite.run(JSON.stringify({...data,ledger:next}),now,stored.revision).changes)fail(409,'conflict','公司帳本有更新，請重新核對。');
      record(user,'invoice.batch',{period,count:posted.length,vouchers:posted.map(x=>x.id)});
      return {posted};
    });
  }
  // A salesperson sees only their own requests, and for approved ones the invoice's live status.
  function salesView(user){
    const book=JSON.parse(queries.company.get().data).ledger, today=new Date().toISOString().slice(0,10);
    const posted=new Map();
    for(const t of book?.txns||[]) if(typeof t?.inv?.request==='string') posted.set(t.inv.request,t.id);
    const live=new Map(invoiceSummary(book,today).map(x=>[x.id,x]));
    const requests=queries.requestMine.all(user.id).map(r=>{
      const x=live.get(posted.get(r.id));
      return {...requestRow(r),invoice:x?{print:x.print,id:x.id,no:x.no,date:x.date,dueDate:x.dueDate,amount:x.amount,balance:x.balance,settled:x.settled,status:x.status,overdueDays:x.overdueDays}:null};
    });
    return {company:book?{name:book.company?.name||'',cur:book.company?.cur||'',year:book.company?.year||null}:null,customers:ownCustomers(user),requests};
  }
  // Browsers keep cookies per host, not per port, so two servers on one computer (the books on 8800, the demo
  // on 3001) would overwrite each other's login. A local server names its cookie after its port; a public site
  // keeps the plain name. Locally the plain name is still read, so logins from before this change keep working.
  const cookieNames=url=>demo?[demo.cookieName]:origin?[COOKIE]:[`${COOKIE}_${url.port||'80'}`,COOKIE];
  const cookie=(name,value,max)=>`${name}=${value}; Path=${demo?'/api/demo/':'/'}; HttpOnly; SameSite=Strict; Max-Age=${max}${origin?'; Secure':''}`;
  const readCookie=(req,name)=>req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([\\da-f]{64})(?:;|$)`))?.[1];
  return {
    publicOrigin:origin,
    close:()=>db.close(),
    openDemoSession(role,previousToken,maxAge){
      if(!demo)throw new Error('此账套不支持免密码演示。');
      const sample=demo.fixture.members.find(member=>member.role===role);
      if(!sample)throw new Error('找不到该演示角色。');
      const secret=randomBytes(32).toString('hex');
      atomic(()=>{
        if(previousToken)queries.revoke.run(tokenHash(previousToken));
        queries.sessionAdd.run(tokenHash(secret),sample.id,Date.now()+maxAge*1000);
      });
      return {secret,cookie:cookie(demo.cookieName,secret,maxAge),user:publicUser({...sample,email:null})};
    },
    // Used by scripts/add-member.mjs to create the owner on a public site where sign-up is closed.
    async addMember({username,name,password,role}){
      username=normalized(username);
      if(!validUsername(username)) throw new Error('用户名为 3–32 位字母、数字、点、下划线或短横线，以字母或数字开头。');
      if(!named(name||'',60)) throw new Error('请输入不超过 60 字的姓名。');
      if(!ROLES.includes(role)) throw new Error('角色须为 owner、accountant、sales、hr 或 employee。');
      if(!validPassword(password)) throw new Error('密码须为 12–128 个字符。');
      const account=await createAccount({username,name:name.trim(),password});
      queries.memberSet.run(account.id,role,Date.now());
      record(null,'member.add',{member:account.id,name:account.name,username,role,by:'command line'});
      return publicUser({...account,role});
    },
    async handle(req,res,url,send) {
      try {
        const expected=origin || url.origin;
        if ((!origin && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) ||
            (req.headers.origin && req.headers.origin!==expected) ||
            (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) ||
            req.headers['x-account-workspace']!=='1') fail(403,'forbidden','请通过当前站点操作个人空间。');
        const route=url.pathname.slice('/api/workspace/'.length), method=req.method;
        const names=cookieNames(url), raws=names.map(n=>readCookie(req,n)), raw=raws.find(Boolean);
        const hash=raw?tokenHash(raw):null;
        const user=hash?queries.session.get(hash,Date.now()):null;
        if (route==='session' && method==='GET') { send(200,{user:user?publicUser(user):null,allowSignup});return; }
        // A tab from an old login must not act on a different account's new cookie.
        const [area,sub,third]=route.split('/');
        if (user && ['state','logout','username','password','members','audit','requests','sales','payroll'].includes(area) && req.headers['x-workspace-user']!==String(user.id))
          fail(409,'account_changed','此浏览器的登录账号已变化。请先导出本页改动，再刷新。');
        if (route==='logout' && method==='POST') {
          // End the session under either name, or the older cookie would sign the user straight back in.
          for (const r of new Set(raws.filter(Boolean))) queries.revoke.run(tokenHash(r));
          res.setHeader('Set-Cookie',names.map(n=>cookie(n,'',0)));send(200,{user:null});return;
        }
        if ((route==='login' || route==='register') && method==='POST') {
          if(demo)fail(403,'demo_auth','演示账套使用免密码入口。');
          if(user) fail(409,'already_signed_in','请先退出当前账号。');
          if(route==='register' && !allowSignup) fail(403,'signup_closed','当前站点未开放注册。');
          requireJSON(req);
          charge('ip:'+req.socket.remoteAddress,35);
          const input=await body(req,4096);
          const password=input?.password;
          if(!validPassword(password))fail(400,'credentials','密码须为 12–128 个字符。');
          let account;
          if(route==='login') {
            const identifier=normalized(input?.identifier ?? input?.email ?? input?.username);
            if(!validEmail(identifier) && !validUsername(identifier)) fail(400,'credentials','请输入有效的用户名或邮箱。');
            account=lookup(identifier);
            await verifyPassword(account,password,identifier);
          } else {
            const email=normalized(input?.email), username=normalized(input?.username);
            if((!email && !username) || (email && !validEmail(email)) || (username && !validUsername(username)))
              fail(400,'credentials','请填写有效邮箱或用户名。用户名为 3–32 位字母、数字、点、下划线或短横线，以字母或数字开头。');
            const name=(typeof input?.name==='string'?input.name.trim():'') || username || email.split('@')[0].slice(0,60);
            if(!named(name,60)) fail(400,'invalid_name','请输入不超过 60 字的显示名称。');
            account=await createAccount({email,username,name,password});
            // The first person to set up the system owns it; later sign-ups wait for the owner to grant a role.
            atomic(()=>{ if(!queries.owners.get().n) queries.memberSet.run(account.id,'owner',Date.now()); });
          }
          account={...account,role:queries.role.get(account.id)?.role};
          queries.prune.run(Date.now());
          if(hash)queries.revoke.run(hash);
          const secret=randomBytes(32).toString('hex');
          queries.sessionAdd.run(tokenHash(secret),account.id,Date.now()+SESSION);
          res.setHeader('Set-Cookie',cookie(names[0],secret,SESSION/1000));send(200,{user:publicUser(account)});return;
        }
        if(!user) fail(401,'sign_in_required','请先登录个人空间。');
        // Every permission is decided here on the server; the page only hides what a role cannot use.
        const need=(...roles)=>{ if(!roles.includes(user.role)) fail(403,'forbidden_role',user.role?'当前账号没有此操作的权限。':'账号尚未分配权限，请联系老板。'); };
        const still=()=>{
          const now=queries.session.get(hash,Date.now());
          if(!now) fail(401,'sign_in_required','登录已过期，请重新登录。');
          if(now.role!==user.role) fail(409,'role_changed','账号权限已变更，请刷新页面。');
        };
        if(area==='payroll'){
          need(...ROLES);
          const input=method==='POST'?(requireJSON(req),await body(req,512*1024)):{account:url.searchParams.get('account')};
          still();
          send(200,payroll.handle({user,method,sub,id:third,input}));return;
        }
        if(route==='username' && method==='POST'){
          requireJSON(req);
          if(user.username)fail(409,'username_exists','当前账号已设置用户名。');
          charge('ip:'+req.socket.remoteAddress,35);
          const input=await body(req,4096), username=normalized(input?.username);
          if(!validUsername(username))fail(400,'invalid_username','用户名为 3–32 位字母、数字、点、下划线或短横线，以字母或数字开头。');
          if(!validPassword(input?.password))fail(400,'credentials','请输入当前账号的密码。');
          await verifyPassword(queries.byId.get(user.id),input.password);
          if(!queries.session.get(hash,Date.now()))fail(401,'sign_in_required','登录已过期，请重新登录。');
          if(registered('',username))duplicate();
          let changes;
          try { ({changes}=queries.bindUsername.run(username,user.id)); }
          catch(error){if(registered('',username))duplicate();throw error;}
          if(!changes)fail(409,'username_exists','当前账号已设置用户名。');
          send(200,{user:publicUser({...queries.byId.get(user.id),role:user.role})});return;
        }
        if(route==='password' && method==='POST'){
          requireJSON(req);
          const input=await body(req,4096);
          if(!validPassword(input?.password)) fail(400,'credentials','新密码须为 12–128 个字符。');
          if(!validPassword(input?.current)) fail(400,'credentials','请输入当前密码。');
          await verifyPassword(queries.byId.get(user.id),input.current);
          still();
          await storePassword(user.id,input.password);
          queries.revokeOthers.run(user.id,hash);
          record(user,'password.change');
          send(200,{ok:true});return;
        }
        if(route==='state' && method==='GET') {
          need(...BOOK_ROLES);
          const c=queries.company.get(), mine=queries.state.get(user.id);
          send(200,{revision:c.revision,updatedAt:c.updated_at,state:{...JSON.parse(c.data),...personalPart(mine?JSON.parse(mine.data):{})}});return;
        }
        if(route==='state' && method==='PUT') {
          need(...(ownerReadOnly?['accountant']:BOOK_ROLES));
          if(!/^application\/json\b/i.test(req.headers['content-type']||'')) fail(400,'bad_json','请求必须使用 JSON。');
          const input=await body(req,MAX_BODY);
          if(!object(input)||!exact(input,['revision','state'])||!Number.isSafeInteger(input.revision)||input.revision<0) invalid();
          validateState(input.state);
          // Recheck after the async body read, so a revoked session or a changed role cannot finish a write.
          still();
          const now=Date.now(), next=JSON.stringify(companyPart(input.state)), personal=personalPart(input.state);
          const result=atomic(()=>{
            const current=queries.company.get();
            if(current.revision!==input.revision) fail(409,'conflict','同一空间已在其他页面更新。请备份本页改动后刷新，再核对资料。');
            let revision=current.revision, updatedAt=current.updated_at;
            if(next!==current.data){
              const before=JSON.parse(current.data), after=JSON.parse(next);
              payroll.checkPosted(before.ledger,after.ledger);
              approveRequests(before.ledger,after.ledger,user,now);
              if(!queries.companyWrite.run(next,now,input.revision).changes) fail(409,'conflict','同一空间已在其他页面更新。请备份本页改动后刷新，再核对资料。');
              revision++;updatedAt=now;
              const change=ledgerChanges(before.ledger,after.ledger);
              if(change.count || JSON.stringify([before.folders,before.reports])!==JSON.stringify([after.folders,after.reports]))
                record(user,'book.save',{...change.detail,library:JSON.stringify([before.folders,before.reports])!==JSON.stringify([after.folders,after.reports])});
            }
            queries.stateInit.run(user.id,JSON.stringify(empty()));
            const mine=JSON.parse(queries.state.get(user.id).data);
            if(JSON.stringify(personalPart(mine))!==JSON.stringify(personal)) queries.personalWrite.run(JSON.stringify({...mine,...personal}),now,user.id);
            return {revision,updatedAt};
          });
          send(200,result);return;
        }
        if(area==='members'){
          need('owner');
          if(!sub && method==='GET'){ send(200,{members:queries.people.all().map(publicUser)});return; }
          if(demo)fail(403,'demo_auth','演示角色已预设。');
          requireJSON(req);
          const input=await body(req,4096);
          if(!sub && method==='POST'){
            const username=normalized(input?.username), name=typeof input?.name==='string'?input.name.trim():'';
            if(!validUsername(username)) fail(400,'invalid_username','用户名为 3–32 位字母、数字、点、下划线或短横线，以字母或数字开头。');
            if(!named(name,60)) fail(400,'invalid_name','请输入不超过 60 字的姓名。');
            if(!ROLES.includes(input?.role)) fail(400,'invalid_role','请选择角色。');
            if(!validPassword(input?.password)) fail(400,'credentials','初始密码须为 12–128 个字符。');
            still();
            const account=await createAccount({username,name,password:input.password});
            queries.memberSet.run(account.id,input.role,Date.now());
            record(user,'member.add',{member:account.id,name,username,role:input.role});
            send(200,{member:publicUser({...account,role:input.role})});return;
          }
          const target=/^\d{1,12}$/.test(sub||'')?queries.byId.get(Number(sub)):null;
          if(!target) fail(404,'not_found','找不到这位成员。');
          if(!third && method==='PUT'){
            const role=input?.role===null?null:input?.role;
            if(role!==null && !ROLES.includes(role)) fail(400,'invalid_role','请选择角色。');
            still();
            atomic(()=>{
              const before=queries.role.get(target.id)?.role||null;
              if(before==='owner' && role!=='owner' && queries.owners.get().n<=1) fail(409,'last_owner','至少需要保留一位老板。');
              if(role)queries.memberSet.run(target.id,role,Date.now()); else queries.memberDrop.run(target.id);
              // A new role takes effect on next sign-in, so no open page keeps the old access.
              if(before!==role)queries.revokeUser.run(target.id);
              record(user,'member.role',{member:target.id,name:target.name,from:before,to:role});
            });
            send(200,{member:publicUser({...target,role})});return;
          }
          if(third==='password' && method==='POST'){
            if(target.id===Number(user.id)) fail(400,'self_password','请用「修改密码」更改自己的密码。');
            if(!validPassword(input?.password)) fail(400,'credentials','新密码须为 12–128 个字符。');
            still();
            await storePassword(target.id,input.password);
            queries.revokeUser.run(target.id);
            record(user,'member.password',{member:target.id,name:target.name});
            send(200,{ok:true});return;
          }
          fail(404,'not_found','未找到此操作。');
        }
        if(route==='audit' && method==='GET'){
          need(...BOOK_ROLES);
          send(200,{entries:queries.auditList.all().map(a=>({at:a.at,user:a.user_name,action:a.action,detail:JSON.parse(a.detail)}))});return;
        }
        if(area==='requests'){
          need(...BOOK_ROLES);
          if(!sub && method==='GET'){
            send(200,{
              requests:queries.requestQueue.all(Date.now()-30*DAY).map(r=>({...requestRow(r),requester:r.requester,reviewer:r.reviewer||'',txnId:r.txn_id||'',mine:r.user_id===Number(user.id)})),
              authors:queries.requestAuthors.all(),
            });return;
          }
          if(sub==='batch' && !third && method==='POST'){
            need('accountant'); requireJSON(req);
            const input=await body(req,32768); still();
            send(200,postInvoices(user,input));return;
          }
          if(validId(sub) && third==='reject' && method==='POST'){
            if(ownerReadOnly)need('accountant');
            requireJSON(req);
            const input=await body(req,4096), note=typeof input?.note==='string'?input.note.trim():'';
            if(!note || note.length>300) fail(400,'invalid_note','请填写退回原因（最多 300 字）。');
            still();
            atomic(()=>{
              const row=queries.requestGet.get(sub);
              if(!row || row.status!=='pending') fail(409,'request_state','这张申请已被处理或撤回，请刷新后重试。');
              if(row.user_id===Number(user.id)) fail(403,'self_review','录入和审批须由不同的人完成。');
              queries.requestReview.run('rejected',user.id,note,Date.now(),null,Date.now(),sub);
              record(user,'request.reject',{request:sub,note});
            });
            send(200,{ok:true});return;
          }
          fail(404,'not_found','未找到此操作。');
        }
        if(area==='sales'){
          need('sales');
          if(!sub && method==='GET'){ send(200,salesView(user));return; }
          if(route==='sales/customers' && method==='POST'){
            requireJSON(req);
            const input=await body(req,4096), id=input?.id?.trim?.(), name=input?.name?.trim?.();
            if(!named(id,80)||!named(name,80))fail(400,'invalid_customer','請填寫客戶編號和名稱（各最多 80 字）。');
            still();
            send(200,{customer:atomic(()=>saveCustomer(user,id,name))});return;
          }
          if(sub!=='requests') fail(404,'not_found','未找到此操作。');
          if(!third && method==='POST'){
            requireJSON(req);
            const data=requestInput(await body(req,65536));
            still();
            if(queries.requestOpen.get(user.id).n>=200) fail(429,'too_many','待审核或被退回的申请过多，请先处理现有申请。');
            const id=randomUUID(), now=Date.now();
            atomic(()=>{ saveCustomer(user,data.partyId,data.partyName); queries.requestAdd.run(id,user.id,JSON.stringify(data),now,now); record(user,'request.create',{request:id,customer:data.partyName,total:data.total}); });
            send(200,{id});return;
          }
          if(!validId(third)) fail(404,'not_found','找不到这张申请。');
          if(method==='PUT'){
            requireJSON(req);
            const data=requestInput(await body(req,65536));
            still();
            atomic(()=>{
              saveCustomer(user,data.partyId,data.partyName);
              if(!queries.requestEdit.run(JSON.stringify(data),Date.now(),third,user.id).changes) fail(409,'request_state','这张申请已审核通过，不能再修改。');
              record(user,'request.update',{request:third,customer:data.partyName,total:data.total});
            });
            send(200,{ok:true});return;
          }
          if(method==='DELETE'){
            still();
            atomic(()=>{
              if(!queries.requestDrop.run(third,user.id).changes) fail(409,'request_state','这张申请已审核通过，不能撤回。');
              record(user,'request.withdraw',{request:third});
            });
            send(200,{ok:true});return;
          }
        }
        fail(404,'not_found','未找到此操作。');
      } catch(error) {
        if(error instanceof WorkspaceError)send(error.status,{error:{code:error.code,message:error.message}});
        else send(500,{error:{code:'workspace_error',message:'个人空间暂不可用，请稍后重试。'}});
      }
    },
  };
}

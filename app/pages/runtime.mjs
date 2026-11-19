import {emptyDemo} from '../empty-demo.mjs';
import {createWorkspace} from '../workspace-store.mjs';

const asset=name=>new URL(name,import.meta.url).href;
async function script(name){
  const tag=document.createElement('script');
  const loaded=new Promise((resolve,reject)=>{tag.onload=resolve;tag.onerror=()=>reject(new Error('無法載入演示程式，請重新整理。'));});
  tag.src=asset(name);document.head.append(tag);await loaded;
}
const storage=new Promise((resolve,reject)=>{
  const open=indexedDB.open('cagene-finance-pages-v1',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('ledger');
  open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
});
const ready=Promise.all([
  script('vendor/sql-wasm.js').then(()=>window.initSqlJs({locateFile:()=>asset('vendor/sql-wasm.wasm')})),
  fetch(asset('../demo-data.json')).then(r=>{if(!r.ok)throw new Error('演示資料載入失敗');return r.json();}),
  script('vendor/sha256.min.js'),storage
]);

class DemoDatabase {
  constructor(engine,bytes){this.db=new engine.Database(bytes);}
  exec(sql){
    this.db.run(sql);
    if(/^BEGIN/i.test(sql))this.isTransaction=true;
    if(/^(COMMIT|ROLLBACK)/i.test(sql))this.isTransaction=false;
  }
  prepare(sql){
    const read=(args,first)=>{
      const statement=this.db.prepare(sql);
      try {
        statement.bind(args);
        if(first)return statement.step()?statement.getAsObject():undefined;
        const rows=[];
        while(statement.step())rows.push(statement.getAsObject());
        return rows;
      } finally {statement.free();}
    };
    return {get:(...args)=>read(args,true),all:(...args)=>read(args,false),run:(...args)=>{
      this.db.run(sql,args);
      return {changes:this.db.getRowsModified(),lastInsertRowid:this.db.exec('SELECT last_insert_rowid()')[0].values[0][0]};
    }};
  }
  close(){this.db.close();}
}

async function load(store){
  return new Promise((resolve,reject)=>{
    const req=store.transaction('ledger').objectStore('ledger').get('demo');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function save(store,data){
  return new Promise((resolve,reject)=>{
    const tx=store.transaction('ledger','readwrite');
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    tx.objectStore('ledger').put(data,'demo');
  });
}
const answer=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const failure=(status,message)=>answer(status,{error:{message}});
export async function request(path,options){
  const [engine,fixture,,store]=await ready;
  return navigator.locks.request('cagene-finance-pages-v1',async()=>{
    const current=await load(store);
    const enter=path==='/api/demo/enter',reset=path==='/api/demo/reset',clear=path==='/api/demo/clear';
    if(!current&&!enter)return path.endsWith('/session')?answer(200,{user:null,allowSignup:false}):failure(401,'請重新進入演示。');
    const db=new DemoDatabase(engine,(reset||clear)?undefined:current?.bytes);
    try {
      const origin=location.protocol==='https:'?location.origin:'';
      const ws=createWorkspace({database:db,publicOrigin:origin,allowSignup:false,ownerReadOnly:true,demo:{fixture:clear?emptyDemo(fixture):fixture,cookieName:'pages_demo'}});
      if(enter||reset||clear){
        const role=JSON.parse(options.body||'{}').role||'accountant';
        if(!fixture.members.some(row=>row.role===role))return failure(400,'未知角色');
        const session=ws.openDemoSession(role,current?.secret,12*3600);
        await save(store,{bytes:db.db.export(),secret:session.secret});
        return answer(200,{user:session.user});
      }
      const url=new URL(path.replace('/api/demo/workspace/','/api/workspace/'),location.origin);
      if(!url.pathname.startsWith('/api/workspace/'))return failure(404,'演示操作不存在。');
      const headers=Object.fromEntries(new Headers(options.headers));
      headers.cookie='pages_demo='+current.secret;
      const req={method:options.method,headers,async *[Symbol.asyncIterator](){if(options.body)yield new TextEncoder().encode(options.body);}};
      let result;
      await ws.handle(req,{setHeader(){}},url,(status,data)=>{result=answer(status,data);});
      if(result?.ok && options.method!=='GET')await save(store,{...current,bytes:db.db.export()});
      return result;
    } finally {db.close();}
  });
}

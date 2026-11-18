/* Linked open items for ordinary business vouchers. Values are integer cents. */
(() => {
'use strict';
const LEDGERS={
  receivable:{account:'1100',sign:1,party:'customer',label:'客户应收'},
  payable:{account:'2000',sign:-1,party:'supplier',label:'供应商应付'},
  staffAdvance:{account:'1150',sign:1,party:'employee',label:'员工借支'},
  staffPayable:{account:'2060',sign:-1,party:'employee',label:'员工报销应付'},
  supplierAdvance:{account:'1350',sign:1,party:'supplier',label:'预付供应商'},
  customerAdvance:{account:'2300',sign:-1,party:'customer',label:'预收客户'},
  payroll:{account:'2100',sign:-1,party:'employee',label:'应付员工工资'},
  mpfPayable:{account:'2070',sign:-1,party:'employee',label:'应付强积金'},
  profitsTax:{account:'2200',sign:-1,party:'taxOffice',label:'香港利得税应付'},
  taxPrepayment:{account:'1360',sign:1,party:'taxOffice',label:'香港税款预付'},
  deferredExpense:{account:'1300',sign:1,party:'supplier',label:'预付费用'},
  accruedExpense:{account:'2080',sign:-1,party:'supplier',label:'应计营业费用'},
  borrowing:{account:'2500',sign:-1,party:'lender',label:'长期借款本金'},
  loanInterest:{account:'2150',sign:-1,party:'lender',label:'借款应付利息'},
};
const key=x=>String(x ?? '').trim().normalize('NFKC').toLowerCase();
const compare=(a,b)=>a.date.localeCompare(b.date)||a.seq-b.seq;
const plus=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))throw new Error('往来金额合计超出允许范围');return n;};
const validDate=x=>typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const text=(x,max)=>typeof x==='string' && x.trim() && x.length<=max;
const marked=t=>t.biz?.v===1;
function money(value){
  const raw=String(value ?? '').trim();
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw))throw new Error('分配金额须为正数，最多两位小数');
  const [d,c='']=raw.replace(/,/g,'').split('.'), n=Number(d)*100+Number(c.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n<=0)throw new Error('分配金额须为正数，且不能过大');
  return n;
}
function parseAlloc(raw){
  let obj;
  try{obj=JSON.parse(raw||'{}');}catch(e){throw new Error('核销分配格式不正确');}
  if(!obj||Array.isArray(obj)||typeof obj!=='object')throw new Error('核销分配格式不正确');
  return Object.entries(obj).filter(([,v])=>String(v ?? '').trim()).map(([id,v])=>({id,amount:money(v)}));
}
function replay(book,through,check=true){
  const items=new Map(), identities=new Map();
  if(book.txns.some(t=>t.biz!=null&&!marked(t)))throw new Error('业务明细的版本无效');
  const txns=book.txns.filter(t=>marked(t)&&(!through||t.date<=through)).slice().sort(compare);
  for(const t of txns){
    if(!t.id||!Number.isSafeInteger(t.seq)||t.seq<1||!Array.isArray(t.biz.events)||!t.biz.events.length||t.biz.events.length>8)throw new Error('业务凭证的关联信息无效');
    const expected=new Map(), txnParties=new Map();
    const bind=(type,id)=>{const k=key(id),old=txnParties.get(type);if(old&&old!==k)throw new Error('同一笔凭证只能核销同一个往来对象');txnParties.set(type,k);};
    if(t.biz.contractId){const loan=items.get(t.biz.contractId);if(!loan||loan.ledger!=='borrowing')throw new Error('关联的借款合同不存在或晚于当前凭证');bind('lender',loan.partyId);}
    for(let i=0;i<t.biz.events.length;i++){
      const e=t.biz.events[i], spec=LEDGERS[e?.ledger];
      if(!spec)throw new Error('业务往来类型无效');
      let delta=0;
      if(e.kind==='open'){
        if(!text(e.partyId,80)||!text(e.partyName,80)||!Number.isSafeInteger(e.amount)||e.amount<=0||
          (e.dueDate && !validDate(e.dueDate)))throw new Error('往来单据缺少有效对象、金额或到期日');
        const partyKey=spec.party+'|'+key(e.partyId), old=identities.get(partyKey);
        if(old&&key(old)!==key(e.partyName))throw new Error(`${spec.label}编号 ${e.partyId} 的名称与已有凭证不一致`);
        identities.set(partyKey,e.partyName);
        bind(spec.party,e.partyId);
        const id=t.id+':'+i;
        items.set(id,{id,source:t,ledger:e.ledger,partyId:e.partyId,partyName:e.partyName,amount:e.amount,balance:e.amount,dueDate:e.dueDate||'',cashSettled:0,cashReturned:0,returned:0,applications:[],returns:[]});
        delta=spec.sign*e.amount;
      }else if(e.kind==='apply'){
        if(!Array.isArray(e.allocations)||!e.allocations.length||e.allocations.length>1000)throw new Error('请选择至少一笔待核销单据');
        let party='',total=0;const seen=new Set();
        for(const a of e.allocations){
          if(!a||typeof a.id!=='string'||seen.has(a.id)||!Number.isSafeInteger(a.amount)||a.amount<=0)throw new Error('核销单据或金额无效');
          seen.add(a.id);const sourceId=a.id.startsWith('$self:')?t.id+a.id.slice(5):a.id,item=items.get(sourceId);
          if(!item||item.ledger!==e.ledger)throw new Error('关联单据不存在、日期晚于核销日期或往来类型不一致');
          if(party&&party!==key(item.partyId))throw new Error('同一笔核销只能分配给同一个往来对象');
          party=key(item.partyId);bind(spec.party,item.partyId);item.balance=plus(item.balance,-a.amount);
          if(item.balance<0)throw new Error(`${spec.label}单据 ${item.source.id} 的核销金额超过未结余额`);
          if(t.groups.flat().some(l=>l.a==='1000'))item.cashSettled=plus(item.cashSettled,a.amount);
          item.applications.push({txn:t,amount:a.amount});total=plus(total,a.amount);
        }
        delta=-spec.sign*total;
      }else if(e.kind==='return'){
        const item=items.get(e.id);
        if(!item||item.ledger!==e.ledger)throw new Error('退款关联的原单据不存在或晚于退款日期');
        if(!Number.isSafeInteger(e.cancel)||!Number.isSafeInteger(e.cash)||e.cancel<0||e.cash<0||!e.cancel&&!e.cash)throw new Error('退款或冲减金额无效');
        const total=plus(e.cancel,e.cash);bind(spec.party,item.partyId);
        if(e.cancel>item.balance)throw new Error('冲减未结款超过原单据余额');
        if(e.cash>item.cashSettled-item.cashReturned)throw new Error('现金退款超过原单据已收付金额');
        const cashMovement=t.groups.flat().filter(l=>l.a==='1000').reduce((n,l)=>plus(n,l.s),0);
        if(cashMovement!==(e.ledger==='receivable'?-e.cash:e.cash))throw new Error('退款现金金额与凭证分录不一致');
        const contra=e.ledger==='receivable'?(t.tpl==='stockReturn'?'4000':t.tpl==='customerRefund'?'4100':''):
          e.ledger==='payable'&&t.tpl==='supplierRefund'?item.source.groups.flat().find(l=>l.a!=='2000'&&l.s>0)?.a:'';
        const movement=t.groups.flat().filter(l=>l.a===contra).reduce((n,l)=>plus(n,l.s),0);
        if(!contra||movement!==(e.ledger==='receivable'?total:-total))throw new Error('退款收入、费用或存货冲回与原单据不一致');
        item.balance=plus(item.balance,-e.cancel);item.returned=plus(item.returned,total);item.cashReturned=plus(item.cashReturned,e.cash);
        if(item.returned>item.amount)throw new Error('累计退款超过原单据金额');
        item.returns.push({txn:t,amount:total,cancel:e.cancel,cash:e.cash});delta=-spec.sign*e.cancel;
      }else throw new Error('往来事件类型无效');
      expected.set(spec.account,plus(expected.get(spec.account)||0,delta));
    }
    if(check){
      for(const account of new Set(Object.values(LEDGERS).map(x=>x.account))){
        const actual=t.groups.flat().filter(l=>l.a===account).reduce((n,l)=>plus(n,l.s),0);
        if(actual!==(expected.get(account)||0))throw new Error('往来明细与凭证科目金额不一致');
      }
    }
  }
  return [...items.values()];
}
function validate(book){replay(book);return true;}
function summary(book,through){
  const items=replay(book,through), parties=new Map();
  for(const item of items){
    const k=item.ledger+'|'+key(item.partyId), p=parties.get(k)||{ledger:item.ledger,id:item.partyId,name:item.partyName,opened:0,balance:0,items:[]};
    p.opened=plus(p.opened,item.amount);p.balance=plus(p.balance,item.balance);p.items.push(item);parties.set(k,p);
  }
  return {items,parties:[...parties.values()]};
}
function monthlyMpf(income,holiday=false){
  if(!Number.isSafeInteger(income)||income<0)throw new Error('請填寫有效的強積金有關入息。');
  const employer=Math.min(Math.floor(income/20)+(income%20>=10?1:0),150000);
  return {employer,employee:!holiday&&income>=710000?employer:0};
}
window.AccountingBusiness={monthlyMpf,LEDGERS,key,marked,parseAlloc,validate,summary};
})();

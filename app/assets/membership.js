/* Membership balances are derived from linked, posted journal entries. */
(() => {
'use strict';

const types = new Map([
  ['memberCardSale','sale'], ['memberCardUse','use'],
  ['memberCommissionAccrue','accrue'], ['memberCommissionPay','pay'],
  ['memberCardRefund','refund'], ['memberCommissionReverse','reverse'], ['memberCommissionRecover','recover'],
]);
const key = value => String(value ?? '').trim().normalize('NFKC').toLowerCase();
const clean = value => String(value ?? '').trim();
const compare = (a,b) => a.date.localeCompare(b.date) || a.seq-b.seq;
const inline = t => t.member?.v===2 && t.member.kind==='sale';
const linked = t => t.member?.v===1 || inline(t);
const groupAmount = (g,dr,cr) => {
  if (!Array.isArray(g) || g.length!==2) throw new Error('会员卡凭证的借贷明细不正确');
  const d=g.find(l=>l.a===dr && l.s>0), c=g.find(l=>l.a===cr && l.s<0);
  if (!d || !c || d.s!==-c.s || !Number.isSafeInteger(d.s)) throw new Error('会员卡凭证科目或金额与业务不符');
  return d.s;
};
const amount = (t,dr,cr) => {
  if (!Array.isArray(t.groups) || t.groups.length!==1) throw new Error('会员卡凭证必须包含一组借贷分录');
  return groupAmount(t.groups[0],dr,cr);
};
const safeAdd = (a,b) => {
  const n=a+b;
  if (!Number.isSafeInteger(n)) throw new Error('会员卡明细金额合计超出允许范围');
  return n;
};
function rate(value) {
  const text=clean(value);
  if (!/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/.test(text)) throw new Error('佣金比例须在 0% 至 100% 之间，最多两位小数');
  const [whole, decimal='']=text.split('.');
  return Number(whole)*100+Number(decimal.padEnd(2,'0'));
}
function commission(cents,bps) {
  if (!Number.isSafeInteger(cents) || cents<0 || !Number.isInteger(bps) || bps<0 || bps>10000) throw new Error('佣金计算参数无效');
  const result=(BigInt(cents)*BigInt(bps)+5000n)/10000n;
  if (result>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('佣金金额超出允许范围');
  return Number(result);
}
const saleAmount = t => inline(t) ? groupAmount(t.groups[0],'1000','2300') : amount(t,'1000','2300');
const useAmount = t => amount(t,'2300','4100');
const accrueAmount = t => amount(t,'6250','2050');
const payAmount = t => amount(t,'2050','1000');
const refundAmount = t => amount(t,'2300','1000');
const recoverAmount = t => amount(t,'1000','1160');
function reverseAmount(t){
  const {unpaid,paid}=t.member;
  if(!Number.isSafeInteger(unpaid)||!Number.isSafeInteger(paid)||unpaid<0||paid<0||!unpaid&&!paid||t.groups.length!==1)throw new Error('佣金冲回金额无效');
  const total=unpaid+paid;if(!Number.isSafeInteger(total))throw new Error('佣金冲回金额过大');
  const g=t.groups[0],allowed=new Set(['2050','1160','6250']);
  if(g.some(l=>!allowed.has(l.a))||g.filter(l=>l.a==='2050').reduce((n,l)=>n+l.s,0)!==unpaid||
     g.filter(l=>l.a==='1160').reduce((n,l)=>n+l.s,0)!==paid||g.filter(l=>l.a==='6250').reduce((n,l)=>n+l.s,0)!==-total)throw new Error('佣金冲回分录与明细不一致');
  return total;
}
const expected = t => commission(saleAmount(t),t.member.rateBps);
function inlineDue(t) {
  if (!inline(t)) return 0;
  const due=expected(t);
  if (t.groups.length!==(due?2:1) || due && groupAmount(t.groups[1],'6250','2050')!==due) {
    throw new Error('售卡凭证的应付佣金分录须与确认金额一致');
  }
  return due;
}
const nonempty = (value,max) => typeof value==='string' && !!value.trim() && value.length<=max;

function validate(book) {
  if (book.txns.some(t=>t.member!=null && !linked(t))) throw new Error('会员卡凭证关联信息版本无效');
  const txns=book.txns.filter(linked).slice().sort(compare);
  const sales=new Map(), cards=new Map(), accruals=new Map(), refunded=new Map();
  for (const t of txns) {
    const m=t.member;
    if (!t.id || !Number.isSafeInteger(t.seq) || t.seq<1 || types.get(t.tpl)!==m.kind) throw new Error('会员卡凭证类型或编号无效');
    if (m.kind!=='sale') continue;
    if (!nonempty(m.cardNo,80) || !nonempty(m.customer,80) || !Number.isInteger(m.rateBps) || m.rateBps<0 || m.rateBps>10000) throw new Error('购卡凭证缺少有效的卡号、客户或佣金比例');
    const k=key(m.cardNo), existing=cards.get(k);
    if (existing && key(existing.customer)!==key(m.customer)) throw new Error(`会员卡 ${m.cardNo} 的客户与已有购卡凭证不一致`);
    if (!existing) cards.set(k,{customer:m.customer,balance:0});
    saleAmount(t); sales.set(t.id,t);
  }
  for (const t of txns) {
    const m=t.member;
    if (m.kind==='sale') {
      const c=cards.get(key(m.cardNo)); c.balance=safeAdd(c.balance,saleAmount(t));
      const due=inlineDue(t);
      if (due) accruals.set(t.id,{txn:t,remaining:due,paid:0,paidReversed:0,recoverable:0});
    } else if (m.kind==='use') {
      if (!nonempty(m.cardNo,80)) throw new Error('消费凭证缺少会员卡号');
      const c=cards.get(key(m.cardNo));
      if (!c) throw new Error('消费凭证关联的会员卡不存在，请先记录购卡');
      c.balance=safeAdd(c.balance,-useAmount(t));
      if (c.balance<0) throw new Error(`会员卡 ${m.cardNo} 在 ${t.date} 的可用余额不足，无法保存`);
    } else if (m.kind==='refund') {
      const sale=sales.get(m.saleId);if(!sale||compare(t,sale)<0)throw new Error('退款须关联此前的购卡凭证');
      const a=refundAmount(t),c=cards.get(key(sale.member.cardNo)),total=safeAdd(refunded.get(sale.id)||0,a);
      if(total>saleAmount(sale))throw new Error('退款金额超过该购卡凭证的实收金额');
      refunded.set(sale.id,total);c.balance=safeAdd(c.balance,-a);
      if(c.balance<0)throw new Error(`会员卡 ${sale.member.cardNo} 在 ${t.date} 的可用余额不足，无法退款`);
    } else if (m.kind==='accrue') {
      const sale=sales.get(m.saleId);
      if (!sale || compare(t,sale)<0) throw new Error('佣金计提须关联此前的购卡凭证');
      if (inline(sale) || accruals.has(m.saleId)) throw new Error('该购卡凭证的佣金已计提，不能重复计提');
      const due=m.amount==null?expected(sale):m.amount;
      if (!Number.isSafeInteger(due)||due<=0||due>expected(sale)||accrueAmount(t)!==due) throw new Error('佣金计提金额超过购卡预计佣金或与分录不一致');
      accruals.set(m.saleId,{txn:t,remaining:due,paid:0,paidReversed:0,recoverable:0});
    } else if (m.kind==='pay') {
      const a=accruals.get(m.saleId);
      if (!a || compare(t,a.txn)<0) throw new Error('佣金支付须关联此前已确认应付佣金的购卡凭证');
      const paid=payAmount(t);a.remaining=safeAdd(a.remaining,-paid);a.paid=safeAdd(a.paid,paid);
      if (a.remaining<0) throw new Error('支付金额超过该购卡凭证的应付佣金');
    } else if (m.kind==='reverse') {
      const a=accruals.get(m.saleId);if(!a||compare(t,a.txn)<0)throw new Error('佣金冲回须关联此前已确认应付佣金的购卡凭证');
      reverseAmount(t);a.remaining=safeAdd(a.remaining,-m.unpaid);
      if(a.remaining<0)throw new Error('冲回未付佣金超过应付余额');
      if(m.paid>a.paid-a.paidReversed)throw new Error('追回已付佣金超过尚未冲回的已付金额');
      a.paidReversed=safeAdd(a.paidReversed,m.paid);a.recoverable=safeAdd(a.recoverable,m.paid);
    } else if (m.kind==='recover') {
      const a=accruals.get(m.saleId);if(!a)throw new Error('佣金追回须关联此前的冲回凭证');
      a.recoverable=safeAdd(a.recoverable,-recoverAmount(t));if(a.recoverable<0)throw new Error('追回金额超过应收佣金追回款');
    } else throw new Error('会员卡凭证类型无效');
  }
  summary(book);
  return true;
}

function summary(book,through) {
  const cards=new Map(), purchases=new Map();
  const txns=book.txns.filter(t=>linked(t) && (!through || t.date<=through)).slice().sort(compare);
  for (const t of txns) {
    const m=t.member;
    if (m.kind==='sale') {
      const k=key(m.cardNo), card=cards.get(k) || {cardNo:m.cardNo,customer:m.customer,received:0,used:0,refunded:0,sales:[],uses:[],refunds:[]};
      const due=inlineDue(t);
      const p={txn:t,card,amount:saleAmount(t),expected:expected(t),accrued:due,paid:0,refunded:0,reversedUnpaid:0,reversedPaid:0,recovered:0,accrual:due?t:null,payments:[],reversals:[],recoveries:[]};
      card.received=safeAdd(card.received,p.amount); card.sales.push(p); cards.set(k,card); purchases.set(t.id,p);
    } else if (m.kind==='use') {
      const card=cards.get(key(m.cardNo)); if (!card) continue;
      card.used=safeAdd(card.used,useAmount(t)); card.uses.push(t);
    } else {
      const p=purchases.get(m.saleId); if (!p) continue;
      if (m.kind==='accrue') { p.accrued=safeAdd(p.accrued,accrueAmount(t)); p.accrual=t; }
      else if (m.kind==='pay') { p.paid=safeAdd(p.paid,payAmount(t)); p.payments.push(t); }
      else if (m.kind==='refund') {const a=refundAmount(t);p.refunded=safeAdd(p.refunded,a);p.card.refunded=safeAdd(p.card.refunded,a);p.card.refunds.push(t);}
      else if (m.kind==='reverse') {reverseAmount(t);p.reversedUnpaid=safeAdd(p.reversedUnpaid,m.unpaid);p.reversedPaid=safeAdd(p.reversedPaid,m.paid);p.reversals.push(t);}
      else if (m.kind==='recover') {p.recovered=safeAdd(p.recovered,recoverAmount(t));p.recoveries.push(t);}
    }
  }
  const totals={balance:0,unpaid:0,unaccrued:0,recoverable:0};
  for (const p of purchases.values()) {
    p.unpaid=p.accrued-p.paid-p.reversedUnpaid;
    p.recoverable=p.reversedPaid-p.recovered;
    p.unaccrued=inline(p.txn) || p.accrual ? 0 : p.expected;
    for (const key of ['unpaid','unaccrued','recoverable']) totals[key]=safeAdd(totals[key],p[key]);
  }
  for (const c of cards.values()) {
    c.balance=c.received-c.used-c.refunded;
    totals.balance=safeAdd(totals.balance,c.balance);
  }
  return {cards:[...cards.values()],purchases:[...purchases.values()],totals,
    legacy:book.txns.filter(t=>types.has(t.tpl) && !linked(t) && (!through || t.date<=through)).length};
}
window.AccountingMembership={types,key,rate,commission,expected,inline,linked,validate,summary};
})();

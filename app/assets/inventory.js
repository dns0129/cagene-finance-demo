/* Per-item inventory quantities and moving-average cost derived from posted vouchers. */
(() => {
'use strict';
const types=new Map([['stockPurchase','purchase'],['stockSale','sale'],['stockReturn','return'],['stockGain','gain'],['stockLoss','loss']]);
const key=x=>String(x??'').trim().normalize('NFKC').toLowerCase(),marked=t=>t.stock?.v===1;
const cmp=(a,b)=>a.date.localeCompare(b.date)||a.seq-b.seq;
const add=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))throw new Error('存货数量或金额超出允许范围');return n;};
function quantity(value){const s=String(value??'').trim();if(!/^\d+(?:\.\d{1,3})?$/.test(s))throw new Error('数量须为正数，最多三位小数');const [a,b='']=s.split('.'),n=Number(a)*1000+Number(b.padEnd(3,'0'));if(!Number.isSafeInteger(n)||n<=0)throw new Error('数量须为正数且不能过大');return n;}
function portion(value,part,total){if(!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(part)||part<0||!Number.isSafeInteger(total)||total<=0||part>total)throw new Error('存货成本计算参数无效');return Number((BigInt(value)*BigInt(part)+BigInt(Math.floor(total/2)))/BigInt(total));}
const movements=t=>t.groups.flat().filter(l=>l.a==='1200').reduce((n,l)=>add(n,l.s),0);
const account=(t,a)=>t.groups.flat().filter(l=>l.a===a).reduce((n,l)=>add(n,l.s),0);
function replay(book,through){
  if(book.txns.some(t=>t.stock!=null&&!marked(t)))throw new Error('存货明细版本无效');
  const all=book.txns.filter(t=>marked(t)&&(!through||t.date<=through)).slice().sort(cmp),items=new Map(),sales=new Map();
  for(const t of all){
    const m=t.stock;if(!t.id||!Number.isSafeInteger(t.seq)||types.get(t.tpl)!==m.kind||typeof m.sku!=='string'||!m.sku.trim()||m.sku.length>80||typeof m.name!=='string'||!m.name.trim()||m.name.length>80||!Number.isSafeInteger(m.qty)||m.qty<=0||!Number.isSafeInteger(m.cost)||m.cost<0)throw new Error('存货凭证明细无效');
    const k=key(m.sku),item=items.get(k)||{sku:m.sku,name:m.name,qty:0,cost:0,txns:[]};
    if(key(item.name)!==key(m.name))throw new Error(`商品 ${m.sku} 的名称与已有凭证不一致`);
    if(m.kind==='purchase'||m.kind==='gain'){
      if(m.cost<=0||movements(t)!==m.cost)throw new Error('存货入库金额与凭证不一致');
      if(m.kind==='gain'&&account(t,'4700')!==-m.cost)throw new Error('盘盈分录与存货成本不一致');
      if(m.kind==='purchase'&&account(t,'1000')+account(t,'2000')!==-m.cost)throw new Error('采购分录与存货成本不一致');
      item.qty=add(item.qty,m.qty);item.cost=add(item.cost,m.cost);
    }else if(m.kind==='sale'||m.kind==='loss'){
      if(m.qty>item.qty)throw new Error(`商品 ${m.sku} 在 ${t.date} 的库存不足`);
      const cost=portion(item.cost,m.qty,item.qty);if(m.cost!==cost||movements(t)!==-cost)throw new Error(`商品 ${m.sku} 的出库成本已变化，请先处理后续存货凭证`);
      if(m.kind==='loss'&&account(t,'6900')!==cost || m.kind==='sale'&&account(t,'5000')!==cost)throw new Error('存货出库成本与损益科目不一致');
      if(m.kind==='sale'){
        const e=t.biz?.events?.find(e=>e.kind==='open'&&e.ledger==='receivable');
        if(!e||account(t,'4000')!==-e.amount||account(t,'1000')+account(t,'1100')!==e.amount)throw new Error('商品销售收入与客户单据不一致');
      }
      item.qty-=m.qty;item.cost-=cost;
      if(m.kind==='sale')sales.set(t.id,{txn:t,qty:m.qty,cost,returned:0,returnedCost:0});
    }else if(m.kind==='return'){
      const s=sales.get(m.saleId);if(!s||key(s.txn.stock.sku)!==k)throw new Error('退货须关联此前的商品销售凭证');
      const cumulative=add(s.returned,m.qty);if(cumulative>s.qty)throw new Error('退货数量超过原销售数量');
      const cumulativeCost=portion(s.cost,cumulative,s.qty),cost=cumulativeCost-s.returnedCost;
      if(m.cost!==cost||movements(t)!==cost)throw new Error('退货成本与原销售凭证不一致');
      const e=t.biz?.events?.find(e=>e.kind==='return'&&e.ledger==='receivable');
      if(!e||e.id!==m.saleId+':0'||account(t,'5000')!==-cost||account(t,'4000')!==e.cancel+e.cash)throw new Error('商品退货分录与原销售或退款不一致');
      s.returned=cumulative;s.returnedCost=cumulativeCost;item.qty=add(item.qty,m.qty);item.cost=add(item.cost,cost);
    }else throw new Error('存货业务类型无效');
    item.txns.push(t);items.set(k,item);
  }
  return {items:[...items.values()],sales:[...sales.values()]};
}
const validate=book=>{replay(book);return true;};
window.AccountingInventory={types,key,marked,quantity,portion,summary:replay,validate};
})();

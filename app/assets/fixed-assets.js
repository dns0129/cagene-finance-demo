/* Fixed asset cards, straight-line monthly depreciation and disposals. */
(() => {
'use strict';
const types=new Map([['assetPurchase','purchase'],['assetDepreciation','depreciation'],['assetDisposal','disposal']]);
const key=x=>String(x??'').trim().normalize('NFKC').toLowerCase(),marked=t=>t.asset?.v===1;
const cmp=(a,b)=>a.date.localeCompare(b.date)||a.seq-b.seq;
const month=x=>Number(x.slice(0,4))*12+Number(x.slice(5,7))-1;
const portion=(value,k,total)=>Number((BigInt(value)*BigInt(k)+BigInt(Math.floor(total/2)))/BigInt(total));
const sum=(t,a)=>t.groups.flat().filter(l=>l.a===a).reduce((n,l)=>n+l.s,0);
function monthly(a,n){return portion(a.cost-a.residual,n,a.life)-portion(a.cost-a.residual,n-1,a.life);}
function replay(book,through){
  if(book.txns.some(t=>t.asset!=null&&!marked(t)))throw new Error('固定资产明细版本无效');
  const txns=book.txns.filter(t=>marked(t)&&(!through||t.date<=through)).slice().sort(cmp),assets=new Map(),codes=new Set();
  for(const t of txns){
    const m=t.asset;if(!t.id||!Number.isSafeInteger(t.seq)||types.get(t.tpl)!==m.kind)throw new Error('固定资产凭证类型无效');
    if(m.kind==='purchase'){
      if(typeof m.code!=='string'||!m.code.trim()||m.code.length>80||typeof m.name!=='string'||!m.name.trim()||m.name.length>80||codes.has(key(m.code))||!Number.isSafeInteger(m.cost)||m.cost<=0||!Number.isSafeInteger(m.residual)||m.residual<0||m.residual>m.cost||!Number.isInteger(m.life)||m.life<1||m.life>1200||typeof m.firstMonth!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.firstMonth)||m.firstMonth<t.date.slice(0,7)||sum(t,'1510')!==m.cost)throw new Error('固定资产编号、成本、残值、年限或起算月份无效');
      codes.add(key(m.code));assets.set(t.id,{txn:t,code:m.code,name:m.name,cost:m.cost,residual:m.residual,life:m.life,firstMonth:m.firstMonth,depreciation:0,lastPeriod:0,deps:[],disposal:null,proceeds:0});
    }else{
      const a=assets.get(m.sourceId);if(!a||a.disposal)throw new Error('固定资产原凭证不存在、日期晚于本凭证或资产已处置');
      if(m.kind==='depreciation'){
        const n=month(t.date)-month(a.firstMonth)+1;
        if(!Number.isInteger(n)||n<1||n>a.life||n<=a.lastPeriod)throw new Error('折旧月份无效或已经计提');
        for(let i=a.lastPeriod+1;i<n;i++)if(monthly(a,i))throw new Error('请先计提之前尚未入账的折旧月份');
        const amount=monthly(a,n);if(!amount||m.amount!==amount||sum(t,'6500')!==amount||sum(t,'1515')!==-amount)throw new Error('折旧金额与资产卡片或期间不一致');
        a.depreciation+=amount;a.lastPeriod=n;a.deps.push(t);
      }else if(m.kind==='disposal'){
        if(!Number.isSafeInteger(m.proceeds)||m.proceeds<0)throw new Error('资产处置收入无效');
        const carrying=a.cost-a.depreciation,gain=m.proceeds-carrying;
        if(sum(t,'1510')!==-a.cost||sum(t,'1515')!==a.depreciation||sum(t,'1000')!==m.proceeds||sum(t,'4600')!==-Math.max(gain,0)||sum(t,'7100')!==Math.max(-gain,0))throw new Error('资产处置分录与资产账面价值不一致');
        a.disposal=t;a.proceeds=m.proceeds;
      }else throw new Error('固定资产业务类型无效');
    }
  }
  for(const a of assets.values())a.bookValue=a.disposal?0:a.cost-a.depreciation;
  return {assets:[...assets.values()]};
}
const validate=book=>{replay(book);return true;};
window.AccountingFixedAssets={types,key,marked,monthly,summary:replay,validate};
})();

/* Customer copy of a posted sales invoice. The terms are transcribed from the salon's paper form. */
(() => {
'use strict';
const terms=[
  ['一、營業時間','星期一至六：11:00 – 20:00','星期日及公眾假期休息'],
  ['二、預約、更改及取消政策',
    '2.1 客戶如需更改或取消預約，必須於已預約時間至少24小時前通知本公司，否則視為違反預約條款。',
    '2.2 如客戶未能於預約時間出席，或未提前通知取消，本公司有權收取已預約療程之全額費用，且不作退款或補償。',
    '2.3 如客戶遲到超過15分鐘，本公司有權視當日安排縮短療程時間或取消療程，並將該次療程視為已完成，相關費用將全數扣除。'],
  ['三、訂金及退款安排',
    '3.1 所有已支付之訂金、療程費用及產品費用，一經確認，均不設退款或轉讓。',
    '3.2 客戶於購買療程或產品前，應審慎考慮個人需要及情況，一經確認購買，即表示同意相關服務內容及本合約條款，所繳付之費用將不獲退還。',
    '3.3 如療程或產品已被使用（包括已開始療程或產品已開封），相關費用將不設退款。',
    '3.4 如因本公司之實際情況未能提供已購買之療程或服務，本公司將按情況提供合理替代安排，包括更改療程內容或重新安排服務時間。',
    '3.5 所有優惠、套票安排及贈送項目均以整體方案形式提供，不可分拆、轉換或兌換現金。'],
  ['四、療程使用及轉讓限制',
    '4.1 所有療程及服務僅限客戶本人使用，不得轉讓或與他人共用，否則視為違約，本公司有權終止餘下療程且不作退款。',
    '4.2 未經本公司書面同意，客戶不得將未使用療程轉換為其他產品或服務。'],
  ['五、健康狀況及風險告知',
    '5.1 客戶須於首次療程前，如實申報其健康狀況，包括但不限於懷孕、皮膚敏感、慢性疾病或正在接受治療等。',
    '5.2 如因客戶未有提供完整或正確健康資料而引致任何不良後果，本公司概不負責。',
    '5.3 所有療程效果因人而異，本公司不保證任何效果，亦不承擔因個人體質差異所引致之結果。'],
  ['六、不可抗力及營運安排',
    '6.1 如因不可抗力因素（包括但不限於天災、政府措施、疫情、停電等）導致服務延誤或取消，本公司將協助重新安排，但不承擔相關責任。',
    '6.2 本公司保留因營運需要調整療程內容、產品或流程之權利，而不影響整體服務性質。',
    '6.3 如指定治療師未能提供服務，本公司有權安排其他合資格治療師替代。'],
  ['七、付款及價格政策',
    '7.1 所有療程及產品價格以付款當日為準，本公司有權調整價格而毋須另行通知。',
    '7.2 已付款之療程須按照合約使用，不接受因價格變動而提出退款或補差。',
    '7.3 如涉及分期付款或第三方支付，客戶須遵守相關機構條款，本公司不承擔相關責任。'],
  ['八、產品及療程聲明',
    '8.1 本公司提供之服務屬美容護理性質，並非醫療行為，亦不構成醫學診斷或治療。',
    '8.2 客戶如有需要，應自行諮詢專業醫生意見。',
    '8.3 客戶須依照建議療程及護理指引，否則可能影響效果，本公司不作保證。'],
  ['九、安全及責任限制',
    '9.1 客戶須遵守療程前後注意事項，否則引致之任何不良反應，本公司概不負責。',
    '9.2 如療程後出現不適，客戶應即時通知本公司並尋求醫療協助。',
    '9.3 在法律允許範圍內，本公司不承擔任何間接或衍生性損失。'],
  ['十、個人資料及私隱',
    '10.1 客戶同意本公司收集及使用其個人資料作預約、療程記錄及客戶服務用途。',
    '10.2 未經客戶同意，本公司不會向第三方披露其個人資料（法律要求除外）。',
    '10.3 客戶同意／不同意（請刪去不適用者）本公司使用療程前後照片作內部記錄或推廣用途。'],
  ['十一、療程有效期',
    '11.1 所有療程須於購買日起計12個月內使用，逾期作廢且不設退款或延期（除非另有書面協議）。'],
  ['十二、條款修改及法律適用',
    '12.1 本公司保留隨時修改本條款及細則之權利，並於店內或官方渠道公佈。',
    '12.2 如有任何爭議，本公司保留最終解釋權。',
    '12.3 本條款受香港特別行政區法律管轄並按其解釋。']
];
const esc=window.AccountingLocale.escape;
const date=value=>value?value.replace(/^(\d{4})-(\d{2})-(\d{2})$/,(_,y,m,d)=>y+'年'+Number(m)+'月'+Number(d)+'日'):'';
function time(value){
  if(!value)return '';
  const [h,m]=value.split(':');
  return (Number(h)<12?'上午 ':'下午 ')+String(Number(h)%12||12).padStart(2,'0')+':'+m;
}
function sheet(invoice,currency){
  const symbol=['HKD','HK$'].includes(currency)?'$':currency;
  const money=n=>esc(symbol)+' '+(n/100).toLocaleString('en-US',{minimumFractionDigits:n%100?2:0,maximumFractionDigits:2});
  const field=(k,v)=>`<div><dt>${k}：</dt><dd>${esc(v||'—')}</dd></div>`;
  const rows=invoice.lines.map(l=>{
    const note=[l.staff,l.expiry?'到期日 '+date(l.expiry):''].filter(Boolean).join(' / ');
    return `<tr><td>${esc(l.code||'—')}</td><td>${esc(l.desc)}</td><td>${l.qty/1000}</td><td>${money(l.price)}</td><td>${money(l.discount||0)}</td><td>${money(l.amount)}</td></tr>
      ${note?`<tr class="salon-note"><td colspan="6">${esc(note)}</td></tr>`:''}`;
  }).join('');
  const sum=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${money(value)}</dd></div>`;
  return `<article class="salon-sheet" lang="zh-HK"><h1>發票 (重印)</h1>
    <header><dl>${field('會員',invoice.partyName)}${field('會員編號',invoice.partyId)}${field('分店',invoice.branch)}</dl>
    <dl>${field('發票日期',[date(invoice.date),time(invoice.issueTime)].filter(Boolean).join(' '))}${field('發票編號',invoice.no)}${field('製作人',invoice.maker)}</dl></header>
    <table aria-label="發票明細"><colgroup>${[10,43,7,13,13,14].map(w=>`<col style="width:${w}%">`).join('')}</colgroup>
    <thead><tr>${['編號','名稱','數量','單價','折扣','總金額'].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <dl class="salon-totals">${sum('小計',invoice.amount)}${sum('總金額',invoice.amount)}<div><dt>付款由</dt><dd></dd></div>
    ${invoice.payments.map(([label,amount])=>sum(label,amount)).join('')}${invoice.balance?sum('未付餘額',invoice.balance):''}</dl>
    <section class="salon-terms"><h2>美容療程服務合約及條款細則</h2>
    ${terms.map(([title,...lines])=>`<section><h3>${title}</h3>${lines.map(line=>`<p>${line}</p>`).join('')}</section>`).join('')}
    <h3>客戶聲明</h3><p>本人確認已細閱、明白及同意上述所有條款及細則，並確認本人之健康狀況適合接受相關療程。</p></section>
    <footer>會員簽署 <span></span></footer></article>`;
}

// Measure at physical paper width. A longer invoice uses tighter row spacing, then
// scales and reflows to use the full printable width while keeping every line.
function open(invoice,currency){
  document.getElementById('salon-print-page')?.remove();
  const page=document.createElement('div');
  page.id='salon-print-page';
  page.innerHTML=sheet(invoice,currency);
  document.body.append(page);
  const paper=page.firstElementChild;
  const fit=()=>{
    const width=page.clientWidth, height=page.clientHeight-2;
    if(width<=0||height<=0)return;
    paper.classList.toggle('compact',invoice.lines.length>8);
    const fits=scale=>{
      paper.style.zoom=String(scale);
      paper.style.width=((width-1)/scale)+'px';
      const bounds=paper.getBoundingClientRect();
      return bounds.height<=height && bounds.width<=width;
    };
    if(!fits(1)){
      let low=0, high=1;
      for(let i=0;i<13;i++){
        const mid=(low+high)/2;
        if(fits(mid))low=mid;else high=mid;
      }
      fits(low);
    }
  };
  const done=()=>{
    window.removeEventListener('beforeprint',fit);
    window.removeEventListener('afterprint',done);
    document.body.classList.remove('salon-printing');
    page.remove();
  };
  document.body.classList.add('salon-printing');
  fit();
  window.addEventListener('beforeprint',fit);
  window.addEventListener('afterprint',done);
  try{window.print();}catch(error){done();throw error;}
}
window.SalonInvoicePrint={open};
})();

/* Fictional source documents, isolated ledger seeds and acceptance criteria. */
(() => {
'use strict';
const Bank = window.AccountingBank;
const Invoices = window.AccountingInvoices;
const year = 2026, month = 6, opening = 1000000;
const date = day => `${year}-06-${String(day).padStart(2,'0')}`;
const row = (day,memo,amount,ref) => ({date:date(day),memo,amount,ref});
const line = (a,s,extra={}) => ({a,s,...extra});
const voucher = (seq,day,tpl,memo,ref,groups,extra={}) =>
  ({id:'T'+seq,seq,date:date(day),tpl,memo,ref,groups:[groups],...extra});
const income = (seq,day,party,ref) => voucher(seq,day,'service',party+'服务款',ref,
  [line('1000',125000),line('4100',-125000)],{party,p:{amt:'1250',pay:'cash'}});
const rent = voucher(1,12,'payExpense','六月办公室租金','BT-RENT-0612',
  [line('6100',36000,{fn:'admin',expenseName:'办公室租金'}),line('1000',-36000)],
  {memoUser:'六月办公室租金',p:{amt:'360',expenseName:'办公室租金',pay:'cash',fn:'auto'}});
function issuedInvoice(seq,day,no,partyId,partyName,total,description) {
  return voucher(seq,day,'salesInvoice',partyName+description,no,
    [line('1100',total),line('4100',-total)],{
      party:partyName,
      inv:{v:1,no,account:'4100',lines:[{desc:description,qty:1000,price:total,amount:total}]},
      biz:{v:1,events:[{kind:'open',ledger:'receivable',partyId,partyName,amount:total,dueDate:date(30)}]},
    });
}
const invoice=issuedInvoice(1,8,'TR-INV-2406','TR-C01','清棠工作室',240000,'设计服务');
const matchAt='2026-06-15T09:00:00+08:00';
const reconciled=id=>({id,at:matchAt});
const oneReceipt = (seq,day,ref,id,party,amount) => voucher(seq,day,'customerReceipt','收到 '+party+' 货款',ref,
  [line('1000',amount),line('1100',-amount)],{party,
    biz:{v:1,events:[{kind:'apply',ledger:'receivable',allocations:[{id:id+':0',amount}]}]},
  });
const periodThroughMay=[{from:0,to:5,at:'2026-06-01T09:00:00+08:00',reason:''}];
const salesPerson = (id,name) => ({id,name});
const salesCustomer=salesPerson('C206','雾岛设计');
const similarCustomer=salesPerson('C260','雾岛工坊');
const orderLines=[{desc:'品牌设计',qty:'2',price:'1250'},{desc:'交付培训',qty:'1',price:'1600'}];
const returnedCustomer=salesPerson('C310','青屿陈列');
const returnedLines=[{desc:'陈列维护',qty:'2',price:'950'},{desc:'现场交付',qty:'1',price:'600'}];
function requestFixture(id,status,customer,lines,dueDate,reviewNote='') {
  const parsed=Invoices.parseLines(lines);
  return {id,status,reviewNote,updatedAt:Date.parse(matchAt),data:{
    partyId:customer.id,partyName:customer.name,date:date(18),dueDate,note:'',lines:parsed.lines,total:parsed.total,
  }};
}
function hasOrder(request,customer,day,due,lines,note) {
  if(request?.status!=='pending')return false;
  const actual=request.data, expected=Invoices.parseLines(lines);
  return actual.partyId===customer.id&&actual.partyName===customer.name&&actual.date===date(day)
    &&actual.dueDate===due&&actual.total===expected.total&&actual.lines.length===expected.lines.length
    &&expected.lines.every((line,i)=>['desc','qty','price'].every(k=>line[k]===actual.lines[i][k]))
    &&(!note||actual.note.includes(note));
}
const step = (title,text,action,label,options) => ({title,text,action,label,options});
const checks = {
  matched: (r,i,id) => r.statement?.matches[i]?.id===id,
  lines: (txn,entries) => {
    const lines=txn?.groups.flat();
    return lines?.length===entries.length && entries.every(([a,s])=>lines.some(l=>l.a===a && l.s===s));
  },
};
const levels = [
  {
    id:'same-amount',title:'两笔同额收款，匹配哪张？',tag:'流水匹配',minutes:3,
    brief:'银行同一天收到两笔 HK$1,250.00，账上也有两张同额凭证。用流水号区分客户并逐一配对。',
    source:[['06-05 · 松岚设计','+1,250.00','BT-R101'],['06-05 · 雨桥贸易','+1,250.00','BT-R102']],
    rows:[row(5,'松岚设计来款',125000,'BT-R101'),row(5,'雨桥贸易来款',125000,'BT-R102')],
    txns:[income(1,5,'松岚设计','BT-R101'),income(2,5,'雨桥贸易','BT-R102')],
    steps:[
      step('匹配松岚设计','在「银行对账 → 未匹配流水」找 BT-R101，点「选择匹配」，核对 T1 的客户摘要和流水号，再点「确认匹配」。','bank:0','定位 BT-R101'),
      step('匹配雨桥贸易','在同一页找 BT-R102，点「选择匹配」，选 T2，再点「确认匹配」。如果配错，到「已确认匹配」点「解除匹配」后重做。','bank:1','定位 BT-R102'),
    ],
    criteria:(book,r)=>[
      checks.matched(r,0,'T1') && matchesOriginal(book,1),
      checks.matched(r,1,'T2') && matchesOriginal(book,2),
    ],
    takeaway:'金额一致只是筛选条件。确认匹配前，还要对照流水号和付款方。',
  },
  {
    id:'correct-amount',title:'修正错录的办公租金',tag:'更正凭证',minutes:4,
    brief:'租金回单和银行都显示实付 HK$630.00，账上却录成 HK$360.00。原凭证还没有匹配，可以直接更正。',
    source:[['银行扣款／租金回单','−630.00','BT-RENT-0612'],['凭证 J1 原录金额','−360.00','差额 270.00']],
    rows:[row(12,'六月办公室租金',-63000,'BT-RENT-0612')],txns:[rent],
    steps:[
      step('把原凭证金额改成 630.00','在「凭证查询」找到「六月办公室租金」，点这张凭证的「编辑」。把「金额」从 360 改成 630，保留日期、结算方式和单据编号，点「保存修改」。','voucher:T1','定位原凭证'),
      step('匹配更正后的凭证','回到「银行对账 → 未匹配流水」，在 BT-RENT-0612 行点「选择匹配」，选 T1 并点「确认匹配」。','bank:0','定位租金流水'),
    ],
    criteria:(book,r)=>{
      const t=book.txns.find(x=>x.id==='T1');
      return [t?.date===date(12)&&t.ref===rent.ref&&t.tpl===rent.tpl&&t.p?.expenseName==='办公室租金'&&checks.lines(t,[['6100',63000],['1000',-63000]]),
        checks.matched(r,0,'T1')];
    },
    takeaway:'原始回单证明凭证录错时，修正原凭证可以保留单据与分录的对应关系；无需再另记一笔租金。',
  },
  {
    id:'missing-fee',title:'找回漏记的银行手续费',tag:'补记凭证',minutes:5,
    brief:'银行在 6 月 18 日扣了 HK$35.50 手续费，账上没有这笔支出。补记费用，再关联原流水。',
    source:[['06-18 · 银行网银手续费','−35.50','BT-FEE-0618'],['对应现金凭证','未入账','银行已扣款']],
    rows:[row(18,'银行网银手续费',-3550,'BT-FEE-0618')],txns:[],additions:1,
    steps:[
      step('填一张「支付营业费用」','在「录入凭证 → 支付营业费用」填日期 2026-06-18、「这是什么费用？」填 银行手续费、「金额」填 35.50，「结算方式」选「现金」（计入默认资金账户）。展开「摘要、往来对象与单据（选填）」，在「单据编号」填 BT-FEE-0618，点「确认记账」。','expense','打开费用模板'),
      step('把新增的费用凭证与流水配对','打开「银行对账 → 未匹配流水」，找到 BT-FEE-0618，点「选择匹配」。选择刚记的 HK$35.50 支出，然后点「确认匹配」。','bank:0','定位手续费流水'),
    ],
    criteria:(book,r)=>{
      const t=book.txns.find(x=>x.tpl==='payExpense'&&x.date===date(18)&&x.ref==='BT-FEE-0618'&&
        checks.lines(x,[['6900',3550],['1000',-3550]])&&['银行手续费','銀行手續費'].includes(x.groups.flat().find(l=>l.a==='6900')?.expenseName));
      return [!!t,!!t&&checks.matched(r,0,t.id)];
    },
    takeaway:'银行已经扣款、账上没有正确凭证时，先按实际业务补记，再配对。匹配本身不会产生分录。',
  },
  {
    id:'partial-invoice',title:'核销一笔部分到账的发票',tag:'应收核销',minutes:5,
    brief:'清棠工作室的发票原额 HK$2,400.00。银行只收到 HK$1,800.00，剩余款还在应收。',
    source:[['销售发票 TR-INV-2406','2,400.00','清棠工作室'],['06-23 · 客户来款','+1,800.00','TR-INV-2406']],
    rows:[row(23,'清棠工作室 TR-INV-2406 来款',180000,'TR-INV-2406')],txns:[invoice],additions:1,
    steps:[
      step('按实收金额核销发票','在「银行对账 → 未匹配流水」找到清棠工作室来款，点「对应发票收款」。勾选 TR-INV-2406，在「本次核销」确认是 1,800.00，再点「确认收款并匹配」。','bank:0','定位客户来款'),
      step('核对发票还欠 600.00','打开「销售发票」，在 TR-INV-2406 行点「查看」。在发票明细底部核对「已收款 / 已冲减」为 HK$1,800.00，「未收余额」为 HK$600.00，原发票合计仍是 HK$2,400.00。','invoice:T1','定位发票的「查看」'),
    ],
    criteria:(book,r)=>{
      const bill=Invoices.summary(book,date(30)).invoices.find(x=>x.id==='T1'&&x.no==='TR-INV-2406');
      const receipt=bill?.applications.find(a=>a.amount===180000 && checks.matched(r,0,a.txn.id))?.txn;
      return [receipt?.date===date(23)&&receipt.tpl==='customerReceipt'&&checks.lines(receipt,[['1000',180000],['1100',-180000]]),
        bill?.amount===240000&&bill.received===180000&&bill.balance===60000&&bill.partyId==='TR-C01'];
    },
    takeaway:'这笔收款冲减原发票的应收账款。收入已在开票时确认，收款时无需再确认收入。',
  },
  {
    id:'multi-invoice',title:'一笔回款，按付款附言分配到两张发票',tag:'多单核销',minutes:8,advanced:true,
    brief:'银行入账 HK$5,400。同一客户有两张发票，另一位客户也有一张 HK$5,400 的发票。请按付款附言分配。',
    source:[['汀兰零售 · 付款附言','+5,400.00','先付 INV-TL-0610 全额，再付 INV-TL-0616 的 2,200'],
      ['汀兰零售 · INV-TL-0610','3,200.00','第一张待收'],['汀兰零售 · INV-TL-0616','4,600.00','第二张待收'],
      ['明沅零售 · INV-MY-0615','5,400.00','同额发票，付款人不同']],
    rows:[row(25,'汀兰零售合并回款',540000,'TL-PAY-0625')],
    txns:[
      issuedInvoice(1,10,'INV-TL-0610','TR-TL','汀兰零售',320000,'陈列设计'),
      issuedInvoice(2,16,'INV-TL-0616','TR-TL','汀兰零售',460000,'门店改造'),
      issuedInvoice(3,15,'INV-MY-0615','TR-MY','明沅零售',540000,'门店服务'),
    ],additions:1,
    steps:[
      step('按付款附言分配 5,400.00','在 TL-PAY-0625 行点「对应发票收款」。若默认勾选了明沅零售的同额发票，先取消。勾选汀兰零售的两张单，在「本次核销」分别填 INV-TL-0610 = 3,200、INV-TL-0616 = 2,200，再点「确认收款并匹配」。','bank:0','定位回款流水'),
      step('复核两位客户的余额','在「销售发票」查看 INV-TL-0616，确认还欠 2,400。INV-TL-0610 应已收清，明沅零售的 5,400 仍全额未收。','invoice:T2','定位第二张发票'),
    ],
    criteria:(book,r)=>{
      const bills=Invoices.summary(book,date(30)).invoices;
      const [first,second,other]=['T1','T2','T3'].map(id=>bills.find(x=>x.id===id));
      const receipt=book.txns.find(t=>checks.matched(r,0,t.id));
      const allocations=receipt?.biz?.events[0]?.allocations;
      return [receipt?.tpl==='customerReceipt'&&allocations?.length===2&&
        allocations.some(x=>x.id==='T1:0'&&x.amount===320000)&&allocations.some(x=>x.id==='T2:0'&&x.amount===220000),
        first?.received===320000&&first.balance===0&&second?.received===220000&&second.balance===240000&&other?.balance===540000];
    },
    takeaway:'合并回款先按付款人和付款附言确认，再分配单据。另一客户的同额发票应保持未收。',
  },
  {
    id:'bank-transfer',title:'一张内部转账凭证，对上两家银行',tag:'多账户对账',minutes:9,advanced:true,
    brief:'默认资金账户收到客户款 1,250，又转出 2,500 到备用银行。备用银行当日到账。账上只有客户收款。',
    source:[['默认资金账户 · 客户来款','+1,250.00','BT-R621'],['默认资金账户 · 内部划出','−2,500.00','BT-XFER-0624'],
      ['备用银行 · 内部划入','+2,500.00','BT-XFER-0624']],
    rows:[row(21,'松岚设计来款',125000,'BT-R621'),row(24,'转往备用银行',-250000,'BT-XFER-0624')],
    extraBanks:[{account:{id:'reserve',name:'备用银行',opening:200000},rows:[row(24,'默认资金账户转入',250000,'BT-XFER-0624')]}],
    txns:[income(1,21,'松岚设计','BT-R621')],additions:1,
    steps:[
      step('确认原有客户来款','在默认资金账户找到 BT-R621，选择凭证 T1 并确认匹配。','bank:0','定位客户来款'),
      step('录一次内部转账','打开「资金账户内部转账」。交易日期填 2026-06-24，金额填 2,500，转出选「默认资金账户」，转入选「备用银行」。展开摘要与单据，在「单据编号」填 BT-XFER-0624，点「确认记账」。','template:cashTransfer','打开内部转账模板'),
      step('匹配默认账户的转出','在默认资金账户的 BT-XFER-0624 转出行点「选择匹配」，确认刚录的转账凭证。','bank:1','定位转出流水'),
      step('匹配备用账户的转入','把「资金账户」切到「备用银行」，在同号转入行选择同一张转账凭证。','bank:0:reserve','定位转入流水'),
    ],
    criteria:(book,r,reports)=>{
      const transfer=book.txns.find(t=>t.tpl==='cashTransfer'&&t.ref==='BT-XFER-0624'&&t.date===date(24)
        &&checks.lines(t,[['1000',-250000],['1000',250000]])&&Bank.cash(t)===-250000&&Bank.cash(t,'reserve')===250000);
      return [checks.matched(r,0,'T1'),!!transfer,!!transfer&&checks.matched(r,1,transfer.id),
        !!transfer&&checks.matched(reports.reserve,0,transfer.id)];
    },
    takeaway:'企业名下的两个资金账户用同一张转账凭证，各自完成匹配。内部划拨不计入收入或费用。',
  },
  {
    id:'rolling-statement',title:'续导下半月流水，保留已确认的匹配',tag:'区段导入',minutes:9,advanced:true,allowImport:true,
    brief:'6 月 1–15 日已导入并完成首笔匹配。把 16–30 日的区段接上，确认原匹配仍在，再处理新增流水。',
    source:[['06-01 至 06-15 · 已完成','11,250.00','期初 10,000.00 · BT-M1 已匹配 T1'],['06-16 至 06-30 · 待导入','12,500.00','区段期初 11,250.00 · 期末 12,500.00']],
    csv:['date,memo,amount,ref','2026-06-26,雨桥贸易来款,1250,BT-M2'].join('\n'),
    rows:[row(5,'松岚设计来款',125000,'BT-M1'),row(26,'雨桥贸易来款',125000,'BT-M2')],
    initial:{from:date(1),to:date(15),closing:1125000,matches:{0:reconciled('T1')}},
    txns:[income(1,5,'松岚设计','BT-M1'),income(2,26,'雨桥贸易','BT-M2')],
    steps:[
      step('续导 6 月 16–30 日区段','先用「复制练习 CSV」或选中复制题目资料中的两行。点「匯入更多流水 / 更新」，填开始日期 2026-06-16、结束日期 2026-06-30、期初 11,250、期末 12,500，并粘贴 CSV。点「校验并预览」，通过后点「確認匯入」。','bankImport','定位续导按钮'),
      step('核对原匹配并确认新增款','到「已确认匹配」确认 BT-M1 仍关联 T1，再在「未匹配流水」找 BT-M2，选择 T2 并确认。','bank:1','定位新增流水'),
    ],
    criteria:(_book,r)=>[
      r.complete&&r.statement?.from===date(1)&&r.statement?.to===date(30)&&r.statement.matches[0]?.id==='T1'&&r.statement.matches[0]?.at===matchAt,
      checks.matched(r,1,'T2'),
    ],
    takeaway:'下一段的期初余额要接上上一段的期末。按区段续导可以保留原匹配，整月替换会清除它。',
  },
  {
    id:'month-close',title:'补掉最后一笔差额，再锁 6 月账',tag:'月结复核',minutes:11,advanced:true,page:'close',
    brief:'5 月已锁定。6 月的客户款已确认，银行另外扣了 HK$48。手头已有月结复核底稿，先处理差额。',
    source:[['06-19 · 银行手续费','−48.00','BT-CLOSE-0619'],
      ['6 月期末底稿','11,202.00','期末现金；应收、应付均为 0'],
      ['6 月报表复核','1,202.00','净利润；试算借贷平衡；本月无待调事项']],
    rows:[row(5,'松岚设计来款',125000,'BT-CL1'),row(19,'六月银行手续费',-4800,'BT-CLOSE-0619')],
    initial:{matches:{0:reconciled('T1')}},txns:[income(1,5,'松岚设计','BT-CL1')],additions:1,
    periodHistory:periodThroughMay,
    steps:[
      step('记入漏掉的手续费','在「银行 / 支付平台手续费」模板填日期 2026-06-19，手续费金额 48，保留默认费用功能。在「单据编号」填 BT-CLOSE-0619，点「确认记账」。','template:bankFee','打开手续费模板'),
      step('清掉未匹配流水','在银行对账找到 BT-CLOSE-0619，选择刚录的费用凭证并确认。期末余额应为 11,202。','bank:1','定位待匹配扣款'),
      step('核对底稿，锁定 6 月','回到「月结工作台」，确认选择 6 月，系统勾稽通过且银行显示已对账。点「查看本期试算平衡」「查看截至 6 月报表」，对照题目底稿。回到 6 月月结页勾选三项人工复核，再点「锁定至 6 月」和「确认锁定」。','close','定位 6 月复核区'),
    ],
    criteria:(book,r)=>{
      const fee=book.txns.find(t=>t.tpl==='bankFee'&&t.ref==='BT-CLOSE-0619'&&t.date===date(19)&&checks.lines(t,[['6900',4800],['1000',-4800]]));
      return [!!fee,!!fee&&checks.matched(r,1,fee.id),window.AccountingEnterprise.closedThrough(book)===6];
    },
    takeaway:'月结锁定前，先处理银行差异，再核对底稿及报表。锁账会保护本月凭证和对账结果。',
  },
  {
    id:'sales-order',role:'sales',page:'salesPractice',title:'按签约订单提交两行发票申请',tag:'销售开票',minutes:7,
    brief:'两位客户名称相近。请按已签订单挑对客户，将设计与培训分成两行，留完整的单据说明。',
    source:[['订单 SO-0618 · 雾岛设计','C206','开票 2026-06-18；到期 2026-06-30'],
      ['品牌设计 · 数量 2','单价 1,250','交付培训 · 数量 1，单价 1,600'],['订单总额','4,100.00','给会计的说明写入 SO-0618']],
    sales:{customers:[salesCustomer,similarCustomer],requests:[]},
    steps:[
      step('选客户并填两行订单','在「我的销售发票」点「新建发票申请」。客户编号填 C206，确认带出「雾岛设计」。开票日期填 2026-06-18，到期日填 2026-06-30。首行填「品牌设计」、数量 2、单价 1,250；点「添加一行」填「交付培训」、数量 1、单价 1,600。','salesNew','定位新建申请'),
      step('核对 4,100 后提交审核','在同一表单底部核对合计 4,100，在「给会计的说明」写 SO-0618，再点「提交审核」。回列表应只有一笔待会计审核。','salesList','定位申请列表'),
    ],
    review(book){
      const list=book.trainingSales.requests;
      const entered=list.some(r=>hasOrder(r,salesCustomer,18,date(30),orderLines));
      return {itemChecks:[entered,list.length===1&&hasOrder(list[0],salesCustomer,18,date(30),orderLines,'SO-0618')],
        note:'已核对客户、开票日期、到期日、两行明细与订单号。申请正等待会计审核。'};
    },
    takeaway:'按客户编号确认客户，按合同拆分项目。提交后可在列表看到待审核状态。',
  },
  {
    id:'sales-correction',role:'sales',page:'salesPractice',title:'更正退回申请，并撤掉重复单',tag:'退回与重交',minutes:8,
    brief:'会计发现维护数量录多了，还缺到期日。另有一张同客户的重复申请在排队，先判断应修改哪一张。',
    source:[['订单 SO-0619 · 青屿陈列','C310','维持开票日 06-18；到期 06-30'],
      ['陈列维护','2 × 950','原申请误填 3'],['现场交付','1 × 600','正确合计 2,500']],
    sales:{customers:[returnedCustomer],requests:[
      requestFixture('TRAIN-RETURN','rejected',returnedCustomer,[{...returnedLines[0],qty:'3'},returnedLines[1]],'',
        '合同 SO-0619 的陈列维护为两次；请补填 6 月 30 日到期。'),
      requestFixture('TRAIN-DUPLICATE','pending',returnedCustomer,returnedLines,date(30)),
    ]},
    steps:[
      step('按退回原因修正原单','点带有「已退回」标记那张申请的「修改后重交」。将陈列维护数量改为 2，到期日填 2026-06-30，保留现场交付原值。合计 2,500，点「重新提交审核」。','salesEdit:TRAIN-RETURN','定位退回原单'),
      step('撤回重复申请','在另外一张申请上点「撤回」，核对弹窗是同一客户后点「确认撤回」。请保留刚修好的原申请。','salesWithdraw:TRAIN-DUPLICATE','定位重复单的撤回按钮'),
    ],
    review(book){
      const list=book.trainingSales.requests;
      const corrected=hasOrder(list.find(r=>r.id==='TRAIN-RETURN'),returnedCustomer,18,date(30),returnedLines);
      return {itemChecks:[corrected,!list.some(r=>r.id==='TRAIN-DUPLICATE')&&list.length===1],
        note:'原申请已纠正并重交，重复申请已撤回。'};
    },
    takeaway:'有退回记录的原单应就地更正，重复申请应撤回，以保留审核来往。',
  },
  {
    id:'owner-review',role:'owner',page:'reports',title:'利润不错，为什么银行只多了 3,750？',tag:'管理复核',minutes:9,
    brief:'用老板视角复核 6 月。银行已经对完，请把利润、现金净变动和发票未收余额串起来，选出应跟进的问题。',
    source:[['6 月管理例会','已对账','观察利润、银行净变动和销售应收'],['经理提问','要跟进什么？','从每个实际页面找到数字，再填写判断']],
    rows:[row(24,'澄华零售回款',400000,'TY-0624'),row(27,'银行手续费',-25000,'TY-0627')],
    initial:{matches:{0:reconciled('T2'),1:reconciled('T3')}},
    txns:[
      issuedInvoice(1,10,'INV-CH-0610','TR-CH','澄华零售',1000000,'门店设计'),
      oneReceipt(2,24,'TY-0624','T1','澄华零售',400000),
      voucher(3,27,'bankFee','银行手续费','TY-0627',[line('6900',25000,{fn:'admin'}),line('1000',-25000)]),
    ],
    steps:[
      step('从利润表确认 6 月净利润','打开「利润表」，找到「本期净利润」，选出报表显示的金额。','report:pl','打开利润表',['HK$3,750','HK$9,750','HK$10,000']),
      step('从银行确认本月净变动','打开「银行对账」，展开「核对金额与余额」，在「本月净变动」行查看金额。','bankTotals','打开银行余额表',['HK$13,750','HK$4,000','HK$3,750']),
      step('查看未收款，决定下一步','打开销售发票 INV-CH-0610，核对「未收余额」和已收款。再选择交给团队跟进的事项。','invoice:T1','定位发票余额',
        ['请会计按利润额补记银行收款','请销售按 INV-CH-0610 跟进未收 HK$6,000','请会计把已匹配的 HK$4,000 再记一次']),
    ],
    review(book){
      const answers=book.trainingAnswers||{};
      return {itemChecks:[answers[0]===1,answers[1]===2,answers[2]===1],
        note:'净利润 HK$9,750，银行净增 HK$3,750。差额对应未收的 HK$6,000，应跟进客户回款。'};
    },
    takeaway:'赊销确认利润时，现金可能尚未到账。用银行对账确认已收款，再按发票余额落实催收。',
  },
];
function matchesOriginal(book,seq) {
  const t=book.txns.find(x=>x.id==='T'+seq), original=levels[0].txns[seq-1];
  return t?.date===original.date && t.ref===original.ref && t.party===original.party &&
    checks.lines(t,[['1000',125000],['4100',-125000]]);
}
const roles={accountant:'会计',sales:'销售',owner:'老板'};
const roleOf=level=>level?.role || 'accountant';
const find=id=>levels.find(level=>level.id===id);
const bankSpecs=level=>{
  const extra=level.extraBanks||[];
  const allocated=extra.reduce((total,bank)=>total+bank.account.opening,0);
  return [
    {id:Bank.MAIN,opening:opening-allocated,rows:level.rows,initial:level.initial},
    ...extra.map(bank=>({id:bank.account.id,opening:bank.account.opening,rows:bank.rows,initial:bank.initial})),
  ];
};
const closing=(open,rows)=>open+rows.reduce((n,r)=>n+r.amount,0);
function seed(level) {
  const txns=level.txns||[];
  const book={
    v:1,seq:txns.length,company:{name:'海岬商贸 · 实训账套',year,cur:'HK$'},
    settings:{autoTax:false,lang:'zh',tab:'journal'},openingShares:0,
    opening:{1000:opening,3000:-opening},txns:structuredClone(txns),
  };
  if(level.sales)book.trainingSales=structuredClone(level.sales);
  if(level.periodHistory)book.periodHistory=structuredClone(level.periodHistory);
  if(level.extraBanks){
    book.cashAccounts=structuredClone(level.extraBanks.map(b=>b.account));
    book.bankReconciliationByAccount={};
  }
  if(level.rows)for(const bank of bankSpecs(level)){
    const rows=bank.initial?.to?bank.rows.filter(row=>row.date<=bank.initial.to):bank.rows;
    const statement={opening:bank.opening,closing:closing(bank.opening,rows),rows,matches:{},...bank.initial};
    const periods={[month]:structuredClone(statement)};
    if(bank.id===Bank.MAIN)book.bankReconciliation=periods;
    else book.bankReconciliationByAccount[bank.id]=periods;
  }
  return book;
}
const money=amount=>'HK$'+(amount/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function bankIssue(spec,report,book) {
  const statement=report.statement;
  const rowsMatch=statement?.rows.length===spec.rows.length&&spec.rows.every((row,i)=>
    ['date','amount','memo','ref'].every(k=>row[k]===statement.rows[i][k]));
  const name=Bank.accounts(book).find(a=>a.id===spec.id)?.name || spec.id;
  if(!report.complete)return name+'：银行对账单还没有覆盖整月。';
  if(!rowsMatch||statement.opening!==spec.opening||statement.closing!==closing(spec.opening,spec.rows))
    return name+'：流水或区段余额和题目资料不符。可重置本关后再试。';
  if(report.endingDifference)return `${name}：账面 ${money(report.bookEnding)}，银行 ${money(statement.closing)}，相差 ${money(Math.abs(report.endingDifference))}。`;
  if(!report.ready)return `${name}：还需核对期初和未匹配记录。流水 ${report.bankUnmatched} 条，凭证 ${report.unmatchedVouchers.length} 笔。`;
  return '';
}
function review(level,book) {
  if(level.review){
    const {itemChecks,note}=level.review(book);
    const passed=itemChecks.every(Boolean);
    return {itemChecks,passed,balanceHint:passed?note:'请按上方尚未完成的步骤继续。'};
  }
  const specs=bankSpecs(level);
  const reports=Object.fromEntries(specs.map(spec=>[spec.id,Bank.summary(book,month,spec.id)]));
  const itemChecks=level.criteria(book,reports[Bank.MAIN],reports).map(Boolean);
  const expectedCount=level.txns.length+(level.additions||0);
  const issue=specs.map(spec=>bankIssue(spec,reports[spec.id],book)).find(Boolean)
    || (book.txns.length!==expectedCount?`应有 ${expectedCount} 张凭证，当前 ${book.txns.length} 张，请核对是否重复记账。`:'');
  const balanceHint=issue || (specs.length===1
    ?`账面和对账单期末余额均为 ${money(reports[Bank.MAIN].bookEnding)}，流水已全部匹配。`
    :specs.map(spec=>`${Bank.accounts(book).find(a=>a.id===spec.id).name}期末 ${money(reports[spec.id].bookEnding)}`).join('，')+'，双方均已对账。');
  return {itemChecks,balanceHint,passed:itemChecks.every(Boolean)&&!issue};
}
window.AccountingTrainingContent={levels,roles,roleOf,year,month,find,seed,review};
})();

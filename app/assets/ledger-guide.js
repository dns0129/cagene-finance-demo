/* 总账与试算 tutorial: an introduction plus one step per tab, in the order a bookkeeper uses them.
   The app switches tabs and passes figures it has already computed (money and names arrive as
   escaped HTML), so every number in the text is the same one the page shows. */
(() => {
'use strict';
const TABS = ['chart', 'opening', 'ledger', 'tb', 'closing'];
const LAST = TABS.length; // step 0 is the introduction, steps 1–5 follow the tabs
const NAMES = {chart:'科目表', opening:'期初余额', ledger:'分类账', tb:'试算平衡表', closing:'年结分录预览'};

const stepOf = tab => TABS.indexOf(tab) + 1;
const tabOf = i => TABS[i - 1] || null;

function content(i, f){
  if (i === 0) return {
    title:'总账与试算是做什么的',
    body:`<p>凭证记完以后，到这里检查账本。上面五个标签按顺序就是查账的五步：</p>
      <ol class="guide-list"><li><b>科目表</b>：定好记账用哪些科目</li><li><b>期初余额</b>：填开始用系统时的余额</li><li><b>分类账</b>：按科目看每一笔进出</li><li><b>试算平衡表</b>：检查借贷是否相等</li><li><b>年结分录预览</b>：看年底怎么结账</li></ol>`,
    tip:'① 和 ② 通常只在开始用系统时设置一次；平时主要看 ③ 和 ④，月底出报表前一定要看 ④。'};
  if (i === 1) return {
    title:'科目表：记账用哪些科目',
    body:f.chart
      ? `<p>这里列出公司的每个科目：代码、名称，以及它在报表里属于哪一组。现在用的是公司自己的科目表，共 <b>${f.accounts}</b> 个科目、<b>${f.banks}</b> 个银行和现金户口。录入凭证、自动记账和报表都按这里的代码和名称显示。</p>`
      : `<p>这里列出记账用的科目：代码、名称，以及它在报表里属于哪一组。现在用的是系统默认科目；如果公司有自己的科目表，点「导入科目表」换成你们的，之后凭证和报表都按你们的代码显示。</p>`,
    tip:'改代码或名称不会改动任何金额。已经用过的科目只能隐藏，不能删除。'};
  if (i === 2) return {
    title:'期初余额：开始用系统时的余额',
    body:`<p>填开始用这个系统前一天（${f.openingDate}）每个科目还剩多少，通常照上年的资产负债表抄过来。资产填左边（借方），负债和权益填右边（贷方）。${f.chart ? '每个银行和现金户口各占一行。' : ''}</p>`,
    status:f.obOk ? [true, `借方合计 ${f.obDr}，贷方合计 ${f.obCr}，已经平衡。`] : [false, `借贷相差 ${f.obDiff}，要先补齐，报表才会正确。`],
    tip:f.frozen ? '已经有锁账的月份，所以这里现在是只读。' : '只在开账时填一次。收入和费用不用填，它们每年从零开始。'};
  if (i === 3) {
    const s = f.sample;
    return {
      title:'分类账：按科目看每一笔',
      body:`<p>每个科目一张卡片：左边记借方，右边记贷方，底下是余额。对银行户口来说，左边是钱进来，右边是钱出去。</p>`
        + (s ? `<p>比如 <b>${s.code} ${s.name}</b>：期初 ${s.ob}，借方${s.cash ? '（进）' : ''} ${s.dr}，贷方${s.cash ? '（出）' : ''} ${s.cr}，余额 <b>${s.bal}</b>，共 ${s.n} 笔。</p>`
          : '<p>这本账还没有凭证，记几笔之后这里就会出现每个科目的卡片。</p>'),
      tip:'想知道某个科目「为什么是这个数」，就来这里。点卡片里的 J 编号可以打开那张凭证；上面的「资产 / 负债 / 损益」可以只看某一类。'};
  }
  if (i === 4) return {
    title:'试算平衡表：检查借贷是否相等',
    body:`<p>把所有科目${f.month}的余额排成一张表。复式记账每一笔都借贷相等，所以两边合计也必须相等：现在借方 ${f.tbDr}，贷方 ${f.tbCr}。</p>
      <p>表里有三组数字：<b>未调整</b>（日常凭证）＋ <b>调整分录</b>（月底计提、折旧等带「调整」标签的凭证）＝ <b>调整后</b>。报表用的是调整后的数字。</p>`,
    status:f.tbOk ? [true, '表格最下面的合计行两边相等，三个 ✓ 都亮了：记账的算术没有错。'] : [false, '表格最下面出现了 ✗：有借贷不等的地方，请先到「凭证查询」找出来。'],
    tip:'平衡只说明算术没错：记错科目或者漏记整笔交易，试算表发现不了，还要对照银行流水和单据。'};
  return {
    title:'年结分录预览：年底怎么结账',
    body:`<p>年底要把收入和费用「清零」，全年的结果转入 <b>${f.reName}</b>，新的一年从零开始算利润。这里列出会做的结转：本年${f.npLoss ? '亏损' : '利润'} <b>${f.np}</b>。</p>`,
    tip:`这里只是预览，系统不会真的记这些分录；资产负债表已经自动把本年${f.npLoss ? '亏损' : '利润'}算进 ${f.reName}。`};
}

function cardHTML(i, f){
  const c = content(i, f);
  const count = i ? `第 ${i} 步 / 共 ${LAST} 步 · ${NAMES[tabOf(i)]}` : `使用教程 · 共 ${LAST} 步`;
  const next = i < LAST ? `下一步：${NAMES[tabOf(i + 1)]}` : '完成';
  const status = c.status ? `<p class="guide-status${c.status[0] ? '' : ' bad'}">${c.status[0] ? '✓' : '✗'} ${c.status[1]}</p>` : '';
  const dots = Array.from({length:LAST + 1}, (_, k) => `<span class="${k === i ? 'on' : k < i ? 'done' : ''}"></span>`).join('');
  return `<section class="guide-card" aria-labelledby="guide-title">
    <div class="guide-head"><span class="guide-count">${count}</span><span class="guide-dots" aria-hidden="true">${dots}</span>
      <button type="button" class="guide-x" id="guide-close" data-act="guide" data-v="close" aria-label="关闭教程">×</button></div>
    <h3 id="guide-title" tabindex="-1">${c.title}</h3>
    <div class="guide-body">${c.body}</div>${status}
    <p class="guide-tip">${c.tip}</p>
    <div class="guide-actions">${i ? '<button type="button" class="btn" id="guide-prev" data-act="guide" data-v="prev">上一步</button>' : ''}<button type="button" class="btn primary" id="guide-next" data-act="guide" data-v="next">${next}</button></div>
  </section>`;
}

window.AccountingLedgerGuide = {TABS, LAST, stepOf, tabOf, cardHTML};
})();

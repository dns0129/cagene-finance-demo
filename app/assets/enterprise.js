/* Enterprise ledger rules shared by the report and posting workspaces. */
(() => {
'use strict';

const monthEnd = (year, month) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
const monthOf = date => Number(date.slice(5, 7));
const closedThrough = book => book.periodHistory?.at(-1)?.to || 0;
const locked = (book, date) => typeof date === 'string' && monthOf(date) <= closedThrough(book);
const periodFor = (book, month) => ({
  start: `${book.company.year}-01-01`,
  end: monthEnd(+book.company.year, month),
  month,
  year: +book.company.year,
});
const CLOSE_ITEMS = [
  ['cash', '已核对现金和银行流水，并处理差异'],
  ['balance', '已核对应收、应付及相关明细余额'],
  ['adjust', '已检查截止日期、计提、折旧及其他期末调整'],
  ['reports', '已复核本期报表和试算平衡表'],
];

function validateHistory(book) {
  if (!Object.hasOwn(book, 'periodHistory')) return;
  if (!Array.isArray(book.periodHistory) || book.periodHistory.length > 1000) throw new Error('月结记录格式不正确');
  let through = 0;
  for (const event of book.periodHistory) {
    if (!event || event.from !== through || !Number.isInteger(event.to) || event.to < 0 || event.to > 12 ||
      event.to === through || !Number.isFinite(Date.parse(event.at)) || typeof event.reason !== 'string' ||
      event.reason.length > 200 || (event.to < through && !event.reason.trim())) throw new Error('月结记录格式不正确');
    through = event.to;
  }
}

const HEADERS = ['凭证号','日期','摘要','往来对象','科目代码','借方','贷方','调整'];
const csv = rows => '\uFEFF' + rows.map(row => row.map(value => {
  let v = String(value ?? '');
  if (typeof value !== 'number' && /^[\s\uFEFF]*[=+\-@]/.test(v)) v = "'" + v;
  return '"' + v.replace(/"/g, '""') + '"';
}).join(',')).join('\r\n');

function readCsv(text) {
  if (text.length > 300_000) throw new Error('CSV 超过 30 万字符，请分批导入');
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', state = 'start';
  const fieldDone = () => { row.push(field.trim()); field = ''; state = 'start'; };
  const rowDone = () => { fieldDone(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === 'quoted') {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else state = 'closed';
    } else if (c === ',') fieldDone();
    else if (c === '\n' || c === '\r') { rowDone(); if (c === '\r' && text[i + 1] === '\n') i++; }
    else if (state === 'start' && c === '"') state = 'quoted';
    else if (c === '"' || state === 'closed') throw new Error('CSV 引号格式不正确，请使用标准 CSV 文件');
    else { state = 'text'; field += c; }
  }
  if (state === 'quoted') throw new Error('CSV 中有未闭合的引号');
  rowDone();
  return rows;
}

function parseVouchers(text, {book, accounts, validDate}) {
  const [headers, ...rows] = readCsv(text);
  const trad = window.AccountingLocale?.traditional || (value=>value);
  if (!headers || headers.length !== HEADERS.length || !HEADERS.every((h, i) => h === headers[i] || trad(h) === trad(headers[i]))) throw new Error('表头不匹配，请使用本页提供的凭证 CSV 模板');
  if (!rows.length || rows.length > 1000) throw new Error('每批需要 1–1,000 行凭证明细');
  const refs = new Set(book.txns.map(t => String(t.ref || '').trim().toLowerCase()).filter(Boolean));
  const vouchers = new Map();
  const cents = val => {
    if (!val) return 0;
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(val)) return NaN;
    const [d, c = ''] = val.split('.');
    return Number(d) * 100 + Number(c.padEnd(2, '0'));
  };
  rows.forEach((row, i) => {
    const [ref, date, memo, party, account, debit, credit, adj] = row;
    const fail = message => { throw new Error(`第 ${i + 1} 条明细：${message}`); };
    if (row.length !== HEADERS.length) fail('列数不匹配');
    if (!ref || ref.length > 60 || !memo || memo.length > 120 || party.length > 80) fail('凭证号和摘要必填，请检查文字长度');
    const key = ref.toLowerCase();
    if (refs.has(key)) fail(`凭证号 ${ref} 已存在`);
    if (!validDate(date, book.company.year)) fail('日期必须在当前会计年度内');
    if (locked(book, date)) fail(`${date} 所在期间已锁定`);
    if (!Object.hasOwn(accounts, account) || accounts[account].hidden) fail('会计科目代码无效');
    if (!['', '否', '是'].includes(adj)) fail('调整列只接受「是」或「否」');
    const d = cents(debit), c = cents(credit);
    if (!Number.isFinite(d) || !Number.isFinite(c) || (!!d === !!c)) fail('每行只能填写一侧正金额，最多两位小数');
    if (!vouchers.has(key)) vouchers.set(key, {ref,date,memo,party,adj:adj === '是',tpl:'custom',src:'csv',groups:[[]]});
    const v = vouchers.get(key);
    if (v.ref !== ref || v.date !== date || v.memo !== memo || v.party !== party || v.adj !== (adj === '是')) fail('同一凭证号的日期、摘要、往来对象和调整标记必须一致');
    // The company's own codes resolve to the system account behind them; a bank's code also picks the bank.
    const acc = accounts[account], line = {a:acc.c || account, s:d-c};
    if (acc.cash && acc.cash !== 'main') line.cashAccount = acc.cash;
    v.groups[0].push(line);
  });
  const result = [...vouchers.values()];
  for (const v of result) if (v.groups[0].length < 2 || v.groups[0].reduce((sum, l) => sum + l.s, 0) !== 0) throw new Error(`凭证 ${v.ref} 借贷不平衡`);
  return result;
}

function monthlySeries(report, accounts) {
  const out = Array.from({length:report.month}, (_, index) => ({month:index + 1, revenue:0, profit:0, cashMove:0, cashEnd:0, count:0}));
  for (const txn of report.entries) {
    const m = out[monthOf(txn.date) - 1];
    if (!txn.auto) m.count++;
    for (const l of txn.groups.flat()) {
      const acc = accounts[l.a];
      if (acc.pl === 'rev') m.revenue -= l.s;
      if (acc.pl) m.profit -= l.s;
      if (l.a === '1000') m.cashMove += l.s;
    }
  }
  let cash = report.CF.openCash;
  for (const m of out) { cash += m.cashMove; m.cashEnd = cash; }
  return out;
}
window.AccountingEnterprise = {monthEnd, monthOf, closedThrough, locked, periodFor, CLOSE_ITEMS, validateHistory, csv, readCsv, HEADERS, parseVouchers, monthlySeries};
})();

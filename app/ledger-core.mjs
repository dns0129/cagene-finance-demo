// Runs the browser's pure ledger modules on the server, so a sales user's invoice
// status is computed by exactly the same code the accountant's page uses.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const text = value => String(value ?? '');
const window = {AccountingLocale:{current:'zh-CN', text, markup:text, escape:text, literal:text}};
const context = vm.createContext({window});
for (const name of ['enterprise.js', 'business-workflows.js', 'bank-reconciliation.js', 'sales-invoices.js']) {
  vm.runInContext(readFileSync(new URL('./assets/' + name, import.meta.url), 'utf8'), context, {filename:name});
}

// Values cross the vm boundary as plain JSON, so callers never hold objects from the other realm.
const plain = value => JSON.parse(JSON.stringify(value));
export const Invoices = window.AccountingInvoices;
export const parseLines = raw => plain(Invoices.parseLines(raw));
export const customers = book => book ? plain(Invoices.customers(book)) : [];
export const invoiceSummary = (book, asOf) => book ? plain(Invoices.summary(book, undefined, asOf).invoices.map(({txn, applications, returns, ...x}) => x)) : [];

export const Bank = window.AccountingBank;
export const Business = window.AccountingBusiness;
export const Enterprise = window.AccountingEnterprise;

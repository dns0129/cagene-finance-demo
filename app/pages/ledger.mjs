export const Bank=window.AccountingBank, Business=window.AccountingBusiness, Enterprise=window.AccountingEnterprise;
export const Invoices=window.AccountingInvoices;
export const parseLines=raw=>Invoices.parseLines(raw);
export const invoiceSummary=(book,asOf)=>book?Invoices.summary(book,undefined,asOf).invoices.map(({txn,applications,returns,...row})=>row):[];

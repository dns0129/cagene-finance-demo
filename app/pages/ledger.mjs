export const Bank=window.AccountingBank, Business=window.AccountingBusiness, Enterprise=window.AccountingEnterprise;
export const Invoices=window.AccountingInvoices;
export const parseLines=raw=>Invoices.parseLines(raw);
export function invoiceSummary(book,asOf){
  if(!book)return [];
  return Invoices.summary(book,undefined,asOf).invoices.map(invoice=>{
    const {txn,applications,returns,...summary}=invoice;
    return {...summary,print:Invoices.printData(invoice)};
  });
}

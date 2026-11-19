// Start a new business ledger while keeping the five demo identities available.
export function emptyDemo(fixture) {
  const {company,settings}=fixture.ledger;
  return {
    ledger:{v:1,company,settings,seq:0,opening:{},openingShares:0,txns:[],bankReconciliation:{}},
    members:fixture.members, customers:[], requests:[], staff:[], payroll:[], payrollAudit:[],
  };
}

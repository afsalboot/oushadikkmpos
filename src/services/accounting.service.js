export const ACCOUNT_DIRECTIONS={IN:"IN",OUT:"OUT"};
export const ACCOUNT_TRANSACTION_TYPES={SALE:"SALE",PURCHASE:"PURCHASE",EXPENSE:"EXPENSE"};

const money=(value)=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const text=(value)=>String(value??"").trim();
const validDate=(value)=>{const date=new Date(value);return Number.isNaN(date.getTime())?null:date;};
const startOfDay=(value)=>{if(/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return new Date(`${value}T00:00:00+05:30`);const date=validDate(value);if(!date)return null;date.setHours(0,0,0,0);return date;};
const endOfDay=(value)=>{if(/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return new Date(`${value}T23:59:59.999+05:30`);const date=validDate(value);if(!date)return null;date.setHours(23,59,59,999);return date;};
const storeDateKey=(value)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
const movementAmount=(movement)=>movement.direction===ACCOUNT_DIRECTIONS.IN?movement.amount:-movement.amount;

function normalizeSale(sale){
  let remaining=Math.max(0,Number(sale.total||0));
  const paymentBreakdown=[];
  for(const payment of sale.payments||[]){
    if(remaining<=0)break;
    const amount=money(Math.min(remaining,Math.max(0,Number(payment.amount||0))));
    if(!amount)continue;
    paymentBreakdown.push({method:text(payment.method||"CASH").toUpperCase(),amount,reference:text(payment.reference),paidAt:payment.paidAt||sale.createdAt});
    remaining=money(remaining-amount);
  }
  const amount=money(paymentBreakdown.reduce((sum,payment)=>sum+payment.amount,0));
  if(!amount)return null;
  const methods=[...new Set(paymentBreakdown.map((payment)=>payment.method))];
  return{id:`sale-${sale._id}`,sourceId:String(sale._id),date:paymentBreakdown[0]?.paidAt||sale.createdAt,direction:ACCOUNT_DIRECTIONS.IN,type:ACCOUNT_TRANSACTION_TYPES.SALE,source:"SALES",reference:sale.invoiceNumber,party:sale.customerSnapshot?.name||"Walk-in Customer",description:"Sale invoice",category:"",method:methods.join(" + "),paymentReference:paymentBreakdown.map((payment)=>payment.reference).filter(Boolean).join(", "),paymentBreakdown,amount,createdBy:sale.actorId?.name||sale.cashierSnapshot?.name||"Cashier",status:"POSTED",sourcePath:`/sales/${sale._id}`,sourceDetails:{invoiceNumber:sale.invoiceNumber,customer:sale.customerSnapshot?.name||"Walk-in Customer",itemCount:sale.items?.length||0}};
}

function normalizeExpense(expense,purchases){
  if(expense.status==="VOID")return null;
  const amount=money(expense.source==="PURCHASE"&&expense.paidAmount!==undefined?expense.paidAmount:expense.amount);
  if(!amount)return null;
  const purchase=expense.source==="PURCHASE"?purchases.get(String(expense.referenceId)):null,isPurchase=expense.source==="PURCHASE";
  const reference=expense.expenseNumber||(isPurchase?(purchase?.purchaseNumber||expense.description?.match(/PUR-[A-Z0-9-]+/)?.[0]||"Purchase"):expense.category);
  const party=isPurchase?(purchase?.supplierSnapshot?.name||"Supplier"):(expense.staffId?.name||expense.staffSnapshot?.name||expense.paidTo||expense.title||expense.category);
  return{id:`expense-${expense._id}`,sourceId:String(expense._id),date:expense.expenseDate||expense.createdAt,direction:ACCOUNT_DIRECTIONS.OUT,type:isPurchase?ACCOUNT_TRANSACTION_TYPES.PURCHASE:ACCOUNT_TRANSACTION_TYPES.EXPENSE,source:isPurchase?"PURCHASES":"EXPENSES",reference,party,description:expense.title||expense.description||expense.category,category:expense.category,method:text(expense.paymentMethod||"CASH").toUpperCase(),paymentReference:text(expense.paymentReference||purchase?.paymentReference),paymentBreakdown:[{method:text(expense.paymentMethod||"CASH").toUpperCase(),amount,reference:text(expense.paymentReference||purchase?.paymentReference),paidAt:expense.expenseDate||expense.createdAt}],amount,createdBy:expense.actorId?.name||expense.creatorSnapshot?.name||"System",status:"POSTED",sourcePath:isPurchase?`/purchases?search=${encodeURIComponent(purchase?.purchaseNumber||reference)}`:`/expenses?search=${encodeURIComponent(expense.expenseNumber||reference)}`,sourceDetails:isPurchase?{purchaseNumber:purchase?.purchaseNumber||reference,supplier:purchase?.supplierSnapshot?.name||"Supplier",supplierInvoiceNumber:purchase?.supplierInvoiceNumber||"",purchaseTotal:money(purchase?.total),amountPaid:money(purchase?.amountPaid),balanceDue:money(purchase?.balanceDue)}:{expenseNumber:expense.expenseNumber||reference,title:expense.title||expense.description,category:expense.category,recordedBy:expense.actorId?.name||expense.creatorSnapshot?.name||"System"}};
}

export function calculateRunningBalances(movements){
  let runningBalance=0;
  const methodBalances={};
  return[...movements].sort((left,right)=>new Date(left.date)-new Date(right.date)||left.id.localeCompare(right.id)).map((movement)=>{
    runningBalance=money(runningBalance+movementAmount(movement));
    for(const payment of movement.paymentBreakdown||[])methodBalances[payment.method]=money((methodBalances[payment.method]||0)+(movement.direction===ACCOUNT_DIRECTIONS.IN?payment.amount:-payment.amount));
    return{...movement,runningBalance,accountBalance:money(methodBalances[movement.paymentBreakdown?.[0]?.method]||0)};
  });
}

function matchesFilters(movement,options){
  const from=startOfDay(options.dateFrom||options.from),to=endOfDay(options.dateTo||options.to),date=validDate(movement.date);
  if(from&&date<from)return false;if(to&&date>to)return false;
  if(options.direction&&movement.direction!==options.direction)return false;
  if(options.transactionType?.length&&!options.transactionType.includes(movement.type))return false;
  if(options.source?.length&&!options.source.includes(movement.source))return false;
  if(options.paymentMethod?.length&&!movement.paymentBreakdown.some((payment)=>options.paymentMethod.includes(payment.method)))return false;
  const search=text(options.search).toLowerCase();
  return !search||`${movement.reference} ${movement.party} ${movement.description} ${movement.category} ${movement.paymentReference} ${movement.createdBy}`.toLowerCase().includes(search);
}

function summarize(movements){
  const moneyIn=money(movements.filter((movement)=>movement.direction===ACCOUNT_DIRECTIONS.IN).reduce((sum,movement)=>sum+movement.amount,0));
  const moneyOut=money(movements.filter((movement)=>movement.direction===ACCOUNT_DIRECTIONS.OUT).reduce((sum,movement)=>sum+movement.amount,0));
  return{moneyIn,moneyOut,netCashFlow:money(moneyIn-moneyOut)};
}

function paymentSummary(movements,enabledMethods){
  const summary=Object.fromEntries(enabledMethods.map((method)=>[method,{method,moneyIn:0,moneyOut:0,net:0}]));
  for(const movement of movements)for(const payment of movement.paymentBreakdown||[]){
    if(!summary[payment.method])continue;
    const key=movement.direction===ACCOUNT_DIRECTIONS.IN?"moneyIn":"moneyOut";
    summary[payment.method][key]=money(summary[payment.method][key]+payment.amount);
  }
  return Object.values(summary).map((entry)=>({...entry,net:money(entry.moneyIn-entry.moneyOut)}));
}

function cashFlow(movements){
  const days=new Map();
  for(const movement of movements){
    const key=storeDateKey(movement.date),row=days.get(key)||{date:key,moneyIn:0,moneyOut:0,net:0};
    if(movement.direction===ACCOUNT_DIRECTIONS.IN)row.moneyIn=money(row.moneyIn+movement.amount);else row.moneyOut=money(row.moneyOut+movement.amount);
    row.net=money(row.moneyIn-row.moneyOut);days.set(key,row);
  }
  return[...days.values()].sort((left,right)=>left.date.localeCompare(right.date));
}

export function buildAccountLedger(sales=[],expenses=[],options={}){
  const purchases=new Map((options.purchases||[]).map((purchase)=>[String(purchase._id),purchase]));
  const raw=[...sales.map(normalizeSale),...expenses.map((expense)=>normalizeExpense(expense,purchases))].filter(Boolean);
  const chronological=calculateRunningBalances(raw),filtered=chronological.filter((movement)=>matchesFilters(movement,options));
  const enabledMethods=(options.enabledMethods?.length?options.enabledMethods:[...new Set(chronological.flatMap((movement)=>movement.paymentBreakdown.map((payment)=>payment.method)))]).filter(Boolean);
  const order=options.order==="asc"?1:-1,sort=options.sort||"date";
  const sorted=[...filtered].sort((left,right)=>{const comparison=sort==="amount"?left.amount-right.amount:sort==="type"?left.type.localeCompare(right.type):new Date(left.date)-new Date(right.date);return comparison*order||(left.id.localeCompare(right.id)*order);});
  const page=Math.max(1,Number(options.page)||1),limit=Math.min(1000,Math.max(1,Number(options.limit)||25)),total=sorted.length;
  const allSummary=summarize(chronological),periodSummary=summarize(filtered),balances=paymentSummary(chronological,enabledMethods);
  return{movements:sorted.slice((page-1)*limit,page*limit),pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},summary:{...periodSummary,balance:allSummary.netCashFlow,cashBalance:balances.find((entry)=>entry.method==="CASH")?.net||0,digitalBalance:money(balances.filter((entry)=>entry.method!=="CASH").reduce((sum,entry)=>sum+entry.net,0))},paymentMethods:paymentSummary(filtered,enabledMethods),enabledMethods,cashFlow:cashFlow(filtered),supportedTypes:Object.values(ACCOUNT_TRANSACTION_TYPES),supportedSources:["SALES","PURCHASES","EXPENSES"]};
}

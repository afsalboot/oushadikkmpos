const amount = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function isWholesaleSale(sale) {
  return (
    sale?.saleType === "WHOLESALE" ||
    (sale?.items || []).some((item) => item.saleMode === "WHOLESALE")
  );
}

export function wholesaleLineQuantities(item) {
  if (item?.saleMode !== "WHOLESALE")
    return { paid: 0, free: 0, outgoing: 0 };
  const paid = Number(item.paidQuantity || 0);
  const free = Number(item.freeQuantity || 0);
  return {
    paid: amount(paid),
    free: amount(free),
    outgoing: amount(Number(item.totalOutgoingQuantity || paid + free)),
  };
}

export function summarizeWholesaleSales(sales = []) {
  const products = new Map();
  const customers = new Set();
  let invoices = 0,
    revenue = 0,
    paidQuantity = 0,
    freeQuantity = 0,
    totalOutgoing = 0;

  for (const sale of sales) {
    if (!isWholesaleSale(sale)) continue;
    invoices += 1;
    revenue += Number(sale.total || 0);
    if (sale.customerId) customers.add(String(sale.customerId));
    for (const item of sale.items || []) {
      if (item.saleMode !== "WHOLESALE") continue;
      const quantities = wholesaleLineQuantities(item);
      paidQuantity += quantities.paid;
      freeQuantity += quantities.free;
      totalOutgoing += quantities.outgoing;
      const id = String(item.productId?._id || item.productId || item.name);
      const current = products.get(id) || {
        id,
        name: item.name || item.productId?.name || "Product",
        revenue: 0,
        paidQuantity: 0,
        freeQuantity: 0,
        totalOutgoing: 0,
      };
      current.revenue += Number(item.total || 0);
      current.paidQuantity += quantities.paid;
      current.freeQuantity += quantities.free;
      current.totalOutgoing += quantities.outgoing;
      products.set(id, current);
    }
  }

  return {
    invoices,
    customers: customers.size,
    revenue: amount(revenue),
    averageInvoice: invoices ? amount(revenue / invoices) : 0,
    paidQuantity: amount(paidQuantity),
    freeQuantity: amount(freeQuantity),
    totalOutgoing: amount(totalOutgoing),
    products: [...products.values()]
      .map((product) => ({
        ...product,
        revenue: amount(product.revenue),
        paidQuantity: amount(product.paidQuantity),
        freeQuantity: amount(product.freeQuantity),
        totalOutgoing: amount(product.totalOutgoing),
      }))
      .sort((left, right) => right.revenue - left.revenue),
  };
}

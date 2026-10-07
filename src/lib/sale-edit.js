// Editing returns consumed stock to its original batches. Packages opened for
// loose sales stay open; counted units are never inferred from package weight.
export function saleEditProblem(sale) {
  if (!sale) return "Sale not found";
  if (sale.documentStatus === "CANCELLED") return "Cancelled sales cannot be edited.";
  if (sale.gstEnabled || Number(sale.tax) > 0 || (sale.documentType && sale.documentType !== "COMMERCIAL_INVOICE")) return "This tax document is locked. Use the invoice correction workflow.";
  if (sale.paymentStatus !== "PAID" || Number(sale.balanceDue) > 0) return "Credit and partially paid sales cannot be edited here.";
  return null;
}

export function saleStockReturns(sale, rows) {
  if (Array.isArray(sale.stockAllocations) && sale.stockAllocations.length) return sale.stockAllocations;
  return rows.filter(row => row.direction === "OUT").map(row => {
    let mode;
    if (["PACKAGE_SALE", "WHOLESALE_FREE"].includes(row.type)) mode = "PACKAGE";
    else if (["LOOSE_SALE", "MIXTURE_SALE"].includes(row.type)) mode = "LOOSE";
    else if (row.type === "WHOLESALE_SALE") {
      const modes = new Set(sale.items.filter(item => String(item.productId) === String(row.productId)).map(item => item.wholesaleUnit === item.baseUnit && Number(item.unitsPerWholesalePack) === 1 ? "LOOSE" : "PACKAGE"));
      if (modes.size === 1) mode = [...modes][0];
    }
    if (!row.batchId || !mode) throw new Error("The original batch allocation is ambiguous. This sale cannot be edited safely.");
    return { productId: row.productId, batchId: row.batchId,
      sealedPackages: mode === "PACKAGE" ? -Number(row.packageQuantity || 0) : 0,
      openQuantity: mode === "LOOSE" ? -Number(row.looseQuantity || row.baseQuantity || 0) : 0 };
  });
}

export function creditSaleStock(products, allocations) {
  return products.map(product => {
    const returned = allocations.filter(row => String(row.productId) === String(product._id));
    const packages = returned.reduce((sum, row) => sum + Number(row.sealedPackages), 0);
    const loose = returned.reduce((sum, row) => sum + Number(row.openQuantity), 0);
    const counted = product.loosePricingMethod === "count_based";
    const stock = { ...product.stock,
      sealedPackages: Number(product.stock?.sealedPackages || 0) + packages,
      openQuantity: Number(product.stock?.openQuantity || 0) + loose,
      totalBaseQuantity: Number(product.stock?.totalBaseQuantity || 0) + loose + (counted ? 0 : packages * Number(product.packageSize)) };
    if (counted) stock.totalLooseQuantity = stock.openQuantity + (product.looseConversionType === "fixed" ? stock.sealedPackages * Number(product.unitsPerPackage || 0) : 0);
    stock.hasStock = stock.sealedPackages > 0 || stock.openQuantity > 0;
    return { ...product, stock };
  });
}

export function saleEditCart(sale, products) {
  const byId = new Map(products.map(product => [String(product._id), product]));
  const get = id => {
    const product = byId.get(String(id));
    if (!product) throw new Error("A billed product is unavailable. Restore it in Products before editing this sale.");
    return product;
  };
  return sale.items.map((item, index) => {
    if (item.kind === "MIX") {
      const ingredients = item.ingredients.map(ingredient => ({ ...get(ingredient.productId), loosePricePerUnit: ingredient.unitPrice, baseQuantity: ingredient.baseQuantity }));
      const ingredientTotal = item.ingredients.reduce((sum, ingredient) => sum + Number(ingredient.total || 0), 0);
      return { ...item, _id: `mix-edit-${index}`, billedLineIndex: index, ingredients, packagingPrice: Math.max(0, Number(item.unitPrice) - ingredientTotal), packageSellingPrice: item.unitPrice };
    }
    const product = get(item.productId);
    const wholesale = item.saleMode === "WHOLESALE";
    return { ...product, kind: "PRODUCT", productId: String(item.productId),
      _id: item.saleMode === "PACKAGE" ? String(item.productId) : `${item.productId}-edit-${index}`,
      saleMode: item.saleMode, quantity: item.quantity,
      looseQuantity: item.saleMode === "LOOSE" ? item.quantity : 0,
      packageSellingPrice: item.saleMode === "PACKAGE" ? item.unitPrice : product.packageSellingPrice,
      loosePricePerUnit: item.saleMode === "LOOSE" ? item.unitPrice : product.loosePricePerUnit,
      billedLineIndex: index, freeQuantity: item.freeQuantity || 0,
      saleWholesaleDiscountPercent: item.wholesaleDiscountPercent || 0,
      ...(wholesale ? { sellBy: item.wholesaleUnit === item.baseUnit ? "LOOSE" : item.wholesaleUnit,
        wholesaleTotal: Number(item.unitPrice) * Number(item.paidQuantity || item.quantity), wholesalePriceApplied: item.unitPrice,
        manualFreeQuantity: item.manualFree ? item.freeQuantity : undefined, manualFreeReason: item.manualFreeReason } : {}),
      openPackageCounts: [] };
  });
}

// Browsing metadata only. Never pass an index row into pricing or inventory code.
export const SALES_INDEX_LIMIT = 10000;
export const SALES_INDEX_FIELDS = 'name sku barcode manufacturer categoryId packageSellingPrice baseUnit packageType allowPackageSale allowLooseSale allowMixture loosePricingMethod updatedAt';
export const normalizeSalesSearch = (value = '') => String(value).normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

export function salesIndexRow(product, categoryName = '') {
  return {
    _id: String(product._id), name: product.name, sku: product.sku || '', barcode: product.barcode || undefined,
    revision: product.updatedAt ? Number(new Date(product.updatedAt)) : undefined,
    categoryId: product.categoryId ? String(product.categoryId) : '', categoryName,
    searchText: [product.name, product.sku, product.barcode, product.manufacturer, categoryName].map(value => normalizeSalesSearch(value || '')).join('\u001f'),
    packageSellingPrice: product.packageSellingPrice, baseUnit: product.baseUnit, packageType: product.packageType,
    // Omit default values on the wire, with explicit defaults in the UI adapter.
    allowPackageSale: product.allowPackageSale === false ? false : undefined,
    allowLooseSale: product.allowLooseSale || undefined,
    allowMixture: product.allowMixture || undefined,
    loosePricingMethod: product.loosePricingMethod === 'count_based' ? 'count_based' : undefined,
  };
}

export function buildBarcodeMap(rows) {
  const map = new Map();
  for (const row of rows) if (row.barcode) map.set(row.barcode.trim(), row);
  return map;
}

export function searchSalesIndex(rows, { search = '', mode = 'PRODUCT', filter = 'All', page = 1, limit = 50, stockIds } = {}) {
  const query = normalizeSalesSearch(search);
  let matches = rows.filter(row => (!query || row.searchText.includes(query)) &&
    (mode === 'MIX' ? row.allowMixture : stockIds ? stockIds.has(row._id) : filter === 'Loose Sale' ? row.allowLooseSale : filter === 'All' || row.categoryName === filter));
  if (query) {
    const barcode = search.trim();
    matches = matches.map(row => {
      const [name, sku] = row.searchText.split('\u001f');
      return { row, rank: row.barcode?.trim() === barcode ? 0 : sku === query ? 1 : name.startsWith(query) ? 2 : name.includes(query) ? 3 : 4 };
    }).sort((a, b) => a.rank - b.rank).map(match => match.row);
  }
  const pages = Math.max(1, Math.ceil(matches.length / limit));
  page = Math.min(page, pages);
  return { rows: matches.slice((page - 1) * limit, page * limit), pagination: { page, pages, total: matches.length, limit } };
}

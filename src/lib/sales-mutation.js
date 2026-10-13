// A compact, non-sensitive invalidation message shared with other tabs.
export function salesMutation(url, method, body = {}, data = {}) {
  const parsed = new URL(url, 'http://pos.local');
  const path = parsed.pathname;
  if (path.startsWith('/api/auth/')) return { kind: 'session', ids: [] };
  if (!/^\/api\/(products|sales|purchases|inventory|stock|categories|backups)(\/|$)/.test(path)) return { kind: 'unrelated', ids: [] };
  const ids = new Set();
  const add = value => { const id = typeof value === 'object' && value ? value._id : value; if (typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) ids.add(id); };
  const items = value => {
    if (!value || typeof value !== 'object') return;
    add(value.productId);
    for (const id of value.affectedProductIds || []) add(id);
    for (const id of value.ids || []) add(id);
    for (const row of value.items || []) { add(row.productId); items(row); }
    for (const row of value.ingredients || []) add(row.productId);
    for (const row of value.freeProducts || []) add(row.productId);
  };
  items(body); items(data);
  if (path.startsWith('/api/products')) {
    if (path === '/api/products/import') return { kind: body.previewOnly ? 'unrelated' : 'catalogue-batch', ids: [] };
    add(body.id); add(data._id); add(parsed.searchParams.get('id'));
    add(path.match(/^\/api\/products\/([a-f\d]{24})(?:\/|$)/i)?.[1]);
    add(body.targetId);
    for (const id of body.sourceIds || []) add(id);
    const stockOnly = /\/(stock|adjustment|batches)(\/|$)/.test(path);
    const removed = method === 'DELETE' ? [...ids] : (body.sourceIds || []).filter(id => /^[a-f\d]{24}$/i.test(id));
    return { kind: stockOnly ? 'stock' : ids.size ? 'products' : 'catalogue', ids: [...ids], removed };
  }
  if (path.startsWith('/api/categories') || path.startsWith('/api/backup')) return { kind: 'catalogue', ids: [] };
  // An idempotent edit retry may omit products returned by the original bill.
  return { kind: 'stock', ids: body.editSaleId && !data.affectedProductIds?.length ? [] : [...ids] };
}

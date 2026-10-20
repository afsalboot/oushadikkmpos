import { requireSession } from '@/lib/auth';
import { connectDb } from '@/lib/db';
import { ok, fail, apiError } from '@/lib/api';
import { requestTiming } from '@/lib/performance';
import { getSalesIndex, getSalesRevision } from '@/services/sales-index.service';
import { salesCacheResponse } from '@/lib/sales-cache-scope';
import mongoose from 'mongoose';
import { SALES_INDEX_SCHEMA_VERSION } from '@/lib/sales-search';

export async function GET(request) {
  const timing = requestTiming('sales-index');
  try {
    const session = await timing.measure('auth', () => requireSession(['sales.view', 'products.view']));
    await timing.measure('connection', () => connectDb());
    const parameters = new URL(request.url).searchParams;
    const ids = parameters.has('ids') ? [...new Set(parameters.get('ids').split(',').filter(Boolean))] : undefined;
    if (ids && (!ids.length || ids.length > 200 || ids.some(id => !mongoose.isValidObjectId(id)))) return timing.finish(fail('Invalid product selection', 422));
    const version = ids ? undefined : await getSalesRevision(timing);
    const etag = version ? `W/"sales-v${SALES_INDEX_SCHEMA_VERSION}-${version}"` : undefined;
    if (etag && request.headers.get('if-none-match') === etag) {
      const response = salesCacheResponse(new Response(null, { status: 304, headers: { ETag: etag } }), session);
      return timing.finish(response);
    }
    const index = await getSalesIndex(timing, ids);
    const response = await timing.measure('serialization', () => ok({ ...index, schemaVersion: SALES_INDEX_SCHEMA_VERSION, version, ...(ids ? { removedIds: ids.filter(id => !index.rows.some(row => row._id === id)) } : {}) }));
    if (etag) response.headers.set('ETag', etag);
    if (process.env.POS_PERFORMANCE_LOG === '1') console.info(JSON.stringify({ performance: 'sales-index-payload', count: index.rows.length, bytes: Buffer.byteLength(await response.clone().text()), complete: index.complete }));
    return timing.finish(salesCacheResponse(response, session));
  } catch (error) { return timing.finish(apiError(error)); }
}

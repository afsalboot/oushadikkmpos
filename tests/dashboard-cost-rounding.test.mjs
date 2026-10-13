import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDashboardCostRounding } from '../src/lib/dashboard-sales-pipeline.js';

test('half-cent cost ties preserve the existing per-invoice JS rounding for period and chart profit', () => {
  const sales = { summary: [{ _id: 'current', profit: 20 }, { _id: 'previous', profit: 10 }], chart: [{ _id: { slot: 0, period: 'current' }, profit: 20 }, { _id: { slot: 0, period: 'previous' }, profit: 10 }], costCorrections: [{ period: 'current', slot: 0, rawCost: 0.005, estimatedCost: 0 }, { period: 'previous', slot: 0, rawCost: 0.015, estimatedCost: 0.02 }] };
  applyDashboardCostRounding(sales);
  assert.equal(sales.summary[0].profit, 19.99);
  assert.equal(sales.chart[0].profit, 19.99);
  assert.equal(sales.summary[1].profit, 10.01);
  assert.equal(sales.chart[1].profit, 10.01);
});

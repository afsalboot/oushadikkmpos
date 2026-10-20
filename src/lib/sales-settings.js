// Only configuration used to browse, price, collect and print a sale. Store
// administration, security, backups and retention configuration stay private.
export function salesSettings(settings, actor) {
  const keys = ['storeName', 'store', 'checkout', 'discount', 'roundOff', 'gst', 'payments',
    'inventory', 'batchExpiry', 'looseSales', 'customMix', 'wholesale', 'customers', 'invoice', 'receipt'];
  return { ...Object.fromEntries(keys.filter(key => settings[key] !== undefined).map(key => [key, settings[key]])),
    _capabilities: { role: actor.role, customerLookup: actor.role === 'ADMIN' || actor.permissions?.includes('customers.view') === true } };
}

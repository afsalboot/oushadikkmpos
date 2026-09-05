export function selectedFilterValues(event) {
  return Array.from(event.currentTarget.selectedOptions, (option) => option.value).filter(Boolean);
}

export function serializedFilterEntries(filters) {
  return Object.entries(filters).flatMap(([key, value]) => {
    if (Array.isArray(value)) return value.length ? [[key, JSON.stringify(value)]] : [];
    return value === "" || value === null || value === undefined ? [] : [[key, String(value)]];
  });
}

export function hasFilterValue(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export function queryValues(parameters, key, allowed) {
  const values = parameters.getAll(key).flatMap((value) => {
    const raw=String(value).trim();
    if(raw.startsWith("[")){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed;}catch{ /* Fall through to the legacy comma format. */ }}
    return raw.split(",");
  }).map((value) => String(value).trim()).filter(Boolean);
  const unique = [...new Set(values)];
  return allowed ? unique.filter((value) => allowed.includes(value)) : unique;
}

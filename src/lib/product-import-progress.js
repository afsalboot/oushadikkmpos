export async function importProductsWithProgress(rows, sendBatch, onProgress) {
  const result = { imported: 0, skipped: 0, failed: 0, results: [] };
  onProgress({ completed: 0, total: rows.length, percent: 0 });
  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = rows.slice(offset, offset + 10);
    let response;
    try {
      response = await sendBatch(batch);
    } catch (error) {
      result.interrupted = true;
      result.error = error.message;
      rows.slice(offset).forEach((row, index) => result.results.push({
        row: offset + index + 2, name: row.name,
        status: index < batch.length ? "UNCONFIRMED" : "NOT_ATTEMPTED",
        errors: [index < batch.length ? "Connection interrupted. Check the product list before importing this row again; it may have been saved." : "Not attempted because the import was interrupted."],
      }));
      return result;
    }
    result.imported += response.imported;
    result.skipped += response.skipped;
    result.failed += response.failed;
    result.results.push(...response.results.map(entry => ({ ...entry, row: entry.row + offset })));
    const completed = offset + batch.length;
    onProgress({ completed, total: rows.length, percent: Math.floor(completed / rows.length * 100) });
  }
  return result;
}

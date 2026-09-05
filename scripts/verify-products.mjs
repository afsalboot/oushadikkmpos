import mongoose from "mongoose";
import { SignJWT } from "jose";

const baseUrl = process.env.PROBE_BASE_URL;
const marker = `VERIFY_${Date.now()}`;
const categoryName = `Verify ${marker}`;
const singleSku = `${marker}_ONE`;
const importSku = `${marker}_CSV`;
let categoryId;

async function request(path, token, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Cookie: `oushadi_session=${token}`, ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: ${result.error || response.status}`);
  return result.data;
}

try {
  await mongoose.connect(process.env.MONGODB_URI);
  const database = mongoose.connection.db;
  const admin = await database.collection("users").findOne({ role: "ADMIN", active: true });
  if (!admin) throw new Error("No active admin is available for the product API probe");
  const token = await new SignJWT({ sub: String(admin._id), role: "ADMIN", name: admin.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));

  const category = await request("/api/categories", token, { method: "POST", body: JSON.stringify({ name: categoryName }) });
  categoryId = category._id;
  await request("/api/products", token, {
    method: "POST",
    body: JSON.stringify({ name: `Single ${marker}`, sku: singleSku, categoryId, baseUnit: "ml", packageType: "Bottle", packageSize: 100, packageSellingPrice: 50, openingPackages: 2, allowPackageSale: true }),
  });
  const listed = await request(`/api/products?q=${encodeURIComponent(singleSku)}`, token);
  if (listed.length !== 1 || listed[0].stockLabel !== "2 Bottles") throw new Error("Single product creation did not reconcile opening stock");
  const productId = listed[0]._id;
  await request("/api/products", token, {
    method: "PUT",
    body: JSON.stringify({ id: productId, name: `Edited ${marker}`, sku: singleSku, categoryId, baseUnit: "ml", packageType: "Bottle", packageSize: 100, packageSellingPrice: 55, allowPackageSale: true }),
  });
  await request("/api/products", token, { method: "PATCH", body: JSON.stringify({ id: productId, visibleInSales: false }) });
  const hiddenFromSales = await request(`/api/products?sales=true&q=${encodeURIComponent(singleSku)}`, token);
  if (hiddenFromSales.length !== 0) throw new Error("Hidden product remained visible in Sales");
  await request(`/api/products/${productId}/stock`, token, { method: "POST", body: JSON.stringify({ sealedPackages: 4, openQuantity: 25, note: "Automated verification" }) });
  const adjusted = await request(`/api/products?q=${encodeURIComponent(singleSku)}`, token);
  if (adjusted[0]?.stockLabel !== "4 Bottles + 25 ml Open") throw new Error("Physical stock adjustment did not reconcile");

  const imported = await request("/api/products/import", token, {
    method: "POST",
    body: JSON.stringify({ rows: [{ name: `Imported ${marker}`, sku: importSku, category: categoryName, baseUnit: "g", packageType: "Packet", packageSize: "100", packageSellingPrice: "75", openingPackages: "3", allowPackageSale: "true" }] }),
  });
  if (imported.imported !== 1 || imported.failed !== 0) throw new Error("CSV import API did not import the valid row");
  await request(`/api/products?id=${productId}`, token, { method: "DELETE" });
  if ((await request(`/api/products?q=${encodeURIComponent(singleSku)}`, token)).length !== 0) throw new Error("Product deletion did not remove the product");
  console.log("Product create/list/opening-stock probe: passed");
  console.log("Product edit/visibility/stock/delete probe: passed");
  console.log("Bulk import probe: passed");
} finally {
  if (mongoose.connection.readyState) {
    const database = mongoose.connection.db;
    const products = await database.collection("products").find({ sku: { $in: [singleSku, importSku] } }, { projection: { _id: 1 } }).toArray();
    const productIds = products.map((product) => product._id);
    if (productIds.length) {
      await database.collection("inventorybatches").deleteMany({ productId: { $in: productIds } });
      await database.collection("products").deleteMany({ _id: { $in: productIds } });
    }
    if (categoryId) await database.collection("categories").deleteOne({ _id: new mongoose.Types.ObjectId(categoryId), name: categoryName });
    await mongoose.disconnect();
    console.log("Temporary verification records removed");
  }
}

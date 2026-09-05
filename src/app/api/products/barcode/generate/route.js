import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { DocumentCounter, Product } from "@/models";

export async function POST() {
  try {
    await requireSession("products.create");
    await connectDb();
    let barcode;
    do {
      const counter = await DocumentCounter.findOneAndUpdate(
        { key: "PRODUCT_BARCODE:GLOBAL" },
        { $inc: { sequence: 1 } },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
      );
      barcode = `POS-${String(counter.sequence).padStart(8, "0")}`;
    } while (await Product.exists({ barcode }));
    return ok({ barcode, barcodeType: "CODE128" });
  } catch (error) {
    return apiError(error);
  }
}

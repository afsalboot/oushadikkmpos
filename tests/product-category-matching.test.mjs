import test from "node:test";
import assert from "node:assert/strict";
import { productCategoryKey } from "../src/lib/product-import-fields.js";

test("bulk category matching ignores case in both stored and imported names", () => {
  for (const stored of ["SYRUP", "syrup", "Syrup", " Syrup "]) {
    const categories = new Map([[productCategoryKey(stored), "existing-category-id"]]);
    for (const imported of ["SYRUP", "syrup", "SyRuP", " syrup "]) {
      assert.equal(categories.get(productCategoryKey(imported)), "existing-category-id");
    }
    assert.equal(categories.get(productCategoryKey("Syrups")), undefined);
    assert.equal(categories.get(productCategoryKey("Herbal Syrup")), undefined);
  }
});

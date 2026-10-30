import SalesWorkspaceModern from "@/components/SalesWorkspaceModern";
import SalesCheckoutHostV2 from "@/components/SalesCheckoutHostV2";
import SalesSuccessHost from "@/components/SalesSuccessHost";
import SalesBarcodeHost from "@/components/barcode/SalesBarcodeHost";
import { requireWorkspacePage } from "@/lib/server/workspace-access";

export default async function Page({ searchParams }) {
  const { edit } = await searchParams;
  const editSaleId = typeof edit === "string" && edit ? edit : null;
  if (editSaleId) await requireWorkspacePage("sales.edit");
  return <><SalesWorkspaceModern editSaleId={editSaleId}/><SalesBarcodeHost/><SalesCheckoutHostV2/><SalesSuccessHost/></>;
}

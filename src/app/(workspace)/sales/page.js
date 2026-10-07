import SalesWorkspaceModern from "@/components/SalesWorkspaceModern";
import SalesCheckoutHostV2 from "@/components/SalesCheckoutHostV2";
import SalesSuccessHost from "@/components/SalesSuccessHost";
import SalesBarcodeHost from "@/components/barcode/SalesBarcodeHost";
export default async function Page({searchParams}){const {edit}=await searchParams;return <><SalesWorkspaceModern editSaleId={typeof edit === "string" ? edit : null}/><SalesBarcodeHost/><SalesCheckoutHostV2/><SalesSuccessHost/></>;}

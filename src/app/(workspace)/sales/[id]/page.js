import SaleSourceDetails from "@/components/SaleSourceDetails";

export default async function Page({params}){const{id}=await params;return <SaleSourceDetails id={id}/>;}

import ReportCategoryScrollEnhancer from "@/components/ReportCategoryScrollEnhancer";
import ReportsWorkspace from "@/components/ReportsWorkspace";

export default async function Page({ searchParams }) {
  const initialReport = (await searchParams)?.report === "service-fees" ? "service-fees" : "overview";
  return (
    <>
      <ReportCategoryScrollEnhancer />
      <ReportsWorkspace initialReport={initialReport} />
    </>
  );
}

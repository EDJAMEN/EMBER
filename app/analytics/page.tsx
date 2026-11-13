import type { Metadata } from "next";
import { AnalyticsPage } from "./analytics-client";

export const metadata: Metadata = { title: "Analytics | EMBER" };

export default function Page() {
  return <AnalyticsPage />;
}

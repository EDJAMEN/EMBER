import type { Metadata } from "next";
import { IngestionPage } from "./ingestion-client";

export const metadata: Metadata = { title: "Ingestion | EMBER" };

export default function Page() {
  return <IngestionPage />;
}

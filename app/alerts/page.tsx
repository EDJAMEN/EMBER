import type { Metadata } from "next";
import { AlertsPage } from "./alerts-client";

export const metadata: Metadata = { title: "Alerts | EMBER" };

export default function Page() {
  return <AlertsPage />;
}

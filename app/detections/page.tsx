import type { Metadata } from "next";
import { DetectionsPage } from "./detections-client";

export const metadata: Metadata = { title: "Detections | EMBER" };

export default function Page() {
  return <DetectionsPage />;
}

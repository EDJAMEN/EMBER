import type { Metadata } from "next";
import { CalendarPage } from "./calendar-client";

export const metadata: Metadata = { title: "Burn calendar | EMBER" };

export default function Page() {
  return <CalendarPage />;
}

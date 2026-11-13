import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMBER — Emergency Monitoring & Burn-zone Early Response",
  description:
    "Harmonized real-time geospatial satellite thermal feeds (NASA MODIS & VIIRS) for disaster risk management and public safety.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 selection:bg-orange-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

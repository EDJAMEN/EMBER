import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950 py-8 text-xs text-zinc-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-200">EMBER</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">
                Emergency Monitoring & Burn-zone Early Response
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 max-w-xl">
              Harmonizing NASA MODIS & VIIRS telemetry for Disaster Risk Reduction and Management Councils (DRRMCs) and vulnerable settlement protection.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-zinc-400 font-mono text-[11px]">
            <Link href="/map" className="hover:text-orange-400 transition-colors">
              /map
            </Link>
            <Link href="/detections" className="hover:text-orange-400 transition-colors">
              /detections
            </Link>
            <Link href="/alerts" className="hover:text-orange-400 transition-colors">
              /alerts
            </Link>
            <Link href="/analytics" className="hover:text-orange-400 transition-colors">
              /analytics
            </Link>
            <Link href="/ingestion" className="hover:text-orange-400 transition-colors">
              /ingestion
            </Link>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
          <div>
            © {new Date().getFullYear()} EMBER Project. Strict PostGIS SRID 4326 compliance.
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <span>NASA FIRMS API</span>
            <span>•</span>
            <span>Supabase PostGIS</span>
            <span>•</span>
            <span>Next.js App Router</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

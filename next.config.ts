import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // turf's convex() → concaveman → rbush breaks when bundled ("RBush is not a constructor"); load it natively on the server.
  serverExternalPackages: ["@turf/turf"],
};

export default nextConfig;

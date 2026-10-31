import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["manifold-3d", "rhino3dm"],
  // A package-lock.json in the user home directory was being treated as the
  // workspace root, so the dev server never emitted the app routes.
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default nextConfig;

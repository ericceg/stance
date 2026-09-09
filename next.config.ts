import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser app can still be run with `next start`. Tauri packages this
  // self-contained server output and runs it only on the loopback interface.
  output: "standalone",
  experimental: {
    // The importer enforces a 10 MB file limit; leave room for multipart metadata.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;

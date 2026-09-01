import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The importer enforces a 10 MB file limit; leave room for multipart metadata.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;

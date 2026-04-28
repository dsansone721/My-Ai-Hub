/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // DALL-E 3 returns time-limited signed URLs hosted on Azure blob storage.
    remotePatterns: [
      { protocol: "https", hostname: "oaidalleapiprodscus.blob.core.windows.net" },
    ],
  },
  experimental: {
    // pdfkit ships .afm font files that webpack tries to bundle and fails to
    // resolve at runtime; loading these from node_modules keeps the route
    // module loadable. exceljs/pptxgenjs/mammoth/xlsx are already used via
    // dynamic import but listed here for safety in case Next bundling changes.
    serverComponentsExternalPackages: [
      "pdfkit",
      "exceljs",
      "pptxgenjs",
      "mammoth",
      "xlsx",
    ],
  },
};

module.exports = nextConfig;

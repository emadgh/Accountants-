/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1"],
};
export default nextConfig;

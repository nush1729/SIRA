import type { NextConfig } from "next";

// When APP_URL points at a tunnel (scripts/start-tunnel.mjs), Next's dev
// server blocks cross-origin HMR/asset requests from that host by default.
// Allow it so the site works when opened through the public URL, not just
// localhost. Re-reads on every dev server start, same as APP_URL itself.
const tunnelHost = (() => {
  try {
    const url = process.env.APP_URL;
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  ...(tunnelHost ? { allowedDevOrigins: [tunnelHost] } : {}),
};

export default nextConfig;

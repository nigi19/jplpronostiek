import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow team logos from API-Football CDN
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/teams/**",
      },
      {
        protocol: "https",
        hostname: "media-1.api-sports.io",
        pathname: "/football/teams/**",
      },
    ],
  },
};

export default nextConfig;

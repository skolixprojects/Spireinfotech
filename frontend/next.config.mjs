/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' }
    ]
  },
  async redirects() {
    return [
      // Phase 1B renamed /signup → /enroll. Permanent so any
      // bookmarks or external links migrate cleanly.
      { source: '/signup', destination: '/enroll', permanent: true },
    ];
  },
};

export default nextConfig;

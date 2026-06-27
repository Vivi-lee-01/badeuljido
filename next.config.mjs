/** @type {import('next').NextConfig} */
const nextConfig = {
  // 캐시 XML/문서 파일을 서버 번들에 포함시키기 위해 외부 패키지 추적을 켠다
  outputFileTracingIncludes: {
    "/api/**": ["./src/data/cached/**"],
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // instrumentation.ts: запуск фоновых задач приложения в режиме direct (в Next 14 — экспериментально)
  experimental: { instrumentationHook: true },
  // Ядро поставляется исходниками и собирается вместе с приложением
  transpilePackages: ['@revolit/core'],
  // Корень монорепозитория — чтобы сборка нашла общие зависимости
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

module.exports = nextConfig;

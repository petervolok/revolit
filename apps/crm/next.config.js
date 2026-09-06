/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Ядро поставляется исходниками и собирается вместе с приложением
  transpilePackages: ['@revolit/core'],
  // Корень монорепозитория — чтобы сборка нашла общие зависимости
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

module.exports = nextConfig;

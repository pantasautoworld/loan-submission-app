# Separate Railway service (root directory: luluchat-monitor). Playwright image already ships
# Chromium + its system libraries; the tag must match the "playwright" version in package.json.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
ENV NODE_ENV=production
CMD ["node", "src/monitor.mjs"]

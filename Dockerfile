FROM node:22-bookworm-slim AS base

# LibreOffice Calc (not the full sufte) is enough for xlsx -> pdf conversion,
# and keeps the image significantly smaller than `libreoffice` (full suite).
# qpdf strips owner-password restrictions from locked PDFs (EPF/KWSP statements
# especially) before they're merged into the packet - see src/lib/pdf/unlockPdf.ts.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-calc \
    fonts-liberation \
    qpdf \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV LIBREOFFICE_BIN=/usr/bin/soffice

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/templates ./templates

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]

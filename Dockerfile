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
# NEXT_PUBLIC_* vars are inlined into the client bundle by `next build`, so they
# must be real env vars during this RUN step. Docker isolates builds from the host
# env by design - Railway only injects service variables here if the Dockerfile
# opts in with ARG (see docs.railway.com/builds/dockerfiles#using-variables-at-build-time).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV LIBREOFFICE_BIN=/usr/bin/soffice

# --system users get HOME=/nonexistent by default on Debian, which broke LibreOffice
# (it needs a writable home to create its user profile) - give this user a real one.
# convertToPdf.ts also points LibreOffice at its own temp dir directly as a second
# layer of defense, independent of $HOME.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --home /home/nextjs --shell /bin/false nextjs \
    && mkdir -p /home/nextjs \
    && chown nextjs:nodejs /home/nextjs
ENV HOME=/home/nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/templates ./templates

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]

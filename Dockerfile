# Static export (next.config.ts: output: "export", distDir: "dist") served by nginx — same dist/ a
# static host (Cloudflare Pages, etc.) or the Tauri app itself bundles. See docs/WEB.md.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* vars are inlined into the static bundle at BUILD time, not read at container
# runtime — must be build args here, not just env vars on the final nginx image.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}

RUN npm run build

EXPOSE 3000

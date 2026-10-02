# Static export (next.config.ts: output: "export", distDir: "dist") — same dist/ a static host
# (Cloudflare Pages, etc.) or the Tauri app itself bundles. See docs/WEB.md.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* vars are inlined into the static bundle at BUILD time, not read at container
# runtime — must be build args here, not just env vars on the final image.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}

RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
# `next start` doesn't work here (needs a server build, not a static export) — `serve` handles the
# same clean-URL mapping nginx would (home -> home.html) without a separate config file.
RUN npm install --global serve
EXPOSE 3000
CMD ["serve", "-p", "3000", "dist"]

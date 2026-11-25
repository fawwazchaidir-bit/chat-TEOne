# TE One — image (multi-stage). Tidak berisi rahasia: semua konfigurasi lewat environment saat runtime.
#   runtime : server web (standalone, non-root, hanya dependensi produksi hasil tracing)
#   tools   : tugas sekali-jalan — migrasi, bootstrap Super Admin, pemulihan akun, seed (butuh tsx + node_modules penuh)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# docker build --target tools -t teone-tools .
#   docker run --rm --env-file /etc/teone/staging.env teone-tools npm run db:migrate
#   docker run --rm -it --env-file /etc/teone/staging.env teone-tools npm run admin:bootstrap
FROM build AS tools
# Provenance: image dikaitkan ke commit lewat label (scripts/build-staging-image.sh mengisi GIT_SHA; tidak ada rahasia/konfigurasi di image).
ARG GIT_SHA=tidak-diketahui
LABEL org.opencontainers.image.source="https://github.com/fawwazchaidir-bit/chat-TEOne" org.opencontainers.image.revision="${GIT_SHA}" org.opencontainers.image.title="teone-tools"
USER node
CMD ["npm", "run", "db:migrate"]

FROM node:22-bookworm-slim AS runtime
ARG GIT_SHA=tidak-diketahui
LABEL org.opencontainers.image.source="https://github.com/fawwazchaidir-bit/chat-TEOne" org.opencontainers.image.revision="${GIT_SHA}" org.opencontainers.image.title="teone-app"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# UID/GID tetap (10001) agar volume media (Tahap 2) dapat dibagi dengan proses worker tanpa konflik hak akses.
RUN groupadd -r -g 10001 teone && useradd -r -u 10001 -g teone -d /app teone \
 && mkdir -p /data/media && chown teone:teone /data/media && chmod 700 /data/media
ENV MEDIA_DIR=/data/media
COPY --from=build --chown=teone:teone /app/.next/standalone ./
COPY --from=build --chown=teone:teone /app/.next/static ./.next/static
USER teone
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

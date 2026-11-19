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
USER node
CMD ["npm", "run", "db:migrate"]

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -r teone && useradd -r -g teone -d /app teone
COPY --from=build --chown=teone:teone /app/.next/standalone ./
COPY --from=build --chown=teone:teone /app/.next/static ./.next/static
USER teone
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

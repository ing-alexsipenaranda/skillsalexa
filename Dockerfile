FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=cloud_ca \
    if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; \
    npm ci --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000
COPY src ./src
COPY linking ./linking
COPY skill-package ./skill-package
COPY scripts/build.mjs ./scripts/build.mjs
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production BIND_HOST=0.0.0.0 PORT=3000 BROKER_DB=/data/evoll-alexa.sqlite
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist/linking ./dist/linking
COPY --chown=node:node broker ./broker
RUN mkdir -p /data && chown node:node /data && chmod 700 /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "broker/server.js"]

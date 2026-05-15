FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json vite.config.ts vitest.config.ts ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS relay
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/src/server/index.js"]

FROM node:22-alpine AS bridge
WORKDIR /app
ENV NODE_ENV=production \
  CODEX_AUTO_START_APP_SERVER=false \
  CODEX_APP_SERVER_URL=ws://127.0.0.1:53179
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && chown -R node:node /app
COPY --from=build --chown=node:node /app/dist ./dist
USER node
CMD ["node", "dist/src/bridge/index.js"]

FROM relay AS default

# Production image of Flase: built application served by Flase server, one port (3001).
#   docker build -f docker/production/Dockerfile -t flase .
#   docker run -p 3001:3001 flase
# Configuration: JWT_SECRET (random when missing), FLASE_CONNECTIONS, FLASE_ALLOW_CUSTOM_CONNECTIONS,
# IDLE_CONNECTION_RELEASE_SECONDS, JWT_TOKEN_EXPIRE, PORT

# --- application (React)
FROM node:22-alpine AS front
WORKDIR /build/front
COPY front/package.json front/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY front/ ./
# warnings of ESLint must not fail the build (CRA treats them as errors when CI=true)
ENV CI=false GENERATE_SOURCEMAP=false
RUN npm run build

# --- server (TypeScript)
FROM node:22-alpine AS server
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npx tsc -p . && npm prune --omit=dev

# --- runtime
FROM node:22-alpine
ENV NODE_ENV=production PORT=3001 FLASE_FRONT_DIR=/app/public
WORKDIR /app
COPY --from=server --chown=node:node /build/server/node_modules ./node_modules
COPY --from=server --chown=node:node /build/server/dist ./dist
COPY --from=server --chown=node:node /build/server/package.json ./package.json
COPY --from=front --chown=node:node /build/front/build ./public
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/api/config" > /dev/null || exit 1
CMD ["node", "dist/index.js"]

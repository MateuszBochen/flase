# Production image of Flase: built application served by Flase server, one port (3001).
#   docker build -f docker/production/Dockerfile -t flase .
#   docker run -p 3001:3001 flase
# Configuration: JWT_SECRET (random when missing), FLASE_CONNECTIONS, FLASE_ALLOW_CUSTOM_CONNECTIONS, FLASE_CERT_DIR, FLASE_SSH_KEY_DIR,
# IDLE_CONNECTION_RELEASE_SECONDS, JWT_TOKEN_EXPIRE, PORT

# Alpine of the node image and of the runtime image must be the same (node binary is copied to the runtime image)
ARG ALPINE=3.24

# --- application (React)
FROM node:22-alpine${ALPINE} AS front
WORKDIR /build/front
COPY front/package.json front/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY front/ ./
# warnings of ESLint must not fail the build (CRA treats them as errors when CI=true)
ENV CI=false GENERATE_SOURCEMAP=false
RUN npm run build

# --- server (TypeScript)
FROM node:22-alpine${ALPINE} AS server
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
# node-sql-parser is loaded by its index.js (all dialects in one file) - browser (umd) and per dialect builds are
# 65 MB; source maps are not used at runtime
RUN npx tsc -p . && npm prune --omit=dev \
    && rm -rf node_modules/node-sql-parser/umd node_modules/node-sql-parser/build \
    && find node_modules -name '*.map' -type f -delete

# --- runtime: plain Alpine with the node binary only - npm, yarn, corepack and C headers of the node image are not
# needed to run the application (30 MB, and npm brings its own vulnerabilities)
FROM alpine:${ALPINE}
RUN apk add --no-cache libstdc++ \
    && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node
COPY --from=server /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production PORT=3001 FLASE_FRONT_DIR=/app/public FLASE_CERT_DIR=/app/certs
WORKDIR /app
# CA / client certificates of database TLS (sslrootcert, sslcert, sslkey of DSN) and private keys of SSH tunnels
# (FLASE_SSH_KEY_DIR, default the same directory) - mount: -v ./certs:/app/certs:ro
RUN mkdir -p /app/certs && chown node:node /app/certs
COPY --from=server --chown=node:node /build/server/node_modules ./node_modules
COPY --from=server --chown=node:node /build/server/dist ./dist
COPY --from=server --chown=node:node /build/server/package.json ./package.json
COPY --from=front --chown=node:node /build/front/build ./public
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/api/config" > /dev/null || exit 1
CMD ["node", "dist/index.js"]

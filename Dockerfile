# Stackby MCP Server — container image for hosted deployment or MCP registries.
# Stdio transport; for HTTP transport add a separate entry point (e.g. server-http.js).
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev
COPY . .
RUN npm run build

FROM node:20-alpine AS release

LABEL io.modelcontextprotocol.server.name="io.stackby/stackby-mcp-server"

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Stdio: no PORT needed; for HTTP mode set CMD to node dist/server-http.js and expose PORT
ENTRYPOINT ["node", "dist/index.js"]

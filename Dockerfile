# Stackby MCP Server — container image for stdio (Cursor/Claude) or HTTP (hosted/ChatGPT).
# Build produces dist/index.js (stdio) and dist/server-http.js (HTTP).
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

# Default: stdio (same as npm start). For hosted HTTP use: docker run -p 3001:3001 --entrypoint node <image> dist/server-http.js
EXPOSE 3001
ENTRYPOINT ["node", "dist/index.js"]

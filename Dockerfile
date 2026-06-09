# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend --------------------------------------
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: build the Express backend -------------------------------------
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ---- Stage 3: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV CLIENT_DIR=/app/client/dist
WORKDIR /app/server

# Production dependencies only.
COPY server/package*.json ./
RUN npm ci --omit=dev

# Compiled server + built client.
COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/client/dist /app/client/dist

# Uploads volume mount point.
RUN mkdir -p /data/uploads

EXPOSE 3000
CMD ["node", "dist/index.js"]

# Stage 1: build frontend
FROM node:22-alpine AS frontend
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY client/ ./client/
COPY shared/ ./shared/
COPY tsconfig*.json ./
RUN npm run build:client


# Stage 2: build server
FROM node:22-alpine AS server-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig*.json ./
RUN npm run build:server


# Stage 3: production image
FROM node:22-alpine AS production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=frontend /app/client/dist ./public
COPY --from=server-build /app/dist ./dist

VOLUME /data

ENV PORT=3000
ENV DB_PATH=/data/notifeed.db
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server/index.js"]

FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json ./
COPY tsconfig*.json ./
COPY client/ ./client/
COPY shared/ ./shared/
RUN npm install
RUN npm run build:client

FROM node:22-alpine AS server-build
WORKDIR /app
COPY package.json ./
COPY tsconfig*.json ./
COPY server/ ./server/
COPY shared/ ./shared/
RUN npm install
RUN npm run build:server

FROM node:22-alpine AS production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=frontend /app/client/dist ./public
COPY --from=server-build /app/dist/server ./dist/server
COPY --from=server-build /app/dist/shared ./dist/shared

VOLUME /data
ENV DB_PATH=/data/notifeed.db
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server/index.js"]

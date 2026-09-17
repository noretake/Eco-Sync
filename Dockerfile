FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install
COPY . .
RUN npm run build
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
COPY package*.json ./
COPY .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --omit=dev
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY --from=build /app/demo demo
RUN mkdir -p /data
ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DATA_DIR=/data \
    PORT=8787
EXPOSE 8787
CMD ["node","server/dist/index.js"]

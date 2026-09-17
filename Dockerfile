FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json web/package.json server/tsconfig.json web/tsconfig.json web/vite.config.ts web/index.html ./
RUN npm install
COPY . .
RUN npm run build
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p data
EXPOSE 8787
CMD ["npm","run","dev","--workspace","server"]

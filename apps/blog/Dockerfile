FROM node:22.17.0-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM nginx:1.28.0-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

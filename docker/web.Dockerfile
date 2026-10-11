FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY App.js index.js app.json ./
COPY config/ ./config/
COPY screens/ ./screens/
COPY assets/ ./assets/
ENV EXPO_PUBLIC_API_BASE_URL=/api CI=1
RUN npm run build:web

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

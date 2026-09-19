FROM node:24-alpine AS build
WORKDIR /app
COPY src/package.json src/package-lock.json ./
RUN npm ci
COPY src/ ./
ARG VITE_API_BASE_URL=""
ARG VITE_GAMES_BASE_DOMAIN="games.example.com"
ARG VITE_HOST_ORIGIN="https://games.example.com"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GAMES_BASE_DOMAIN=$VITE_GAMES_BASE_DOMAIN
ENV VITE_HOST_ORIGIN=$VITE_HOST_ORIGIN
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

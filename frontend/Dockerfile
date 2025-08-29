#### Stage 1. Build the application with dependencies ####
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# 透過 build-arg 傳入 API base；並轉存為 ENV 給 Vite（只取 VITE_ 前綴）
ARG VITE_API_BASE_URL="http://140.113.160.136:419/api"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build the application
RUN npm run build

#### Stage 2. Create production image using nginx ####
FROM nginx:alpine

# Copy built application to nginx
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

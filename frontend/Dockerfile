#### Stage 1. Build the application with dependencies ####
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Accept build arguments and set environment variables
ARG REACT_APP_API_BASE_URL=/api
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL

# Build the application
RUN npm run build

#### Stage 2. Create production image using nginx ####
FROM nginx:alpine

# Copy built application to nginx
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

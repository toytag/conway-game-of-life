# Stage 1: Build the project
FROM node:lts-alpine AS build

WORKDIR /app

COPY . .

# Install dependencies, package-lock.json is used for reproducible builds
RUN npm install && npm cache clean --force

RUN npm run build

# Stage 2: Serve the project using Nginx
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Nginx serves on port 80 by default
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

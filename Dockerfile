# Dockerfile for AWS Elastic Beanstalk (Docker platform)
# Builds a lightweight production image for the full-stack project

FROM node:20-alpine AS base
WORKDIR /app

# Install production dependencies first to leverage Docker layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the repository
COPY . .

# Elastic Beanstalk sets the PORT env variable; make sure the server uses it.
# battle_royale_server.js already falls back to 5003 if PORT is undefined.
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "backend/battle_royale_server.js"]

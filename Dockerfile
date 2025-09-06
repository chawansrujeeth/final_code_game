# Root Dockerfile for Elastic Beanstalk (Single Container Docker)
# Builds and runs only the backend service

FROM node:18-slim

# Create app directory
WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/. .

# Environment
ENV NODE_ENV=production
# Bind app to 8080 (required by Elastic Beanstalk Docker platform)
ENV PORT=8080

# Expose the port EB expects containers to listen on
EXPOSE 8080

# Start the Battle Royale server directly
CMD ["node", "battle_royale_server.js"]

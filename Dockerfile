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
# EB sets PORT env var; our server reads it via backend/config/index.js
ENV PORT=3001

# Expose the port (informational)
EXPOSE 3001

# Start backend server
CMD ["node", "server.js"]

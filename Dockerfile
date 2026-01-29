FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (need typescript for build)
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies to slim down
RUN npm prune --production

# Start the bot
CMD ["npm", "run", "start"]

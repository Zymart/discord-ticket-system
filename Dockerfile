FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create data directory for JSON database
RUN mkdir -p data

# Expose port (for health checks if needed)
EXPOSE 8080

# Start the bot
CMD ["node", "src/index.js"]

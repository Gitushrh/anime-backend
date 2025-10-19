# Build stage
FROM node:20-alpine AS deps

WORKDIR /app
COPY package*.json ./

# Install only npm dependencies (no puppeteer download yet)
RUN npm ci --production && npm cache clean --force

# Production stage
FROM node:20-alpine

# Install minimal chromium runtime libs only
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    libxss1

# Critical: Tell Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /app

# Copy pre-installed node_modules from builder
COPY --from=deps /app/node_modules ./node_modules

# Copy app code (smaller, faster)
COPY server.js .
COPY utils/scraper.js ./utils/scraper.js

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000', (r) => {if(r.statusCode === 200) process.exit(0); else process.exit(1)})"

CMD ["node", "server.js"]
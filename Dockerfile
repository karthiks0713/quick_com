# Multi-stage Dockerfile for QuickAPI E-commerce Scraper
# Optimized for faster builds with better caching
FROM node:20-slim AS app

# Set working directory
WORKDIR /app

# Install all system dependencies in one layer for better caching
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 && \
    rm -rf /var/lib/apt/lists/*

# Install Google Chrome in same layer
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# Copy package files first for better dependency caching
COPY package*.json ./

# Install Node.js dependencies and Playwright in one layer
RUN npm ci --only=production && \
    npx playwright install chromium && \
    npx playwright install-deps chromium

# Copy all application files at once
COPY *.js ./
COPY quickapi-ui.html* ./

# Create output directory
RUN mkdir -p /app/output

# Set environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    HEADLESS=true \
    CHROME_BIN=/usr/bin/google-chrome-stable \
    CHROME_PATH=/usr/bin/google-chrome-stable \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run QuickAPI server
CMD ["node", "quickapi.js"]

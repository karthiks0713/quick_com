# Multi-stage Dockerfile for QuickAPI E-commerce Scraper
# Stage 1: Base image with Node.js and Chrome dependencies
FROM node:20-slim as base

# Install system dependencies for Chrome and Selenium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome (using modern method)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome binary path
ENV CHROME_BIN=/usr/bin/google-chrome-stable
ENV CHROME_PATH=/usr/bin/google-chrome-stable

# Stage 2: Application setup
FROM base as app

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (including dev dependencies for Playwright)
RUN npm ci

# Install Playwright browsers
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Copy application files
COPY *.js ./
COPY quickapi-ui.html ./

# Create output directory (even though we don't save files, some scrapers might check for it)
RUN mkdir -p /app/output

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HEADLESS=true
ENV CHROME_BIN=/usr/bin/google-chrome-stable

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run QuickAPI server
CMD ["node", "quickapi.js"]


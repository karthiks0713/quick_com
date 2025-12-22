# Docker Setup for QuickAPI

This guide explains how to build and run the QuickAPI e-commerce scraper using Docker.

## Prerequisites

- Docker installed on your system
- Docker Compose (optional, for easier management)

## Quick Start

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

### Option 2: Using Docker directly

```bash
# Build the image
docker build -t quickapi-scraper .

# Run the container
docker run -d \
  --name quickapi \
  -p 3001:3001 \
  -e HEADLESS=true \
  --shm-size=2gb \
  quickapi-scraper

# View logs
docker logs -f quickapi

# Stop the container
docker stop quickapi
docker rm quickapi
```

## Accessing the API

Once the container is running:

- **Web UI**: http://localhost:3001
- **API Health Check**: http://localhost:3001/api/health
- **API Documentation**: http://localhost:3001/api

## Environment Variables

You can customize the container behavior using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port for the API server |
| `HEADLESS` | `true` | Run Chrome in headless mode |
| `NODE_ENV` | `production` | Node.js environment |
| `CHROME_BIN` | `/usr/bin/google-chrome-stable` | Chrome binary path |

### Example with custom port:

```bash
docker run -d \
  --name quickapi \
  -p 8080:8080 \
  -e PORT=8080 \
  -e HEADLESS=true \
  --shm-size=2gb \
  quickapi-scraper
```

## Testing the API

### Health Check
```bash
curl http://localhost:3001/api/health
```

### Search All Websites
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"product": "lays", "location": "Mumbai"}'
```

### Search Specific Website
```bash
curl -X POST http://localhost:3001/api/search/dmart \
  -H "Content-Type: application/json" \
  -d '{"product": "lays", "location": "Mumbai"}'
```

## Troubleshooting

### Chrome crashes in Docker

If you encounter Chrome crashes, increase shared memory:

```bash
docker run -d \
  --name quickapi \
  -p 3001:3001 \
  --shm-size=2gb \
  quickapi-scraper
```

Or in docker-compose.yml, ensure:
```yaml
shm_size: '2gb'
volumes:
  - /dev/shm:/dev/shm
```

### Container won't start

Check logs:
```bash
docker logs quickapi
```

### Port already in use

Change the port mapping:
```bash
docker run -d \
  --name quickapi \
  -p 3002:3001 \
  quickapi-scraper
```

Then access at: http://localhost:3002

### Permission issues

If you encounter permission issues, you may need to run with:
```bash
docker run -d \
  --name quickapi \
  -p 3001:3001 \
  --security-opt seccomp=unconfined \
  quickapi-scraper
```

## Building for Production

### Optimize image size:
```bash
docker build --no-cache -t quickapi-scraper:latest .
```

### Multi-platform build:
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t quickapi-scraper:latest .
```

## Docker Image Details

- **Base Image**: `node:20-slim`
- **Chrome**: Google Chrome Stable
- **Working Directory**: `/app`
- **Exposed Port**: `3001`
- **Health Check**: Enabled (checks `/api/health`)

## Development Mode

For development with file watching and hot reload, you can mount the source code:

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  quickapi:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - HEADLESS=false
    ports:
      - "3001:3001"
```

Run with:
```bash
docker-compose -f docker-compose.dev.yml up
```

## Production Deployment

### Using Docker Compose:

1. Update `docker-compose.yml` with production settings
2. Build and deploy:
```bash
docker-compose up -d --build
```

### Using Docker Swarm:

```bash
docker stack deploy -c docker-compose.yml quickapi
```

### Using Kubernetes:

Create a deployment YAML based on the Dockerfile and deploy to your cluster.

## Monitoring

### View container stats:
```bash
docker stats quickapi
```

### View logs:
```bash
docker logs -f quickapi
```

### Execute commands in container:
```bash
docker exec -it quickapi /bin/bash
```

## Notes

- The container runs Chrome in headless mode by default
- No files are saved to disk (as per project configuration)
- All data is returned via API responses
- The container includes all necessary dependencies for Selenium and Playwright


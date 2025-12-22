# QuickAPI Documentation

QuickAPI is a RESTful API wrapper around the location-selector-orchestrator that allows you to search for products across multiple e-commerce websites via HTTP requests.

## Quick Start

### Start the Server

```bash
npm run quickapi
# or
node quickapi.js
```

The server will start on port 3001 (or the port specified in `PORT` environment variable).

### Default URL
- **Base URL**: `http://localhost:3001`
- **Health Check**: `http://localhost:3001/api/health`
- **Documentation**: `http://localhost:3001/api`

## API Endpoints

### 1. Health Check
**GET** `/api/health`

Check if the API is running.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-22T10:30:00.000Z",
  "service": "QuickAPI",
  "version": "1.0.0"
}
```

### 2. List Supported Websites
**GET** `/api/websites`

Get a list of all supported e-commerce websites.

**Response:**
```json
{
  "websites": [
    {
      "id": "dmart",
      "name": "D-Mart",
      "displayName": "D-Mart"
    },
    {
      "id": "jiomart",
      "name": "JioMart",
      "displayName": "JioMart"
    },
    {
      "id": "naturesbasket",
      "name": "Nature's Basket",
      "displayName": "Nature's Basket"
    },
    {
      "id": "zepto",
      "name": "Zepto",
      "displayName": "Zepto"
    },
    {
      "id": "swiggy",
      "name": "Swiggy Instamart",
      "displayName": "Swiggy Instamart"
    }
  ],
  "total": 5
}
```

### 3. Search All Websites
**POST** `/api/search`

Search for a product across all supported websites.

**Request Body:**
```json
{
  "product": "lays",
  "location": "Mumbai"
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-12-22T10:30:00.000Z",
  "request": {
    "product": "lays",
    "location": "Mumbai"
  },
  "execution": {
    "duration": "45.23s",
    "totalWebsites": 5,
    "successful": 4,
    "failed": 1
  },
  "results": [
    {
      "website": "dmart",
      "success": true,
      "error": null,
      "products": [...],
      "totalProducts": 15,
      "location": "Mumbai"
    },
    {
      "website": "jiomart",
      "success": true,
      "error": null,
      "products": [...],
      "totalProducts": 12,
      "location": "Mumbai"
    },
    ...
  ]
}
```

### 4. Search Specific Website
**POST** `/api/search/:website`

Search for a product on a specific website.

**URL Parameters:**
- `website`: One of `dmart`, `jiomart`, `naturesbasket`, `zepto`, `swiggy`

**Request Body:**
```json
{
  "product": "lays",
  "location": "Mumbai"
}
```

**Example:**
```bash
POST /api/search/dmart
Content-Type: application/json

{
  "product": "lays",
  "location": "Mumbai"
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-12-22T10:30:00.000Z",
  "request": {
    "website": "dmart",
    "product": "lays",
    "location": "Mumbai"
  },
  "execution": {
    "duration": "12.45s"
  },
  "result": {
    "website": "dmart",
    "success": true,
    "error": null,
    "products": [...],
    "totalProducts": 15,
    "location": "Mumbai"
  }
}
```

## Usage Examples

### Using cURL

**Search all websites:**
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"product": "lays", "location": "Mumbai"}'
```

**Search specific website:**
```bash
curl -X POST http://localhost:3001/api/search/dmart \
  -H "Content-Type: application/json" \
  -d '{"product": "lays", "location": "Mumbai"}'
```

**Health check:**
```bash
curl http://localhost:3001/api/health
```

### Using JavaScript (Fetch API)

```javascript
// Search all websites
const response = await fetch('http://localhost:3001/api/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    product: 'lays',
    location: 'Mumbai'
  })
});

const data = await response.json();
console.log(data);

// Search specific website
const response2 = await fetch('http://localhost:3001/api/search/dmart', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    product: 'lays',
    location: 'Mumbai'
  })
});

const data2 = await response2.json();
console.log(data2);
```

### Using Python (requests)

```python
import requests

# Search all websites
response = requests.post(
    'http://localhost:3001/api/search',
    json={
        'product': 'lays',
        'location': 'Mumbai'
    }
)
data = response.json()
print(data)

# Search specific website
response = requests.post(
    'http://localhost:3001/api/search/dmart',
    json={
        'product': 'lays',
        'location': 'Mumbai'
    }
)
data = response.json()
print(data)
```

## Error Handling

### 400 Bad Request
Missing required parameters:
```json
{
  "success": false,
  "error": "Missing required parameters",
  "message": "Both \"product\" and \"location\" are required"
}
```

Invalid website:
```json
{
  "success": false,
  "error": "Invalid website",
  "message": "Unsupported website: invalid. Supported websites: dmart, jiomart, naturesbasket, zepto, swiggy"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Not found",
  "message": "Endpoint GET /api/invalid not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Error details..."
}
```

## Environment Variables

- `PORT`: Server port (default: 3001)
- `HEADLESS`: Set to `true` to run browsers in headless mode (default: `true`)
- `NODE_ENV`: Set to `development` to include error stack traces in responses

## Notes

- The API runs scrapers in parallel for DMart, JioMart, Nature's Basket, and Zepto
- Swiggy Instamart runs sequentially after the parallel tasks complete
- Scraping can take 30-60 seconds depending on the websites
- All responses include execution duration and success/failure status
- Product data includes name, price, MRP, discount, availability, and image URLs

## CORS

The API has CORS enabled for all origins. You can call it from any frontend application.


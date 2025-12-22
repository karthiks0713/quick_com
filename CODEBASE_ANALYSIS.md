# Codebase Analysis

## Executive Summary

This is a **multi-platform e-commerce product scraper and location selector** system that automates browser interactions to extract product data from Indian e-commerce websites. The project combines:

- **MCP (Model Context Protocol) Server** for Selenium automation
- **Multiple API servers** (Node.js Express and Python FastAPI)
- **Location selection automation** for 5 e-commerce sites
- **HTML parsing and data extraction** from scraped pages

---

## 1. Project Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                        │
│  (MCP Clients, API Consumers, CLI Tools)                    │
└────────────────────┬──────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼────┐            ┌─────▼─────┐
    │  MCP    │            │   REST    │
    │ Server  │            │   APIs    │
    │(Selenium)│            │(Express/ │
    │         │            │ FastAPI)  │
    └────┬────┘            └─────┬─────┘
         │                       │
         │              ┌────────┴────────┐
         │              │                 │
    ┌────▼──────────────▼─────┐    ┌──────▼──────────┐
    │  Location Selectors      │    │  HTML Parsers   │
    │  (Zepto, JioMart, etc.)  │    │  (Cheerio)      │
    └────┬─────────────────────┘    └──────┬──────────┘
         │                                 │
         │              ┌──────────────────┘
         │              │
    ┌────▼──────────────▼─────┐
    │  Browser Automation     │
    │  (Selenium/Playwright)  │
    └─────────────────────────┘
```

### Core Components

1. **MCP Selenium Server** (`src/lib/server.js`)
   - Provides browser automation via MCP protocol
   - Supports Chrome, Firefox, Edge
   - Used by AI assistants (Claude Desktop, etc.)

2. **Location Selector Orchestrator** (`location-selector-orchestrator.js`)
   - Central coordinator for multi-site scraping
   - Manages sequential execution across 5 websites
   - Handles HTML extraction and data processing

3. **Individual Location Selectors**
   - `zepto-location-selector.js` (Playwright)
   - `jiomart-location-selector.js`
   - `dmart-location-selector.js`
   - `naturesbasket-location-selector.js`
   - Each handles site-specific automation

4. **HTML Parsers**
   - `unified-html-parser.js` - Main parser with site-specific extractors
   - `html-data-selector.js` - Alternative extraction module
   - Both use Cheerio for DOM manipulation

5. **API Servers**
   - `api-server.js` - Express.js API (port 3000)
   - `scraper-api-server.js` - Production-ready Express API (port 3001)
   - `api_server.py` - FastAPI server (port 8000)
   - `scraper-api.js` - Wrapper API

6. **Router** (`location-router.js`)
   - CLI tool for routing requests to appropriate handlers

---

## 2. Technology Stack

### Backend
- **Node.js** (ES Modules)
- **Python 3** (FastAPI)
- **Selenium WebDriver** - Browser automation
- **Playwright** - Alternative browser automation (Zepto)
- **Cheerio** - HTML parsing (jQuery-like)
- **Express.js** - Node.js web framework
- **FastAPI** - Python web framework

### Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^1.7.0",
  "cheerio": "^1.1.2",
  "express": "^5.2.1",
  "multer": "^2.0.2",
  "playwright": "^1.57.0",
  "selenium-webdriver": "^4.18.1",
  "zod": "^3.25.76"
}
```

### Python Dependencies
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
python-multipart==0.0.6
```

---

## 3. Supported E-commerce Sites

1. **D-Mart** (`dmart.in`)
2. **JioMart** (`jiomart.com`)
3. **Nature's Basket** (`naturesbasket.co.in`)
4. **Zepto** (`zepto.com`)
5. **Swiggy Instamart** (`swiggy.com/instamart`)

Each site has:
- Custom location selection automation
- Site-specific HTML parsing logic
- Product extraction strategies

---

## 4. Data Flow

### Scraping Workflow

```
1. User Request (product + location)
   ↓
2. Location Selector Orchestrator
   ↓
3. For each website:
   a. Launch browser (Selenium/Playwright)
   b. Navigate to site
   c. Select location
   d. Search for product
   e. Wait for results
   f. Extract HTML
   ↓
4. HTML Parsers (unified-html-parser.js / html-data-selector.js)
   ↓
5. Extract:
   - Product names
   - Prices (MRP, selling price)
   - Discounts
   - Stock status
   - Location
   ↓
6. Return JSON data
   ↓
7. Save to files (optional)
   - HTML files → `output/`
   - JSON files → `outputs/`
```

### API Request Flow

```
Client → API Server → Orchestrator → Location Selectors → Browser
                                                              ↓
Client ← API Server ← Orchestrator ← HTML Parsers ← HTML Content
```

---

## 5. API Endpoints

### Express API (`api-server.js` - Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information |
| POST/GET | `/api/scrape` | Scrape products (product, location) |
| GET | `/api/data` | Get latest extracted data |
| GET | `/api/data/latest` | Alias for `/api/data` |
| GET | `/api/data/website/:website` | Filter by website |
| GET | `/api/data/search` | Search data (q, website, location) |
| GET | `/api/websites` | List all websites |
| GET | `/api/stats` | Statistics |
| POST | `/api/refresh` | Refresh data from HTML files |

### Production API (`scraper-api-server.js` - Port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API info (instant) |
| GET | `/api/health` | Health check (instant) |
| GET | `/api/info` | API documentation |
| GET/POST | `/api/scrape` | Start scraping job (non-blocking) |
| GET | `/api/job/:jobId` | Check job status |
| GET | `/api/extract` | Extract from HTML files |

**Key Feature**: Non-blocking architecture - returns job ID immediately, scraping runs in background.

### FastAPI (`api_server.py` - Port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information |
| GET | `/api/products` | Get all products |
| GET | `/api/products/{site}` | Get products by site |
| GET | `/api/products/{site}/{location}` | Get products by site and location |
| POST | `/api/parse` | Parse HTML file |
| POST | `/api/upload` | Upload and parse HTML |
| POST | `/api/scrape` | Scrape from all sites |
| GET | `/api/health` | Health check |

---

## 6. File Structure

```
location/
├── src/
│   └── lib/
│       └── server.js              # MCP Selenium server
├── bin/
│   └── mcp-selenium.js            # MCP binary
├── location-router.js             # CLI router
├── location-selector-orchestrator.js  # Main orchestrator
├── unified-html-parser.js         # HTML parser
├── html-data-selector.js           # Alternative parser
├── zepto-location-selector.js     # Zepto automation (Playwright)
├── jiomart-location-selector.js    # JioMart automation
├── dmart-location-selector.js      # D-Mart automation
├── naturesbasket-location-selector.js  # Nature's Basket automation
├── api-server.js                   # Express API (port 3000)
├── scraper-api-server.js           # Production API (port 3001)
├── scraper-api.js                  # API wrapper
├── api_server.py                   # FastAPI server (port 8000)
├── package.json                    # Node.js dependencies
├── requirements.txt                # Python dependencies
└── [Documentation files]
```

---

## 7. Key Features

### 1. Multi-Site Support
- Unified interface for 5 different e-commerce sites
- Site-specific selectors and parsing logic
- Fallback strategies for reliability

### 2. Robust Error Handling
- Multiple selector strategies per element
- Retry mechanisms
- Graceful degradation

### 3. Anti-Detection
- User agent spoofing
- Slow typing simulation
- Headless mode support
- Stealth browser options

### 4. Data Extraction
- Multiple extraction strategies:
  - JSON state extraction (Next.js apps)
  - DOM-based extraction
  - Generic pattern matching
- Handles dynamic content
- Removes duplicates

### 5. Non-Blocking API
- Background job processing
- Job status tracking
- Instant health checks (Railway-compatible)


---

## 8. Code Quality Observations

### Strengths

1. **Modular Design**
   - Clear separation of concerns
   - Reusable functions
   - Site-specific modules

2. **Error Resilience**
   - Multiple fallback strategies
   - Try-catch blocks
   - Graceful error messages

3. **Documentation**
   - Multiple README files
   - API documentation
   - Usage examples

4. **Flexibility**
   - Multiple API servers for different use cases
   - CLI and API interfaces
   - Configurable options

### Areas for Improvement

1. **Code Duplication**
   - Similar extraction logic across parsers
   - Could benefit from shared utilities

2. **Error Handling**
   - Some functions could use more specific error types
   - Better error propagation

3. **Testing**
   - No visible test files
   - Could benefit from unit/integration tests

4. **Configuration**
   - Hardcoded values scattered throughout
   - Could use environment-based config

5. **Performance**
   - Sequential website processing (could be parallelized)
   - No caching mechanism

6. **Type Safety**
   - JavaScript files lack TypeScript
   - Python files use Pydantic (good)

---

## 9. Deployment

### Railway
- `railway.json` - Railway deployment config
- `RAILWAY-DEPLOY.md` - Deployment guide
- Optimized for Railway's requirements (instant health checks)

### Environment Variables
- `PORT` - Server port
- `NODE_ENV` - Environment (development/production)
- `HEADLESS` - Headless browser flag
- `CHROME_BIN` - Chrome binary path

---

## 10. Usage Patterns

### CLI Usage
```bash
# Single site
node location-router.js zepto Paracetamol Mumbai

# All sites
node location-selector-orchestrator.js potato Mumbai
```

### API Usage
```bash
# Express API
curl "http://localhost:3000/api/scrape?product=lays&location=RT%20Nagar"

# FastAPI
curl -X POST "http://localhost:8000/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{"product": "lays", "location": "RT Nagar"}'
```

### MCP Usage
Configure in MCP client (e.g., Claude Desktop):
```json
{
  "mcpServers": {
    "selenium": {
      "command": "npx",
      "args": ["-y", "@angiejones/mcp-selenium"]
    }
  }
}
```

---

## 11. Data Models

### Product Object
```typescript
{
  name: string;
  mrp: number | null;
  price: number | null;
  discount: number | null;
  discountAmount: number | null;
  isOutOfStock: boolean;
}
```

### Site Data Object
```typescript
{
  site: string;           // 'dmart', 'jiomart', etc.
  location: string;
  products: Product[];
  totalProducts: number;
  filename: string;
}
```

---

## 12. Security Considerations

1. **CORS**: Currently allows all origins (`*`) - should be restricted in production
2. **Input Validation**: Present but could be more comprehensive
3. **Rate Limiting**: Not implemented
4. **Authentication**: No authentication on APIs
5. **File Upload**: FastAPI endpoint accepts file uploads - needs validation

---

## 13. Performance Characteristics

### Bottlenecks
1. **Sequential Processing**: Websites processed one at a time
2. **Browser Overhead**: Each site opens a new browser instance
3. **No Caching**: Repeated requests scrape again
4. **Large HTML Files**: Full page HTML stored in memory

### Optimization Opportunities
1. Parallel website processing
2. Browser pooling/reuse
3. Response caching
4. Incremental HTML parsing
5. Database for product storage

---

## 14. Dependencies Analysis

### Critical Dependencies
- `selenium-webdriver` - Core automation
- `playwright` - Alternative automation (Zepto)
- `cheerio` - HTML parsing
- `express` - API server
- `@modelcontextprotocol/sdk` - MCP protocol

### Potential Issues
- Browser driver versions need to match browser versions
- Playwright requires browser binaries
- Selenium requires WebDriver binaries

---

## 15. Recommendations

### Short-term
1. Add input validation and sanitization
2. Implement rate limiting
3. Add logging framework (Winston/Pino)
4. Create shared utility functions
5. Add basic tests

### Medium-term
1. Parallel website processing
2. Database integration (PostgreSQL/MongoDB)
3. Caching layer (Redis)
4. TypeScript migration
5. API authentication

### Long-term
1. Microservices architecture
2. Message queue for job processing
3. Monitoring and observability
4. CI/CD pipeline
5. Performance optimization

---

## 16. Conclusion

This is a **well-structured, feature-rich e-commerce scraping system** with:

✅ **Strengths**:
- Multi-site support
- Multiple interfaces (CLI, API, MCP)
- Robust error handling
- Good documentation

⚠️ **Areas for Growth**:
- Testing coverage
- Performance optimization
- Security hardening
- Code deduplication
- Type safety

The codebase demonstrates good software engineering practices with modular design, error handling, and multiple deployment options. With the recommended improvements, it could become a production-grade system.

---

**Analysis Date**: 2024
**Lines of Code**: ~15,000+ (estimated)
**Languages**: JavaScript (ES Modules), Python
**Primary Use Case**: E-commerce product price comparison and location-based product search


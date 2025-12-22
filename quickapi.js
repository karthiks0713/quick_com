/**
 * QuickAPI - REST API for Location Selector Orchestrator
 * 
 * Converts the location-selector-orchestrator into a RESTful API
 * 
 * Endpoints:
 *   POST /api/search          - Search all websites for a product
 *   POST /api/search/:website - Search specific website for a product
 *   GET  /api/health          - Health check
 *   GET  /api/websites        - List supported websites
 *   GET  /api/status/:jobId   - Get job status (if async)
 */

import express from 'express';
import { selectLocationAndSearchOnAllWebsites, executeOnWebsite, determineSite } from './location-selector-orchestrator.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'QuickAPI',
    version: '1.0.0'
  });
});

/**
 * Get list of supported websites
 */
app.get('/api/websites', (req, res) => {
  res.json({
    websites: [
      {
        id: 'dmart',
        name: 'D-Mart',
        displayName: 'D-Mart'
      },
      {
        id: 'jiomart',
        name: 'JioMart',
        displayName: 'JioMart'
      },
      {
        id: 'naturesbasket',
        name: "Nature's Basket",
        displayName: "Nature's Basket"
      },
      {
        id: 'zepto',
        name: 'Zepto',
        displayName: 'Zepto'
      },
      {
        id: 'swiggy',
        name: 'Swiggy Instamart',
        displayName: 'Swiggy Instamart'
      }
    ],
    total: 5
  });
});

/**
 * Search all websites for a product
 * 
 * POST /api/search
 * Body: {
 *   "product": "lays",
 *   "location": "Mumbai"
 * }
 */
app.post('/api/search', async (req, res) => {
  try {
    const { product, location } = req.body;

    // Validation
    if (!product || !location) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'Both "product" and "location" are required',
        example: {
          product: 'lays',
          location: 'Mumbai'
        }
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`QuickAPI: Starting search for all websites`);
    console.log(`Product: ${product}`);
    console.log(`Location: ${location}`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = Date.now();

    // Execute search on all websites
    const results = await selectLocationAndSearchOnAllWebsites(product, location);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Format response
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      request: {
        product,
        location
      },
      execution: {
        duration: `${duration}s`,
        totalWebsites: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      },
      results: results.map(result => {
        const formatted = {
          website: result.website,
          success: result.success,
          error: result.error || null
        };

        // Add product data if available
        if (result.jsonData && result.jsonData.products) {
          formatted.products = result.jsonData.products;
          formatted.totalProducts = result.jsonData.products.length;
          formatted.location = result.jsonData.location;
        }

        return formatted;
      })
    };

    res.json(response);

  } catch (error) {
    console.error('QuickAPI Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Search specific website for a product
 * 
 * POST /api/search/:website
 * Body: {
 *   "product": "lays",
 *   "location": "Mumbai"
 * }
 * 
 * Example: POST /api/search/dmart
 */
app.post('/api/search/:website', async (req, res) => {
  try {
    const { website } = req.params;
    const { product, location } = req.body;

    // Validation
    if (!product || !location) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'Both "product" and "location" are required in request body',
        example: {
          product: 'lays',
          location: 'Mumbai'
        }
      });
    }

    // Validate website
    let normalizedWebsite;
    try {
      normalizedWebsite = determineSite(website);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid website',
        message: error.message,
        supportedWebsites: ['dmart', 'jiomart', 'naturesbasket', 'zepto', 'swiggy']
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`QuickAPI: Starting search for ${normalizedWebsite}`);
    console.log(`Product: ${product}`);
    console.log(`Location: ${location}`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = Date.now();

    // Execute search on specific website
    const result = await executeOnWebsite(normalizedWebsite, product, location);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Format response
    const response = {
      success: result.success,
      timestamp: new Date().toISOString(),
      request: {
        website: normalizedWebsite,
        product,
        location
      },
      execution: {
        duration: `${duration}s`
      },
      result: {
        website: result.website,
        success: result.success,
        error: result.error || null
      }
    };

    // Add product data if available
    if (result.jsonData && result.jsonData.products) {
      response.result.products = result.jsonData.products;
      response.result.totalProducts = result.jsonData.products.length;
      response.result.location = result.jsonData.location;
    }

    if (result.success) {
      res.json(response);
    } else {
      res.status(500).json(response);
    }

  } catch (error) {
    console.error('QuickAPI Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Get API documentation
 */
app.get('/api', (req, res) => {
  res.json({
    name: 'QuickAPI',
    version: '1.0.0',
    description: 'REST API for Location Selector Orchestrator',
    endpoints: {
      'GET /api/health': 'Health check endpoint',
      'GET /api/websites': 'List all supported websites',
      'POST /api/search': {
        description: 'Search all websites for a product',
        body: {
          product: 'string (required) - Product name to search',
          location: 'string (required) - Location name'
        },
        example: {
          product: 'lays',
          location: 'Mumbai'
        }
      },
      'POST /api/search/:website': {
        description: 'Search specific website for a product',
        params: {
          website: 'string (required) - Website ID (dmart, jiomart, naturesbasket, zepto, swiggy)'
        },
        body: {
          product: 'string (required) - Product name to search',
          location: 'string (required) - Location name'
        },
        example: {
          url: '/api/search/dmart',
          body: {
            product: 'lays',
            location: 'Mumbai'
          }
        }
      }
    },
    examples: {
      'Search all websites': {
        method: 'POST',
        url: '/api/search',
        body: {
          product: 'lays',
          location: 'Mumbai'
        }
      },
      'Search specific website': {
        method: 'POST',
        url: '/api/search/dmart',
        body: {
          product: 'lays',
          location: 'Mumbai'
        }
      }
    }
  });
});

/**
 * Serve UI
 */
app.get('/', (req, res) => {
  const uiPath = join(__dirname, 'quickapi-ui.html');
  if (fs.existsSync(uiPath)) {
    res.sendFile(uiPath);
  } else {
    res.json({
      message: 'Welcome to QuickAPI',
      version: '1.0.0',
      documentation: '/api',
      health: '/api/health',
      endpoints: [
        'GET  /api/health',
        'GET  /api/websites',
        'POST /api/search',
        'POST /api/search/:website'
      ]
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: [
      'GET  /api/health',
      'GET  /api/websites',
      'POST /api/search',
      'POST /api/search/:website'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 QuickAPI Server Started`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Web UI: http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`${'='.repeat(60)}\n`);
});

export default app;


/**
 * Final API - Express.js API for Sequential Location Selector
 * 
 * This API wraps the sequential-location-selector.js functionality
 * to run all location selectors (Zepto, Nature's Basket, JioMart, D-Mart) sequentially
 * 
 * Endpoints:
 *   GET/POST /api/scrape - Run sequential location selector for all websites
 *   GET /api/health - Health check endpoint
 * 
 * Usage:
 *   GET /api/scrape?location=Mumbai&product=Chaas
 *   POST /api/scrape { "location": "Mumbai", "product": "Chaas" }
 */

import express from 'express';
import { runAllSelectors } from './sequential-location-selector.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (if you have a frontend)
app.use(express.static(join(__dirname, 'public')));

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Final API - Sequential Location Selector'
  });
});

/**
 * GET /api/scrape
 * Run sequential location selector for all websites
 * 
 * Query Parameters:
 *   - location: Location name to select (required)
 *   - product: Product name to search (required)
 * 
 * Example:
 *   GET /api/scrape?location=Mumbai&product=Chaas
 */
app.get('/api/scrape', async (req, res) => {
  try {
    const { location, product } = req.query;

    if (!location || !product) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'Both "location" and "product" query parameters are required',
        example: '/api/scrape?location=Mumbai&product=Chaas'
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`API Request: Sequential scraping "${product}" in "${location}"`);
    console.log(`${'='.repeat(80)}\n`);

    const startTime = Date.now();
    
    // Run all selectors sequentially
    const summary = await runAllSelectors(location, product);
    
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Format response
    const response = {
      success: true,
      location: summary.location,
      product: summary.product,
      timestamp: new Date().toISOString(),
      totalDuration: `${summary.totalDuration}s`,
      summary: {
        totalWebsites: summary.totalWebsites,
        successCount: summary.successCount,
        failedCount: summary.totalWebsites - summary.successCount,
        totalProducts: summary.totalProducts
      },
      websites: summary.results.map(result => ({
        website: result.website,
        success: result.success,
        location: result.location,
        product: result.product,
        duration: `${result.duration}s`,
        productCount: result.result?.products?.length || result.result?.totalProducts || 0,
        error: result.error || null,
        data: result.success && result.result ? {
          website: result.result.website,
          location: result.result.location,
          product: result.result.product,
          timestamp: result.result.timestamp,
          products: result.result.products || [],
          totalProducts: result.result.totalProducts || result.result.products?.length || 0
        } : null
      }))
    };

    console.log(`\n✅ API Request completed in ${totalDuration}s`);
    console.log(`   Success: ${summary.successCount}/${summary.totalWebsites} websites`);
    console.log(`   Total Products: ${summary.totalProducts}\n`);

    res.status(200).json(response);

  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/scrape
 * Run sequential location selector for all websites (POST method)
 * 
 * Request Body:
 *   {
 *     "location": "Mumbai",
 *     "product": "Chaas"
 *   }
 */
app.post('/api/scrape', async (req, res) => {
  try {
    const { location, product } = req.body;

    if (!location || !product) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'Both "location" and "product" are required in request body',
        example: { location: 'Mumbai', product: 'Chaas' }
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`API Request (POST): Sequential scraping "${product}" in "${location}"`);
    console.log(`${'='.repeat(80)}\n`);

    const startTime = Date.now();
    
    // Run all selectors sequentially
    const summary = await runAllSelectors(location, product);
    
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Format response
    const response = {
      success: true,
      location: summary.location,
      product: summary.product,
      timestamp: new Date().toISOString(),
      totalDuration: `${summary.totalDuration}s`,
      summary: {
        totalWebsites: summary.totalWebsites,
        successCount: summary.successCount,
        failedCount: summary.totalWebsites - summary.successCount,
        totalProducts: summary.totalProducts
      },
      websites: summary.results.map(result => ({
        website: result.website,
        success: result.success,
        location: result.location,
        product: result.product,
        duration: `${result.duration}s`,
        productCount: result.result?.products?.length || result.result?.totalProducts || 0,
        error: result.error || null,
        data: result.success && result.result ? {
          website: result.result.website,
          location: result.result.location,
          product: result.result.product,
          timestamp: result.result.timestamp,
          products: result.result.products || [],
          totalProducts: result.result.totalProducts || result.result.products?.length || 0
        } : null
      }))
    };

    console.log(`\n✅ API Request completed in ${totalDuration}s`);
    console.log(`   Success: ${summary.successCount}/${summary.totalWebsites} websites`);
    console.log(`   Total Products: ${summary.totalProducts}\n`);

    res.status(200).json(response);

  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /
 * API information endpoint
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Final API - Sequential Location Selector',
    version: '1.0.0',
    description: 'API for running sequential location selectors across multiple e-commerce websites',
    endpoints: {
      health: 'GET /api/health',
      scrape: {
        get: 'GET /api/scrape?location=<location>&product=<product>',
        post: 'POST /api/scrape { "location": "<location>", "product": "<product>" }'
      }
    },
    websites: ['Zepto', "Nature's Basket", 'JioMart', 'D-Mart'],
    example: {
      get: '/api/scrape?location=Mumbai&product=Chaas',
      post: {
        location: 'Mumbai',
        product: 'Chaas'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 Final API Server started`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🔍 Scrape (GET): http://localhost:${PORT}/api/scrape?location=Mumbai&product=Chaas`);
  console.log(`🔍 Scrape (POST): http://localhost:${PORT}/api/scrape`);
  console.log(`${'='.repeat(80)}\n`);
});

export default app;

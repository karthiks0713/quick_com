/**
 * Express API Server for E-commerce Product Scraper
 * Railway-safe production version with non-blocking architecture
 * 
 * Product Data Structure:
 * {
 *   name: string,
 *   mrp: number | null,
 *   price: number | null,
 *   discount: number | null,
 *   discountAmount: number | null,
 *   isOutOfStock: boolean,
 *   imageUrl: string | null,  // Product image URL (absolute)
 *   productUrl: string | null // Product page URL (absolute)
 * }
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Log startup immediately
console.log('🚀 Initializing Express server...');
console.log(`📡 Will listen on 0.0.0.0:${PORT}`);

// Middleware - minimal and fast
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS middleware - must be fast
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files from public directory
const publicPath = join(__dirname, 'public');
if (existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log(`📁 Serving static files from: ${publicPath}`);
}

// In-memory job store (for production, use Redis or a proper queue)
const jobs = new Map();
let jobCounter = 0;

/**
 * Health check - MUST return instantly (Railway requirement)
 * No async, no file I/O, no imports
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Scraper API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Root endpoint - MUST return instantly
 */
app.get('/', (req, res) => {
  // Return immediately - no async operations
  try {
    res.status(200).json({
      name: 'E-commerce Product Scraper API',
      status: 'running',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        info: '/api/info',
        scrape: '/api/scrape?product=<name>&location=<name>',
        jobStatus: '/api/job/<jobId>',
        json: '/api/json/<jobId>'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in root endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle favicon.ico to prevent 502s
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content
});

/**
 * API Info - MUST return instantly
 */
app.get('/api/info', (req, res) => {
  res.status(200).json({
    name: 'E-commerce Product Scraper API',
    version: '1.0.0',
    description: 'API for scraping product data from multiple e-commerce websites',
    productStructure: {
      name: 'string',
      mrp: 'number | null',
      price: 'number | null',
      discount: 'number | null',
      discountAmount: 'number | null',
      isOutOfStock: 'boolean',
      imageUrl: 'string | null (Product image URL - absolute)',
      productUrl: 'string | null (Product page URL - absolute)'
    },
    endpoints: {
      'GET /api/health': 'Health check endpoint (instant)',
      'GET /api/scrape?product=<name>&location=<name>': 'Start scraping job (returns immediately)',
      'GET /api/job/<jobId>': 'Check job status',
      'GET /api/json/<jobId>': 'Get clean JSON output for completed job',
      'GET /api/info': 'Get API information (instant)'
    },
    supportedWebsites: ['D-Mart', 'JioMart', "Nature's Basket", 'Zepto', 'Swiggy'],
    note: 'Scraping jobs run in background. Use /api/job/<jobId> to check status.'
  });
});

/**
 * GET /api/scrape - Start scraping job (non-blocking)
 * Returns immediately with job ID, scraping happens in background
 */
app.get('/api/scrape', async (req, res) => {
  const { product, location, saveHtml } = req.query;

  // Validate immediately
  if (!product || !location) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters',
      message: 'Both "product" and "location" query parameters are required',
      example: '/api/scrape?product=lays&location=RT%20Nagar'
    });
  }

  // Create job immediately
  const jobId = `job-${Date.now()}-${++jobCounter}`;
  const job = {
    id: jobId,
    product,
    location,
    saveHtml: saveHtml === 'true' || saveHtml === '1',
    status: 'queued',
    createdAt: new Date().toISOString(),
    result: null,
    error: null
  };
  
  jobs.set(jobId, job);

  // Start scraping in background (don't await)
  scrapeInBackground(jobId, product, location, job.saveHtml).catch(err => {
    console.error(`Job ${jobId} failed:`, err);
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = err.message;
    }
  });

  // Return immediately with job ID
  res.status(202).json({
    success: true,
    message: 'Scraping job started',
    jobId: jobId,
    status: 'queued',
    checkStatus: `/api/job/${jobId}`,
    product,
    location,
    timestamp: job.createdAt
  });
});

/**
 * POST /api/scrape - Start scraping job (non-blocking)
 */
app.post('/api/scrape', async (req, res) => {
  const { product, location, saveHtml } = req.body;

  // Validate immediately
  if (!product || !location) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters',
      message: 'Both "product" and "location" in request body are required',
      example: { product: 'lays', location: 'RT Nagar' }
    });
  }

  // Create job immediately
  const jobId = `job-${Date.now()}-${++jobCounter}`;
  const job = {
    id: jobId,
    product,
    location,
    saveHtml: saveHtml === true || saveHtml === 'true' || saveHtml === '1',
    status: 'queued',
    createdAt: new Date().toISOString(),
    result: null,
    error: null
  };
  
  jobs.set(jobId, job);

  // Start scraping in background (don't await)
  scrapeInBackground(jobId, product, location, job.saveHtml).catch(err => {
    console.error(`Job ${jobId} failed:`, err);
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = err.message;
    }
  });

  // Return immediately with job ID
  res.status(202).json({
    success: true,
    message: 'Scraping job started',
    jobId: jobId,
    status: 'queued',
    checkStatus: `/api/job/${jobId}`,
    product,
    location,
    timestamp: job.createdAt
  });
});

/**
 * GET /api/job/:jobId - Check job status
 */
app.get('/api/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found',
      jobId
    });
  }

  // Return job status (instant)
  res.status(200).json({
    success: true,
    jobId: job.id,
    status: job.status,
    product: job.product,
    location: job.location,
    createdAt: job.createdAt,
    result: job.result,
    error: job.error
  });
});

/**
 * Background scraping function - runs asynchronously
 * This does NOT block the request handler
 */
async function scrapeInBackground(jobId, product, location, saveHtml) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'processing';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Job ${jobId}: Scraping "${product}" in "${location}"`);
    console.log(`${'='.repeat(60)}\n`);

    // Lazy import - only when actually needed
    const { selectLocationAndSearchOnAllWebsites } = await import('./location-selector-orchestrator.js');

    // Store original argv (request-scoped, not global)
    const originalArgv = [...process.argv];
    
    // Set saveHtml flag if provided (request-scoped)
    if (saveHtml) {
      process.argv.push('--save-html');
    }

    try {
      // Call the orchestrator function
      const results = await selectLocationAndSearchOnAllWebsites(product, location);
      
      // Restore original argv
      process.argv = originalArgv;
      
      // Extract data from HTML
      const { extractDataFromHtml } = await import('./location-selector-orchestrator.js');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extractedData = [];
      
      for (const result of results) {
        if (result.success) {
          // Check if website returns JSON data directly (Swiggy, DMart, JioMart, Nature's Basket, Zepto)
          if (result.jsonData) {
            console.log(`Job ${jobId}: Processing ${result.website} JSON data...`);
            const jsonData = result.jsonData;
            
            // Normalize website name to match frontend expectations
            let normalizedWebsite = result.website;
            if (normalizedWebsite.toLowerCase() === 'swiggy') {
              normalizedWebsite = 'Swiggy Instamart';
            } else if (normalizedWebsite.toLowerCase() === 'dmart') {
              normalizedWebsite = 'D-Mart';
            } else if (normalizedWebsite.toLowerCase() === 'jiomart') {
              normalizedWebsite = 'JioMart';
            } else if (normalizedWebsite.toLowerCase() === 'naturesbasket') {
              normalizedWebsite = "Nature's Basket";
            } else if (normalizedWebsite.toLowerCase() === 'zepto') {
              normalizedWebsite = 'Zepto';
            }
            
            // Extract products from JSON data
            const websiteData = {
              website: normalizedWebsite,
              location: jsonData.location || location,
              products: (jsonData.products || []).map(p => ({
                name: p.name,
                price: p.price,
                mrp: p.mrp,
                discount: p.discount || null,
                discountAmount: p.discountAmount || null,
                isOutOfStock: p.isOutOfStock || false,
                imageUrl: p.imageUrl || null,
                productUrl: p.productUrl || null
              }))
            };
            
            if (websiteData.products && websiteData.products.length > 0) {
              console.log(`Job ${jobId}: ✅ Extracted ${websiteData.products.length} product(s) from ${result.website} (normalized to: ${normalizedWebsite})`);
              extractedData.push(websiteData);
            } else {
              console.log(`Job ${jobId}: ⚠️  ${result.website} JSON data has no products`);
            }
          } else if (result.html && typeof result.html === 'string' && result.html.length > 0) {
            // Other websites return HTML, extract data from HTML
            console.log(`Job ${jobId}: Processing ${result.website} HTML (${result.html.length} chars)...`);
            const extracted = await extractDataFromHtml(
              result.html, 
              result.website, 
              `${result.website}-${location.toLowerCase().replace(/\s+/g, '-')}-${product.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.html`
            );
            if (extracted) {
              // Normalize website name to match frontend expectations
              let normalizedWebsite = extracted.website || result.website;
              if (normalizedWebsite.toLowerCase() === 'dmart') {
                normalizedWebsite = 'D-Mart';
              } else if (normalizedWebsite.toLowerCase() === 'jiomart') {
                normalizedWebsite = 'JioMart';
              } else if (normalizedWebsite.toLowerCase() === 'naturesbasket') {
                normalizedWebsite = "Nature's Basket";
              } else if (normalizedWebsite.toLowerCase() === 'zepto') {
                normalizedWebsite = 'Zepto';
              }
              extracted.website = normalizedWebsite;
              
              if (extracted.products && extracted.products.length > 0) {
                console.log(`Job ${jobId}: ✅ Extracted ${extracted.products.length} product(s) from ${result.website} (normalized to: ${normalizedWebsite})`);
                extractedData.push(extracted);
              } else {
                console.log(`Job ${jobId}: ⚠️  ${result.website} extraction returned data but no products (${extracted.products?.length || 0} products)`);
                extractedData.push(extracted);
              }
            } else {
              console.log(`Job ${jobId}: ⚠️  ${result.website} extraction returned null/undefined`);
            }
          } else {
            console.log(`Job ${jobId}: ⚠️  ${result.website} has no valid HTML (html type: ${typeof result.html}, length: ${result.html?.length || 0})`);
          }
        }
      }

      // Update job with result
      job.status = 'completed';
      
      // Map extracted data to website results for frontend compatibility
      const websitesWithData = results.map(r => {
        // Find matching extracted data
        let extracted = null;
        if (r.website === 'swiggy') {
          extracted = extractedData.find(d => d.website?.toLowerCase().includes('swiggy'));
        } else {
          // Match by normalized website name
          const normalizedResultWebsite = r.website.toLowerCase();
          extracted = extractedData.find(d => {
            const normalizedExtractedWebsite = d.website?.toLowerCase();
            return normalizedExtractedWebsite === normalizedResultWebsite ||
                   (normalizedResultWebsite === 'dmart' && normalizedExtractedWebsite === 'dmart') ||
                   (normalizedResultWebsite === 'jiomart' && normalizedExtractedWebsite === 'jiomart') ||
                   (normalizedResultWebsite === 'naturesbasket' && normalizedExtractedWebsite === 'naturesbasket') ||
                   (normalizedResultWebsite === 'zepto' && normalizedExtractedWebsite === 'zepto');
          });
        }
        
        // Normalize website names for frontend
        let websiteName = r.website;
        if (r.website === 'swiggy') {
          websiteName = 'Swiggy Instamart';
        } else if (r.website === 'jiomart') {
          websiteName = 'JioMart';
        } else if (r.website === 'naturesbasket') {
          websiteName = "Nature's Basket";
        } else if (r.website === 'dmart') {
          websiteName = 'D-Mart';
        }
        
        return {
          website: websiteName,
          success: r.success,
          error: r.error || null,
          productCount: extracted?.products?.length || 0,
          data: extracted || null
        };
      });
      
      job.result = {
        success: true,
        timestamp: timestamp,
        product: product,
        location: location,
        websites: websitesWithData,
        data: extractedData,
        summary: {
          totalWebsites: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          successCount: results.filter(r => r.success).length,
          totalProducts: extractedData.reduce((sum, site) => sum + (site.products?.length || 0), 0),
          totalDuration: ((Date.now() - new Date(job.createdAt).getTime()) / 1000).toFixed(2) + 's'
        }
      };

      // Save JSON output to file
      const jsonOutput = {
        product: product,
        location: location,
        timestamp: timestamp,
        websites: extractedData.map(site => ({
          website: site.website,
          location: site.location,
          products: (site.products || []).map(p => ({
            name: p.name,
            price: p.price,
            mrp: p.mrp,
            discount: p.discount || null,
            discountAmount: p.discountAmount || null,
            isOutOfStock: p.isOutOfStock || false,
            imageUrl: p.imageUrl || null,
            productUrl: p.productUrl || null
          }))
        })),
        summary: job.result.summary
      };

      // Ensure output directory exists
      const outputDir = join(__dirname, 'output');
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Save JSON file
      const jsonFilename = `output/${product.toLowerCase().replace(/\s+/g, '-')}-${location.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.json`;
      const jsonPath = join(__dirname, jsonFilename);
      writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2), 'utf8');
      console.log(`Job ${jobId}: 📄 JSON saved to: ${jsonFilename}`);

      console.log(`Job ${jobId}: ✅ Completed successfully`);
    } catch (error) {
      process.argv = originalArgv;
      throw error;
    }
  } catch (error) {
    console.error(`Job ${jobId}: ❌ Error:`, error);
    job.status = 'failed';
    job.error = error.message;
  }
}

/**
 * GET /api/extract - Extract data from existing HTML files
 * This can be slow, so we'll make it async but still return quickly
 */
app.get('/api/extract', async (req, res) => {
  const { dir = 'output' } = req.query;

  // Start extraction in background
  const jobId = `extract-${Date.now()}-${++jobCounter}`;
  const job = {
    id: jobId,
    directory: dir,
    status: 'processing',
    createdAt: new Date().toISOString(),
    result: null,
    error: null
  };
  
  jobs.set(jobId, job);

  // Extract in background
  (async () => {
    try {
      const { extractDataFromAllFiles } = await import('./html-data-selector.js');
      const results = extractDataFromAllFiles(dir);
      job.status = 'completed';
      job.result = {
        success: true,
        timestamp: new Date().toISOString(),
        directory: dir,
        data: results,
        summary: {
          totalFiles: results.length,
          totalProducts: results.reduce((sum, site) => sum + (site.products?.length || 0), 0)
        }
      };
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
    }
  })();

  // Return immediately
  res.status(202).json({
    success: true,
    message: 'Extraction job started',
    jobId: jobId,
    checkStatus: `/api/job/${jobId}`,
    directory: dir
  });
});

/**
 * GET /api/json/:jobId - Get clean JSON output for a completed job
 * Returns pure JSON without job metadata
 */
app.get('/api/json/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found',
      jobId
    });
  }

  if (job.status !== 'completed') {
    return res.status(202).json({
      success: false,
      status: job.status,
      message: job.status === 'processing' ? 'Job still processing' : job.status === 'queued' ? 'Job queued' : 'Job failed',
      error: job.error || null
    });
  }

  if (!job.result || !job.result.data) {
    return res.status(404).json({
      success: false,
      error: 'No data available for this job'
    });
  }

  // Return clean JSON structure
  res.status(200).json({
    product: job.product,
    location: job.location,
    timestamp: job.result.timestamp,
    websites: job.result.data.map(site => ({
      website: site.website,
      location: site.location,
      products: (site.products || []).map(p => ({
        name: p.name,
        price: p.price,
        mrp: p.mrp,
        discount: p.discount || null,
        discountAmount: p.discountAmount || null,
        isOutOfStock: p.isOutOfStock || false,
        imageUrl: p.imageUrl || null,
        productUrl: p.productUrl || null
      }))
    })),
    summary: job.result.summary
  });
});

// Clean up old jobs (keep last 100) - start after server is ready
// Use setTimeout to ensure server starts first
setTimeout(() => {
  setInterval(() => {
    if (jobs.size > 100) {
      const jobsArray = Array.from(jobs.entries());
      jobsArray.sort((a, b) => new Date(a[1].createdAt) - new Date(b[1].createdAt));
      const toDelete = jobsArray.slice(0, jobsArray.length - 100);
      toDelete.forEach(([id]) => jobs.delete(id));
      console.log(`Cleaned up ${toDelete.length} old jobs`);
    }
  }, 60000); // Every minute
}, 5000); // Start cleanup after 5 seconds

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit - let server keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let server keep running
});

// Start server IMMEDIATELY - this must succeed
let server;
try {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Scraper API Server running on http://0.0.0.0:${PORT}`);
    console.log(`📖 API Documentation: http://0.0.0.0:${PORT}/api/info`);
    console.log(`📡 Listening on all interfaces (0.0.0.0) for Railway compatibility`);
    console.log(`✅ Server started successfully - ready to accept requests`);
    console.log(`⚡ All endpoints respond instantly - scraping runs in background`);
    console.log(`⏱️  Server listening on port ${PORT}`);
    console.log(`${'='.repeat(60)}\n`);
  });

  // Handle server errors
  server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
      process.exit(1);
    } else {
      console.error('Unknown server error:', error);
      // Try to keep running
    }
  });

  // Verify server is actually listening
  server.on('listening', () => {
    const addr = server.address();
    console.log(`✅ Server is listening on ${addr.address}:${addr.port}`);
  });

} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}

export default app;

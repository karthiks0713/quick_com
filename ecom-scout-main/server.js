/**
 * Backend Server for PriceWise (ecom-scout-main)
 * Express.js API server with job-based non-blocking architecture
 * Uses parallel orchestrator for faster execution
 * 
 * This server provides the API endpoints for the React frontend
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// CORS middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from dist (built React app)
app.use(express.static(join(__dirname, 'dist')));

// In-memory job store (for production, use Redis or a proper queue)
const jobs = new Map();
let jobCounter = 0;

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'PriceWise API Server',
        uptime: process.uptime()
    });
});

/**
 * GET /api/scrape - Start scraping job (non-blocking)
 * Returns immediately with job ID, scraping happens in background
 */
app.get('/api/scrape', async (req, res) => {
    const { product, location } = req.query;

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
        status: 'queued',
        createdAt: new Date().toISOString(),
        result: null,
        error: null
    };
    
    jobs.set(jobId, job);

    // Start scraping in background (don't await)
    scrapeInBackground(jobId, product, location).catch(err => {
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
    const { product, location } = req.body;

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
        status: 'queued',
        createdAt: new Date().toISOString(),
        result: null,
        error: null
    };
    
    jobs.set(jobId, job);

    // Start scraping in background (don't await)
    scrapeInBackground(jobId, product, location).catch(err => {
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
 * GET /api/json/:jobId - Get job results as JSON
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
        return res.status(400).json({
            success: false,
            error: 'Job not completed',
            status: job.status,
            jobId
        });
    }

    // Return results in format expected by frontend
    const results = job.result?.data || [];
    const formattedResults = {
        dmart: [],
        jiomart: [],
        naturesbasket: [],
        zepto: [],
        swiggy: []
    };

    console.log(`📤 Returning results for job ${jobId}:`, {
        dataType: Array.isArray(results) ? 'array' : typeof results,
        dataLength: Array.isArray(results) ? results.length : 'N/A',
        websites: Array.isArray(results) ? results.map(r => r.website) : []
    });

    // Transform extracted data to match frontend format
    if (Array.isArray(results)) {
        results.forEach(siteData => {
            const website = siteData.website?.toLowerCase();
            let products = siteData.products || [];
            
            console.log(`  Processing ${website}: ${products.length} products`);
            
            if (website === 'swiggy instamart' || website === 'swiggy') {
                formattedResults.swiggy = products;
            } else if (website === 'dmart' || website === 'd-mart') {
                formattedResults.dmart = products;
            } else if (website === 'jiomart' || website === 'jio mart') {
                formattedResults.jiomart = products;
            } else if (website === "nature's basket" || website === 'naturesbasket') {
                formattedResults.naturesbasket = products;
            } else if (website === 'zepto') {
                formattedResults.zepto = products;
            }
        });
    }

    console.log(`📊 Final formatted results:`, {
        dmart: formattedResults.dmart.length,
        jiomart: formattedResults.jiomart.length,
        naturesbasket: formattedResults.naturesbasket.length,
        zepto: formattedResults.zepto.length,
        swiggy: formattedResults.swiggy.length,
    });

    res.status(200).json(formattedResults);
});

/**
 * Background scraping function - runs asynchronously
 * This does NOT block the request handler
 * Uses QuickAPI backend for scraping
 */
async function scrapeInBackground(jobId, product, location) {
    const job = jobs.get(jobId);
    if (!job) return;

    try {
        job.status = 'processing';
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Job ${jobId}: Scraping "${product}" in "${location}"`);
        console.log(`Using QuickAPI backend...`);
        console.log(`${'='.repeat(60)}\n`);

        // Use QuickAPI backend instead of direct orchestrator call
        const QUICKAPI_URL = process.env.QUICKAPI_URL || 'http://localhost:3001';
        
        console.log(`Job ${jobId}: Calling QuickAPI at ${QUICKAPI_URL}/api/search`);
        
        // Call QuickAPI
        const response = await fetch(`${QUICKAPI_URL}/api/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                product,
                location
            })
        });

        if (!response.ok) {
            throw new Error(`QuickAPI request failed: ${response.status} ${response.statusText}`);
        }

        const quickApiResult = await response.json();
        
        if (!quickApiResult.success) {
            throw new Error(quickApiResult.error || quickApiResult.message || 'QuickAPI request failed');
        }

        console.log(`Job ${jobId}: QuickAPI response received`);
        console.log(`Job ${jobId}: Execution duration: ${quickApiResult.execution?.duration}`);
        console.log(`Job ${jobId}: Successful websites: ${quickApiResult.execution?.successful}/${quickApiResult.execution?.totalWebsites}`);

        // Transform QuickAPI results to match existing format
        const results = quickApiResult.results || [];
        
        // Extract data from HTML
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extractedData = [];
        
        for (const result of results) {
            if (result.success) {
                // Swiggy Instamart returns JSON data directly, not HTML
                if (result.website === 'swiggy' && result.jsonData) {
                    console.log(`Job ${jobId}: Processing ${result.website} JSON data...`);
                    // Swiggy's JSON data is already in the correct format
                    const swiggyData = {
                        website: 'Swiggy Instamart',
                        location: result.jsonData.location || location,
                        products: (result.jsonData.products || []).map(p => ({
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
                    if (swiggyData.products && swiggyData.products.length > 0) {
                        console.log(`Job ${jobId}: ✅ Extracted ${swiggyData.products.length} product(s) from ${result.website}`);
                        extractedData.push(swiggyData);
                    }
                } else if (result.html && typeof result.html === 'string') {
                    // Other websites return HTML, extract data from HTML
                    console.log(`Job ${jobId}: Processing ${result.website} HTML...`);
                    const extracted = await extractDataFromHtml(
                        result.html, 
                        result.website, 
                        `${result.website}-${location.toLowerCase().replace(/\s+/g, '-')}-${product.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.html`
                    );
                    if (extracted && extracted.products && extracted.products.length > 0) {
                        console.log(`Job ${jobId}: ✅ Extracted ${extracted.products.length} product(s) from ${result.website}`);
                        extractedData.push(extracted);
                    } else if (extracted) {
                        extractedData.push(extracted);
                    }
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
                extracted = extractedData.find(d => 
                    d.website?.toLowerCase() === r.website?.toLowerCase()
                );
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
        const outputDir = join(__dirname, '..', 'output');
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        // Save JSON file
        const jsonFilename = `${product.toLowerCase().replace(/\s+/g, '-')}-${location.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.json`;
        const jsonPath = join(outputDir, jsonFilename);
        writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2), 'utf8');
        console.log(`Job ${jobId}: 📄 JSON saved to: ${jsonFilename}`);

        console.log(`Job ${jobId}: ✅ Completed successfully`);
    } catch (error) {
        console.error(`Job ${jobId}: ❌ Error:`, error);
        job.status = 'failed';
        job.error = error.message;
    }
}

/**
 * GET /
 * Serve React app (fallback to index.html for client-side routing)
 */
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 PriceWise API Server started`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🔍 Scrape API: http://localhost:${PORT}/api/scrape`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`\n💡 Using PARALLEL execution for faster scraping`);
    console.log(`${'='.repeat(80)}\n`);
});

export default app;

/**
 * Frontend Server - Serves the React/HTML frontend
 * Runs on port 3002 (separate from backend API)
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import http from 'http';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.FRONTEND_PORT || 3002;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Middleware to parse JSON
app.use(express.json());

// Proxy API requests to backend server
app.use('/api', (req, res) => {
  try {
    // Construct the full backend URL
    // Note: req.path already has /api stripped, so we need to add it back
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const backendPath = '/api' + req.path + queryString;
    const backendUrl = new URL(backendPath, BACKEND_URL);
    
    console.log(`🔄 Proxying ${req.method} ${req.path}${queryString} to ${backendUrl.toString()}`);
    
    const options = {
      hostname: backendUrl.hostname,
      port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
      path: backendUrl.pathname + backendUrl.search,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    // Remove host header to avoid issues
    if (req.headers.host) {
      delete req.headers.host;
    }
    
    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      
      proxyRes.on('data', (chunk) => {
        data += chunk;
      });
      
      proxyRes.on('end', () => {
        try {
          res.status(proxyRes.statusCode || 200);
          res.setHeader('Content-Type', 'application/json');
          
          // Try to parse as JSON, if fails send as text
          try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
          } catch {
            res.send(data);
          }
        } catch (sendError) {
          console.error('❌ Error sending response:', sendError.message);
        }
      });
    });
    
    proxyReq.on('error', (error) => {
      console.error('❌ Proxy connection error:', error.message);
      console.error(`   Backend URL: ${BACKEND_URL}`);
      console.error(`   Error code: ${error.code}`);
      
      // Provide helpful error message
      let errorMessage = 'Failed to connect to backend API';
      if (error.code === 'ECONNREFUSED') {
        errorMessage = `Backend server is not running on ${BACKEND_URL}`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = `Backend server timeout on ${BACKEND_URL}`;
      }
      
      res.status(503).json({
        success: false,
        error: errorMessage,
        message: `Please start the backend server: npm run backend`,
        backendUrl: BACKEND_URL,
        errorCode: error.code,
        details: error.message
      });
    });
    
    // Set timeout
    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy();
      res.status(504).json({
        success: false,
        error: 'Backend request timeout',
        message: 'The backend server took too long to respond'
      });
    });
    
    // Send request body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
    
    proxyReq.end();
  } catch (error) {
    console.error('❌ Proxy setup error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to setup proxy',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Serve static files from public directory
const publicPath = join(__dirname, 'public');
if (existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log(`📁 Serving frontend from: ${publicPath}`);
} else {
  console.error(`❌ Frontend directory not found: ${publicPath}`);
  process.exit(1);
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Frontend Server',
    backendUrl: BACKEND_URL,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎨 Frontend Server`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Frontend: http://localhost:${PORT}/`);
  console.log(`Backend API: ${BACKEND_URL}`);
  console.log(`\n📝 Note: Make sure backend is running on ${BACKEND_URL}`);
  console.log(`${'='.repeat(60)}\n`);
});


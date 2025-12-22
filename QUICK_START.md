# Quick Start Guide

## 🚀 Start the Server

### Option 1: Using the Startup Script (Easiest)

**Windows:**
```bash
# Double-click or run:
start-server.bat
```

**PowerShell:**
```powershell
.\start-server.ps1
```

### Option 2: Using npm
```bash
npm run scraper-api
```

### Option 3: Direct Node.js
```bash
node scraper-api-server.js
```

## 🌐 Access the Application

Once the server starts, open your browser and go to:

**Frontend (Web Interface):**
```
http://localhost:3001/
```

**API Endpoints:**
- Health Check: http://localhost:3001/api/health
- API Info: http://localhost:3001/api/info
- Scrape Products: http://localhost:3001/api/scrape?product=lays&location=RT%20Nagar

## 📱 Using the Frontend

1. **Open** http://localhost:3001/ in your browser
2. **Enter** a product name (e.g., "lays", "potato", "tomato")
3. **Enter** a location (e.g., "RT Nagar", "Mumbai", "Bangalore")
4. **Click** "🔍 Search Products"
5. **Wait** for results (scraping runs in background)
6. **View** products with images, prices, and discounts

## ✅ Verify Server is Running

Check if the server is running:
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/health"
```

You should see:
```json
{
  "status": "ok",
  "message": "Scraper API is running",
  "timestamp": "...",
  "uptime": ...
}
```

## 🛑 Stop the Server

Press `Ctrl+C` in the terminal where the server is running.

## 🔧 Troubleshooting

### Port Already in Use
If port 3001 is already in use:
```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### Server Not Starting
1. Check if Node.js is installed: `node --version`
2. Install dependencies: `npm install`
3. Check for errors in the terminal

### Frontend Not Loading
1. Make sure the server is running
2. Check browser console for errors (F12)
3. Verify `public/` folder exists with `index.html`, `style.css`, and `app.js`

## 📝 Notes

- The server runs on **port 3001** by default
- Frontend and backend are served from the same server
- Scraping jobs run in the background (non-blocking)
- Results are displayed automatically when ready


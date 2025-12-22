# How to Run the PriceWise Application

## Prerequisites
- Node.js (v18 or higher)
- npm or yarn

## Step 1: Install Dependencies

First, navigate to the `ecom-scout-main` directory and install dependencies:

```bash
cd ecom-scout-main
npm install
```

## Step 2: Build the React Frontend

Build the React application for production:

```bash
npm run build
```

This will create a `dist` folder with the compiled React app.

## Step 3: Start the Server

Start the Express server that serves both the frontend and API:

```bash
npm start
```

Or alternatively:

```bash
npm run server
```

The server will start on **http://localhost:3003**

## Development Mode (Optional)

If you want to develop with hot-reload:

### Terminal 1: Start the Vite dev server (frontend)
```bash
cd ecom-scout-main
npm run dev
```
This runs the frontend on **http://localhost:5173** (or another port if 5173 is busy)

### Terminal 2: Start the backend API server
```bash
cd ecom-scout-main
npm start
```
This runs the backend API on **http://localhost:3003**

**Note:** In development mode, you'll need to update the `VITE_API_URL` in your `.env` file or update the API base URL in `useScrapingJob.ts` to point to `http://localhost:3003`.

## Access the Application

Once the server is running:

- **Frontend**: http://localhost:3003
- **API Health Check**: http://localhost:3003/api/health
- **API Scrape Endpoint**: http://localhost:3003/api/scrape?product=lays&location=RT%20Nagar

## Features

- ✅ Compare prices across 5 stores (DMart, JioMart, Nature's Basket, Zepto, Swiggy Instamart)
- ✅ Shopping list functionality
- ✅ Real-time price scraping
- ✅ Job-based non-blocking API
- ✅ Parallel execution for faster results

## Troubleshooting

1. **Port already in use**: Change the PORT in `server.js` or set `PORT` environment variable
2. **Build errors**: Make sure all dependencies are installed (`npm install`)
3. **API not working**: Ensure the `location-selector-orchestrator.js` file exists in the parent directory


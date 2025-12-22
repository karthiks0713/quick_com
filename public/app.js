/**
 * PriceWise Application
 * Vanilla JavaScript implementation connecting to finalapi.js backend
 * NO MOCK DATA - All data comes from real API
 */

// ============================================
// Configuration
// ============================================
const API_BASE_URL = window.location.origin;
const WEBSITES = ['Zepto', "Nature's Basket", 'JioMart', 'D-Mart', 'Swiggy Instamart'];

// Website colors for visual identification
const WEBSITE_COLORS = {
    'Zepto': 'zepto',
    "Nature's Basket": 'naturesbasket',
    'JioMart': 'jiomart',
    'D-Mart': 'dmart',
    'Swiggy Instamart': 'swiggy'
};

// ============================================
// State Management
// ============================================
const state = {
    appState: 'search', // 'search' | 'thinking' | 'results'
    websiteStatuses: WEBSITES.map(name => ({ name, status: 'pending', productCount: 0 })),
    currentWebsite: '',
    searchParams: { location: '', product: '' },
    results: null,
    activeWebsiteFilter: null
};

// ============================================
// DOM Elements
// ============================================
const elements = {
    searchState: document.getElementById('searchState'),
    thinkingState: document.getElementById('thinkingState'),
    resultsState: document.getElementById('resultsState'),
    searchInputComponent: document.getElementById('searchInputComponent'),
    thinkingAnimationComponent: document.getElementById('thinkingAnimationComponent'),
    resultsViewComponent: document.getElementById('resultsViewComponent')
};

// ============================================
// Initialization
// ============================================
function init() {
    renderSearchInput();
    checkApiHealth();
}

// ============================================
// API Functions
// ============================================
async function checkApiHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        const data = await response.json();
        console.log('API Status:', data.status);
    } catch (error) {
        console.error('API Health Check Failed:', error);
    }
}

async function searchProducts(location, product) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/scrape?location=${encodeURIComponent(location)}&product=${encodeURIComponent(product)}`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Backend returns job ID immediately, we need to poll for results
        if (data.jobId) {
            return await pollJobStatus(data.jobId);
        }
        
        return data;
    } catch (error) {
        console.error('Search error:', error);
        throw error;
    }
}

async function pollJobStatus(jobId) {
    const maxAttempts = 300; // 5 minutes max (1 second intervals)
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/job/${jobId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const jobData = await response.json();
            
            // Update website statuses in real-time
            if (jobData.result && jobData.result.websites) {
                jobData.result.websites.forEach(website => {
                    const statusIndex = state.websiteStatuses.findIndex(ws => ws.name === website.website);
                    if (statusIndex !== -1) {
                        if (website.success) {
                            state.websiteStatuses[statusIndex].status = 'done';
                            state.websiteStatuses[statusIndex].productCount = website.productCount || 0;
                        } else {
                            state.websiteStatuses[statusIndex].status = 'error';
                        }
                    }
                });
                renderThinkingAnimation(); // Update UI with current status
            }
            
            // Check if job is complete
            if (jobData.status === 'completed' && jobData.result) {
                return jobData.result;
            } else if (jobData.status === 'failed') {
                throw new Error(jobData.error || 'Job failed');
            }
            
            // Job still processing, wait and poll again
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            
        } catch (error) {
            if (error.message.includes('Job failed') || error.message.includes('HTTP error')) {
                throw error;
            }
            // Network error, retry
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error('Job timeout - scraping took too long');
}

// ============================================
// Search Handler
// ============================================
async function handleSearch(location, product) {
    if (!location || !product) {
        alert('Please enter both location and product');
        return;
    }
    
    // Update state
    state.appState = 'thinking';
    state.searchParams = { location, product };
    state.websiteStatuses = WEBSITES.map(name => ({ name, status: 'pending', productCount: 0 }));
    state.currentWebsite = '';
    state.results = null;
    state.activeWebsiteFilter = null;
    
    // Update UI
    showState('thinking');
    renderThinkingAnimation();
    
    try {
        // Call real API (NO MOCK DATA) - this will poll for results
        const data = await searchProducts(location, product);
        
        // Store results
        state.results = data;
        
        // Update UI with final results
        state.appState = 'results';
        showState('results');
        renderResultsView();
        
    } catch (error) {
        console.error('Search failed:', error);
        alert(`Error: ${error.message}`);
        state.appState = 'search';
        showState('search');
        renderSearchInput();
    }
}

// ============================================
// Progress Simulation (Visual Only)
// ============================================
function simulateProgress() {
    let index = 0;
    const update = () => {
        if (index < WEBSITES.length) {
            const website = WEBSITES[index];
            const statusIndex = state.websiteStatuses.findIndex(ws => ws.name === website);
            if (statusIndex !== -1) {
                state.websiteStatuses[statusIndex].status = 'loading';
                state.currentWebsite = website;
            }
            renderThinkingAnimation();
            index++;
            if (index < WEBSITES.length) {
                setTimeout(update, 2000);
            }
        }
    };
    setTimeout(update, 500);
}

// ============================================
// Render Functions
// ============================================
function renderSearchInput() {
    elements.searchInputComponent.innerHTML = `
        <form id="searchForm" class="search-form" onsubmit="event.preventDefault(); handleSearchFormSubmit()">
            <div class="search-input-group">
                <label class="search-label">
                    📍 Location
                </label>
                <select id="location" name="location" class="search-select" required>
                    <option value="">Select a city</option>
                    <option value="Mumbai">Mumbai</option>
                    <option value="Bangalore">Bangalore</option>
                    <option value="RT Nagar">RT Nagar</option>
                    <option value="Delhi">Delhi</option>
                    <option value="Chennai">Chennai</option>
                    <option value="Kolkata">Kolkata</option>
                    <option value="Hyderabad">Hyderabad</option>
                    <option value="Pune">Pune</option>
                    <option value="Ahmedabad">Ahmedabad</option>
                </select>
            </div>
            <div class="search-input-group">
                <label class="search-label">
                    📦 Product
                </label>
                <input 
                    type="text" 
                    id="product" 
                    name="product" 
                    class="search-input"
                    placeholder="e.g., Chaas, Tomato, Lays"
                    required
                    autocomplete="off"
                >
            </div>
            <button type="submit" class="search-button">
                Search Prices
            </button>
        </form>
    `;
}

function renderThinkingAnimation() {
    const { location, product } = state.searchParams;
    
    elements.thinkingAnimationComponent.innerHTML = `
        <div class="thinking-header">
            <h2 class="thinking-title">Searching for "${product}" in ${location}...</h2>
            <p class="thinking-subtitle">Comparing prices across all platforms</p>
        </div>
        <div class="websites-status">
            ${state.websiteStatuses.map(website => {
                const colorClass = WEBSITE_COLORS[website.name] || '';
                const statusClass = website.status;
                const statusText = website.status === 'done' ? 'Complete' : 
                                  website.status === 'loading' ? 'Loading...' :
                                  website.status === 'error' ? 'Error' : 'Pending';
                
                return `
                    <div class="website-status-card ${statusClass}">
                        <div class="website-status-header">
                            <div class="website-name">
                                <div class="website-dot ${colorClass}"></div>
                                ${website.name}
                            </div>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        ${website.status === 'loading' ? `
                            <div class="progress-bar">
                                <div class="progress-fill"></div>
                            </div>
                        ` : ''}
                        ${website.status === 'done' && website.productCount > 0 ? `
                            <div style="margin-top: 0.75rem; font-size: 0.875rem; color: hsl(var(--muted-foreground));">
                                Found ${website.productCount} products
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        </div>
        <div class="thinking-dots">•••</div>
    `;
}

function renderResultsView() {
    if (!state.results) return;
    
    const { location, product } = state.searchParams;
    const allProducts = getAllProducts(state.results);
    const lowestPrice = findLowestPrice(allProducts);
    
    // Group products by website
    const productsByWebsite = {};
    allProducts.forEach(product => {
        if (!productsByWebsite[product.website]) {
            productsByWebsite[product.website] = [];
        }
        productsByWebsite[product.website].push(product);
    });
    
    // Get active website or first available
    const activeWebsite = state.activeWebsiteFilter || 
                         Object.keys(productsByWebsite)[0] || 
                         null;
    
    const displayProducts = activeWebsite ? productsByWebsite[activeWebsite] : allProducts;
    
    elements.resultsViewComponent.innerHTML = `
        <div class="results-header">
            <div class="results-header-top">
                <h2 class="results-title">Price Comparison Results</h2>
                <button class="back-button" onclick="handleBack()">← New Search</button>
            </div>
            <div class="results-stats">
                <div class="stat-item">
                    <div class="stat-value">${state.results.summary.totalProducts || 0}</div>
                    <div class="stat-label">Total Products</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${state.results.summary.successCount}/${state.results.summary.totalWebsites}</div>
                    <div class="stat-label">Stores Found</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${state.results.summary?.totalDuration || 'N/A'}</div>
                    <div class="stat-label">Search Time</div>
                </div>
            </div>
        </div>
        <div class="results-content">
            <div class="website-tabs">
                <div class="website-tab ${!activeWebsite ? 'active' : ''}" 
                     onclick="filterByWebsite(null)">
                    All Stores
                </div>
                ${Object.keys(productsByWebsite).map(website => `
                    <div class="website-tab ${activeWebsite === website ? 'active' : ''}" 
                         onclick="filterByWebsite('${website}')">
                        <div class="website-dot ${WEBSITE_COLORS[website] || ''}"></div>
                        ${website} (${productsByWebsite[website].length})
                    </div>
                `).join('')}
            </div>
            <div class="products-section">
                <div class="products-header">
                    <div class="products-count">
                        Showing ${displayProducts.length} product${displayProducts.length !== 1 ? 's' : ''}
                    </div>
                    <select class="sort-select" id="sortSelect" onchange="handleSort()">
                        <option value="price-low">Price: Low to High</option>
                        <option value="price-high">Price: High to Low</option>
                        <option value="discount">Discount: Highest</option>
                        <option value="name">Name: A to Z</option>
                    </select>
                </div>
                <div class="products-grid" id="productsGrid">
                    ${renderProducts(displayProducts, lowestPrice)}
                </div>
            </div>
        </div>
    `;
}

function renderProducts(products, lowestPrice) {
    if (products.length === 0) {
        return `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: hsl(var(--muted-foreground));">
                No products found.
            </div>
        `;
    }
    
    // Sort products
    const sortedProducts = [...products].sort((a, b) => {
        const sortBy = document.getElementById('sortSelect')?.value || 'price-low';
        switch (sortBy) {
            case 'price-low':
                return (a.price || 0) - (b.price || 0);
            case 'price-high':
                return (b.price || 0) - (a.price || 0);
            case 'discount':
                const discountA = a.mrp && a.price ? (a.mrp - a.price) : 0;
                const discountB = b.mrp && b.price ? (b.mrp - b.price) : 0;
                return discountB - discountA;
            case 'name':
                return a.name.localeCompare(b.name);
            default:
                return 0;
        }
    });
    
    return sortedProducts.map((product, index) => {
        const discount = product.mrp && product.mrp > product.price 
            ? ((product.mrp - product.price) / product.mrp * 100).toFixed(0)
            : null;
        
        const isBestPrice = lowestPrice && product.price === lowestPrice;
        
        return `
            <div class="product-card ${isBestPrice ? 'best-price' : ''}" 
                 style="animation-delay: ${index * 0.05}s"
                 onclick="openProductUrl('${product.productUrl || '#'}')">
                <div class="product-image-container">
                    ${product.imageUrl ? `
                        <img src="${product.imageUrl}" 
                             alt="${escapeHtml(product.name)}" 
                             class="product-image"
                             loading="lazy"
                             onerror="this.style.display='none'">
                    ` : ''}
                    ${product.isOutOfStock ? `
                        <div class="product-out-of-stock">Out of Stock</div>
                    ` : ''}
                </div>
                <div class="product-content">
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    <div class="product-price-row">
                        <span class="product-price">₹${product.price?.toFixed(2) || 'N/A'}</span>
                        ${product.mrp && product.mrp > product.price ? `
                            <span class="product-mrp">₹${product.mrp.toFixed(2)}</span>
                            <span class="product-discount">${discount}% OFF</span>
                        ` : ''}
                    </div>
                    <div class="product-meta">
                        <div class="stock-status ${product.isOutOfStock ? 'out-of-stock' : 'in-stock'}">
                            ${product.isOutOfStock ? '❌ Out of Stock' : '✓ In Stock'}
                        </div>
                        <div class="product-website">${product.website || ''}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Helper Functions
// ============================================
function showState(newState) {
    elements.searchState.classList.add('hidden');
    elements.thinkingState.classList.add('hidden');
    elements.resultsState.classList.add('hidden');
    
    if (newState === 'search') {
        elements.searchState.classList.remove('hidden');
    } else if (newState === 'thinking') {
        elements.thinkingState.classList.remove('hidden');
    } else if (newState === 'results') {
        elements.resultsState.classList.remove('hidden');
    }
}

function getAllProducts(data) {
    const products = [];
    if (data.websites) {
        data.websites.forEach(website => {
            if (website.success && website.data && website.data.products) {
                website.data.products.forEach(product => {
                    products.push({
                        ...product,
                        website: website.website
                    });
                });
            }
        });
    }
    return products;
}

function findLowestPrice(products) {
    const prices = products.map(p => p.price).filter(p => p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
}

function filterByWebsite(website) {
    state.activeWebsiteFilter = website;
    renderResultsView();
}

function handleSort() {
    renderResultsView();
}

function handleBack() {
    state.appState = 'search';
    state.results = null;
    state.websiteStatuses = WEBSITES.map(name => ({ name, status: 'pending', productCount: 0 }));
    state.activeWebsiteFilter = null;
    showState('search');
    renderSearchInput();
}

function handleSearchFormSubmit() {
    const location = document.getElementById('location').value.trim();
    const product = document.getElementById('product').value.trim();
    handleSearch(location, product);
}

function openProductUrl(url) {
    if (url && url !== '#') {
        window.open(url, '_blank');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Global Functions (for inline handlers)
// ============================================
window.handleSearchFormSubmit = handleSearchFormSubmit;
window.filterByWebsite = filterByWebsite;
window.handleSort = handleSort;
window.handleBack = handleBack;
window.openProductUrl = openProductUrl;

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', init);


import { chromium } from 'playwright';
import readline from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';
import * as fs from 'fs';

// Force headless mode for efficiency
const isHeadless = true;

/**
 * Robust Playwright script to automate location selection on Zepto
 * Based on MCP Selenium implementation - uses proven selectors
 * 
 * Features:
 * - Multiple selector fallbacks for reliability
 * - Slow typing for better form interaction
 * - Screenshot capture at key points
 * - Reload verification
 * - HTML export
 * - Waits for user input before closing
 */
async function selectLocationOnZepto(locationName, productName = 'Chaas') {
  // Construct search URL from product name
  const searchUrl = `https://www.zepto.com/search?query=${encodeURIComponent(productName)}`;
  // Launch Chrome browser - opens only once
  let browser;
  let context;
  let page;
  
  try {
    try {
      browser = await chromium.launch({
        headless: isHeadless,
        channel: 'chrome',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
    } catch (channelError) {
      console.log('⚠️ Failed to launch with channel option, trying without...');
      browser = await chromium.launch({
        headless: isHeadless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
    }

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    page = await context.newPage();
    
    // Small delay to ensure browser is fully initialized
    await page.waitForTimeout(500);
    
    // Verify browser is still open
    if (!browser.isConnected()) {
      throw new Error('Browser disconnected immediately after launch');
    }
  } catch (launchError) {
    console.error('❌ Failed to launch browser:', launchError);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    throw launchError;
  }

  try {
    // Verify browser is still connected before navigation
    if (!browser.isConnected()) {
      throw new Error('Browser disconnected before navigation');
    }
    
    console.log(`Navigating to Zepto search page...`);
    console.log(`URL: ${searchUrl}`);
    // Navigate to Zepto search page with better error handling
    try {
      const response = await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      
      if (!response || !response.ok()) {
        const status = response ? response.status() : 'unknown';
        console.warn(`⚠️  Zepto returned status ${status}, continuing anyway...`);
      }
    } catch (gotoError) {
      // If goto fails, try with networkidle
      console.warn(`⚠️  Initial navigation failed, retrying with networkidle...`);
      try {
        await page.goto(searchUrl, {
          waitUntil: 'networkidle',
          timeout: 60000
        });
      } catch (retryError) {
        console.error(`❌ Failed to navigate to Zepto: ${retryError.message}`);
        throw new Error(`Failed to load Zepto page: ${retryError.message}`);
      }
    }
    
    // Wait for page to fully load
    await page.waitForTimeout(3000);

    console.log(`Opening location selector...`);
    // Step 1: Find and click location selector
    // Proven MCP selector: //*[contains(text(), 'Select Location')]
    const locationSelectors = [
      'xpath=//*[contains(text(), "Select Location")]',
      'text=Select Location',
      '*:has-text("Select Location")',
      'button:has-text("Select Location")',
      'span:has-text("Select Location")',
      'xpath=//*[contains(text(), "Location")]',
      'xpath=//button[contains(text(), "Location")]'
    ];

    let locationClicked = false;
    for (const selector of locationSelectors) {
      try {
        if (selector.startsWith('xpath=')) {
          const xpath = selector.replace('xpath=', '');
          await page.waitForSelector(xpath, { timeout: 5000 });
          await page.click(xpath, { timeout: 5000 });
          locationClicked = true;
          console.log(`✓ Location selector clicked using: ${selector}`);
          break;
        } else {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 5000 })) {
            await element.click({ timeout: 5000 });
            locationClicked = true;
            console.log(`✓ Location selector clicked using: ${selector}`);
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!locationClicked) {
      throw new Error('Location selector not found after trying all selectors');
    }

    console.log(`Waiting for location modal to open...`);
    await page.waitForTimeout(1000);

    // Step 2: Find location input field
    // Proven MCP selector: //input[@placeholder and contains(translate(@placeholder, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'search a new address')]
    const locationInputSelectors = [
      'xpath=//input[@placeholder and contains(translate(@placeholder, \'ABCDEFGHIJKLMNOPQRSTUVWXYZ\', \'abcdefghijklmnopqrstuvwxyz\'), \'search a new address\')]',
      'input[placeholder*="search a new address" i]',
      'input[placeholder*="search" i]',
      'input[type="text"]',
      'xpath=//input[@type=\'text\' and not(contains(@id, \'R49trea4tb\'))]'
    ];

    await page.waitForSelector('input[placeholder*="search" i], input[type="text"]', {
      timeout: 10000
    });

    let locationInput = null;
    for (const selector of locationInputSelectors) {
      try {
        if (selector.startsWith('xpath=')) {
          const xpath = selector.replace('xpath=', '');
          locationInput = page.locator(xpath).first();
          await locationInput.waitFor({ timeout: 5000, state: 'visible' });
          if (await locationInput.isVisible({ timeout: 2000 })) {
            console.log(`✓ Found location input using: ${selector}`);
            break;
          }
        } else {
          const input = page.locator(selector).first();
          if (await input.isVisible({ timeout: 5000 })) {
            locationInput = input;
            console.log(`✓ Found location input using: ${selector}`);
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!locationInput) {
      throw new Error('Location input field not found after trying all selectors');
    }

    console.log(`Clicking location input field...`);
    // Click and focus the input
    await locationInput.click({ force: true });
    await page.waitForTimeout(500);

    // Clear any existing text
    await locationInput.fill('');
    await page.waitForTimeout(200);

    console.log(`Typing location: ${locationName}`);
    // Type slowly character by character (as done in MCP with slowly=true)
    // This ensures better reliability with dynamic forms
    for (const char of locationName) {
      await locationInput.type(char, { delay: 100 });
    }
    await page.waitForTimeout(500);

    console.log(`Waiting for location suggestions to appear...`);
    await page.waitForTimeout(3000);

    // Step 3: Find and click location suggestion
    let suggestionClicked = false;
    
    // Generate location name variations to handle different formats
    const normalizedLocation = locationName.trim();
    const locationVariations = [
      normalizedLocation,                           // Exact: "RT Nagar"
      normalizedLocation.replace(/\s+/g, ''),      // No spaces: "RTNagar"
      normalizedLocation.replace(/\s+/g, ' '),     // Normalized: "RT Nagar"
      normalizedLocation.toLowerCase(),             // Lowercase: "rt nagar"
      normalizedLocation.toUpperCase(),             // Uppercase: "RT NAGAR"
      normalizedLocation.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '), // Title case
      // Handle "rtnagar" -> "RT Nagar" or "R T Nagar"
      normalizedLocation.replace(/([a-z])([A-Z])/g, '$1 $2'), // Add space before capital: "rtNagar" -> "rt Nagar"
      normalizedLocation.split(/(?=[A-Z])/).join(' '), // Split on capitals: "RTNagar" -> "RT Nagar"
      normalizedLocation.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') // Combined
    ];
    
    // Remove duplicates
    const uniqueVariations = [...new Set(locationVariations)];
    
    // First, try to get all visible suggestions and match by text content (case-insensitive)
    try {
      const allSuggestions = await page.locator('*:has-text("' + normalizedLocation + '")').all();
      for (const suggestion of allSuggestions) {
        try {
          const text = await suggestion.textContent();
          const lowerText = (text || '').toLowerCase();
          const lowerLocation = normalizedLocation.toLowerCase();
          
          // Check if suggestion text contains location (case-insensitive)
          if (lowerText.includes(lowerLocation) && 
              !lowerText.includes('airport') && 
              !lowerText.includes('railway') && 
              !lowerText.includes('station') &&
              !lowerText.includes('search') &&
              !lowerText.includes('enter')) {
            if (await suggestion.isVisible({ timeout: 2000 })) {
              await suggestion.scrollIntoViewIfNeeded();
              await page.waitForTimeout(500);
              await suggestion.click({ timeout: 2000 });
              suggestionClicked = true;
              console.log(`✓ Location suggestion clicked: ${locationName} (matched: "${text?.substring(0, 50)}")`);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      // Continue to fallback strategies
    }
    
    // Build multiple selector strategies (fallback)
    const suggestionSelectors = [];
    
    for (const loc of uniqueVariations) {
      // Strategy 1: Case-insensitive matching excluding airport/railway/station
      suggestionSelectors.push(`xpath=//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${loc.toLowerCase()}') and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'airport')) and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'railway')) and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'station'))]`);
      
      // Strategy 2: List items
      suggestionSelectors.push(`xpath=//li[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${loc.toLowerCase()}')]`);
      
      // Strategy 3: Divs
      suggestionSelectors.push(`xpath=//div[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${loc.toLowerCase()}') and not(ancestor::input)]`);
      
      // Strategy 4: Any element (excluding input)
      suggestionSelectors.push(`xpath=//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${loc.toLowerCase()}') and not(self::input) and not(ancestor::input)]`);
      
      // Strategy 5: Playwright has-text (case-insensitive)
      suggestionSelectors.push(`*:has-text("${loc}")`);
      
      // Strategy 6: Text locator
      suggestionSelectors.push(`text=${loc}`);
    }

    for (const selector of suggestionSelectors) {
      try {
        let suggestion;
        if (selector.startsWith('xpath=') || selector.startsWith('//')) {
          const xpath = selector.startsWith('xpath=') ? selector.replace('xpath=', '') : selector;
          suggestion = page.locator(xpath).first();
        } else {
          suggestion = page.locator(selector).first();
        }
        
        await suggestion.waitFor({ timeout: 3000, state: 'visible' });
        if (await suggestion.isVisible({ timeout: 2000 })) {
          // Scroll into view
          await suggestion.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          
          // Try regular click
          try {
            await suggestion.click({ timeout: 2000 });
            suggestionClicked = true;
            console.log(`✓ Location suggestion clicked: ${locationName}`);
            break;
          } catch (e) {
            // Try force click
            try {
              await suggestion.click({ timeout: 2000, force: true });
              suggestionClicked = true;
              console.log(`✓ Location suggestion clicked (force): ${locationName}`);
              break;
            } catch (e2) {
              // Try JavaScript click
              const elementHandle = await suggestion.elementHandle();
              if (elementHandle) {
                await elementHandle.click();
                suggestionClicked = true;
                console.log(`✓ Location suggestion clicked (JS): ${locationName}`);
                break;
              }
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!suggestionClicked) {
      throw new Error(`Could not click location suggestion for: ${locationName}`);
    }

    console.log(`Waiting for location to be applied...`);
    await page.waitForTimeout(3000);

    // Step 4: Reload page to verify location persists
    console.log(`Reloading page to verify location...`);
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    // Wait for page to be ready
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      console.log(`✓ Page DOM loaded`);
    } catch (e) {
      console.log(`⚠️  DOM load check timeout, continuing...`);
    }
    await page.waitForTimeout(2000);

    // Step 5: Scroll slowly from top to bottom to load all images and products
    console.log(`Scrolling slowly from top to bottom to load all products and images...`);
    await page.evaluate(async () => {
      const scrollHeight = document.body.scrollHeight || document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      const scrollSteps = Math.max(20, Math.ceil(scrollHeight / (viewportHeight * 0.5))); // Scroll in smaller increments
      
      for (let i = 0; i <= scrollSteps; i++) {
        const scrollPosition = (scrollHeight / scrollSteps) * i;
        window.scrollTo({
          top: scrollPosition,
          behavior: 'smooth'
        });
        // Wait between scroll steps to allow images to load
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Scroll back to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await new Promise(resolve => setTimeout(resolve, 500));
    });
    
    await page.waitForTimeout(2000);
    
    // Force load lazy images
    console.log(`Force loading lazy images...`);
    await page.evaluate(() => {
      const images = document.querySelectorAll('img[data-src], img[data-lazy-src], img[data-original], img[data-srcset]');
      images.forEach(img => {
        const src = img.getAttribute('data-src') || 
                   img.getAttribute('data-lazy-src') || 
                   img.getAttribute('data-original') ||
                   (img.getAttribute('data-srcset')?.split(',')[0]?.trim().split(' ')[0]);
        if (src && !img.src) {
          img.src = src;
        }
      });
    });
    
    await page.waitForTimeout(2000);
    
    // Step 6: Extract products from HTML
    console.log(`Extracting products from page...`);
    const products = await page.evaluate(() => {
      const productList = [];
      const processedNames = new Set();
      
      // Strategy 1: Find products by img alt/title attributes (primary method for Zepto)
      const images = document.querySelectorAll('img[alt], img[title]');
      
      images.forEach(img => {
        try {
          let productName = img.getAttribute('alt')?.trim() || img.getAttribute('title')?.trim();
          
          if (!productName || productName.length < 3) return;
          
          // Skip if it's not a product image
          if (productName.match(/^(P3|Ad|logo|icon|button|arrow|close|menu|search|Zepto)$/i) || 
              productName.match(/\.(png|jpg|jpeg|gif|svg)$/i) || 
              productName.length < 5) return;
          
          // Find the parent container with price
          let container = img.parentElement;
          let depth = 0;
          const maxDepth = 5;
          
          while (depth < maxDepth && container) {
            const containerText = container.textContent || '';
            if (containerText.match(/₹\s*\d+/)) {
              break; // Found container with price
            }
            container = container.parentElement;
            depth++;
          }
          
          if (!container) container = img.closest('div, article, section');
          
          // Must have price in the container
          const containerText = container?.textContent || '';
          if (!containerText.match(/₹\s*\d+/)) return;
          
          // Extract prices
          let price = null;
          let mrp = null;
          const priceMatches = containerText.match(/₹\s*(\d+(?:\.\d+)?)/g);
          
          if (priceMatches && priceMatches.length > 0) {
            const prices = priceMatches.map(m => {
              const match = m.match(/₹\s*(\d+(?:\.\d+)?)/);
              return match ? parseFloat(match[1]) : null;
            }).filter(p => p !== null && p > 0);
            
            if (prices.length > 1) {
              // Usually first is MRP, second is selling price
              const sortedPrices = prices.sort((a, b) => b - a);
              mrp = sortedPrices[0];
              price = sortedPrices[1];
            } else if (prices.length === 1) {
              price = prices[0];
            }
          }
          
          if (!price || !productName) return;
          
          // Extract image URL
          let imageUrl = img.getAttribute('src') || 
                        img.getAttribute('data-src') || 
                        img.getAttribute('data-lazy-src') || 
                        img.getAttribute('data-original') ||
                        (img.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0]);
          
          if (imageUrl && !imageUrl.startsWith('http')) {
            if (imageUrl.startsWith('//')) {
              imageUrl = 'https:' + imageUrl;
            } else if (imageUrl.startsWith('/')) {
              imageUrl = 'https://www.zepto.com' + imageUrl;
            }
          }
          
          // Extract product URL - look for links in container
          // Zepto uses /pn/ pattern: https://www.zepto.com/pn/tomato-local/pvid/7e261768-88d6-4cbb-8b9b-8718625577bd
          let productUrl = null;
          
          // First, check if the image itself or its parent is a link
          let linkElement = img.closest('a[href]');
          if (linkElement) {
            const href = linkElement.getAttribute('href');
            if (href && (href.includes('/pn/') || href.includes('/product') || href.includes('/p/'))) {
              productUrl = href;
            }
          }
          
          // If no link found from image, search in container
          if (!productUrl && container) {
            // First try to find links with /pn/ pattern (Zepto product URLs)
            const link = container.querySelector('a[href*="/pn/"]');
            if (link) {
              productUrl = link.getAttribute('href');
            } else {
              // Fallback to other patterns
              const fallbackLink = container.querySelector('a[href*="/product"], a[href*="/p/"], a[href*="/item"]');
              if (fallbackLink) {
                productUrl = fallbackLink.getAttribute('href');
              } else {
                // Last resort: any link that looks like a product URL
                const anyLink = container.querySelector('a[href]');
                if (anyLink) {
                  const href = anyLink.getAttribute('href');
                  if (href && !href.startsWith('#') && !href.startsWith('javascript:') && 
                      (href.includes('/pn/') || href.includes('/product') || href.includes('/p/'))) {
                    productUrl = href;
                  }
                }
              }
            }
          }
          
          // Convert relative URLs to absolute
          if (productUrl && !productUrl.startsWith('http')) {
            if (productUrl.startsWith('//')) {
              productUrl = 'https:' + productUrl;
            } else if (productUrl.startsWith('/')) {
              productUrl = 'https://www.zepto.com' + productUrl;
            } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
              productUrl = 'https://www.zepto.com/' + productUrl;
            }
          }
          
          // Check for out of stock
          const isOutOfStock = container ? (
            container.querySelector('[class*="out-of-stock"], [class*="unavailable"]') !== null ||
            containerText.match(/out of stock|currently unavailable/i) !== null
          ) : false;
          
          // Skip duplicates
          const normalizedName = productName.toLowerCase().trim();
          if (processedNames.has(normalizedName)) return;
          processedNames.add(normalizedName);
          
          const discount = mrp && mrp > price ? mrp - price : null;
          
          productList.push({
            name: productName,
            price: price,
            mrp: mrp || null,
            discount: discount,
            discountAmount: discount,
            isOutOfStock: isOutOfStock,
            imageUrl: imageUrl || null,
            productUrl: productUrl || null
          });
        } catch (e) {
          // Skip products with errors
        }
      });
      
      // Strategy 2: Fallback - Find products using data-slot-id="ProductName"
      if (productList.length === 0) {
        const productCards = document.querySelectorAll('[data-slot-id="ProductName"]');
        
        productCards.forEach(card => {
          try {
            const productName = card.textContent?.trim();
            if (!productName || productName.length < 3) return;
            
            // Find container with price
            let container = card.parentElement;
            let depth = 0;
            while (depth < 5 && container) {
              if (container.textContent?.match(/₹\s*\d+/)) break;
              container = container.parentElement;
              depth++;
            }
            
            if (!container) container = card.closest('div, article, section');
            
            const containerText = container?.textContent || '';
            if (!containerText.match(/₹\s*\d+/)) return;
            
            // Extract prices
            let price = null;
            let mrp = null;
            const priceMatches = containerText.match(/₹\s*(\d+(?:\.\d+)?)/g);
            
            if (priceMatches && priceMatches.length > 0) {
              const prices = priceMatches.map(m => {
                const match = m.match(/₹\s*(\d+(?:\.\d+)?)/);
                return match ? parseFloat(match[1]) : null;
              }).filter(p => p !== null && p > 0);
              
              if (prices.length > 1) {
                const sortedPrices = prices.sort((a, b) => b - a);
                mrp = sortedPrices[0];
                price = sortedPrices[1];
              } else if (prices.length === 1) {
                price = prices[0];
              }
            }
            
            if (!price) return;
            
            // Extract image URL
            let imageUrl = null;
            const img = container?.querySelector('img');
            if (img) {
              imageUrl = img.getAttribute('src') || 
                        img.getAttribute('data-src') || 
                        img.getAttribute('data-lazy-src') || 
                        img.getAttribute('data-original');
              
              if (imageUrl && !imageUrl.startsWith('http')) {
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                  imageUrl = 'https://www.zepto.com' + imageUrl;
                }
              }
            }
            
            // Extract product URL
            // Zepto uses /pn/ pattern: https://www.zepto.com/pn/tomato-local/pvid/7e261768-88d6-4cbb-8b9b-8718625577bd
            let productUrl = null;
            
            // First, check if container itself is a link
            if (container && container.tagName === 'A') {
              const href = container.getAttribute('href');
              if (href && (href.includes('/pn/') || href.includes('/product') || href.includes('/p/'))) {
                productUrl = href;
              }
            }
            
            // If no link found, search in container
            if (!productUrl && container) {
              // First try to find links with /pn/ pattern (Zepto product URLs)
              const link = container.querySelector('a[href*="/pn/"]');
              if (link) {
                productUrl = link.getAttribute('href');
              } else {
                // Fallback to other patterns
                const fallbackLink = container.querySelector('a[href*="/product"], a[href*="/p/"], a[href*="/item"]');
                if (fallbackLink) {
                  productUrl = fallbackLink.getAttribute('href');
                } else {
                  // Last resort: any link that looks like a product URL
                  const anyLink = container.querySelector('a[href]');
                  if (anyLink) {
                    const href = anyLink.getAttribute('href');
                    if (href && !href.startsWith('#') && !href.startsWith('javascript:') && 
                        (href.includes('/pn/') || href.includes('/product') || href.includes('/p/'))) {
                      productUrl = href;
                    }
                  }
                }
              }
            }
            
            if (productUrl && !productUrl.startsWith('http')) {
              if (productUrl.startsWith('//')) {
                productUrl = 'https:' + productUrl;
              } else if (productUrl.startsWith('/')) {
                productUrl = 'https://www.zepto.com' + productUrl;
              }
            }
            
            const normalizedName = productName.toLowerCase().trim();
            if (!processedNames.has(normalizedName)) {
              processedNames.add(normalizedName);
              
              const isOutOfStock = container ? (
                container.querySelector('[class*="out-of-stock"], [class*="unavailable"]') !== null ||
                containerText.match(/out of stock|currently unavailable/i) !== null
              ) : false;
              
              const discount = mrp && mrp > price ? mrp - price : null;
              
              productList.push({
                name: productName,
                price: price,
                mrp: mrp || null,
                discount: discount,
                discountAmount: discount,
                isOutOfStock: isOutOfStock,
                imageUrl: imageUrl || null,
                productUrl: productUrl || null
              });
            }
          } catch (e) {
            // Skip products with errors
          }
        });
      }
      
      // Remove duplicates and filter invalid products
      const uniqueProducts = [];
      const seenNames = new Set();
      for (const product of productList) {
        const normalizedName = product.name.toLowerCase().trim();
        if (!seenNames.has(normalizedName) && 
            product.name.length >= 3 && 
            product.name.length < 200 &&
            !product.name.match(/^[\d\s₹\-]+$/) && // Not just numbers and symbols
            product.price > 0) {
          seenNames.add(normalizedName);
          uniqueProducts.push(product);
        }
      }
      
      return uniqueProducts;
    });
    
    console.log(`✓ Extracted ${products.length} products`);
    
    // Step 7: Generate JSON output
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0] + 'Z';
    
    const jsonData = {
      website: "Zepto",
      location: locationName,
      product: productName,
      timestamp: timestamp,
      products: products
    };
    
    // HTML and JSON files are not saved locally (disabled per user request)
    console.log(`✓ Total products: ${products.length}`);

    console.log(`\n✅ Location "${locationName}" selected and products extracted successfully!`);
    
    // Close browser
    await browser.close();
    console.log('Browser closed.');

    // Return the JSON data
    return jsonData;

  } catch (error) {
    console.error('❌ Error occurred:', error);
    try {
      if (page) {
        await page.screenshot({ path: 'zepto-error.png', fullPage: true });
        console.log('Error screenshot saved: zepto-error.png');
      }
    } catch (e) {
      // Ignore screenshot errors
    }
    
    // Close browser on error
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    throw error;
  }
}

// Helper function to wait for Enter key press
function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('\nPress Enter to close the browser...', () => {
      rl.close();
      resolve();
    });
  });
}

// Main execution
async function main() {
  const locations = ['Mumbai', 'Bangalore', 'Chennai', 'Madurai'];
  
  // Get location and product from command line arguments
  const locationToSelect = process.argv[2] || locations[0];
  const productName = process.argv[3] || 'Chaas';
  
  console.log(`\n🚀 Starting Zepto location selection`);
  console.log(`📍 Location: ${locationToSelect}`);
  console.log(`🛍️ Product: ${productName}\n`);
  
  const jsonData = await selectLocationOnZepto(locationToSelect, productName);
  console.log(`\n📊 Products extracted: ${jsonData.products.length}`);
  return jsonData;
}

// Run the script only if called directly (not when imported as a module)
const __filename = fileURLToPath(import.meta.url);
const __basename = path.basename(__filename);

let isMainModule = false;
if (process.argv[1]) {
  try {
    const mainFile = path.resolve(process.argv[1]);
    const currentFile = path.resolve(__filename);
    isMainModule = mainFile === currentFile || path.basename(mainFile) === __basename;
  } catch (e) {
    isMainModule = process.argv[1].endsWith('zepto-location-selector.js') || 
                   process.argv[1].includes('zepto-location-selector.js');
  }
}

if (isMainModule) {
  main().catch(console.error);
}

export { selectLocationOnZepto };

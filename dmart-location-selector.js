import { chromium } from 'playwright';
import * as fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

/**
 * Playwright script to automate location selection and product search on D-Mart
 * This script:
 * 1. Opens D-Mart search page
 * 2. Selects a location
 * 3. Searches for the product
 * 4. Extracts product data (name, price, productUrl, imageUrl) from HTML
 * 5. Returns structured JSON data
 * 6. Closes browser when done
 */
async function selectLocationAndSearchOnDmart(locationName, productName = 'potato') {
  // Launch Chrome browser - use headless mode by default (set HEADLESS=false to disable)
  const isHeadless = process.env.HEADLESS !== 'false';
  const browser = await chromium.launch({
    headless: isHeadless,
    channel: 'chrome' // Use Chrome browser
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log(`Navigating to D-Mart search page...`);
    // Navigate to D-Mart search page with product
    await page.goto(`https://www.dmart.in/search?searchTerm=${encodeURIComponent(productName)}`, {
      waitUntil: 'load',
      timeout: 60000 // Increase timeout to 60 seconds
    });
    
    // Wait for page to be fully loaded
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      console.log(`✓ Page DOM loaded`);
    } catch (e) {
      console.log(`⚠️  DOM load check timeout, continuing...`);
    }
    
    // Wait a bit for any dynamic content to load
    await page.waitForTimeout(3000);

    console.log(`Opening location selector...`);
    // Click on the location selector using XPath selector found via MCP
    // Selector: //*[contains(@class, 'location') or contains(@id, 'location')]
    let locationClicked = false;
    try {
      const locationSelector = page.locator('xpath=//*[contains(@class, "location") or contains(@id, "location")]').first();
      if (await locationSelector.isVisible({ timeout: 5000 })) {
        await locationSelector.click({ timeout: 5000 });
        locationClicked = true;
        console.log(`Location selector clicked using XPath`);
      }
    } catch (e) {
      // Fallback: try CSS selector
      try {
        const fallbackSelector = page.locator('*[class*="location" i]').first();
        if (await fallbackSelector.isVisible({ timeout: 5000 })) {
          await fallbackSelector.click({ timeout: 5000 });
          locationClicked = true;
          console.log(`Location selector clicked using CSS fallback`);
        }
      } catch (e2) {
        throw new Error('Location selector not found');
      }
    }

    if (!locationClicked) {
      throw new Error('Location selector not found');
    }

    console.log(`Waiting for location modal to open...`);
    // Wait for the location input field in the dialog
    // Selector found via MCP: //div[@role='dialog']//input[@type='text']
    await page.waitForSelector('div[role="dialog"] input[type="text"]', {
      timeout: 10000
    });

    console.log(`Typing location: ${locationName}`);
    // Find and interact with the location input in the dialog
    const locationInput = page.locator('div[role="dialog"] input[type="text"]').first();
    await locationInput.click();
    await locationInput.fill(locationName);
    
    console.log(`Waiting for location suggestions to appear...`);
    // Wait a bit for suggestions to load
    await page.waitForTimeout(1000);
    
    // Wait for suggestions to appear and select the location
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
      const allSuggestions = await page.locator('div[role="dialog"] *').all();
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
              !lowerText.includes('temple') &&
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
    
    // Build multiple XPath strategies (fallback)
    const suggestionStrategies = [];
    
    for (const loc of uniqueVariations) {
      const locLower = loc.toLowerCase();
      // Strategy 1: Case-insensitive matching in ul elements, excluding airport/railway/station/temple
      suggestionStrategies.push(`xpath=//ul//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}') and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'airport')) and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'railway')) and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'station')) and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'temple'))]`);
      
      // Strategy 2: In list items (case-insensitive)
      suggestionStrategies.push(`xpath=//li[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}')]`);
      
      // Strategy 3: In divs within dialog (case-insensitive)
      suggestionStrategies.push(`xpath=//div[@role='dialog']//div[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}')]`);
      
      // Strategy 4: Any element with location text (excluding input, case-insensitive)
      suggestionStrategies.push(`xpath=//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}') and not(self::input) and not(ancestor::input)]`);
      
      // Strategy 5: Playwright text locator
      suggestionStrategies.push(`text=${loc}`);
    }
    
    // Try each strategy
    for (const selector of suggestionStrategies) {
      try {
        let suggestion;
        if (selector.startsWith('xpath=')) {
          const xpath = selector.replace('xpath=', '');
          suggestion = page.locator(xpath).first();
        } else {
          suggestion = page.locator(selector).first();
        }
        
        if (await suggestion.isVisible({ timeout: 3000 })) {
          // Scroll into view
          await suggestion.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          
          // Try regular click
          try {
            await suggestion.click({ timeout: 2000 });
            suggestionClicked = true;
            console.log(`✓ Location suggestion clicked: ${locationName} using ${selector.substring(0, 50)}...`);
            break;
          } catch (e) {
            // Try force click
            try {
              await suggestion.click({ timeout: 2000, force: true });
              suggestionClicked = true;
              console.log(`✓ Location suggestion clicked (force): ${locationName} using ${selector.substring(0, 50)}...`);
              break;
            } catch (e2) {
              // Try JavaScript click
              await page.evaluate((el) => el.click(), await suggestion.elementHandle());
              suggestionClicked = true;
              console.log(`✓ Location suggestion clicked (JS): ${locationName} using ${selector.substring(0, 50)}...`);
              break;
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
    // Wait a moment for the location to be applied
    await page.waitForTimeout(2000);

    console.log(`Clicking confirm location button...`);
    // Wait a moment for the confirm button to appear
    await page.waitForTimeout(500);
    
    // Find and click the "CONFIRM" button
    // Selector found via MCP: //button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm')]
    let confirmClicked = false;
    
    const confirmSelectors = [
      'xpath=//button[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "confirm")]',
      'button:has-text("CONFIRM")',
      'button:has-text("Confirm")',
      'button:has-text("confirm")'
    ];

    for (const selector of confirmSelectors) {
      try {
        const confirmButton = page.locator(selector).first();
        if (await confirmButton.isVisible({ timeout: 2000 })) {
          await confirmButton.click({ timeout: 2000 });
          confirmClicked = true;
          console.log(`Confirm location button clicked using: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!confirmClicked) {
      console.log(`Warning: Could not find confirm button`);
    }

    console.log(`Waiting for location to be confirmed...`);
    // Wait a moment for the location to be confirmed and page to reload
    await page.waitForTimeout(3000);
    
    // Wait for page to be ready after location confirmation
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      console.log(`✓ Page ready after location confirmation`);
    } catch (e) {
      console.log(`⚠️  Page ready check timeout, continuing...`);
    }

    // After location is confirmed, search for the product
    console.log(`Searching for product: ${productName}...`);
    
    // Find the search input field
    // Selector found via MCP: //input[@id='scrInput']
    const searchInputSelectors = [
      'input#scrInput',
      'input[type="text"][id="scrInput"]',
      'xpath=//input[@id="scrInput"]'
    ];
    
    let searchInput = null;
    for (const selector of searchInputSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 5000 })) {
          searchInput = input;
          console.log(`Found search input using: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!searchInput) {
      console.log(`Warning: Could not find search input, navigating directly to search URL...`);
      // Fallback: navigate directly to search URL with location set
      await page.goto(`https://www.dmart.in/search?searchTerm=${encodeURIComponent(productName)}`, {
        waitUntil: 'networkidle',
        timeout: 60000
      });
      await page.waitForTimeout(3000);
    } else {
      // Clear and fill the search input
      await searchInput.fill('');
      await searchInput.fill(productName);
      await page.waitForTimeout(500);
      
      // Find and click the search button
      // Selector found via MCP: //button[contains(@class, 'searchButton') or contains(@class, 'search')]
      const searchButtonSelectors = [
        'xpath=//button[contains(@class, "searchButton") or contains(@class, "search")]',
        'button[class*="searchButton"]',
        'button[class*="search"]'
      ];
      
      let searchButtonClicked = false;
      for (const selector of searchButtonSelectors) {
        try {
          const searchButton = page.locator(selector).first();
          if (await searchButton.isVisible({ timeout: 2000 })) {
            await searchButton.click({ timeout: 2000 });
            searchButtonClicked = true;
            console.log(`Search button clicked using: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!searchButtonClicked) {
        // Fallback: Press Enter
        console.log(`Pressing Enter to search for: ${productName}...`);
        await searchInput.press('Enter');
        console.log(`✓ Enter pressed`);
      }
      
      // Wait for search results to load - wait for navigation or results to appear
      console.log(`Waiting for search results to load...`);
      
      // Wait for either navigation to complete or search results to appear
      try {
        // Wait for page to navigate (if it does) or for search results container
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}),
          page.waitForSelector('div[class*="product"], div[class*="item"], div[class*="result"], [class*="vertical-card"], [class*="stretched-card"]', {
            timeout: 15000
          })
        ]);
        console.log(`✓ Search results loaded`);
      } catch (e) {
        // Fallback: wait a bit more
        console.log(`Waiting additional time for search results...`);
        await page.waitForTimeout(3000);
        console.log(`✓ Proceeding with search results`);
      }
      
      // Additional wait after search results appear
      console.log(`Waiting 2 seconds for search results to stabilize...`);
      await page.waitForTimeout(2000);
    }

    // Wait for product elements to be fully rendered (like JioMart does)
    console.log(`Waiting for product elements to render...`);
    try {
      // Wait for product cards or items to appear
      await page.waitForSelector('[class*="vertical-card"], [class*="stretched-card"], [class*="product"], [class*="item"]', {
        timeout: 10000
      });
      console.log(`✓ Product elements found`);
    } catch (e) {
      console.log(`⚠️  Product elements not found, continuing anyway...`);
    }
    
    // Wait for network to be idle (ensures images and other resources are loaded)
    console.log(`Waiting for network to be idle...`);
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      console.log(`✓ Network idle`);
    } catch (e) {
      console.log(`⚠️  Network idle timeout, continuing...`);
    }
    
    // Wait for images to load - check for product images with actual src attributes
    console.log(`Waiting for product images to load...`);
    try {
      // First, trigger lazy loading by scrolling
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 3);
      });
      await page.waitForTimeout(1500);
      
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await page.waitForTimeout(1500);
      
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1500);
      
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1000);
      
      // Wait for images to have actual src attributes (not just data-src)
      await page.waitForFunction(() => {
        const images = document.querySelectorAll('[class*="vertical-card"] img, [class*="stretched-card"] img, [class*="product"] img, [class*="card"] img');
        let loadedCount = 0;
        let hasSrcCount = 0;
        images.forEach(img => {
          // Check if image has a src attribute (not empty)
          if (img.src && img.src !== '' && !img.src.includes('data:image/svg')) {
            hasSrcCount++;
          }
          // Check if image is actually loaded
          if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            loadedCount++;
          }
        });
        // We want at least 3 images with src, or all if less than 3
        return hasSrcCount >= Math.min(3, images.length) && loadedCount >= Math.min(2, images.length);
      }, { timeout: 15000 });
      console.log(`✓ Product images loaded with src attributes`);
    } catch (e) {
      console.log(`⚠️  Image loading check timeout: ${e.message}`);
      // Try to force load images by setting src from data-src
      console.log(`Attempting to force load lazy images...`);
      try {
        await page.evaluate(() => {
          const images = document.querySelectorAll('img[data-src], img[data-lazy-src], img[data-original]');
          images.forEach(img => {
            const src = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
            if (src && !img.src) {
              img.src = src;
            }
          });
        });
        await page.waitForTimeout(3000);
        console.log(`✓ Attempted to force load lazy images`);
      } catch (e2) {
        console.log(`⚠️  Could not force load images`);
      }
    }
    
    // Additional wait to ensure all lazy-loaded images are loaded
    console.log(`Waiting 4 seconds for lazy-loaded images to fully load...`);
    await page.waitForTimeout(4000);
    
    // Scroll again to trigger any remaining lazy-loaded images
    console.log(`Final scroll to trigger remaining lazy-loaded images...`);
    try {
      await page.evaluate(() => {
        // Scroll through the page in smaller increments
        const scrollHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        const scrollSteps = 5;
        for (let i = 0; i <= scrollSteps; i++) {
          window.scrollTo(0, (scrollHeight / scrollSteps) * i);
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(3000);
      console.log(`✓ Final scroll completed`);
    } catch (e) {
      console.log(`⚠️  Final scroll error, continuing...`);
    }
    
    // Final wait for any remaining images to load
    console.log(`Final wait for all images to load...`);
    await page.waitForTimeout(3000);
    
    // Verify images are present before extracting HTML
    const imageCount = await page.evaluate(() => {
      const images = document.querySelectorAll('[class*="vertical-card"] img, [class*="stretched-card"] img, [class*="product"] img');
      let withSrc = 0;
      images.forEach(img => {
        if (img.src && img.src !== '' && !img.src.includes('data:image/svg')) {
          withSrc++;
        }
      });
      return { total: images.length, withSrc: withSrc };
    });
    console.log(`Image status: ${imageCount.withSrc}/${imageCount.total} images have src attributes`);
    console.log(`✓ Ready to extract HTML`);

    // Take a screenshot of search results
    const screenshotPath = `dmart-${locationName.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-')}-search-results.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);

    // Extract product URLs from page using multiple strategies
    console.log(`\nExtracting product URLs from page...`);
    
    const productUrlsMap = await page.evaluate(() => {
      const urlsMap = {};
      
      // Strategy 1: Extract from all clickable elements that might navigate to products
      const cards = document.querySelectorAll('.vertical-card_card-vertical__Q8seS');
      
      cards.forEach((card) => {
        const titleElement = card.querySelector('.vertical-card_title__pMGg9');
        const productName = titleElement ? titleElement.textContent.trim() : null;
        if (!productName) return;
        
        let productUrl = null;
        
        // Try to find the clickable image div and get its navigation target
        const imageDiv = card.querySelector('.vertical-card_image__yNgf2');
        if (imageDiv) {
          // Check if image div or its parent has an onClick that navigates
          // Try to access React props if available
          const reactKey = Object.keys(imageDiv).find(key => 
            key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
          );
          
          if (reactKey) {
            try {
              let fiber = imageDiv[reactKey];
              let depth = 0;
              while (fiber && depth < 15) {
                if (fiber.memoizedProps) {
                  const props = fiber.memoizedProps;
                  // Check for navigation props
                  if (props.href) {
                    productUrl = props.href;
                    break;
                  }
                  if (props.onClick) {
                    // Try to extract URL from onClick handler
                    const onClickStr = props.onClick.toString();
                    const urlMatch = onClickStr.match(/['"`]([^'"`]*\/product[^'"`]*)['"`]/) ||
                                    onClickStr.match(/router\.push\(['"`]([^'"`]+)['"`]\)/) ||
                                    onClickStr.match(/href:\s*['"`]([^'"`]+)['"`]/);
                    if (urlMatch && urlMatch[1]) {
                      productUrl = urlMatch[1];
                      break;
                    }
                  }
                }
                if (fiber.return) {
                  fiber = fiber.return;
                } else {
                  break;
                }
                depth++;
              }
            } catch (e) {
              // Continue if React access fails
            }
          }
          
          // Check parent elements for links
          if (!productUrl) {
            let parent = imageDiv.closest('a[href*="/product"]');
            if (parent) {
              productUrl = parent.getAttribute('href');
            }
          }
        }
        
        // Strategy 2: Check the entire card for links
        if (!productUrl) {
          const link = card.querySelector('a[href*="/product"]');
          if (link) {
            productUrl = link.getAttribute('href');
          }
        }
        
        // Strategy 3: Check data attributes
        if (!productUrl) {
          productUrl = card.getAttribute('data-href') || 
                       card.getAttribute('data-url') ||
                       card.getAttribute('data-product-url');
        }
        
        // Strategy 4: Try to get from Next.js router state or window object
        if (!productUrl) {
          try {
            // Check if Next.js router is available
            if (window.__NEXT_DATA__) {
              const nextData = window.__NEXT_DATA__;
              // Try to find product in router state
              if (nextData.props && nextData.props.pageProps) {
                // Look for product data in page props
                const findProduct = (obj, depth = 0) => {
                  if (depth > 10 || !obj) return null;
                  if (Array.isArray(obj)) {
                    for (const item of obj) {
                      if (item && item.name === productName) {
                        return item.url || item.href || item.slug;
                      }
                      const found = findProduct(item, depth + 1);
                      if (found) return found;
                    }
                  } else if (typeof obj === 'object') {
                    for (const key in obj) {
                      if (obj[key] && obj[key].name === productName) {
                        return obj[key].url || obj[key].href || obj[key].slug;
                      }
                      const found = findProduct(obj[key], depth + 1);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                productUrl = findProduct(nextData.props.pageProps);
              }
            }
          } catch (e) {
            // Continue if access fails
          }
        }
        
        // Convert relative URLs to absolute
        if (productUrl && !productUrl.startsWith('http')) {
          if (productUrl.startsWith('//')) {
            productUrl = 'https:' + productUrl;
          } else if (productUrl.startsWith('/')) {
            productUrl = 'https://www.dmart.in' + productUrl;
          } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
            productUrl = 'https://www.dmart.in/' + productUrl;
          }
        }
        
        if (productName && productUrl) {
          urlsMap[productName] = productUrl;
        }
      });
      
      return urlsMap;
    });
    
    console.log(`Extracted ${Object.keys(productUrlsMap).length} product URLs from page state`);
    
    // If we still don't have URLs, try clicking product images (limited approach)
    if (Object.keys(productUrlsMap).length < 3) {
      console.log(`Trying to extract URLs by clicking product images...`);
      
      const cards = await page.$$('.vertical-card_card-vertical__Q8seS');
      const originalUrl = page.url();
      
      console.log(`Very few URLs found, trying click-based extraction for first 5 products...`);
      for (let i = 0; i < Math.min(cards.length, 5); i++) { // Limit to first 5
        try {
          const card = cards[i];
          const titleElement = await card.$('.vertical-card_title__pMGg9');
          if (!titleElement) continue;
          
          const productName = await titleElement.textContent();
          const trimmedName = productName ? productName.trim() : null;
          
          if (!trimmedName || productUrlsMap[trimmedName]) continue;
          
          // Find the clickable image div
          const imageDiv = await card.$('.vertical-card_image__yNgf2');
          if (!imageDiv) continue;
          
          // Click the image and capture the navigation URL
          try {
            const [response] = await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null),
              imageDiv.click({ timeout: 2000 })
            ]);
            
            if (response && response.url() && response.url().includes('/product/')) {
              productUrlsMap[trimmedName] = response.url();
              console.log(`  ✓ Found URL for: ${trimmedName.substring(0, 50)}...`);
              
              await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
              await page.waitForTimeout(1500);
            } else {
              // Check current URL in case navigation happened but response wasn't captured
              const currentUrl = page.url();
              if (currentUrl.includes('/product/') && currentUrl !== originalUrl) {
                productUrlsMap[trimmedName] = currentUrl;
                console.log(`  ✓ Found URL (from current): ${trimmedName.substring(0, 50)}...`);
                await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(1500);
              }
            }
          } catch (navError) {
            // Check current URL even if navigation promise failed
            try {
              const currentUrl = page.url();
              if (currentUrl.includes('/product/') && currentUrl !== originalUrl) {
                productUrlsMap[trimmedName] = currentUrl;
                console.log(`  ✓ Found URL (fallback): ${trimmedName.substring(0, 50)}...`);
                await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(1500);
              }
            } catch (e) {
              // Continue to next card
            }
          }
        } catch (e) {
          // Continue to next card if this one fails
          continue;
        }
      }
    }
    
    console.log(`Final count: ${Object.keys(productUrlsMap).length} product URLs extracted`);

    // Get the HTML of the search results page
    const pageHtml = await page.content();
    
    // Parse HTML to extract product data
    console.log(`\nExtracting product data from HTML...`);
    const productData = parseDmartProducts(pageHtml, locationName, productName, productUrlsMap);
    
    // HTML and JSON files are not saved locally (disabled per user request)
    console.log(`Found ${productData.products.length} products`);

    console.log(`\nLocation "${locationName}" selected and product "${productName}" searched successfully!`);

    // Close browser AFTER HTML is retrieved
    console.log('\n=== Closing browser ===');
    await browser.close();
    console.log('Browser closed.');

    // Return the structured product data
    return productData;

  } catch (error) {
    console.error('Error occurred:', error);
    try {
      await page.screenshot({ path: 'dmart-error.png', fullPage: true });
      console.log('Error screenshot saved: dmart-error.png');
    } catch (e) {
      // Ignore screenshot errors
    }
    // Close browser on error
    try {
      await browser.close();
      console.log('Browser closed after error.');
    } catch (e) {
      // Ignore if already closed
    }
    throw error;
  }
}

// Main execution
async function main() {
  // Example: Select different locations
  const locations = ['Mumbai', 'Chennai', 'Bangalore', 'Delhi'];
  
  // Get location and product from command line arguments
  const locationToSelect = process.argv[2] || locations[0];
  const productToSearch = process.argv[3] || 'potato';
  
  console.log(`Starting location selection for: ${locationToSelect}`);
  console.log(`Product to search: ${productToSearch}`);
  const productData = await selectLocationAndSearchOnDmart(locationToSelect, productToSearch);
  console.log(`\n✅ Extraction complete!`);
  console.log(`   Location: ${productData.location}`);
  console.log(`   Product: ${productData.product}`);
  console.log(`   Total products found: ${productData.totalProducts}`);
  return productData;
}

// Run the script only if called directly (not when imported as a module)
// Check if this file is being run directly by comparing the script path
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __basename = path.basename(__filename);

// Check if this file is being run directly
// process.argv[1] is a regular file path, not a file URL
let isMainModule = false;
if (process.argv[1]) {
  try {
    // Normalize both paths for comparison
    const mainFile = path.resolve(process.argv[1]);
    const currentFile = path.resolve(__filename);
    isMainModule = mainFile === currentFile || path.basename(mainFile) === __basename;
  } catch (e) {
    // Fallback: check if the filename matches
    isMainModule = process.argv[1].endsWith('dmart-location-selector.js') || 
                   process.argv[1].includes('dmart-location-selector.js');
  }
}

if (isMainModule) {
  main().catch(console.error);
}

/**
 * Parse D-Mart HTML to extract product data
 */
function parseDmartProducts(html, locationName, productName, productUrlsMap = {}) {
  const $ = cheerio.load(html);
  const products = [];
  
  // Extract products from D-Mart product cards
  $('.vertical-card_card-vertical__Q8seS').each((index, element) => {
    const $card = $(element);
    
    // Extract product name
    const productNameText = $card.find('.vertical-card_title__pMGg9').text().trim();
    if (!productNameText) return;
    
    // Extract prices
    let mrp = null;
    let dmartPrice = null;
    let discount = null;
    
    $card.find('.vertical-card_price-container__tPCU9').each((i, priceEl) => {
      const $priceEl = $(priceEl);
      const label = $priceEl.find('.vertical-card_label__OOtAc').text().trim();
      const priceText = $priceEl.find('.vertical-card_amount__80Zwk').text().trim();
      const priceValue = parseFloat(priceText.replace(/[₹,\s]/g, ''));
      
      if (label === 'MRP' && !isNaN(priceValue)) {
        mrp = priceValue;
      } else if (label === 'DMart' && !isNaN(priceValue)) {
        dmartPrice = priceValue;
      } else if (label === 'OFF' && !isNaN(priceValue)) {
        discount = priceValue;
      }
    });
    
    // If prices not found in structured format, try to extract from text
    if (!mrp && !dmartPrice) {
      const cardText = $card.text();
      const priceMatches = cardText.match(/₹\s*(\d+(?:[.,]\d+)?)/g);
      if (priceMatches && priceMatches.length > 0) {
        const prices = priceMatches.map(m => parseFloat(m.replace(/[₹\s,]/g, ''))).filter(p => !isNaN(p) && p > 0);
        if (prices.length > 0) {
          const hasStrike = $card.find('s, del, [style*="line-through"]').length > 0;
          if (hasStrike && prices.length > 1) {
            mrp = prices[0];
            dmartPrice = prices[1];
          } else if (prices.length > 1) {
            mrp = prices[0];
            dmartPrice = prices[1];
          } else {
            dmartPrice = prices[0];
          }
        }
      }
    }
    
    const isOutOfStock = $card.hasClass('vertical-card_no-stock__3G_E0') || 
                        $card.find('.vertical-card_info___ZmV_').text().includes('Out of Stock');
    
    // Extract image URL - try multiple strategies
    let imageUrl = null;
    
    // Strategy 1: Extract from background-image style attribute (D-Mart uses this)
    const $imageDiv = $card.find('[class*="image"]').first();
    if ($imageDiv.length > 0) {
      const style = $imageDiv.attr('style') || '';
      const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
      if (bgMatch && bgMatch[1]) {
        // D-Mart has fallback images, use the first one (actual product image)
        const urls = bgMatch[1].split(',').map(url => url.trim().replace(/^["']|["']$/g, ''));
        // Filter out NoImage fallback
        const productImageUrl = urls.find(url => !url.includes('NoImage') && !url.includes('misc'));
        if (productImageUrl) {
          imageUrl = productImageUrl;
        } else if (urls.length > 0) {
          imageUrl = urls[0];
        }
      }
    }
    
    // Strategy 2: Look for image in product image container
    if (!imageUrl) {
      const $imageContainer = $card.find('[class*="image"], [class*="img"], [class*="product-image"], [class*="thumbnail"]').first();
      if ($imageContainer.length > 0) {
        const $img = $imageContainer.find('img').first();
        if ($img.length > 0) {
          imageUrl = $img.attr('src') || 
                     $img.attr('data-src') || 
                     $img.attr('data-lazy-src') || 
                     $img.attr('data-original') ||
                     $img.attr('data-image') ||
                     $img.attr('data-img') ||
                     $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
        }
      }
    }
    
    // Strategy 3: Find img tag anywhere in card (exclude logos/icons)
    if (!imageUrl) {
      let $img = $card.find('img[src]').not('img[alt*="logo"], img[alt*="icon"], img[alt*="Vegetarian"], img[src*="logo"], img[src*="icon"], img[src^="data:image/svg"], img[src*="veg.fd2bc51a"]').first();
      if ($img.length === 0 || !$img.attr('src') || $img.attr('src').trim() === '') {
        $img = $card.find('img').not('img[alt*="logo"], img[alt*="icon"], img[alt*="Vegetarian"], img[src*="logo"], img[src*="icon"], img[src*="veg.fd2bc51a"]').first();
      }
      if ($img.length > 0) {
        imageUrl = $img.attr('src') || 
                   $img.attr('data-src') || 
                   $img.attr('data-lazy-src') || 
                   $img.attr('data-original') ||
                   $img.attr('data-image') ||
                   $img.attr('data-img') ||
                   $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
      }
    }
    
    // Strategy 4: Look for picture element
    if (!imageUrl) {
      const $picture = $card.find('picture').first();
      if ($picture.length > 0) {
        const $source = $picture.find('source').first();
        if ($source.length > 0) {
          imageUrl = $source.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
        }
        if (!imageUrl) {
          const $img = $picture.find('img').first();
          if ($img.length > 0) {
            imageUrl = $img.attr('src') || $img.attr('data-src');
          }
        }
      }
    }
    
    // Strategy 5: Look for background-image in any child element
    if (!imageUrl) {
      $card.find('[style*="background-image"]').each((i, el) => {
        const style = $(el).attr('style') || '';
        const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
        if (bgMatch && bgMatch[1] && !imageUrl) {
          const urls = bgMatch[1].split(',').map(url => url.trim().replace(/^["']|["']$/g, ''));
          const productImageUrl = urls.find(url => !url.includes('NoImage') && !url.includes('misc'));
          if (productImageUrl) {
            imageUrl = productImageUrl;
            return false; // break
          } else if (urls.length > 0) {
            imageUrl = urls[0];
            return false; // break
          }
        }
      });
    }
    
    // Convert relative URLs to absolute
    if (imageUrl && !imageUrl.startsWith('http')) {
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        imageUrl = 'https://www.dmart.in' + imageUrl;
      } else if (!imageUrl.includes('://')) {
        imageUrl = 'https://www.dmart.in/' + imageUrl;
      }
    }
    
    // Clean up image URL
    if (imageUrl) {
      imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
        p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=') || p.startsWith('fit=')
      ).join('&') : '');
    }
    
    // Extract product URL from link or onClick handler
    let productUrl = null;
    
    // Strategy 1: Look for anchor tag with href
    const $link = $card.find('a[href*="/product"], a[href*="/p/"], a[href*="/item"], a[href*="/pd/"]').first();
    if ($link.length > 0) {
      productUrl = $link.attr('href');
    } else {
      // Try to find any link in the card
      const $anyLink = $card.find('a[href]').first();
      if ($anyLink.length > 0) {
        const href = $anyLink.attr('href');
        // Only use if it looks like a product URL
        if (href && (href.includes('/product') || href.includes('/p/') || href.includes('/item') || href.includes('/pd/') || (!href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')))) {
          productUrl = href;
        }
      }
    }
    
    // Strategy 2: Look for onClick handler or data attributes that might contain product URL
    if (!productUrl) {
      // Check for onClick with router.push or navigation
      const onClick = $card.attr('onclick') || $card.find('[onclick]').first().attr('onclick') || '';
      if (onClick) {
        const urlMatch = onClick.match(/['"`]([^'"`]*\/product[^'"`]*)['"`]/) || 
                        onClick.match(/['"`]([^'"`]*\/p\/[^'"`]*)['"`]/) ||
                        onClick.match(/['"`]([^'"`]*\/pd\/[^'"`]*)['"`]/);
        if (urlMatch && urlMatch[1]) {
          productUrl = urlMatch[1];
        }
      }
      
      // Check data attributes on card and all child elements
      if (!productUrl) {
        productUrl = $card.attr('data-href') || 
                     $card.attr('data-url') || 
                     $card.attr('data-product-url') ||
                     $card.attr('data-product-id') ||
                     $card.find('[data-href]').first().attr('data-href') ||
                     $card.find('[data-url]').first().attr('data-url') ||
                     $card.find('[data-product-url]').first().attr('data-product-url');
      }
    }
    
    // Strategy 3: Look for product URL in parent container (card might be nested)
    if (!productUrl) {
      const $parent = $card.parent();
      if ($parent.length > 0) {
        const parentHref = $parent.find('a[href*="/product"], a[href*="/p/"]').first().attr('href');
        if (parentHref) {
          productUrl = parentHref;
        }
      }
    }
    
    // Strategy 4: Check if the card wrapper has a link
    if (!productUrl) {
      const $wrapper = $card.closest('a[href], [data-href], [data-url]');
      if ($wrapper.length > 0) {
        productUrl = $wrapper.attr('href') || $wrapper.attr('data-href') || $wrapper.attr('data-url');
      }
    }
    
    // Convert relative URLs to absolute
    if (productUrl && !productUrl.startsWith('http')) {
      if (productUrl.startsWith('//')) {
        productUrl = 'https:' + productUrl;
      } else if (productUrl.startsWith('/')) {
        productUrl = 'https://www.dmart.in' + productUrl;
      } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
        productUrl = 'https://www.dmart.in/' + productUrl;
      }
    }
    
    // Strategy 5: Use product URL from the map extracted via Playwright
    if (!productUrl && productUrlsMap[productNameText]) {
      productUrl = productUrlsMap[productNameText];
    }
    
    // If still no productUrl, set to null explicitly (will be included in JSON)
    if (!productUrl) {
      productUrl = null;
    }
    
    // Only add if we have at least a product name
    if (productNameText) {
      products.push({
        name: productNameText,
        price: dmartPrice,
        mrp: mrp,
        discount: discount,
        discountAmount: mrp && dmartPrice ? mrp - dmartPrice : null,
        isOutOfStock: isOutOfStock,
        imageUrl: imageUrl || null,
        productUrl: productUrl || null
      });
    }
  });
  
  // If no products found with the main selector, try fallback strategies
  if (products.length === 0) {
    console.log('⚠️  No products found with main selector, trying fallback strategies...');
    
    // Fallback: Look for any element with product-like structure
    $('[class*="vertical-card"], [class*="stretched-card"], [class*="product"], [class*="item"]').each((index, element) => {
      const $card = $(element);
      const cardText = $card.text().trim();
      
      // Skip if too short or looks like navigation
      if (cardText.length < 10) return;
      
      // Look for price indicators
      const hasPrice = cardText.match(/₹\s*\d+/);
      if (!hasPrice) return;
      
      // Try to extract product name
      const productNameText = $card.find('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"]').first().text().trim() ||
                              cardText.split('\n')[0].trim();
      
      if (!productNameText || productNameText.length < 3) return;
      
      // Extract prices
      let mrp = null;
      let price = null;
      const priceMatches = cardText.match(/₹\s*(\d+(?:[.,]\d+)?)/g);
      if (priceMatches && priceMatches.length > 0) {
        const prices = priceMatches.map(m => parseFloat(m.replace(/[₹\s,]/g, ''))).filter(p => !isNaN(p) && p > 0);
        if (prices.length > 0) {
          const hasStrike = $card.find('s, del, [style*="line-through"]').length > 0;
          if (hasStrike && prices.length > 1) {
            mrp = prices[0];
            price = prices[1];
          } else if (prices.length > 1) {
            mrp = prices[0];
            price = prices[1];
          } else {
            price = prices[0];
          }
        }
      }
      
      // Extract image URL - try background-image first
      let imageUrl = null;
      const $imageDiv = $card.find('[class*="image"], [style*="background-image"]').first();
      if ($imageDiv.length > 0) {
        const style = $imageDiv.attr('style') || '';
        const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
        if (bgMatch && bgMatch[1]) {
          const urls = bgMatch[1].split(',').map(url => url.trim().replace(/^["']|["']$/g, ''));
          const productImageUrl = urls.find(url => !url.includes('NoImage') && !url.includes('misc'));
          if (productImageUrl) {
            imageUrl = productImageUrl;
          } else if (urls.length > 0) {
            imageUrl = urls[0];
          }
        }
      }
      
      // Fallback to img tag
      if (!imageUrl) {
        const $img = $card.find('img').not('img[alt*="logo"], img[alt*="icon"], img[alt*="Vegetarian"], img[src*="logo"], img[src*="icon"], img[src*="veg.fd2bc51a"]').first();
        if ($img.length > 0) {
          imageUrl = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
          if (imageUrl && !imageUrl.startsWith('http')) {
            if (imageUrl.startsWith('//')) {
              imageUrl = 'https:' + imageUrl;
            } else if (imageUrl.startsWith('/')) {
              imageUrl = 'https://www.dmart.in' + imageUrl;
            }
          }
        }
      }
      
      // Extract product URL
      let productUrl = null;
      const $link = $card.find('a[href]').first();
      if ($link.length > 0) {
        const href = $link.attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          productUrl = href;
          if (!productUrl.startsWith('http')) {
            if (productUrl.startsWith('//')) {
              productUrl = 'https:' + productUrl;
            } else if (productUrl.startsWith('/')) {
              productUrl = 'https://www.dmart.in' + productUrl;
            }
          }
        }
      }
      
      if (productNameText && price) {
        products.push({
          name: productNameText,
          price: price,
          mrp: mrp,
          discount: mrp && price ? mrp - price : null,
          discountAmount: mrp && price ? mrp - price : null,
          isOutOfStock: $card.find('[class*="out"], [class*="stock"]').length > 0 || cardText.toLowerCase().includes('out of stock'),
          imageUrl: imageUrl || null,
          productUrl: productUrl || null
        });
      }
    });
  }
  
  // Remove duplicates based on product name
  const uniqueProducts = [];
  const seenNames = new Set();
  for (const product of products) {
    const normalizedName = product.name.toLowerCase().trim();
    if (!seenNames.has(normalizedName) && product.name.length > 3) {
      seenNames.add(normalizedName);
      uniqueProducts.push(product);
    }
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  return {
    website: 'DMart',
    location: locationName,
    product: productName,
    timestamp: timestamp,
    products: uniqueProducts,
    totalProducts: uniqueProducts.length
  };
}

export { selectLocationAndSearchOnDmart, parseDmartProducts };

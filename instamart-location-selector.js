import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Swiggy Instamart scraper using Selenium WebDriver and Puppeteer
 * Finds product URLs from search results and extracts detailed product data
 * All products are saved to a single JSON file
 */

// Run in headless mode by default (can be disabled with HEADLESS=false)
const isHeadless = process.env.HEADLESS !== 'false';

// Parallel scraping concurrency (number of products to scrape simultaneously)
// Increased from 5 to 8 for faster scraping
const PARALLEL_CONCURRENCY = parseInt(process.env.INSTAMART_CONCURRENCY || '8', 10);

/**
 * Scrape a Swiggy Instamart product page using Puppeteer with JavaScript execution
 * Returns product data without saving individual files
 */
async function scrapeProductPage(url) {
  console.log(`🚀 Starting to scrape product page: ${url}`);
  
  const browser = await puppeteer.launch({
    headless: isHeadless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { 
      waitUntil: 'load', // Changed from networkidle2 to load (much faster)
      timeout: 20000 
    });

    // Reduced wait time for dynamic content
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check for error page and reload if needed
    let retryCount = 0;
    const maxRetries = 3;
    while (retryCount < maxRetries) {
      const hasError = await page.evaluate(() => {
        return document.body.innerText.includes('Something went wrong');
      });
      
      if (hasError) {
        console.log(`⚠️  Error page detected in Puppeteer, reloading... (attempt ${retryCount + 1}/${maxRetries})`);
        await page.reload({ waitUntil: 'load', timeout: 20000 }); // Faster reload
        await new Promise(resolve => setTimeout(resolve, 1500)); // Reduced wait
        retryCount++;
      } else {
        break;
      }
    }

    // Quick scroll to load any lazy-loaded content (reduced wait times)
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms

    // Extract product data using JavaScript
    const productData = await page.evaluate(() => {
      const data = {
        url: window.location.href,
        title: document.title,
        productName: null,
        price: null,
        mrp: null,
        discount: null,
        discountAmount: null,
        description: null,
        imageUrl: null,
        quantity: null,
        availability: null,
        rating: null,
        deliveryTime: null,
        fullPageText: document.body.innerText
      };
      
      // Extract product name - try multiple selectors
      const nameSelectors = [
        'h1',
        '[class*="product"] [class*="name"]',
        '[class*="item"] [class*="name"]',
        '[data-testid*="name"]',
        '[aria-label*="product"]',
        '.product-title',
        '.item-title',
        '[class*="title"]',
        'main h1',
        'article h1'
      ];
      
      for (const selector of nameSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.innerText?.trim();
          if (text && text.length > 3 && text.length < 200) {
            data.productName = text;
            break;
          }
        }
        if (data.productName) break;
      }
      
      // Extract prices using JavaScript - look for ₹ symbol in DOM
      const allElements = document.querySelectorAll('*');
      const priceElements = [];
      
      allElements.forEach(el => {
        const style = window.getComputedStyle(el);
        // Skip hidden elements
        if (style.display === 'none' || style.visibility === 'hidden' || 
            style.opacity === '0' || el.offsetWidth === 0 || el.offsetHeight === 0) {
          return;
        }
        
        const text = el.innerText || el.textContent || '';
        // Try with ₹ symbol first
        let priceRegex = /₹\s*(\d{1,6}(?:[.,]\d{2})?)/g;
        let match;
        
        while ((match = priceRegex.exec(text)) !== null) {
          const priceValue = parseFloat(match[1].replace(/[,]/g, ''));
          if (!isNaN(priceValue) && priceValue >= 1 && priceValue < 100000) {
            // Check for strikethrough
            const hasStrikethrough = style.textDecoration.includes('line-through') ||
                                    el.tagName === 'S' || 
                                    el.tagName === 'DEL' || 
                                    el.tagName === 'STRIKE' ||
                                    (el.parentElement && window.getComputedStyle(el.parentElement).textDecoration.includes('line-through'));
            
            priceElements.push({
              price: priceValue,
              isStrikethrough: hasStrikethrough,
              text: match[0],
              elementText: text.substring(0, 100)
            });
          }
        }
      });
      
      // Also check for prices without ₹ symbol (standalone numbers that look like prices)
      const bodyText = document.body.innerText;
      const mainContent = bodyText.split(/Similar Products|Seller Details/i)[0];
      const priceLikeNumbers = [];
      
      // Better pattern: Look for discount percentage followed by two numbers (price and MRP)
      const discountPricePattern = /(\d+)%\s*OFF[\s\n]+(?:[^\n]+\n)*[\s\n]*(\d{1,3})[\s\n]+(\d{1,3})/i;
      const discountMatch = mainContent.match(discountPricePattern);
      if (discountMatch && discountMatch[2] && discountMatch[3]) {
        const num1 = parseInt(discountMatch[2]);
        const num2 = parseInt(discountMatch[3]);
        if (num1 >= 1 && num1 < 1000 && num2 >= 1 && num2 < 1000) {
          priceLikeNumbers.push(Math.min(num1, num2), Math.max(num1, num2));
        }
      }
      
      // Also try pattern: two consecutive numbers near discount text
      const twoNumbersPattern = /(?:OFF|Discount)[\s\n]+(?:[^\n]+\n){0,3}[\s\n]*(\d{2,3})[\s\n]+(\d{2,3})/i;
      const twoNumbersMatch = mainContent.match(twoNumbersPattern);
      if (twoNumbersMatch && twoNumbersMatch[1] && twoNumbersMatch[2]) {
        const num1 = parseInt(twoNumbersMatch[1]);
        const num2 = parseInt(twoNumbersMatch[2]);
        if (num1 >= 10 && num1 < 1000 && num2 >= 10 && num2 < 1000 && num1 !== num2) {
          priceLikeNumbers.push(Math.min(num1, num2), Math.max(num1, num2));
        }
      }
      
      // Look for prices near the product name
      const productPricePattern = /(?:g|kg|ml|l|piece|pc)[\s\n]+(\d{2,3})[\s\n]+(\d{2,3})[\s\n]+(?:−|Add|Buy|Cart|options)/i;
      const productPriceMatch = mainContent.match(productPricePattern);
      if (productPriceMatch && productPriceMatch[1] && productPriceMatch[2]) {
        const num1 = parseInt(productPriceMatch[1]);
        const num2 = parseInt(productPriceMatch[2]);
        if (num1 >= 10 && num1 < 1000 && num2 >= 10 && num2 < 1000 && num1 !== num2) {
          priceLikeNumbers.push(Math.min(num1, num2), Math.max(num1, num2));
        }
      }
      
      // Also try pattern with discount percentage: "% OFF\n...\n30\n38"
      const discountPricePattern2 = /(\d+)%\s*OFF[\s\n]+(?:[^\n]+\n){0,5}[\s\n]*(\d{2,3})[\s\n]+(\d{2,3})[\s\n]+(?:−|Add|Buy|Cart|options)/i;
      const discountPriceMatch2 = mainContent.match(discountPricePattern2);
      if (discountPriceMatch2 && discountPriceMatch2[2] && discountPriceMatch2[3]) {
        const num1 = parseInt(discountPriceMatch2[2]);
        const num2 = parseInt(discountPriceMatch2[3]);
        if (num1 >= 10 && num1 < 1000 && num2 >= 10 && num2 < 1000 && num1 !== num2) {
          priceLikeNumbers.push(Math.min(num1, num2), Math.max(num1, num2));
        }
      }
      
      // Remove duplicates (same price appearing multiple times)
      const uniquePrices = [];
      const seen = new Set();
      for (const item of priceElements) {
        if (!seen.has(item.price)) {
          seen.add(item.price);
          uniquePrices.push(item);
        }
      }
      
      // Sort by price
      uniquePrices.sort((a, b) => a.price - b.price);
      
      // Determine price and MRP
      if (uniquePrices.length > 0) {
        const strikethroughPrices = uniquePrices.filter(p => p.isStrikethrough).map(p => p.price);
        const regularPrices = uniquePrices.filter(p => !p.isStrikethrough).map(p => p.price);
        
        // MRP is from strikethrough prices
        if (strikethroughPrices.length > 0) {
          data.mrp = Math.max(...strikethroughPrices);
        }
        
        // Current price is from regular (non-strikethrough) prices
        if (regularPrices.length > 0) {
          data.price = Math.min(...regularPrices);
        } else if (uniquePrices.length > 0) {
          // If all prices are strikethrough (unlikely), use lowest as price
          data.price = uniquePrices[0].price;
          if (uniquePrices.length > 1 && !data.mrp) {
            data.mrp = uniquePrices[uniquePrices.length - 1].price;
          }
        }
        
        // Calculate discount
        if (data.mrp && data.price && data.mrp > data.price) {
          data.discount = Math.round(((data.mrp - data.price) / data.mrp) * 100);
          data.discountAmount = data.mrp - data.price;
        }
      }
      
      // Fallback: extract from text if DOM extraction didn't work
      if (!data.price && !data.mrp) {
        // Try with ₹ symbol in main content only
        const priceRegex = /₹\s*(\d{1,6}(?:[.,]\d{2})?)/g;
        const prices = [];
        let match;
        while ((match = priceRegex.exec(mainContent)) !== null) {
          const priceValue = parseFloat(match[1].replace(/[,]/g, ''));
          if (!isNaN(priceValue) && priceValue >= 1 && priceValue < 100000) {
            prices.push(priceValue);
          }
        }
        
        // If no prices with ₹ symbol, try price-like numbers from the patterns we found
        if (prices.length === 0 && priceLikeNumbers.length > 0) {
          // Remove duplicates and sort
          const uniquePriceNumbers = [...new Set(priceLikeNumbers)].sort((a, b) => a - b);
          if (uniquePriceNumbers.length > 0) {
            data.price = uniquePriceNumbers[0];
            if (uniquePriceNumbers.length > 1) {
              data.mrp = uniquePriceNumbers[uniquePriceNumbers.length - 1];
            }
            // If we only have one number, try to infer MRP from discount percentage
            if (uniquePriceNumbers.length === 1) {
              const discountMatch = mainContent.match(/(\d+)%\s*OFF/i);
              if (discountMatch) {
                const discountPercent = parseInt(discountMatch[1]);
                if (discountPercent > 0 && discountPercent < 100) {
                  // Calculate MRP from price and discount: price = MRP * (1 - discount/100)
                  // So MRP = price / (1 - discount/100)
                  data.mrp = Math.round(data.price / (1 - discountPercent / 100));
                }
              }
            }
            if (data.mrp && data.price && data.mrp > data.price) {
              data.discount = Math.round(((data.mrp - data.price) / data.mrp) * 100);
              data.discountAmount = data.mrp - data.price;
            }
          }
        } else if (prices.length > 0) {
          prices.sort((a, b) => a - b);
          data.price = prices[0];
          if (prices.length > 1) {
            data.mrp = prices[prices.length - 1];
          }
          if (data.mrp && data.price && data.mrp > data.price) {
            data.discount = Math.round(((data.mrp - data.price) / data.mrp) * 100);
            data.discountAmount = data.mrp - data.price;
          }
        }
      }
      
      // Extract description
      const descSelectors = [
        '[class*="description"]',
        '[class*="details"]',
        '[data-testid*="description"]',
        'p'
      ];
      
      for (const selector of descSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.innerText?.trim();
          if (text && text.length > 20 && text.length < 500 && !data.description) {
            // Skip if it's just a price or contains only numbers
            if (!text.match(/^[₹\d\s.,-]+$/) && !text.match(/^\d+$/)) {
              data.description = text;
              break;
            }
          }
        }
        if (data.description) break;
      }
      
      // Extract product image - look for main product image
      const imgSelectors = [
        'img[src*="instamart"]',
        'img[src*="swiggy"]',
        'img[alt*="product"]',
        'img.product-image',
        '.product-image img',
        'main img',
        'article img',
        'img[src*="image"]'
      ];
      
      for (const selector of imgSelectors) {
        const imgs = document.querySelectorAll(selector);
        for (const img of imgs) {
          if (img.src && img.complete && img.naturalWidth > 0) {
            data.imageUrl = img.src;
            break;
          }
        }
        if (data.imageUrl) break;
      }
      
      // Extract quantity/weight
      const quantityMatch = bodyText.match(/(\d+\s*(g|kg|ml|l|piece|pc|pack|packet|gm|gram|grams))/i);
      if (quantityMatch) {
        data.quantity = quantityMatch[0];
      }
      
      // Extract availability
      if (bodyText.includes('Out of Stock') || bodyText.includes('Sold Out') || 
          bodyText.includes('Currently unavailable') || bodyText.includes('Not available')) {
        data.availability = 'Out of Stock';
      } else {
        data.availability = 'In Stock';
      }
      
      // Extract delivery time
      const deliveryMatch = bodyText.match(/(\d+\s*(mins?|minutes?|hours?|hrs?|hr))/i);
      if (deliveryMatch) {
        data.deliveryTime = deliveryMatch[0];
      }
      
      // Extract rating if available
      const ratingMatch = bodyText.match(/(\d+\.?\d*)\s*(stars?|rating)/i);
      if (ratingMatch) {
        data.rating = parseFloat(ratingMatch[1]);
      }
      
      return data;
    });

    return productData;

  } catch (error) {
    console.error('❌ Error occurred in scrapeProductPage:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Scrape multiple product pages in parallel batches
 * @param {string[]} productUrls - Array of product URLs to scrape
 * @param {number} concurrency - Number of products to scrape simultaneously (default: 5)
 * @returns {Promise<Array>} Array of objects with { url, data } for successfully scraped products
 */
async function scrapeProductsInParallel(productUrls, concurrency = PARALLEL_CONCURRENCY) {
  const results = [];
  const seenUrls = new Set();
  const totalBatches = Math.ceil(productUrls.length / concurrency);
  const startTime = Date.now();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 PARALLEL SCRAPING MODE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total products: ${productUrls.length}`);
  console.log(`Concurrency: ${concurrency} products per batch`);
  console.log(`Total batches: ${totalBatches}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Process in batches
  for (let i = 0; i < productUrls.length; i += concurrency) {
    const batch = productUrls.slice(i, i + concurrency);
    const batchNumber = Math.floor(i / concurrency) + 1;
    
    console.log(`\n📦 Batch ${batchNumber}/${totalBatches}: Scraping ${batch.length} products in parallel...`);
    
    // Scrape all products in batch simultaneously
    const batchPromises = batch.map(async (url, index) => {
      if (seenUrls.has(url)) {
        console.log(`  ⚠️  [${i + index + 1}] Skipped duplicate: ${url}`);
        return null;
      }
      seenUrls.add(url);
      
      try {
        console.log(`  [${i + index + 1}/${productUrls.length}] Starting: ${url.substring(url.lastIndexOf('/') + 1)}`);
        const productData = await scrapeProductPage(url);
        if (productData) {
          console.log(`  ✓ [${i + index + 1}/${productUrls.length}] Completed: ${productData.productName || 'Unknown'}`);
          return { url, data: productData };
        } else {
          console.log(`  ⚠️  [${i + index + 1}/${productUrls.length}] No data returned`);
          return null;
        }
      } catch (error) {
        console.log(`  ⚠️  [${i + index + 1}/${productUrls.length}] Error: ${error.message}`);
        return null;
      }
    });
    
    // Wait for all products in batch to complete
    const batchResults = await Promise.all(batchPromises);
    
    // Process results
    let batchSuccessCount = 0;
    for (const result of batchResults) {
      if (result && result.data) {
        results.push(result);
        batchSuccessCount++;
      }
    }
    
    const batchDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ Batch ${batchNumber}/${totalBatches} completed: ${batchSuccessCount}/${batch.length} successful (${results.length} total products extracted) [${batchDuration}s]`);
  }
  
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ PARALLEL SCRAPING COMPLETED`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Successfully extracted: ${results.length}/${productUrls.length} products`);
  console.log(`Total time: ${totalDuration}s`);
  console.log(`Average time per product: ${(totalDuration / productUrls.length).toFixed(2)}s`);
  console.log(`${'='.repeat(60)}\n`);
  
  return results;
}

async function scrapeInstamartProducts(locationName = 'RT Nagar', productName = 'lays') {
  let driver = null;
  const allProducts = [];

  try {
    console.log(`\n🚀 Starting Swiggy Instamart scraper...`);
    console.log(`📍 Location: ${locationName}`);
    console.log(`🔍 Product: ${productName}\n`);

    // Configure Chrome
    const chromeOptions = new chrome.Options();

    if (process.env.CHROME_BIN) {
      chromeOptions.setChromeBinaryPath(process.env.CHROME_BIN);
      console.log(`Using Chrome binary from: ${process.env.CHROME_BIN}`);
    }

    if (isHeadless) {
      chromeOptions.addArguments('--headless=new');
    } else {
      chromeOptions.addArguments('--start-maximized');
    }

    chromeOptions.addArguments('--disable-blink-features=AutomationControlled');
    chromeOptions.addArguments('--disable-dev-shm-usage');
    chromeOptions.addArguments('--no-sandbox');
    chromeOptions.addArguments('--disable-setuid-sandbox');
    chromeOptions.addArguments('--disable-gpu');
    chromeOptions.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    chromeOptions.addArguments('--window-size=1920,1080');
    chromeOptions.excludeSwitches('enable-automation');

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(chromeOptions)
      .build();

    // Helper function to check if window is still open
    const isWindowOpen = async () => {
      try {
        await driver.getWindowHandle();
        return true;
      } catch (e) {
        return false;
      }
    };

    // Helper function to check and handle error page
    const checkAndHandleErrorPage = async (maxRetries = 3) => {
      let retryCount = 0;
      while (retryCount < maxRetries) {
        try {
          if (!(await isWindowOpen())) {
            return false;
          }
          
          // Check for error text in page
          const pageText = await driver.executeScript('return document.body.innerText || ""');
          const hasErrorText = pageText.includes('Something went wrong') || pageText.includes('went wrong');
          
          if (hasErrorText) {
            const currentUrl = await driver.getCurrentUrl();
            console.log(`⚠️  Error page detected, attempting recovery... (attempt ${retryCount + 1}/${maxRetries})`);
            
            // Try clicking retry button first
            try {
              const retryButtons = await driver.findElements(
                By.xpath('//button[contains(text(), "Retry")] | //button[contains(., "Retry")] | //*[@role="button" and contains(text(), "Retry")]')
              );
              for (const retryBtn of retryButtons) {
                try {
                  if (await retryBtn.isDisplayed()) {
                    await retryBtn.click();
                    console.log('✓ Clicked retry button');
                    await driver.sleep(3000);
                    retryCount++;
                    continue; // Check again after retry
                  }
                } catch (e) {
                  // Continue to next retry button or reload
                }
              }
            } catch (e) {
              // No retry button found, will reload
            }
            
            // If no retry button or it didn't work, reload the page
            console.log(`  → Reloading page...`);
            await driver.get(currentUrl);
            await driver.sleep(3000);
            retryCount++;
            continue;
          }
          
          // No error page found
          return false;
        } catch (e) {
          // Error checking failed, assume no error
          return false;
        }
      }
      return false;
    };

    console.log('Navigating to Swiggy Instamart...');
    
    // Navigate with retry logic for error pages
    let navigationSuccess = false;
    let navigationAttempts = 0;
    const maxNavigationAttempts = 5;
    
    while (!navigationSuccess && navigationAttempts < maxNavigationAttempts) {
      try {
        await driver.get('https://www.swiggy.com/instamart');
        await driver.sleep(3000 + Math.random() * 2000);
        
        // Check for error page immediately
        try {
          const errorElements = await driver.findElements(
            By.xpath('//*[contains(text(), "Something went wrong")] | //*[contains(text(), "went wrong")] | //button[contains(text(), "Retry")]')
          );
          
          if (errorElements.length > 0) {
            // Check if error is visible
            let hasError = false;
            for (const errorEl of errorElements) {
              try {
                if (await errorEl.isDisplayed()) {
                  hasError = true;
                  break;
                }
              } catch (e) {
                // Continue checking
              }
            }
            
            if (hasError) {
              navigationAttempts++;
              console.log(`⚠️  Error page detected, retrying navigation... (attempt ${navigationAttempts}/${maxNavigationAttempts})`);
              
              // Try clicking retry button if it exists
              try {
                const retryButton = await driver.findElement(By.xpath('//button[contains(text(), "Retry")]'));
                if (await retryButton.isDisplayed()) {
                  await retryButton.click();
                  await driver.sleep(3000);
                  continue;
                }
              } catch (e) {
                // No retry button, just reload
              }
              
              // Reload the page
              await driver.navigate().refresh();
              await driver.sleep(3000);
              continue;
            }
          }
          
          // Check page content to verify we're on the right page
          const pageText = await driver.executeScript('return document.body.innerText || ""');
          if (pageText.includes('Something went wrong') || pageText.includes('went wrong')) {
            navigationAttempts++;
            console.log(`⚠️  Error detected in page content, retrying... (attempt ${navigationAttempts}/${maxNavigationAttempts})`);
            await driver.navigate().refresh();
            await driver.sleep(3000);
            continue;
          }
          
          // If we get here, page seems OK
          navigationSuccess = true;
        } catch (checkError) {
          // Error check failed, but page might be OK
          navigationSuccess = true;
        }
      } catch (navError) {
        navigationAttempts++;
        console.log(`⚠️  Navigation error: ${navError.message}, retrying... (attempt ${navigationAttempts}/${maxNavigationAttempts})`);
        await driver.sleep(2000);
      }
    }
    
    if (!navigationSuccess) {
      throw new Error('Failed to load Swiggy Instamart page after multiple attempts. Page may be experiencing issues.');
    }

    // Execute stealth scripts
    try {
      await driver.executeScript(`
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
        window.chrome = { runtime: {} };
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
        Object.defineProperty(navigator, 'platform', {
          get: () => 'Win32'
        });
      `);
    } catch (scriptError) {
      console.log('⚠️  Warning: Could not execute stealth scripts, continuing anyway...');
    }

    // Wait for page to fully load before looking for elements
    console.log('Waiting for page to fully load...');
    await driver.sleep(5000);
    
    // Final check for error page before proceeding
    await checkAndHandleErrorPage(3);
    
    // Check if we're on the right page
    const currentUrl = await driver.getCurrentUrl();
    console.log(`Current URL: ${currentUrl}`);
    if (!currentUrl.includes('swiggy.com') && !currentUrl.includes('instamart')) {
      console.log('⚠️  Not on Swiggy Instamart page, navigating...');
      await driver.get('https://www.swiggy.com/instamart');
      await driver.sleep(5000);
      await checkAndHandleErrorPage(3);
    }
    
    // Wait for page to be interactive
    try {
      await driver.wait(async () => {
        const readyState = await driver.executeScript('return document.readyState');
        return readyState === 'complete';
      }, 10000);
      console.log('✓ Page ready state: complete');
    } catch (e) {
      console.log('⚠️  Page ready check timeout, continuing...');
    }
    
    // Final error page check before looking for location selector
    console.log('Checking for error pages before location selection...');
    try {
      const pageText = await driver.executeScript('return document.body.innerText || ""');
      if (pageText.includes('Something went wrong') || pageText.includes('went wrong')) {
        console.log('⚠️  Error page still detected, attempting to recover...');
        // Try clicking retry button
        try {
          const retryButton = await driver.findElement(By.xpath('//button[contains(text(), "Retry")] | //button[contains(., "Retry")]'));
          if (await retryButton.isDisplayed()) {
            await retryButton.click();
            await driver.sleep(5000);
            await checkAndHandleErrorPage(3);
          }
        } catch (e) {
          // No retry button, reload page
          await driver.navigate().refresh();
          await driver.sleep(5000);
          await checkAndHandleErrorPage(3);
        }
      }
    } catch (e) {
      console.log('⚠️  Could not check for error page, continuing...');
    }
    
    // Check for and close any modals/overlays that might block the search area
    try {
      const closeButtons = await driver.findElements(
        By.xpath('//button[contains(@aria-label, "Close")] | //button[contains(@class, "close")] | //*[@aria-label="Close"]')
      );
      for (const closeBtn of closeButtons) {
        try {
          if (await closeBtn.isDisplayed()) {
            await closeBtn.click();
            console.log('✓ Closed modal/overlay');
            await driver.sleep(1000);
          }
        } catch (e) {
          // Ignore
        }
      }
    } catch (e) {
      // No modals to close
    }
    
    // Step 1: Click location search with multiple selector strategies
    console.log('Clicking on "Search for an area or address"...');
    let searchArea = null;
    let searchAreaClicked = false;
    const searchAreaSelectors = [
      // Text-based selectors (most specific first)
      By.xpath('//*[contains(text(), "Search for an area or address")]'),
      By.xpath('//*[contains(text(), "Search for an area")]'),
      By.xpath('//*[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "search for an area")]'),
      // Placeholder-based selectors
      By.xpath('//*[contains(@placeholder, "Search for an area or address")]'),
      By.xpath('//*[contains(@placeholder, "Search for an area")]'),
      By.xpath('//*[contains(@placeholder, "area or address")]'),
      By.xpath('//*[contains(translate(@placeholder, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "search for an area")]'),
      // Input-based selectors
      By.xpath('//input[contains(@placeholder, "area") or contains(@placeholder, "address")]'),
      By.xpath('//input[@type="text"]'),
      By.xpath('//input[@type="search"]'),
      // Generic clickable elements
      By.xpath('//*[@role="button" and contains(text(), "area")]'),
      By.xpath('//button[contains(text(), "area") or contains(text(), "address")]'),
      By.xpath('//div[contains(@class, "location")]'),
      // Fallback: any input or contenteditable
      By.xpath('//input | //*[@contenteditable="true"] | //*[@role="textbox"]')
    ];
    
    for (const selector of searchAreaSelectors) {
      try {
        searchArea = await driver.wait(until.elementLocated(selector), 3000);
        if (searchArea) {
          await driver.wait(until.elementIsVisible(searchArea), 3000);
          await searchArea.click();
          searchAreaClicked = true;
          console.log(`✓ Found and clicked search area using selector`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!searchAreaClicked) {
      // Take screenshot for debugging
      try {
        const screenshot = await driver.takeScreenshot();
        const fsModule = await import('fs');
        const fs = fsModule.default || fsModule;
        fs.writeFileSync('instamart-search-area-not-found.png', screenshot, 'base64');
        console.log('📸 Debug screenshot saved: instamart-search-area-not-found.png');
      } catch (e) {
        // Ignore screenshot errors
      }
      
      // Try one more time with a longer wait
      console.log('⚠️  Search area not found, waiting longer and retrying...');
      await driver.sleep(3000);
      // Try the most common selectors again
      try {
        searchArea = await driver.findElement(By.xpath('//input | //*[@contenteditable="true"] | //*[@role="textbox"]'));
        await searchArea.click();
        searchAreaClicked = true;
        console.log('✓ Found search area on retry');
      } catch (e) {
        throw new Error(`Could not find "Search for an area" element after trying all selectors. Page may have changed structure.`);
      }
    }
    
    await driver.sleep(1500); // Wait for input to be ready

    // Step 2: Type location
    console.log(`Typing location: ${locationName}`);
    const locationInput = await driver.wait(
      until.elementLocated(By.xpath('//input | //*[@contenteditable="true"] | //*[@role="textbox"]')),
      10000
    );
    await locationInput.clear();

    // Human-like typing
    for (const char of locationName) {
      await locationInput.sendKeys(char);
      await driver.sleep(80 + Math.random() * 120);
      if (Math.random() < 0.1) {
        await driver.sleep(300 + Math.random() * 200);
      }
    }

    await driver.sleep(2000 + Math.random() * 1000);

    // Step 3: Select location from suggestions
    console.log(`Selecting ${locationName} from suggestions...`);
    const normalizedLocation = locationName.trim();
    const locationVariations = [
      normalizedLocation,
      normalizedLocation.replace(/\s+/g, ''),
      normalizedLocation.toLowerCase(),
      normalizedLocation.toUpperCase(),
    ];
    const uniqueVariations = [...new Set(locationVariations)];

    const matchesLocation = (text, location) => {
      if (!text || !location) return false;
      const lowerText = text.toLowerCase().trim();
      const lowerLocation = location.toLowerCase().trim();
      if (lowerText.includes(lowerLocation)) return true;
      const textNoSpaces = lowerText.replace(/\s+/g, '');
      const locationNoSpaces = lowerLocation.replace(/\s+/g, '');
      if (textNoSpaces.includes(locationNoSpaces)) return true;
      return false;
    };

    let suggestionClicked = false;

    // Try to find and click location suggestion
    for (const loc of uniqueVariations) {
      const locLower = loc.toLowerCase();
      const xpathSelectors = [
        `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}') and not(self::input) and not(ancestor::input) and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'airport'))]`,
        `//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}')]`,
        `//li[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}')]`,
      ];

      for (const xpath of xpathSelectors) {
        try {
          const suggestion = await driver.wait(
            until.elementLocated(By.xpath(xpath)),
            2000
          );
          const text = await suggestion.getText();
          if (matchesLocation(text, loc)) {
            await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', suggestion);
            await driver.sleep(500);
            try {
              await suggestion.click();
              suggestionClicked = true;
              console.log(`✓ Location suggestion clicked: ${locationName}`);
              break;
            } catch (e) {
              await driver.executeScript('arguments[0].click();', suggestion);
              suggestionClicked = true;
              console.log(`✓ Location suggestion clicked (JS): ${locationName}`);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
      if (suggestionClicked) break;
    }

    // Fallback: Press Enter
    if (!suggestionClicked) {
      try {
        console.log('⚠️  Trying to press Enter to select first suggestion...');
        await locationInput.sendKeys(Key.ENTER);
        await driver.sleep(1000); // Reduced from 2000ms
        const currentUrl = await driver.getCurrentUrl();
        if (currentUrl.includes('/instamart') || currentUrl.includes('/search')) {
          suggestionClicked = true;
          console.log('✓ Location selected by pressing Enter');
        }
      } catch (e) {
        console.log(`Enter key strategy failed: ${e.message}`);
      }
    }

    if (!suggestionClicked) {
      throw new Error(`Could not click location suggestion for: ${locationName}`);
    }

    await driver.sleep(2000); // Wait for location to be fully set

    // Step 4: Navigate directly to search results
    // First, verify location is set by checking current URL or localStorage
    console.log('Verifying location is set...');
    try {
      const locationSet = await driver.executeScript(`
        return localStorage.getItem('swiggy_location') || 
               localStorage.getItem('instamart_location') ||
               document.cookie.includes('location') ||
               window.location.href.includes('location');
      `);
      if (locationSet) {
        console.log('✓ Location verified in browser storage');
      }
    } catch (e) {
      console.log('⚠️  Could not verify location in storage, proceeding anyway...');
    }

    console.log(`Navigating directly to search results for "${productName}"...`);
    const searchUrl = `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(productName)}`;
    
    // Navigate to search URL
    await driver.get(searchUrl);
    await driver.sleep(3000); // Increased wait for page to load

    // Re-execute stealth scripts
    await driver.executeScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      if (!window.chrome) {
        window.chrome = { runtime: {} };
      }
    `);

    // Wait for search results to load with better detection
    console.log('Waiting for search API to complete and products to load...');
    let searchResultsReady = false;
    try {
      await driver.wait(async () => {
        try {
          const searchState = await driver.executeScript(`
            try {
              // Check for product links
              const productLinks = document.querySelectorAll('a[href*="/instamart/item/"]');
              if (productLinks.length > 0) return true;
              
              // Check for product cards
              const productCards = document.querySelectorAll('[data-testid*="item-collection-card"]');
              if (productCards.length > 0) return true;
              
              // Check if search input has the product name
              const searchInputs = document.querySelectorAll('input[type="search"], input[placeholder*="search" i]');
              for (const input of searchInputs) {
                if (input.value && input.value.toLowerCase().includes('${productName.toLowerCase()}')) {
                  return true;
                }
              }
              
              return false;
            } catch (e) {
              return false;
            }
          `);
          if (searchState) {
            searchResultsReady = true;
          }
          return searchState;
        } catch (e) {
          return false;
        }
      }, 25000); // Increased timeout
      console.log('✓ Search results loaded');
    } catch (e) {
      console.log('⚠️  Timeout waiting for search results, continuing anyway...');
      // Try to check if we're on the right page
      const currentUrl = await driver.getCurrentUrl();
      if (!currentUrl.includes('search') && !currentUrl.includes('instamart')) {
        console.log('⚠️  Not on search page, retrying navigation...');
        await driver.get(searchUrl);
        await driver.sleep(3000);
      }
    }

    await driver.sleep(2000); // Wait for page to stabilize

    // Check for error page
    await checkAndHandleErrorPage();
    await driver.sleep(1000); // Reduced from 2000ms

    // Step 5: Wait for product cards to be visible
    console.log('Waiting for product cards to load...');
    let cardsFound = false;
    try {
      await driver.wait(
        until.elementsLocated(By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')),
        20000
      );
      const cardCount = await driver.findElements(
        By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
      );
      console.log(`✓ Product cards found: ${cardCount.length} cards`);
      cardsFound = true;
    } catch (e) {
      console.log('⚠️  Timeout waiting for product cards, trying alternative selectors...');
      
      // Try alternative selectors
      try {
        const altCards = await driver.findElements(
          By.xpath('//a[contains(@href, "/instamart/item/")] | //*[contains(@class, "product")] | //*[contains(@class, "item")]')
        );
        if (altCards.length > 0) {
          console.log(`✓ Found ${altCards.length} product elements using alternative selectors`);
          cardsFound = true;
        }
      } catch (e2) {
        console.log('⚠️  No product cards found with any selector');
      }
    }

    if (!cardsFound) {
      // Take screenshot for debugging
      try {
        const screenshot = await driver.takeScreenshot();
        const fsModule = await import('fs');
        const fs = fsModule.default || fsModule;
        fs.writeFileSync('instamart-no-products.png', screenshot, 'base64');
        console.log('📸 Debug screenshot saved: instamart-no-products.png');
      } catch (e) {
        // Ignore
      }
    }

    await driver.sleep(2000); // Wait for cards to fully render

    // Step 6: Find all product cards and process them individually (one-by-one approach from reference)
    console.log('🔍 Finding product cards...');
    
    const minRequired = 20; // Target 20 products (from reference code)
    let processedCount = 0;
    let cardIndex = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 10;
    const seenUrls = new Set();

    console.log(`\n📦 Processing products (target: ${minRequired} products)...\n`);

    // Keep processing until we have at least 20 products or run out of cards
    while (processedCount < minRequired && scrollAttempts < maxScrollAttempts) {
      // Find all product cards on current page
      let productCards = await driver.findElements(
        By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
      );

      console.log(`Found ${productCards.length} product cards on page (processed: ${processedCount}/${minRequired})`);

      if (productCards.length === 0) {
        // No cards found - this might mean page state was lost after navigating to a product
        console.log('⚠️  No cards found on page...');

        // If we already processed some products, try to fully recover the search page
        if (processedCount > 0 && scrollAttempts < maxScrollAttempts) {
          console.log('⚠️  Cards disappeared - attempting to recover search results page...');
          try {
            // Reload the original search URL and wait for cards again
            await driver.get(searchUrl);
            await driver.sleep(4000);

            // Re-run basic error-page check
            await checkAndHandleErrorPage(2);

            // Wait for product cards to re-appear
            try {
              await driver.wait(
                until.elementsLocated(By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')),
                15000
              );
            } catch (e) {
              console.log('⚠️  Timeout waiting for product cards after recovery reload');
            }

            // Re-check cards after recovery attempt
            productCards = await driver.findElements(
              By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
            );

            if (productCards.length > 0) {
              console.log(`✓ Recovery succeeded: ${productCards.length} cards found after reload`);
              // Start again from the first visible card, but seenUrls prevents duplicates
              cardIndex = 0;
              scrollAttempts++;
              continue;
            } else {
              console.log('⚠️  Recovery reload did not restore cards');
            }
          } catch (recoveryError) {
            console.log(`⚠️  Error while trying to recover search page: ${recoveryError.message}`);
          }
        }

        // If we reach here, either no products yet or recovery failed; try a scroll-based fallback
        console.log('  → Scrolling to load more products...');
        await driver.executeScript('window.scrollTo(0, document.body.scrollHeight);');
        await driver.sleep(2000);
        scrollAttempts++;

        // Re-check for cards after scroll
        productCards = await driver.findElements(
          By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
        );

        if (productCards.length === 0 && scrollAttempts >= maxScrollAttempts) {
          console.log('⚠️  Still no cards found after multiple recovery attempts - stopping extraction loop');
          break;
        }

        continue;
      }

      // Process one card at a time to avoid stale element issues
      // After each navigation back, we'll re-find cards fresh
      if (cardIndex >= productCards.length) {
        // We've processed all visible cards, try scrolling for more
        console.log(`\nScrolling to load more products... (${processedCount}/${minRequired} collected)`);
        await driver.executeScript('window.scrollTo(0, document.body.scrollHeight);');
        await driver.sleep(3000);
        scrollAttempts++;
        // Re-find cards after scrolling
        productCards = await driver.findElements(
          By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
        );
        if (productCards.length === 0) {
          console.log('⚠️  No cards found after scrolling - breaking extraction loop');
          break;
        }
        // Reset cardIndex to start from beginning of newly loaded cards
        // But we want to continue from where we left off, so keep cardIndex as is
        // Actually, if we scrolled and got new cards, we should continue from 0
        // But to avoid duplicates, we'll track by processed count
        continue;
      }

      // Process the card at current index
      try {
        console.log(`\n[${processedCount + 1}/${minRequired}] Processing product card ${cardIndex + 1}...`);

        // Always re-find cards before accessing to avoid stale elements
        productCards = await driver.findElements(
          By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
        );

        if (cardIndex >= productCards.length) {
          console.log(`⚠️  Card ${cardIndex + 1} no longer available (only ${productCards.length} cards found)`);
          // Try scrolling to load more
          console.log(`  → Scrolling to load more products...`);
          await driver.executeScript('window.scrollTo(0, document.body.scrollHeight);');
          await driver.sleep(3000);
          scrollAttempts++;
          productCards = await driver.findElements(
            By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
          );
          if (productCards.length === 0) {
            console.log('⚠️  No cards found after scrolling - breaking extraction loop');
            break;
          }
          continue;
        }

        const card = productCards[cardIndex];
        if (!card) {
          console.log(`⚠️  Could not find card ${cardIndex + 1}, skipping...`);
          cardIndex++;
          continue;
        }

          // Scroll card into view
          await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', card);
          await driver.sleep(1000);

          // Get current page URL to return to later
          const searchResultsUrl = await driver.getCurrentUrl();

          // Extract product URL by clicking the card and navigating to product page (one-by-one approach from reference)
          let productUrl = null;
          
          try {
            // Disable any buttons inside the card that might interfere (like "Add to Cart")
            await driver.executeScript(`
              const card = arguments[0];
              const buttons = card.querySelectorAll('button, [role="button"]');
              buttons.forEach(btn => {
                if (btn.textContent.includes('Add') || btn.textContent.includes('Cart') || btn.getAttribute('data-testid')?.includes('add')) {
                  btn.style.pointerEvents = 'none';
                }
              });
            `, card);
            
            // Click the card to navigate to product page
            console.log(`  → Clicking product card to navigate...`);
            await card.click();
            
            // Wait for navigation
            await driver.sleep(3000);
            
            // Wait for URL to change to product page
            try {
              await driver.wait(async () => {
                const currentUrl = await driver.getCurrentUrl();
                return currentUrl !== searchResultsUrl && (currentUrl.includes('/item/') || currentUrl.includes('/instamart/item/'));
              }, 10000);
            } catch (waitError) {
              console.log(`  ⚠️  Timeout waiting for navigation...`);
            }
            
            // Get the product page URL
            const currentUrl = await driver.getCurrentUrl();
            
            // Verify it's a product page URL in the correct format
            if (currentUrl && currentUrl !== searchResultsUrl) {
              if (currentUrl.includes('/instamart/item/') || currentUrl.includes('/item/')) {
                // Ensure URL is in correct format: https://www.swiggy.com/instamart/item/{ID}
                if (currentUrl.includes('/instamart/item/')) {
                  productUrl = currentUrl;
                } else if (currentUrl.includes('/item/')) {
                  // Convert /item/ to /instamart/item/
                  productUrl = currentUrl.replace(/\/item\//, '/instamart/item/');
                } else {
                  productUrl = currentUrl;
                }
                
                // Ensure it starts with https://www.swiggy.com
                if (!productUrl.startsWith('http')) {
                  if (productUrl.startsWith('//')) {
                    productUrl = 'https:' + productUrl;
                  } else if (productUrl.startsWith('/')) {
                    productUrl = 'https://www.swiggy.com' + productUrl;
                  }
                }
                
                console.log(`  → Got product URL: ${productUrl}`);
              } else {
                console.log(`  ⚠️  Navigation did not go to product page. Current URL: ${currentUrl}`);
              }
            }
            
            // Navigate back to search results
            await driver.get(searchResultsUrl);
            await driver.sleep(2000);
            
            // Wait for search results to reload
            try {
              await driver.wait(
                until.elementsLocated(By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')),
                10000
              );
            } catch (e) {
              console.log(`  ⚠️  Search results may not have reloaded properly`);
            }
            
          } catch (clickError) {
            console.log(`  ⚠️  Error clicking card, trying alternative methods...`);
            
            // Fallback: Try to extract URL from card's link element
            try {
              const linkElement = await card.findElement(By.xpath('.//a[contains(@href, "/item/") or contains(@href, "/instamart/item/")]'));
              let href = await linkElement.getAttribute('href');
              if (href) {
                if (!href.startsWith('http')) {
                  if (href.startsWith('//')) {
                    href = 'https:' + href;
                  } else if (href.startsWith('/')) {
                    href = 'https://www.swiggy.com' + href;
                  } else {
                    href = 'https://www.swiggy.com/instamart/item/' + href;
                  }
                }
                // Ensure format is /instamart/item/{ID}
                if (href.includes('/item/') && !href.includes('/instamart/item/')) {
                  href = href.replace(/\/item\//, '/instamart/item/');
                }
                productUrl = href;
                console.log(`  → Extracted URL from link element: ${productUrl}`);
              }
            } catch (linkError) {
              // Fallback 2: Extract from card HTML
              try {
                const cardHtml = await driver.executeScript('return arguments[0].outerHTML;', card);
                // Look for href with /item/ or /instamart/item/
                const hrefMatch = cardHtml.match(/href=["']([^"']*(?:\/instamart)?\/item\/[^"']*)["']/);
                if (hrefMatch && hrefMatch[1]) {
                  let href = hrefMatch[1];
                  if (!href.startsWith('http')) {
                    if (href.startsWith('//')) {
                      href = 'https:' + href;
                    } else if (href.startsWith('/')) {
                      href = 'https://www.swiggy.com' + href;
                    } else {
                      href = 'https://www.swiggy.com/instamart/item/' + href;
                    }
                  }
                  // Ensure format is /instamart/item/{ID}
                  if (href.includes('/item/') && !href.includes('/instamart/item/')) {
                    href = href.replace(/\/item\//, '/instamart/item/');
                  }
                  productUrl = href;
                  console.log(`  → Extracted URL from card HTML: ${productUrl}`);
                }
              } catch (extractError) {
                console.log(`  ⚠️  Could not extract URL: ${extractError.message}`);
              }
            }
            
            // Try to navigate back if we're not on search results
            try {
              const currentUrl = await driver.getCurrentUrl();
              if (currentUrl !== searchResultsUrl) {
                await driver.get(searchResultsUrl);
                await driver.sleep(2000);
              }
            } catch (navError) {
              console.log(`  ⚠️  Could not navigate back: ${navError.message}`);
            }
          }

          // Validate and normalize product URL format
          if (productUrl) {
            // Ensure URL is in correct format: https://www.swiggy.com/instamart/item/{ID}
            if (!productUrl.includes('/instamart/item/')) {
              if (productUrl.includes('/item/')) {
                productUrl = productUrl.replace(/\/item\//, '/instamart/item/');
              } else {
                console.log(`  ⚠️  Invalid product URL format: ${productUrl}`);
                productUrl = null;
              }
            }
            
            // Ensure it's a full URL
            if (productUrl && !productUrl.startsWith('http')) {
              if (productUrl.startsWith('//')) {
                productUrl = 'https:' + productUrl;
              } else if (productUrl.startsWith('/')) {
                productUrl = 'https://www.swiggy.com' + productUrl;
              }
            }
          }

          // Process the product URL if we have one and it's valid (scrape immediately - one-by-one approach)
          if (productUrl && productUrl.includes('/instamart/item/') && !seenUrls.has(productUrl)) {
            seenUrls.add(productUrl);
            console.log(`  → Processing product URL: ${productUrl}`);

            try {
              // Call scrapeProductPage function immediately (one-by-one approach)
              const productData = await scrapeProductPage(productUrl);

              if (productData) {
                const product = {
                  name: productData.productName || null,
                  price: productData.price || null,
                  mrp: productData.mrp || null,
                  discount: productData.discount || null,
                  discountAmount: productData.discountAmount || null,
                  isOutOfStock: productData.availability === 'Out of Stock',
                  imageUrl: productData.imageUrl || null,
                  productUrl: productUrl,
                  description: productData.description || null,
                  quantity: productData.quantity || null,
                  deliveryTime: productData.deliveryTime || null,
                  rating: productData.rating || null,
                  badges: null
                };

                if (product.name && product.name.length > 2) {
                  allProducts.push(product);
                  processedCount++;
                  console.log(`✓ [${processedCount}/${minRequired}] Extracted: ${product.name} - ₹${product.price || 'N/A'}${product.mrp ? ` (MRP: ₹${product.mrp}, Discount: ${product.discount}%)` : ''}`);
                } else {
                  console.log(`⚠️  Skipped: Missing or invalid product name`);
                }
              } else {
                console.log(`⚠️  Skipped: No product data returned`);
              }
            } catch (scrapeError) {
              console.log(`⚠️  Error scraping product: ${scrapeError.message}`);
              // Continue with next product
            }
          } else if (productUrl && seenUrls.has(productUrl)) {
            console.log(`  ⚠️  Skipped: Duplicate URL`);
          } else {
            console.log(`  ⚠️  Skipped: Could not extract product URL`);
          }

          // Small delay between products
          await driver.sleep(1000);

      // Increment cardIndex after processing (whether successful or not)
      // This ensures we move to the next card in the next iteration
      // The while loop will re-find cards fresh on the next iteration
      cardIndex++;

    } catch (error) {
      console.log(`⚠️  Error processing card ${cardIndex + 1}: ${error.message}`);
      // Increment cardIndex and continue to next card
      cardIndex++;
    }
    }

    console.log(`\n✓ Finished processing. Collected ${processedCount} products.`);

    console.log(`\n✓ Successfully extracted ${allProducts.length} products`);

    if (allProducts.length < minRequired) {
      console.log(`\n⚠️  Warning: Only extracted ${allProducts.length} products, but need at least ${minRequired}`);
    }

    // Step 8: Save results to JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const jsonData = {
      website: "Swiggy Instamart",
      location: locationName,
      product: productName,
      timestamp: timestamp,
      products: allProducts,
      totalProducts: allProducts.length,
      extractionMethod: "Selenium WebDriver + Puppeteer (merged)"
    };

    const jsonPath = path.join(outputDir, `instamart-${locationName.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
    console.log(`\n✅ JSON data saved: ${jsonPath}`);
    console.log(`📊 Total products: ${allProducts.length}`);

    // Close Selenium browser
    await driver.quit();
    console.log('✅ Browser closed.');

    return jsonData;

  } catch (error) {
    console.error('❌ Error occurred:', error);
    console.error('Error stack:', error.stack);

    // Save error screenshot
    try {
      if (driver) {
        try {
          await driver.getWindowHandle();
          const screenshot = await driver.takeScreenshot();
          fs.writeFileSync('instamart-error.png', screenshot, 'base64');
          console.log('Error screenshot saved: instamart-error.png');
        } catch (screenshotError) {
          console.log('⚠️  Could not save error screenshot (window may be closed)');
        }
      }
    } catch (e) {
      console.log('⚠️  Could not save error screenshot');
    }

    // Close browser on error
    if (driver) {
      try {
        await driver.quit();
      } catch (e) {
        // Ignore close errors
      }
    }

    throw error;
  }
}

// Main function for command-line usage
async function main() {
  const args = process.argv.slice(2);
  const locationToSelect = args[0] || 'RT Nagar';
  const productName = args[1] || 'lays';

  try {
    const jsonData = await scrapeInstamartProducts(locationToSelect, productName);
    console.log(`\n✅ Scraping completed successfully!`);
    console.log(`📊 Total products extracted: ${jsonData.products.length}`);
    return jsonData;
  } catch (error) {
    console.error(`\n❌ Scraping failed:`, error.message);
    process.exit(1);
  }
}

// Run the script only if called directly
const __filename_check = fileURLToPath(import.meta.url);
const __basename = path.basename(__filename_check);
let isMainModule = false;
if (process.argv[1]) {
  try {
    const mainFile = path.resolve(process.argv[1]);
    const currentFile = path.resolve(__filename_check);
    isMainModule = mainFile === currentFile || path.basename(mainFile) === __basename;
  } catch (e) {
    isMainModule = process.argv[1].endsWith('selenium_scraper.js') ||
      process.argv[1].includes('selenium_scraper.js');
  }
}

if (isMainModule) {
  main().catch(console.error);
}

export { scrapeInstamartProducts };


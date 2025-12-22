import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Swiggy Instamart Scraper
 * 
 * Scrapes product data from Swiggy Instamart with accurate price extraction
 * by clicking each product card and extracting prices from product pages.
 * 
 * Usage:
 *   node src/instamart-scraper.js [location] [product]
 *   Example: node src/instamart-scraper.js "RT Nagar" "tomato"
 * 
 * Environment Variables:
 *   HEADLESS=true - Run in headless mode
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to check if this is the main module
function isMainModule() {
  if (!process.argv[1]) return false;
  const mainFile = path.resolve(process.argv[1]);
  const currentFile = path.resolve(__filename);
  return mainFile === currentFile || process.argv[1].endsWith('instamart-scraper.js');
}

// Headless mode support
const isHeadless = process.env.HEADLESS === 'true';

/**
 * Configure Chrome browser with anti-detection options
 */
function configureChromeOptions() {
  const chromeOptions = new chrome.Options();
  
  // Set binary path if CHROME_BIN environment variable is set
  if (process.env.CHROME_BIN) {
    chromeOptions.setChromeBinaryPath(process.env.CHROME_BIN);
    console.log(`Using Chrome binary from: ${process.env.CHROME_BIN}`);
  }
  
  // Headless mode
  if (isHeadless) {
    chromeOptions.addArguments('--headless=new');
  } else {
    chromeOptions.addArguments('--start-maximized');
  }
  
  // Anti-detection options
  chromeOptions.addArguments('--disable-blink-features=AutomationControlled');
  chromeOptions.addArguments('--disable-dev-shm-usage');
  chromeOptions.addArguments('--no-sandbox');
  chromeOptions.addArguments('--disable-setuid-sandbox');
  chromeOptions.addArguments('--disable-gpu');
  chromeOptions.addArguments('--disable-software-rasterizer');
  chromeOptions.addArguments('--disable-web-security');
  chromeOptions.addArguments('--disable-features=IsolateOrigins,site-per-process');
  chromeOptions.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  chromeOptions.addArguments('--window-size=1920,1080');
  chromeOptions.excludeSwitches('enable-automation');
  
  return chromeOptions;
}

/**
 * Execute stealth scripts to hide webdriver properties
 */
async function executeStealthScripts(driver) {
  try {
    await driver.executeScript(`
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Override chrome runtime
      window.chrome = {
        runtime: {}
      };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
      
      // Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32'
      });
    `);
  } catch (error) {
    console.log('⚠️  Warning: Could not execute stealth scripts, continuing anyway...');
  }
}

/**
 * Check and handle error page - reload the page instead of clicking "Try Again"
 */
async function checkAndHandleErrorPage(driver, currentUrl = null) {
  try {
    const errorPage = await driver.findElement(By.xpath('//*[contains(text(), "Something went wrong")]'));
    if (await errorPage.isDisplayed()) {
      console.log('⚠️  Error page detected, reloading page...');
      
      // Reload the current page
      if (currentUrl) {
        console.log(`  → Reloading: ${currentUrl}`);
        await driver.get(currentUrl);
      } else {
        console.log(`  → Reloading current page`);
        await driver.navigate().refresh();
      }
      
      await driver.sleep(5000 + Math.random() * 2000);
      
      // Re-execute stealth scripts
      await executeStealthScripts(driver);
      
      // Wait for products to load again
      try {
        await driver.wait(async () => {
          try {
            const productCount = await driver.executeScript(`
              const links = document.querySelectorAll('a[href*="/instamart/item/"], a[href*="/item/"]');
              const cards = document.querySelectorAll('[data-testid="item-collection-card-full"], [data-testid="item-collection-card"]');
              return Math.max(links.length, cards.length);
            `);
            return productCount > 0;
          } catch (e) {
            return false;
          }
        }, 15000);
        console.log('✓ Page reloaded and products detected');
      } catch (e) {
        console.log('⚠️  Timeout waiting for products after reload, continuing...');
      }
      
      return true;
    }
  } catch (e) {
    // No error page found
    return false;
  }
  return false;
}

/**
 * Select location on Instamart
 */
async function selectLocation(driver, locationName) {
  console.log('Navigating to Swiggy Instamart...');
  await driver.get('https://www.swiggy.com/instamart');
  await driver.sleep(2000 + Math.random() * 2000);
  
  // Execute stealth scripts
  await executeStealthScripts(driver);
  
  console.log('Clicking on location search field...');
  const searchArea = await driver.wait(
    until.elementLocated(By.xpath('//*[contains(text(), "Search for an area") or contains(@placeholder, "Search for an area") or contains(@placeholder, "area or address")]')),
    10000
  );
  await searchArea.click();
  await driver.sleep(2000);
  
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
  }
  
  await driver.sleep(2000 + Math.random() * 1000);
  
  console.log(`Selecting ${locationName} from suggestions...`);
  
  // Generate location name variations
  const normalizedLocation = locationName.trim();
  const locationVariations = [
    normalizedLocation,
    normalizedLocation.replace(/\s+/g, ''),
    normalizedLocation.toLowerCase(),
    normalizedLocation.toUpperCase(),
    normalizedLocation.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  ];
  const uniqueVariations = [...new Set(locationVariations)];
  
  // Helper function to check if text matches location
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
      `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}') and not(self::input) and not(ancestor::input) and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'airport')) and not(contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'railway'))]`,
      `//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}')]`,
      `//li[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}')]`,
      `//div[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locLower}') and not(ancestor::input)]`
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
      await driver.sleep(2000);
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
  
  await driver.sleep(2000);
  
  // Click Confirm location button
  console.log('Clicking Confirm location...');
  let confirmClicked = false;
  
  const confirmSelectors = [
    By.xpath("//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm')]"),
    By.xpath("//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm location')]"),
    By.xpath("//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'done')]")
  ];
  
  for (const selector of confirmSelectors) {
    try {
      const confirmBtn = await driver.wait(until.elementLocated(selector), 3000);
      const isDisplayed = await confirmBtn.isDisplayed();
      if (isDisplayed) {
        await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', confirmBtn);
        await driver.sleep(500);
        try {
          await confirmBtn.click();
          confirmClicked = true;
          console.log('✓ Confirm button clicked');
          break;
        } catch (e) {
          await driver.executeScript('arguments[0].click();', confirmBtn);
          confirmClicked = true;
          console.log('✓ Confirm button clicked (JS)');
          break;
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  if (!confirmClicked) {
    const currentUrl = await driver.getCurrentUrl();
    if (currentUrl.includes('/instamart/search') || currentUrl.includes('/search')) {
      console.log('✓ Already on search page, no confirm button needed');
      confirmClicked = true;
    }
  }
  
  await driver.sleep(3000);
  
  // Check for error page
  await checkAndHandleErrorPage(driver);
  await driver.sleep(2000);
}

/**
 * Navigate to product search page
 */
async function navigateToProductSearch(driver, productName) {
  console.log(`Navigating to search results for "${productName}"...`);
  const searchUrl = `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(productName)}`;
  await driver.get(searchUrl);
  
  await driver.sleep(5000 + Math.random() * 2000);
  
  // Re-execute stealth scripts
  await executeStealthScripts(driver);
  
  // Wait for products to load
  console.log('Waiting for products to load...');
  try {
    await driver.wait(async () => {
      try {
        const productCount = await driver.executeScript(`
          const links = document.querySelectorAll('a[href*="/instamart/item/"], a[href*="/item/"]');
          const cards = document.querySelectorAll('[data-testid="item-collection-card-full"], [data-testid="item-collection-card"]');
          return Math.max(links.length, cards.length);
        `);
        return productCount > 0;
      } catch (e) {
        return false;
      }
    }, 20000);
    console.log('✓ Products detected on page');
  } catch (e) {
    console.log('⚠️  Timeout waiting for products, continuing anyway...');
  }
  
  // Check for error page
  await checkAndHandleErrorPage(driver, searchUrl);
  await driver.sleep(3000);
}

/**
 * Extract basic product info from card HTML using cheerio
 */
function extractBasicProductInfo(cardHtml) {
  const $ = cheerio.load(cardHtml);
  
  // Extract product name
  let name = '';
  const nameEl = $('[class*="iPErou"], [class*="bvSpbA"]').first();
  if (nameEl.length) {
    name = nameEl.text().trim();
    // Clean name - remove delivery time, badges, prices
    name = name
      .replace(/₹\s*\d+[.,]?\d*/g, '')
      .replace(/\d+%\s*OFF/gi, '')
      .replace(/\b(Add|Get|Code|OFF|Flat|Rs|Buy|Cart|MINS|mins|Sold Out|Out of Stock)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Extract description
  let description = null;
  const descEl = $('[class*="diZRny"]').first();
  if (descEl.length) {
    description = descEl.text().trim();
  }
  
  // Extract image URL
  let imageUrl = null;
  const imgEl = $('img').first();
  if (imgEl.length) {
    imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || '';
    if (imageUrl && !imageUrl.startsWith('http')) {
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        imageUrl = 'https://www.swiggy.com' + imageUrl;
      }
    }
  }
  
  // Extract quantity/weight
  let quantity = null;
  const quantityEl = $('[class*="bCqPoH"]').first();
  if (quantityEl.length) {
    quantity = quantityEl.text().trim();
    const quantityMatch = quantity.match(/(\d+\s*(?:g|kg|ml|l|piece|combo|pack|bunch))/i);
    if (quantityMatch) {
      quantity = quantityMatch[1];
    }
  }
  
  // Extract delivery time
  let deliveryTime = null;
  const deliveryEl = $('[class*="ePxHTM"], [class*="GOJ8s"]').first();
  if (deliveryEl.length) {
    deliveryTime = deliveryEl.text().trim();
  }
  
  // Extract badges
  const badges = [];
  const badgeEl = $('[data-testid="badge-wrapper"]').first();
  if (badgeEl.length) {
    const badgeText = badgeEl.text().trim();
    if (badgeText) badges.push(badgeText);
  }
  const offerEl = $('[data-testid="offer-text"]').first();
  if (offerEl.length) {
    const offerText = offerEl.text().trim();
    if (offerText) badges.push(offerText);
  }
  const sourcedBadge = $('[class*="emmXxR"]').first();
  if (sourcedBadge.length) {
    const badgeText = sourcedBadge.text().trim();
    if (badgeText.includes('Sourced at')) {
      badges.push(badgeText);
    }
  }
  
  // Try to extract product URL from href
  let productUrl = null;
  const linkEl = $('a[href*="/instamart/item/"], a[href*="/item/"]').first();
  if (linkEl.length) {
    let href = linkEl.attr('href');
    if (href) {
      if (!href.startsWith('http')) {
        if (href.startsWith('//')) {
          href = 'https:' + href;
        } else if (href.startsWith('/')) {
          href = 'https://www.swiggy.com' + href;
        }
      }
      productUrl = href;
    }
  }
  
  return {
    name,
    description,
    imageUrl,
    quantity,
    deliveryTime,
    badges: badges.length > 0 ? badges : null,
    productUrl
  };
}

/**
 * Extract prices from product page using JavaScript execution
 * Only extracts prices that have rupee symbol (₹) - filters out weights/quantities
 */
async function extractPricesFromProductPage(driver) {
  const priceExtractionScript = `
    // Function to extract all prices from the page
    function extractPrices() {
      const prices = [];
      
      // Keywords that indicate weight/quantity (not prices)
      const weightKeywords = ['g', 'kg', 'ml', 'l', 'piece', 'pieces', 'pack', 'bunch', 'dozen', 'combo', 'gram', 'kilogram', 'liter', 'litre'];
      
      // Function to check if text contains weight/quantity keywords near the number
      function isWeightOrQuantity(text, priceValue, matchIndex) {
        const lowerText = text.toLowerCase();
        const priceStr = priceValue.toString();
        
        // Get context around the match (20 characters before and after)
        const start = Math.max(0, matchIndex - 20);
        const end = Math.min(text.length, matchIndex + priceStr.length + 20);
        const context = lowerText.substring(start, end);
        
        // Check if any weight keyword appears in the context
        for (const keyword of weightKeywords) {
          if (context.includes(keyword)) {
            // Check if keyword is close to the price (within 10 characters)
            const keywordIndex = context.indexOf(keyword);
            const priceIndexInContext = matchIndex - start;
            const distance = Math.abs(keywordIndex - priceIndexInContext);
            if (distance < 15) {
              return true;
            }
          }
        }
        
        // Very small numbers (1-10) without rupee symbol context might be quantities
        // But we only extract with rupee symbol, so this is less relevant
        return false;
      }
      
      // Priority: Look for prices in main product detail area first
      const productDetailSelectors = [
        'main',
        'article',
        '[role="main"]',
        '[class*="product-detail"]',
        '[class*="productDetail"]',
        '[class*="item-detail"]',
        '[class*="itemDetail"]',
        '[class*="price"]',
        '[data-testid*="price"]'
      ];
      
      let productDetailSection = null;
      for (const selector of productDetailSelectors) {
        try {
          const section = document.querySelector(selector);
          if (section) {
            productDetailSection = section;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // If no specific section found, use body but prioritize visible price-like elements
      const searchRoot = productDetailSection || document.body;
      
      // Get all elements that might contain prices
      const allElements = searchRoot.querySelectorAll('*');
      const checkedElements = new Set();
      
      for (const el of allElements) {
        if (checkedElements.has(el)) continue;
        checkedElements.add(el);
        
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        
        // Must be visible
        if (style.display === 'none' || 
            style.visibility === 'hidden' ||
            rect.width === 0 || rect.height === 0) {
          continue;
        }
        
        const text = el.textContent || '';
        
        // Skip elements that contain delivery-related text (these often have ₹49 for free delivery threshold)
        const lowerText = text.toLowerCase();
        if (lowerText.includes('free delivery') || 
            lowerText.includes('delivery on orders') || 
            lowerText.includes('orders above') ||
            lowerText.includes('minimum order') ||
            lowerText.includes('delivery charge') ||
            lowerText.includes('shipping')) {
          continue;
        }
        
        // Skip footer, header, navigation areas
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'footer' || tagName === 'header' || tagName === 'nav') {
          continue;
        }
        
        // Look for rupee symbol followed by price - MUST have rupee symbol
        // Pattern: ₹ (U+20B9) followed by optional space, then digits
        // textContent already decodes HTML entities, so we just need to match ₹
        const priceRegex = /[₹]\\s*(\\d{1,6}(?:[,\\.]\\d{2})?)/g;
        let match;
        while ((match = priceRegex.exec(text)) !== null) {
          const priceValue = parseFloat(match[1].replace(/[,]/g, ''));
          
          // Must be reasonable price range (10 to 50,000) - excludes very small numbers that might be weights
          if (isNaN(priceValue) || priceValue < 10 || priceValue >= 50000) {
            continue;
          }
          
          // Skip if this looks like weight/quantity (check context around the match)
          if (isWeightOrQuantity(text, priceValue, match.index)) {
            continue;
          }
          
          // Skip if the text context suggests this is a delivery threshold or order minimum
          const matchContext = text.substring(Math.max(0, match.index - 30), Math.min(text.length, match.index + 50)).toLowerCase();
          if (matchContext.includes('free delivery') || 
              matchContext.includes('orders above') || 
              matchContext.includes('minimum') ||
              matchContext.includes('delivery on')) {
            continue;
          }
          
          // Check if element or ancestor has strikethrough
          let hasStrikethrough = false;
          let checkEl = el;
          while (checkEl && checkEl !== document.body) {
            const checkStyle = window.getComputedStyle(checkEl);
            if (checkStyle.textDecoration.includes('line-through') ||
                checkEl.tagName === 'S' || 
                checkEl.tagName === 'DEL' || 
                checkEl.tagName === 'STRIKE') {
              hasStrikethrough = true;
              break;
            }
            checkEl = checkEl.parentElement;
          }
          
          // Calculate priority score - higher score = more likely to be the main product price
          let priority = 0;
          
          // Higher priority if in product detail section
          if (productDetailSection && productDetailSection.contains(el)) {
            priority += 10;
          }
          
          // Higher priority if element has price-related classes or attributes
          const className = el.className || '';
          const classLower = className.toLowerCase();
          if (classLower.includes('price') && !classLower.includes('delivery') && !classLower.includes('shipping')) {
            priority += 5;
          }
          
          // Higher priority if font size is larger (likely main price)
          const fontSize = parseFloat(style.fontSize);
          if (fontSize > 20) {
            priority += 3;
          } else if (fontSize > 16) {
            priority += 1;
          }
          
          // Lower priority if in small text or fine print
          if (fontSize < 12) {
            priority -= 2;
          }
          
          prices.push({
            price: priceValue,
            isStrikethrough: hasStrikethrough,
            priority: priority,
            text: text.trim().substring(0, 100) // For debugging
          });
        }
      }
      
      // Remove duplicates, keeping highest priority version
      const priceMap = new Map();
      for (const item of prices) {
        const existing = priceMap.get(item.price);
        if (!existing || (item.priority || 0) > (existing.priority || 0)) {
          priceMap.set(item.price, item);
        }
      }
      
      const uniquePrices = Array.from(priceMap.values());
      
      // Sort by priority (descending) first, then by price (ascending)
      return uniquePrices.sort((a, b) => {
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return a.price - b.price;
      });
    }
    
    return extractPrices();
  `;
  
  try {
    const priceData = await driver.executeScript(priceExtractionScript);
    
    if (priceData && Array.isArray(priceData) && priceData.length > 0) {
      console.log(`  → Found ${priceData.length} price(s) with rupee symbol:`, priceData.map(p => `₹${p.price}${p.isStrikethrough ? ' (MRP/strikethrough)' : ''} (priority: ${p.priority || 0})`).join(', '));
      
      // Filter out delivery-related prices more aggressively
      const filteredPrices = priceData.filter(p => {
        const text = p.text || '';
        const lowerText = text.toLowerCase();
        // Exclude if it's clearly a delivery threshold
        if (lowerText.includes('free delivery') || 
            lowerText.includes('orders above') || 
            lowerText.includes('minimum') ||
            lowerText.includes('delivery on') ||
            lowerText.includes('delivery charge')) {
          console.log(`  → Excluding price ₹${p.price} (delivery-related: ${text.substring(0, 50)})`);
          return false;
        }
        return true;
      });
      
      if (filteredPrices.length === 0) {
        console.log(`  → All prices filtered out as delivery-related, using original list`);
        // If all were filtered, use original but prioritize non-delivery ones
        const strikethroughPrices = priceData.filter(p => p.isStrikethrough).map(p => p.price);
        const regularPrices = priceData.filter(p => !p.isStrikethrough).map(p => p.price);
        
        let price = null;
        let mrp = null;
        
        if (strikethroughPrices.length > 0) {
          mrp = Math.max(...strikethroughPrices);
        }
        if (regularPrices.length > 0) {
          price = Math.min(...regularPrices);
        }
        
        return { price, mrp };
      }
      
      const strikethroughPrices = filteredPrices.filter(p => p.isStrikethrough);
      const regularPrices = filteredPrices.filter(p => !p.isStrikethrough);
      
      let price = null;
      let mrp = null;
      
      // MRP is from strikethrough prices (highest priority, then highest price)
      if (strikethroughPrices.length > 0) {
        const sortedMrp = strikethroughPrices.sort((a, b) => {
          const priorityDiff = (b.priority || 0) - (a.priority || 0);
          if (priorityDiff !== 0) return priorityDiff;
          return b.price - a.price;
        });
        mrp = sortedMrp[0].price;
        console.log(`  → MRP identified: ₹${mrp} (from strikethrough prices, priority: ${sortedMrp[0].priority || 0})`);
      }
      
      // Current price is from regular (non-strikethrough) prices (highest priority, then lowest price)
      if (regularPrices.length > 0) {
        const sortedRegular = regularPrices.sort((a, b) => {
          const priorityDiff = (b.priority || 0) - (a.priority || 0);
          if (priorityDiff !== 0) return priorityDiff;
          return a.price - b.price;
        });
        price = sortedRegular[0].price;
        console.log(`  → Current price identified: ₹${price} (from regular prices, priority: ${sortedRegular[0].priority || 0})`);
      } else if (filteredPrices.length > 0) {
        // Fallback: if all prices are strikethrough, use highest priority, then lowest price
        const sortedAll = filteredPrices.sort((a, b) => {
          const priorityDiff = (b.priority || 0) - (a.priority || 0);
          if (priorityDiff !== 0) return priorityDiff;
          return a.price - b.price;
        });
        price = sortedAll[0].price;
        if (sortedAll.length > 1 && !mrp) {
          mrp = sortedAll[sortedAll.length - 1].price;
        }
        console.log(`  → Using fallback: Price: ₹${price}, MRP: ₹${mrp || 'N/A'}`);
      }
      
      return { price, mrp };
    } else {
      console.log(`  → No prices found with rupee symbol`);
    }
  } catch (error) {
    console.log(`  ⚠️  Price extraction error: ${error.message}`);
    console.log(`  → Error stack: ${error.stack}`);
  }
  
  return { price: null, mrp: null };
}

/**
 * Scroll to load more products
 */
async function scrollToLoadMoreProducts(driver) {
  console.log('  → Scrolling to load more products...');
  const initialScrollHeight = await driver.executeScript('return document.body.scrollHeight');
  
  // Scroll down multiple times to trigger lazy loading
  for (let scroll = 0; scroll < 5; scroll++) {
    await driver.executeScript('window.scrollTo(0, document.body.scrollHeight);');
    await driver.sleep(2000);
    
    // Check if new content loaded
    const newScrollHeight = await driver.executeScript('return document.body.scrollHeight');
    if (newScrollHeight === initialScrollHeight && scroll > 2) {
      break; // No more content loading
    }
  }
  
  // Scroll back to top
  await driver.executeScript('window.scrollTo(0, 0);');
  await driver.sleep(2000);
}

/**
 * Extract product data by clicking each product card
 * Ensures at least 20 products are extracted
 */
async function extractProducts(driver, locationName, productName) {
  console.log('🔍 Extracting products from search results...');
  
  const products = [];
  const searchResultsUrl = await driver.getCurrentUrl();
  const minRequiredProducts = 20;
  
  // Scroll to load more products initially
  await scrollToLoadMoreProducts(driver);
  
  // Check for error page before starting
  await checkAndHandleErrorPage(driver, searchResultsUrl);
  
  let attemptCount = 0;
  const maxAttempts = 3;
  
  while (products.length < minRequiredProducts && attemptCount < maxAttempts) {
    attemptCount++;
    
    if (attemptCount > 1) {
      console.log(`\n⚠️  Only found ${products.length} products, need at least ${minRequiredProducts}. Attempt ${attemptCount}/${maxAttempts}...`);
      
      // Reload page and scroll again
      await driver.get(searchResultsUrl);
      await driver.sleep(5000);
      await executeStealthScripts(driver);
      await scrollToLoadMoreProducts(driver);
      await checkAndHandleErrorPage(driver, searchResultsUrl);
    }
    
    // Find all product cards
    let productCards = await driver.findElements(
      By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
    );
    
    console.log(`Found ${productCards.length} product cards`);
    
    if (productCards.length === 0) {
      console.log('⚠️  No product cards found, checking for error page...');
      await checkAndHandleErrorPage(driver, searchResultsUrl);
      await driver.sleep(3000);
      continue;
    }
    
    // Process each product card
    for (let i = 0; i < productCards.length && products.length < minRequiredProducts; i++) {
    try {
      console.log(`\n[${i + 1}/${productCards.length}] Processing product...`);
      
      // Refresh product cards list (in case DOM changed)
      productCards = await driver.findElements(
        By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
      );
      
      if (i >= productCards.length) {
        console.log(`⚠️  Product ${i + 1} not found, stopping at ${products.length} products`);
        break;
      }
      
      const card = productCards[i];
      
      // Scroll to card
      await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', card);
      await driver.sleep(1000);
      
      // Extract basic info from card HTML
      const cardHtml = await driver.executeScript('return arguments[0].outerHTML;', card);
      const basicInfo = extractBasicProductInfo(cardHtml);
      
      if (!basicInfo.name || basicInfo.name.length < 2) {
        console.log(`  ⚠️  Skipping: No valid product name found`);
        continue;
      }
      
      let productUrl = basicInfo.productUrl;
      let price = null;
      let mrp = null;
      
      // ALWAYS click to navigate to product page to extract prices with rupee symbol
      // Even if URL is found in card, we need to go to product page for accurate price extraction
      try {
        if (!productUrl) {
          console.log(`  → Clicking card to get product URL and prices...`);
        } else {
          console.log(`  → Product URL found in card: ${productUrl}, but clicking to extract accurate prices with rupee symbol...`);
        }
        
        // Disable add to cart button to avoid clicking it
        await driver.executeScript(`
          const card = arguments[0];
          const addButton = card.querySelector('[data-testid="buttonpair-add"]');
          if (addButton) {
            addButton.style.pointerEvents = 'none';
          }
          card.click();
        `, card);
        
        await driver.sleep(2000);
        
        // Get the new URL
        const newUrl = await driver.getCurrentUrl();
        if (newUrl && newUrl !== searchResultsUrl && (newUrl.includes('/item/') || newUrl.includes('/instamart/item/'))) {
          productUrl = newUrl;
          console.log(`  → Navigated to product page: ${productUrl}`);
          
            // Wait for price elements with rupee symbol to appear
            try {
              await driver.wait(async () => {
                const hasPrice = await driver.executeScript(`
                  const priceElements = Array.from(document.querySelectorAll('*')).filter(el => {
                    const text = el.textContent || '';
                    // MUST have rupee symbol (₹) - textContent already decodes HTML entities
                    if (text.match(/[₹]\\s*\\d+/)) {
                      const style = window.getComputedStyle(el);
                      const rect = el.getBoundingClientRect();
                      return style.display !== 'none' && 
                             style.visibility !== 'hidden' &&
                             rect.width > 0 && rect.height > 0;
                    }
                    return false;
                  });
                  return priceElements.length > 0;
                `);
                return hasPrice;
              }, 10000);
              
              await driver.sleep(3000); // Give more time for page to fully render
              
              // Debug: Log all text with rupee symbol found on page
              const debugPrices = await driver.executeScript(`
                const allText = Array.from(document.querySelectorAll('*'))
                  .map(el => {
                    const text = el.textContent || '';
                    if (text.match(/[₹]\\s*\\d+/)) {
                      const style = window.getComputedStyle(el);
                      const rect = el.getBoundingClientRect();
                      if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0) {
                        return text.trim().substring(0, 100);
                      }
                    }
                    return null;
                  })
                  .filter(t => t !== null);
                return [...new Set(allText)].slice(0, 10);
              `);
              console.log(`  → Debug: Found text with ₹ symbol:`, debugPrices);
              
              // Extract prices from product page - ONLY prices with rupee symbol
              const priceInfo = await extractPricesFromProductPage(driver);
              price = priceInfo.price;
              mrp = priceInfo.mrp;
              
              if (price || mrp) {
                console.log(`  → Extracted prices: Price: ₹${price || 'N/A'}, MRP: ₹${mrp || 'N/A'}`);
              } else {
                console.log(`  ⚠️  No prices found with rupee symbol on product page`);
                // Try one more time with a longer wait
                await driver.sleep(2000);
                const priceInfoRetry = await extractPricesFromProductPage(driver);
                price = priceInfoRetry.price;
                mrp = priceInfoRetry.mrp;
                if (price || mrp) {
                  console.log(`  → Retry successful: Price: ₹${price || 'N/A'}, MRP: ₹${mrp || 'N/A'}`);
                }
              }
          } catch (waitError) {
            console.log(`  → Timeout waiting for price elements with rupee symbol, continuing...`);
            await driver.sleep(2000);
          }
          
          // Navigate back to search results
          await driver.get(searchResultsUrl);
          await driver.sleep(2000);
          
          // Check for error page after navigating back
          await checkAndHandleErrorPage(driver, searchResultsUrl);
        } else {
          console.log(`  ⚠️  Did not navigate to product page, URL: ${newUrl}`);
        }
      } catch (clickError) {
        console.log(`  ⚠️  Could not click product card: ${clickError.message}`);
        // Check for error page
        await checkAndHandleErrorPage(driver, searchResultsUrl);
        // Continue anyway
      }
      
      // Calculate discount
      let discount = null;
      let discountAmount = null;
      if (mrp && price && mrp > price) {
        discount = Math.round(((mrp - price) / mrp) * 100);
        discountAmount = mrp - price;
      }
      
      // Build product object
      const product = {
        name: basicInfo.name,
        price: price,
        mrp: mrp,
        discount: discount,
        discountAmount: discountAmount,
        isOutOfStock: false,
        imageUrl: basicInfo.imageUrl,
        productUrl: productUrl,
        description: basicInfo.description,
        quantity: basicInfo.quantity,
        deliveryTime: basicInfo.deliveryTime,
        badges: basicInfo.badges
      };
      
      products.push(product);
      console.log(`✓ [${products.length}/${minRequiredProducts}] Extracted: ${product.name} - ₹${price || 'N/A'}${mrp ? ` (MRP: ₹${mrp}, Discount: ${discount}%)` : ''} - URL: ${productUrl ? 'Yes' : 'No'}`);
      
      // Check for error page periodically (every 5 products)
      if (products.length % 5 === 0) {
        await checkAndHandleErrorPage(driver, searchResultsUrl);
      }
      
    } catch (error) {
      console.log(`⚠️  Error extracting product ${i + 1}: ${error.message}`);
      // Check for error page on error
      await checkAndHandleErrorPage(driver, searchResultsUrl);
      // Continue with next product
    }
    }
    
    // If we still don't have enough products, try scrolling more
    if (products.length < minRequiredProducts && attemptCount < maxAttempts) {
      console.log(`\n⚠️  Only extracted ${products.length} products, scrolling to load more...`);
      await scrollToLoadMoreProducts(driver);
      await checkAndHandleErrorPage(driver, searchResultsUrl);
    }
  }
  
  if (products.length < minRequiredProducts) {
    console.log(`\n⚠️  Warning: Only extracted ${products.length} products (minimum ${minRequiredProducts} required)`);
  } else {
    console.log(`\n✓ Successfully extracted ${products.length} products (minimum ${minRequiredProducts} required)`);
  }
  
  return products;
}

/**
 * Save results to JSON file
 */
function saveResults(products, locationName, productName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(__dirname, '..', 'output');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const jsonData = {
    website: "Swiggy Instamart",
    location: locationName,
    product: productName,
    timestamp: timestamp,
    totalProducts: products.length,
    products: products
  };
  
  const filename = `instamart-${locationName.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2), 'utf8');
  console.log(`\n✓ JSON data saved: ${filepath}`);
  console.log(`✓ Total products: ${products.length}`);
  
  return filepath;
}

/**
 * Main scraping function
 */
async function scrapeInstamart(locationName = 'RT Nagar', productName = 'tomato') {
  let driver = null;
  
  try {
    console.log('\n🚀 Starting Swiggy Instamart scraper...');
    console.log(`📍 Location: ${locationName}`);
    console.log(`🔍 Product: ${productName}\n`);
    
    // Build WebDriver
    const chromeOptions = configureChromeOptions();
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(chromeOptions)
      .build();
    
    // Select location
    await selectLocation(driver, locationName);
    
    // Navigate to product search
    await navigateToProductSearch(driver, productName);
    
    // Extract products
    const products = await extractProducts(driver, locationName, productName);
    
    if (products.length === 0) {
      console.log('⚠️  No products found. This might indicate the page structure has changed or products haven\'t loaded yet.');
    }
    
    // Save results
    const filepath = saveResults(products, locationName, productName);
    
    console.log(`\n✅ Scraping completed successfully!`);
    console.log(`📄 JSON saved to: ${filepath}`);
    
    // Close browser
    await driver.quit();
    console.log('Browser closed.');
    
    return {
      website: "Swiggy Instamart",
      location: locationName,
      product: productName,
      timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
      totalProducts: products.length,
      products: products
    };
    
  } catch (error) {
    console.error('❌ Error occurred:', error);
    console.error('Error stack:', error.stack);
    
    // Save error screenshot
    try {
      if (driver) {
        try {
          await driver.getWindowHandle();
          const screenshot = await driver.takeScreenshot();
          const screenshotPath = path.join(__dirname, '..', 'instamart-error.png');
          fs.writeFileSync(screenshotPath, screenshot, 'base64');
          console.log(`Error screenshot saved: ${screenshotPath}`);
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

/**
 * Main function for command-line usage
 */
async function main() {
  const args = process.argv.slice(2);
  const locationName = args[0] || 'RT Nagar';
  const productName = args[1] || 'tomato';
  
  try {
    await scrapeInstamart(locationName, productName);
  } catch (error) {
    console.error(`\n❌ Scraping failed:`, error.message);
    process.exit(1);
  }
}

// Run the script only if called directly
if (isMainModule()) {
  main().catch(console.error);
}

export { scrapeInstamart };


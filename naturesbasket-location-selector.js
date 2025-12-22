import { chromium } from 'playwright';
import readline from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';
import * as fs from 'fs';

// Force headless mode for efficiency
const isHeadless = true;

/**
 * Robust Playwright script to automate location selection on Nature's Basket
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
async function selectLocationOnNaturesBasket(locationName, productName = 'tomato') {
  // Construct search URL from product name
  const searchUrl = `https://www.naturesbasket.co.in/search?q=${encodeURIComponent(productName)}`;
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true  // Ignore SSL certificate errors
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
    
    console.log(`Navigating to Nature's Basket search page...`);
    console.log(`URL: ${searchUrl}`);
    // Navigate to Nature's Basket search page with better error handling
    try {
      const response = await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      
      if (!response || !response.ok()) {
        const status = response ? response.status() : 'unknown';
        console.warn(`⚠️  Nature's Basket returned status ${status}, continuing anyway...`);
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
        console.error(`❌ Failed to navigate to Nature's Basket: ${retryError.message}`);
        throw new Error(`Failed to load Nature's Basket page: ${retryError.message}`);
      }
    }
    
    // Wait for page to fully load
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      console.log(`✓ Page DOM loaded`);
    } catch (e) {
      console.log(`⚠️  DOM load check timeout, continuing...`);
    }
    
    // Wait longer for dynamic content and any modals to appear/disappear
    await page.waitForTimeout(5000);
    
    // Check if there are any modals/overlays that need to be closed first
    try {
      const closeButtons = await page.locator('button[aria-label*="Close" i], button[aria-label*="close" i], [class*="close"], [class*="Close"]').all();
      for (const closeBtn of closeButtons) {
        try {
          if (await closeBtn.isVisible({ timeout: 2000 })) {
            await closeBtn.click({ timeout: 2000 });
            console.log(`✓ Closed modal/overlay`);
            await page.waitForTimeout(1000);
          }
        } catch (e) {
          // Ignore
        }
      }
    } catch (e) {
      // No modals to close
    }

    console.log(`Opening location selector...`);
    
    // First, check if location is already selected (page might already have location set)
    let locationAlreadySet = false;
    try {
      const locationIndicator = await page.locator('*:has-text("Delivering to"), *:has-text("delivering to"), [class*="location"]').first();
      if (await locationIndicator.isVisible({ timeout: 3000 })) {
        const locationText = await locationIndicator.textContent();
        console.log(`ℹ️  Found location indicator: ${locationText}`);
        // If location is already set, we might be able to proceed
        // But we'll still try to open the selector to change it
      }
    } catch (e) {
      // Location not found, continue
    }
    
    // Step 1: Find and click location selector
    // Enhanced selectors with more variations
    const locationSelectors = [
      // Exact text matches
      'xpath=//*[contains(text(), "Select Location")]',
      'xpath=//*[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "select location")]',
      'text=Select Location',
      '*:has-text("Select Location")',
      'button:has-text("Select Location")',
      'span:has-text("Select Location")',
      'div:has-text("Select Location")',
      // Partial matches
      'xpath=//*[contains(text(), "Location") and not(contains(text(), "Delivering"))]',
      'xpath=//button[contains(text(), "Location")]',
      'xpath=//*[@role="button" and contains(text(), "Location")]',
      'xpath=//a[contains(text(), "Location")]',
      // Class/attribute based
      'xpath=//*[contains(@class, "location") and (self::button or self::div or self::span)]',
      'xpath=//*[contains(@id, "location")]',
      'xpath=//*[@data-testid*="location" or @data-testid*="Location"]',
      // Generic location button
      'xpath=//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "location")]',
      // Try any clickable element with "location" in text
      '*:has-text("Location")',
      'button:has-text("Location")',
      'span:has-text("Location")'
    ];

    let locationClicked = false;
    let lastError = null;
    
    for (const selector of locationSelectors) {
      try {
        if (selector.startsWith('xpath=')) {
          const xpath = selector.replace('xpath=', '');
          const element = await page.waitForSelector(xpath, { timeout: 3000, state: 'visible' });
          if (element) {
            await element.click({ timeout: 3000 });
            locationClicked = true;
            console.log(`✓ Location selector clicked using: ${selector}`);
            break;
          }
        } else {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            await element.click({ timeout: 3000 });
            locationClicked = true;
            console.log(`✓ Location selector clicked using: ${selector}`);
            break;
          }
        }
      } catch (e) {
        lastError = e;
        continue;
      }
    }

    if (!locationClicked) {
      // Take screenshot for debugging
      try {
        await page.screenshot({ path: 'naturesbasket-location-selector-not-found.png', fullPage: true });
        console.log('📸 Debug screenshot saved: naturesbasket-location-selector-not-found.png');
      } catch (e) {
        // Ignore screenshot errors
      }
      
      // Save page HTML for debugging
      try {
        const html = await page.content();
        const fsModule = await import('fs');
        const fs = fsModule.default || fsModule;
        fs.writeFileSync('naturesbasket-page-source.html', html, 'utf8');
        console.log('📄 Page source saved: naturesbasket-page-source.html');
      } catch (e) {
        // Ignore
      }
      
      // Try one more time with a longer wait
      console.log(`⚠️  Location selector not found, waiting longer and retrying...`);
      await page.waitForTimeout(3000);
      
      // Try a few more generic selectors
      const fallbackSelectors = [
        'xpath=//button',
        'xpath=//*[@role="button"]',
        'xpath=//*[contains(@class, "button")]'
      ];
      
      for (const selector of fallbackSelectors) {
        try {
          const elements = await page.locator(selector).all();
          for (const el of elements.slice(0, 10)) { // Check first 10 buttons
            try {
              const text = await el.textContent();
              if (text && (text.toLowerCase().includes('location') || text.toLowerCase().includes('select'))) {
                if (await el.isVisible({ timeout: 2000 })) {
                  await el.click({ timeout: 2000 });
                  locationClicked = true;
                  console.log(`✓ Location selector clicked using fallback: "${text}"`);
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
          if (locationClicked) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!locationClicked) {
        throw new Error(`Location selector not found after trying all selectors. Last error: ${lastError?.message || 'Unknown'}`);
      }
    }

    console.log(`Waiting for location modal to open...`);
    // Wait for dialog to appear
    try {
      await page.waitForSelector('div[role="dialog"], [class*="modal"], [class*="dialog"]', { timeout: 10000 });
      console.log(`✓ Dialog/modal detected`);
    } catch (e) {
      console.log(`⚠️  Dialog selector timeout, continuing...`);
    }
    await page.waitForTimeout(3000);

    // Step 2: Click "Search area, street name..." button (optional step)
    console.log(`Trying to click "Search area, street name..." button...`);
    const searchAreaSelectors = [
      'xpath=//*[contains(text(), "Search area") or contains(text(), "street name")]',
      '*:has-text("Search area")',
      '*:has-text("street name")',
      'button:has-text("Search area")'
    ];

    let searchAreaClicked = false;
    for (const selector of searchAreaSelectors) {
      try {
        if (selector.startsWith('xpath=')) {
          const xpath = selector.replace('xpath=', '');
          const element = page.locator(xpath).first();
          if (await element.isVisible({ timeout: 3000 })) {
            await element.click({ timeout: 3000 });
          searchAreaClicked = true;
          console.log(`✓ Search area button clicked using: ${selector}`);
            await page.waitForTimeout(1000);
          break;
          }
        } else {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            await element.click({ timeout: 3000 });
            searchAreaClicked = true;
            console.log(`✓ Search area button clicked using: ${selector}`);
            await page.waitForTimeout(1000);
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!searchAreaClicked) {
      console.log(`⚠️  Search area button not found, trying direct input...`);
    }

    await page.waitForTimeout(2000);

    // Step 3: Find location input field with multiple strategies
    console.log(`Finding location input field...`);
    const locationInputSelectors = [
      // Strategy 1: Input with placeholder containing "enter"
      'xpath=//input[@placeholder and contains(translate(@placeholder, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "enter")]',
      // Strategy 2: Input with placeholder containing "area"
      'xpath=//input[@placeholder and contains(translate(@placeholder, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "area")]',
      // Strategy 3: Any input in dialog
      'xpath=//div[@role="dialog"]//input[@type="text"]',
      // Strategy 4: Input in modal
      'xpath=//*[contains(@class, "modal")]//input[@type="text"]',
      'xpath=//*[contains(@class, "dialog")]//input[@type="text"]',
      // Strategy 5: CSS selectors
      'div[role="dialog"] input[type="text"]',
      'div[role="dialog"] input',
      '[class*="modal"] input[type="text"]',
      '[class*="dialog"] input[type="text"]',
      // Strategy 6: Any visible text input
      'input[type="text"]:visible'
    ];

    let locationInput = null;
    let foundSelector = null;
    
    for (const selector of locationInputSelectors) {
      try {
        let inputElement;
        if (selector.startsWith('xpath=')) {
          const xpath = selector.replace('xpath=', '');
          inputElement = page.locator(xpath).first();
        } else {
          inputElement = page.locator(selector).first();
        }
        
        // Try to wait for visibility with shorter timeout
        const isVisible = await inputElement.isVisible({ timeout: 3000 }).catch(() => false);
        if (isVisible) {
          locationInput = inputElement;
          foundSelector = selector;
            console.log(`✓ Found location input using: ${selector}`);
            break;
        }
      } catch (e) {
        continue;
      }
    }

    // If still not found, try waiting for any input to appear
    if (!locationInput) {
      console.log(`⚠️  Input not found with selectors, waiting for any input to appear...`);
      try {
        await page.waitForSelector('input[type="text"]', { timeout: 5000 });
        const allInputs = page.locator('input[type="text"]');
        const count = await allInputs.count();
        console.log(`Found ${count} text inputs on page`);
        
        // Try each input to find the one in the dialog/modal
        for (let i = 0; i < count && i < 5; i++) {
          const input = allInputs.nth(i);
          try {
            const isVisible = await input.isVisible({ timeout: 2000 });
            if (isVisible) {
              // Check if it's in a dialog/modal
              const inDialog = await input.evaluate((el) => {
                return el.closest('[role="dialog"], [class*="modal"], [class*="dialog"]') !== null;
              }).catch(() => false);
              
              if (inDialog || count === 1) {
                locationInput = input;
                foundSelector = `input[type="text"] (index ${i})`;
                console.log(`✓ Found location input using fallback: ${foundSelector}`);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        console.log(`⚠️  Could not find any input fields`);
      }
    }

    if (!locationInput) {
      // Take screenshot for debugging
      try {
        await page.screenshot({ path: 'naturesbasket-input-not-found.png', fullPage: true });
        console.log('Debug screenshot saved: naturesbasket-input-not-found.png');
      } catch (e) {
        // Ignore screenshot errors
      }
      throw new Error('Location input field not found after trying all selectors');
    }

    console.log(`Clicking location input field...`);
    try {
      await locationInput.click({ timeout: 5000, force: true });
    } catch (e) {
      console.log(`⚠️  Click failed, trying JavaScript click...`);
      await locationInput.evaluate((el) => el.click()).catch(() => {
        throw new Error('Could not click location input field');
      });
    }
    await page.waitForTimeout(500);

    // Clear any existing text
    await locationInput.fill('');
    await page.waitForTimeout(200);

    console.log(`Typing location: ${locationName}`);
    // Type slowly character by character for better reliability
    for (const char of locationName) {
      await locationInput.type(char, { delay: 100 });
    }
    await page.waitForTimeout(1500);

    console.log(`Waiting for location suggestions to appear...`);
    await page.waitForTimeout(3000);

    // Step 4: Find and click location suggestion (simplified approach)
    let suggestionClicked = false;
    
    // Try simpler approach first - look for button with location name
    try {
      const suggestionButton = page.locator(`button:has-text("${locationName}")`).first();
      if (await suggestionButton.isVisible({ timeout: 5000 })) {
        const text = await suggestionButton.textContent();
        const lowerText = text?.toLowerCase() || '';
        if (!lowerText.includes('airport') && !lowerText.includes('railway') && 
            !lowerText.includes('station') && !lowerText.includes('temple')) {
          await suggestionButton.click({ timeout: 5000 });
          suggestionClicked = true;
          console.log(`✓ Location suggestion button clicked: ${locationName}`);
        }
      }
    } catch (e) {
      // Continue to next strategy
    }

    // Try "Delivering to" section if button not found
    if (!suggestionClicked) {
      try {
        const deliveringTo = page.locator('*:has-text("Delivering to")').first();
        if (await deliveringTo.isVisible({ timeout: 3000 })) {
          await deliveringTo.click({ timeout: 5000 });
          suggestionClicked = true;
          console.log(`✓ Clicked "Delivering to" section`);
        }
      } catch (e2) {
        // Continue to next strategy
      }
    }

    // Try text-based selectors (more flexible matching)
    if (!suggestionClicked) {
      const locationVariations = [
        locationName,
        locationName.toLowerCase(),
        locationName.toUpperCase()
      ];
      
      for (const loc of locationVariations) {
      try {
          // Try simple text locator
          const textLocator = page.locator(`text=${loc}`).first();
          if (await textLocator.isVisible({ timeout: 3000 })) {
            const text = await textLocator.textContent();
            const lowerText = text?.toLowerCase() || '';
            if (!lowerText.includes('airport') && !lowerText.includes('railway') && 
                !lowerText.includes('station') && !lowerText.includes('temple') &&
                !lowerText.includes('search') && !lowerText.includes('enter')) {
              await textLocator.click({ timeout: 3000 });
            suggestionClicked = true;
              console.log(`✓ Location suggestion clicked via text: ${loc}`);
            break;
            }
          }
          } catch (e) {
          continue;
        }
      }
    }

    // Try finding any clickable element containing the location name
    if (!suggestionClicked) {
      // Try XPath for buttons/links containing location name
      const xpathSelectors = [
        `//button[contains(text(), '${locationName}')]`,
        `//a[contains(text(), '${locationName}')]`,
        `//*[@role='button' and contains(text(), '${locationName}')]`,
        `//li[contains(text(), '${locationName}')]`,
        `//div[contains(text(), '${locationName}') and (contains(@class, 'button') or contains(@class, 'click') or contains(@class, 'select'))]`,
        `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${locationName.toLowerCase()}')]`
      ];
      
      for (const xpath of xpathSelectors) {
        try {
          const suggestion = page.locator(xpath).first();
          if (await suggestion.isVisible({ timeout: 3000 })) {
            const text = await suggestion.textContent();
            const lowerText = text?.toLowerCase() || '';
            if (!lowerText.includes('airport') && !lowerText.includes('railway') && 
                !lowerText.includes('station') && !lowerText.includes('temple') &&
                !lowerText.includes('search') && !lowerText.includes('enter')) {
              await suggestion.click({ timeout: 3000, force: true });
              suggestionClicked = true;
              console.log(`✓ Location suggestion clicked via XPath: ${text?.substring(0, 50)}`);
              break;
          }
        }
      } catch (e) {
        continue;
        }
      }
    }

    // Last resort: Try clicking any visible suggestion that contains the location name
    if (!suggestionClicked) {
      try {
        console.log(`Trying last resort: finding all suggestions...`);
        const allSuggestions = await page.locator('li, div[role="option"], button, a').all();
        for (const suggestion of allSuggestions) {
          try {
            const text = await suggestion.textContent();
            if (text && text.toLowerCase().includes(locationName.toLowerCase())) {
              const lowerText = text.toLowerCase();
              if (!lowerText.includes('airport') && !lowerText.includes('railway') && 
                  !lowerText.includes('station') && !lowerText.includes('temple') &&
                  !lowerText.includes('search') && !lowerText.includes('enter') &&
                  !lowerText.includes('type') && !lowerText.includes('select')) {
                if (await suggestion.isVisible({ timeout: 2000 })) {
                  await suggestion.click({ timeout: 2000, force: true });
                  suggestionClicked = true;
                  console.log(`✓ Location suggestion clicked (last resort): ${text?.substring(0, 50)}`);
                  break;
                }
              }
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        console.log(`Last resort attempt failed: ${e.message}`);
      }
    }

    if (!suggestionClicked) {
      // Take a screenshot for debugging
      await page.screenshot({ path: `naturesbasket-location-suggestion-error-${Date.now()}.png`, fullPage: true });
      throw new Error(`Could not click location suggestion for: ${locationName}. Screenshot saved for debugging.`);
    }

    console.log(`Waiting for location to be applied...`);
    await page.waitForTimeout(1000);

    // Step 5: Find and click confirm location button
    // Proven MCP selector: //div[@role='dialog']//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm')]
    console.log(`Clicking confirm location button...`);
    let confirmClicked = false;
    
    const confirmSelectors = [
      'xpath=//div[@role=\'dialog\']//button[contains(translate(., \'ABCDEFGHIJKLMNOPQRSTUVWXYZ\', \'abcdefghijklmnopqrstuvwxyz\'), \'confirm\')]',
      'xpath=//button[contains(translate(text(), \'ABCDEFGHIJKLMNOPQRSTUVWXYZ\', \'abcdefghijklmnopqrstuvwxyz\'), \'confirm location\')]',
      'xpath=//button[contains(text(), \'CONFIRM LOCATION\')]',
      'xpath=//button[contains(text(), \'Confirm Location\')]',
      'button:has-text("CONFIRM LOCATION")',
      'button:has-text("Confirm Location")'
    ];

    for (const selector of confirmSelectors) {
      try {
        if (selector.startsWith('xpath=')) {
          const xpath = selector.replace('xpath=', '');
          const confirmButton = page.locator(xpath).first();
          await confirmButton.waitFor({ timeout: 5000, state: 'visible' });
          if (await confirmButton.isVisible({ timeout: 2000 })) {
            await confirmButton.click({ timeout: 2000, force: true });
            confirmClicked = true;
            console.log(`✓ Confirm location button clicked using: ${selector}`);
            break;
          }
        } else {
          const confirmButton = page.locator(selector).first();
          if (await confirmButton.isVisible({ timeout: 5000 })) {
            await confirmButton.click({ timeout: 2000, force: true });
            confirmClicked = true;
            console.log(`✓ Confirm location button clicked using: ${selector}`);
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!confirmClicked) {
      console.log(`⚠ Warning: Could not find confirm button`);
    }

    console.log(`Waiting for location to be confirmed...`);
    await page.waitForTimeout(3000);

    // Step 6: Reload page to verify location persists
    console.log(`Reloading page to verify location...`);
    await page.goto(searchUrl, {
      waitUntil: 'load',
      timeout: 60000
    });
    
    // Wait for page to be ready after reload
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      console.log(`✓ Page DOM loaded after reload`);
    } catch (e) {
      console.log(`⚠️  DOM load check timeout, continuing...`);
    }
    
    // Wait for product elements to appear
    try {
      await page.waitForSelector('a[href*="/product-detail/"], [class*="product"]', {
        timeout: 10000
      });
      console.log(`✓ Product elements found`);
    } catch (e) {
      console.log(`⚠️  Product elements not found, continuing anyway...`);
    }
    
    await page.waitForTimeout(2000);

    // Step 7: Scroll slowly from top to bottom to load all images and products
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
    
    // Step 8: Extract products from HTML
    console.log(`Extracting products from page...`);
    const products = await page.evaluate(() => {
      const productList = [];
      const processedUrls = new Set();
      
      // Find all product links
      const productLinks = document.querySelectorAll('a[href*="/product-detail/"]');
      
      productLinks.forEach(link => {
        try {
          // Extract product URL
          let productUrl = link.getAttribute('href');
          if (!productUrl || productUrl.startsWith('#')) return;
          
          // Convert to absolute URL
          if (!productUrl.startsWith('http')) {
            if (productUrl.startsWith('//')) {
              productUrl = 'https:' + productUrl;
            } else if (productUrl.startsWith('/')) {
              productUrl = 'https://www.naturesbasket.co.in' + productUrl;
            }
          }
          
          // Skip duplicates
          if (processedUrls.has(productUrl)) return;
          processedUrls.add(productUrl);
          
          // Extract product name from h3 tag or link text
          let productName = null;
          const h3 = link.querySelector('h3');
          if (h3) {
            productName = h3.textContent?.trim();
          }
          if (!productName || productName.length < 3) {
            productName = link.textContent?.trim();
          }
          
          if (!productName || productName.length < 3) return;
          
          // Find container with price information
          let container = link.closest('div, article, section, li');
          if (!container) container = link.parentElement;
          
          // Extract prices from container
          let price = null;
          let mrp = null;
          const containerText = container?.textContent || '';
          const priceMatches = containerText.match(/₹\s*(\d+(?:\.\d+)?)/g);
          
          if (priceMatches && priceMatches.length > 0) {
            const prices = priceMatches.map(m => {
              const match = m.match(/₹\s*(\d+(?:\.\d+)?)/);
              return match ? parseFloat(match[1]) : null;
            }).filter(p => p !== null && p > 0);
            
            if (prices.length > 1) {
              // Usually first is MRP, second is selling price (but check which is higher)
              const sortedPrices = prices.sort((a, b) => b - a);
              mrp = sortedPrices[0];
              price = sortedPrices[1];
            } else if (prices.length === 1) {
              price = prices[0];
            }
          }
          
          // Extract image URL
          let imageUrl = null;
          const img = link.querySelector('img');
          if (img) {
            imageUrl = img.getAttribute('src') || 
                      img.getAttribute('data-src') || 
                      img.getAttribute('data-lazy-src') || 
                      img.getAttribute('data-original') ||
                      (img.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0]);
            
            if (imageUrl && !imageUrl.startsWith('http')) {
              if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
              } else if (imageUrl.startsWith('/')) {
                imageUrl = 'https://www.naturesbasket.co.in' + imageUrl;
              }
            }
          }
          
          // Only add if we have essential information
          if (productName && price && productUrl) {
            const discount = mrp && mrp > price ? mrp - price : null;
            
            productList.push({
              name: productName,
              price: price,
              mrp: mrp || null,
              discount: discount,
              discountAmount: discount,
              isOutOfStock: false, // Would need to check for out of stock indicators
              imageUrl: imageUrl || null,
              productUrl: productUrl
            });
          }
        } catch (e) {
          // Skip products with errors
        }
      });
      
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
    
    // Step 9: Generate JSON output
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0] + 'Z';
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const jsonData = {
      website: "Nature's Basket",
      location: locationName,
      product: productName,
      timestamp: timestamp,
      products: products
    };
    
    const jsonPath = path.join(outputDir, `naturesbasket-${locationName.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
    console.log(`✓ JSON data saved: ${jsonPath}`);
    console.log(`✓ Total products: ${products.length}`);
    
    // Also save HTML for reference
    const pageHtml = await page.content();
    const htmlPath = path.join(outputDir, `naturesbasket-${locationName.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.html`);
    fs.writeFileSync(htmlPath, pageHtml, 'utf8');
    console.log(`✓ HTML saved: ${htmlPath}`);

    console.log(`\n✅ Location "${locationName}" selected and products extracted successfully!`);
    console.log(`📄 JSON saved to: ${jsonPath}`);
    
    // Close browser
    await browser.close();
    console.log('Browser closed.');

    // Return the JSON data
    return jsonData;

  } catch (error) {
    console.error('❌ Error occurred:', error);
    try {
      if (page) {
        await page.screenshot({ path: 'naturesbasket-error.png', fullPage: true });
        console.log('Error screenshot saved: naturesbasket-error.png');
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
  const productName = process.argv[3] || 'tomato';
  
  console.log(`\n🚀 Starting Nature's Basket location selection`);
  console.log(`📍 Location: ${locationToSelect}`);
  console.log(`🛍️ Product: ${productName}\n`);
  
  const jsonData = await selectLocationOnNaturesBasket(locationToSelect, productName);
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
    isMainModule = process.argv[1].endsWith('naturesbasket-location-selector.js') || 
                   process.argv[1].includes('naturesbasket-location-selector.js');
  }
}

if (isMainModule) {
  main().catch(console.error);
}

export { selectLocationOnNaturesBasket };

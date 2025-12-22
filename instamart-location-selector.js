import { Builder, By, Key, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Swiggy Instamart scraper using Selenium only:
 * 1. Open Instamart
 * 2. Set location (default: Mumbai) via "Search for an area or address" dialog
 * 3. Open search and search for a product (default: "lays")
 * 4. Collect products from HTML plus card clicks to get clean product URLs
 * 5. Save results to JSON/HTML and return a structured object
 */

const INSTAMART_URL = 'https://www.swiggy.com/instamart';

/**
 * Enhanced extraction using multiple HTML/JSON strategies.
 * Returns array of { name, price, url, image_url }.
 */
function extractProductsEnhanced(htmlContent) {
  const products = [];

  const excludedTexts = [
    'Careers',
    'Swiggy One',
    'Swiggy Instamart',
    'Home',
    'Cart',
    'Search',
    'Menu',
    'Login',
    'Sign',
    'Add',
    'Remove',
    'Quantity',
    'View Cart',
    'Checkout',
    'Delivery',
    'Pickup',
    'Filters',
    'Sort',
    'Categories',
    'View All',
    'See All',
    'More',
    'Less',
    'Close',
    'Back',
    'Next',
    'Previous',
    'Try Again'
  ];

  // Strategy 1: window.___INITIAL_STATE___ JSON
  try {
    const jsonMatch = htmlContent.match(
      /window\.___INITIAL_STATE___\s*=\s*(\{[\s\S]*?\});/
    );
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);

        function findProducts(obj) {
          let list = [];
          if (!obj || typeof obj !== 'object') return list;

          if (Array.isArray(obj)) {
            for (const item of obj) {
              list = list.concat(findProducts(item));
            }
            return list;
          }

          const hasId =
            obj.id ||
            obj.productId ||
            obj.itemId ||
            obj.product_id ||
            obj.item_id;
          const hasName =
            obj.name ||
            obj.title ||
            obj.productName ||
            obj.itemName ||
            obj.displayName ||
            obj.product_name;

          if (hasId && hasName) {
            list.push(obj);
          }

          for (const [key, value] of Object.entries(obj)) {
            if (
              ['product', 'item', 'catalog', 'search'].some((term) =>
                key.toLowerCase().includes(term)
              )
            ) {
              if (Array.isArray(value)) {
                for (const v of value) {
                  if (typeof v === 'object') list.push(v);
                }
              } else if (value && typeof value === 'object') {
                list.push(value);
              }
            }
            list = list.concat(findProducts(value));
          }
          return list;
        }

        const found = findProducts(data);
        for (const p of found) {
          if (typeof p !== 'object' || !p) continue;

          const product = {};

          const name =
            p.name ||
            p.title ||
            p.productName ||
            p.itemName ||
            p.displayName ||
            p.product_name;
          if (name && typeof name === 'string' && name.trim().length > 2) {
            product.name = name.trim();
          }

          const priceVal =
            p.price || p.sellingPrice || p.finalPrice || p.mrp || p.actualPrice;
          if (priceVal) {
            if (typeof priceVal === 'number') {
              product.price = `₹${Math.round(priceVal)}`;
            } else if (typeof priceVal === 'string') {
              const m = priceVal.match(/(\d+)/);
              if (m) product.price = `₹${m[1]}`;
            }
          }

          const id =
            p.id ||
            p.productId ||
            p.itemId ||
            p.product_id ||
            p.item_id;
          const url =
            p.url || p.link || p.productUrl || p.product_url || p.href;

          if (url && typeof url === 'string' && url.includes('/instamart/')) {
            product.url = url.startsWith('http')
              ? url
              : `https://www.swiggy.com${url}`;
          } else if (id) {
            product.url = `https://www.swiggy.com/instamart/product/${id}`;
          }

          // Try multiple image field names
          const img =
            p.image ||
            p.img ||
            p.imageUrl ||
            p.image_url ||
            p.media ||
            p.mediaUrl ||
            (Array.isArray(p.images) && p.images[0]) ||
            (Array.isArray(p.media) && p.media[0]) ||
            p.productImage ||
            p.product_image ||
            p.thumbnail ||
            p.thumb ||
            p.picture ||
            p.photo;
          
          if (img) {
            if (typeof img === 'string') {
              product.image_url = img;
            } else if (typeof img === 'object' && img.url) {
              product.image_url = img.url;
            } else if (typeof img === 'object' && img.src) {
              product.image_url = img.src;
            }
          }

          if (product.name || product.price || product.url) {
            products.push(product);
          }
        }
      } catch {
        // ignore JSON parse
      }
    }
  } catch {
    // ignore strategy errors
  }

  // Strategy 2: product card chunks
  const cardPatterns = [
    /<div[^>]*class="[^"]*_3Rr1X[^"]*"[^>]*>/gi,
    /<div[^>]*data-testid="[^"]*product[^"]*"[^>]*>/gi,
    /<div[^>]*data-testid="[^"]*item[^"]*"[^>]*>/gi
  ];

  const allMatches = [];
  for (const pattern of cardPatterns) {
    let m;
    while ((m = pattern.exec(htmlContent)) !== null) {
      allMatches.push(m.index);
    }
  }
  const positions = [...new Set(allMatches)].sort((a, b) => a - b);

  for (const pos of positions) {
    const chunk = htmlContent.slice(
      Math.max(0, pos - 500),
      Math.min(htmlContent.length, pos + 4000)
    );
    const product = {};

    const urlMatch = chunk.match(
      /["']([^"']*instamart\/product\/(\d+)[^"']*)["']/i
    );
    if (urlMatch) {
      product.url = urlMatch[1].startsWith('http')
        ? urlMatch[1]
        : `https://www.swiggy.com${urlMatch[1]}`;
    } else {
      const idMatch = chunk.match(
        /data-(?:item|product)-id=["'](\d+)["']/i
      );
      if (idMatch) {
        product.url = `https://www.swiggy.com/instamart/product/${idMatch[1]}`;
      }
    }

    const priceMatch =
      chunk.match(/₹\s*(\d+)/) ||
      chunk.match(/class="[^"]*_2jn41[^"]*"[^>]*>(\d+)/i);
    if (priceMatch) {
      const val = parseInt(priceMatch[1], 10);
      if (val >= 1 && val <= 10000) {
        product.price = `₹${val}`;
      }
    }

    let name = null;

    const altMatch = chunk.match(/<img[^>]*alt=["']([^"']+)["']/i);
    if (altMatch) {
      const text = altMatch[1].trim();
      if (
        text.length > 2 &&
        text.length < 200 &&
        !excludedTexts.some((ex) => text.includes(ex))
      ) {
        name = text;
      }
    }

    if (!name) {
      const titleMatch =
        chunk.match(
          /<[^>]*class="[^"]*(?:title|name)[^"]*"[^>]*>([^<]+)<\//i
        ) || chunk.match(/<h[234][^>]*>([^<]+)<\/h[234]>/i);
      if (titleMatch) {
        const text = titleMatch[1].trim();
        if (
          text.length > 2 &&
          text.length < 200 &&
          !excludedTexts.some((ex) => text.includes(ex))
        ) {
          name = text;
        }
      }
    }

    if (!name) {
      const textOnly = chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const priceIdx = textOnly.indexOf('₹');
      if (priceIdx > 0) {
        const beforePrice = textOnly
          .slice(Math.max(0, priceIdx - 100), priceIdx)
          .trim();
        const parts = beforePrice
          .split(/[|•\-\n\r\t]+/)
          .map((s) => s.trim());
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          if (
            p.length > 2 &&
            p.length < 100 &&
            !excludedTexts.some((ex) => p.includes(ex)) &&
            !/^[\d\s₹]+$/.test(p)
          ) {
            name = p;
            break;
          }
        }
      }
    }

    if (name) product.name = name;

    // Try multiple image extraction patterns
    let imgMatch = chunk.match(
      /<img[^>]*src=["'](https:\/\/instamart-media-assets\.swiggy\.com[^"']+)["']/i
    );
    if (!imgMatch) {
      // Try data-src or lazy loading
      imgMatch = chunk.match(
        /<img[^>]*(?:data-src|data-lazy-src|data-image)=["'](https:\/\/instamart-media-assets\.swiggy\.com[^"']+)["']/i
      );
    }
    if (!imgMatch) {
      // Try any swiggy image URL
      imgMatch = chunk.match(
        /(https:\/\/instamart-media-assets\.swiggy\.com\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp))/i
      );
    }
    if (!imgMatch) {
      // Try background-image in style
      imgMatch = chunk.match(
        /background-image:\s*url\(["']?(https:\/\/instamart-media-assets\.swiggy\.com[^"')]+)["']?\)/i
      );
    }
    if (imgMatch && imgMatch[1]) {
      let imgUrl = imgMatch[1];
      // Clean up URL if needed
      if (imgUrl.includes('MARKETING_BANNERS') || imgUrl.includes('OFFERS')) {
        // Skip marketing images
      } else {
        product.image_url = imgUrl;
      }
    }

    if (Object.keys(product).length > 0) {
      products.push(product);
    }
  }

  // Strategy 3: image-based fallback
  const imgPattern =
    /<img[^>]*src=["'](https:\/\/instamart-media-assets\.swiggy\.com\/swiggy\/image\/upload[^"']+)["']/gi;
  let imgMatch;
  while ((imgMatch = imgPattern.exec(htmlContent)) !== null) {
    const imgUrl = imgMatch[1];
    if (
      imgUrl.includes('MARKETING_BANNERS') ||
      imgUrl.includes('OFFERS')
    )
      continue;

    if (products.some((p) => p.image_url === imgUrl)) continue;

    const context = htmlContent.slice(
      Math.max(0, imgMatch.index - 1500),
      Math.min(htmlContent.length, imgMatch.index + 2500)
    );
    const product = { image_url: imgUrl };

    const urlMatch2 = context.match(
      /["']([^"']*instamart\/product[^"']*)["']/i
    );
    if (urlMatch2) {
      product.url = urlMatch2[1].startsWith('http')
        ? urlMatch2[1]
        : `https://www.swiggy.com${urlMatch2[1]}`;
    }

    const priceMatch2 = context.match(/₹\s*(\d+)/);
    if (priceMatch2) {
      const val = parseInt(priceMatch2[1], 10);
      if (val >= 1 && val <= 10000) product.price = `₹${val}`;
    }

    const altMatch2 = context.match(/<img[^>]*alt=["']([^"']+)["']/i);
    if (altMatch2) {
      const text = altMatch2[1].trim();
      if (
        text.length > 2 &&
        text.length < 200 &&
        !excludedTexts.some((ex) => text.includes(ex))
      ) {
        product.name = text;
      }
    }

    if (Object.keys(product).length > 1) {
      products.push(product);
    }
  }

  const seenUrls = new Set();
  const seenNamePrice = new Set();
  const unique = [];

  for (const p of products) {
    const url = p.url;
    const name = p.name || '';
    const price = p.price || '';
    const namePriceKey = `${name}|${price}`;

    if (url) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        unique.push(p);
      }
    } else if (namePriceKey !== '|' && !seenNamePrice.has(namePriceKey)) {
      seenNamePrice.add(namePriceKey);
      unique.push(p);
    }
  }

  return unique;
}

// Minimal stealth: patch common bot-detection signals in the page context
async function executeStealthScripts(driver) {
  try {
    await driver.executeScript(`
      // navigator.webdriver -> undefined
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // fake chrome object
      window.chrome = window.chrome || { runtime: {} };

      // override permissions.query
      try {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters && parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters)
        );
      } catch (e) {}

      // plugins
      try {
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
      } catch (e) {}

      // languages
      try {
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
      } catch (e) {}

      // platform
      try {
        Object.defineProperty(navigator, 'platform', {
          get: () => 'Win32',
        });
      } catch (e) {}
    `);
  } catch {
    // ignore stealth failures
  }
}

// Detect the "Something went wrong" error page and reload a few times
async function recoverFromErrorPage(driver, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const hasError = await driver
        .findElement(
          By.xpath(
            '//*[contains(text(), "Something went wrong") or contains(text(), "Something\'s not right") or contains(text(), "Oops")]'
          )
        )
        .then(() => true)
        .catch(() => false);

      if (!hasError) return; // we're good

      console.log(
        `⚠️  Swiggy error page detected, reloading... (attempt ${attempt}/${maxRetries})`
      );

      // Prefer clicking the "Try Again/Retry" button if present
      const retryButton = await driver
        .findElement(
          By.xpath(
            '//*[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "try again") or contains(translate(@aria-label, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "try again") or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "retry")]'
          )
        )
        .catch(() => null);

      if (retryButton) {
        await retryButton.click();
      } else {
        await driver.navigate().refresh();
      }

      await driver.sleep(4000);
      await executeStealthScripts(driver);
    } catch {
      // Ignore and break out if anything unexpected happens
      return;
    }
  }
}

// Set location (default Mumbai) using the "Search for an area" dialog
async function setLocation(driver, locationName = 'Mumbai') {
  const targetLocation = locationName || 'Mumbai';

  // Open Instamart home
  await driver.get(INSTAMART_URL);
  await driver.sleep(3000);
  await recoverFromErrorPage(driver);

  // Click "Search for an area or address" in the location dialog/header
  const locationTriggerXpath =
    '//*[contains(text(), "Search for an area") or contains(@placeholder, "Search for an area") or contains(@placeholder, "area or address")]';

  const locationTrigger = await driver.wait(
    until.elementLocated(By.xpath(locationTriggerXpath)),
    15000
  );
  await driver.sleep(1000);
  await locationTrigger.click();
  await driver.sleep(1500);

  // Find the actual input / textbox inside the dialog
  const locationInput = await driver.wait(
    until.elementLocated(
      By.xpath('//input | //*[@contenteditable="true"] | //*[@role="textbox"]')
    ),
    10000
  );

  // Clear and type the location in a human‑like way
  try {
    await locationInput.clear();
  } catch {
    // some implementations don't support clear(), ignore
  }

  for (const ch of targetLocation) {
    await locationInput.sendKeys(ch);
    await driver.sleep(80 + Math.random() * 120);
  }

  await driver.sleep(2000);

  // Try to click a suggestion that matches our location
  const locLower = targetLocation.toLowerCase();
  const primarySuggestionXpath =
    `//*[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "${locLower}") and not(self::input) and not(ancestor::input)][1]`;

  let suggestion;
  try {
    suggestion = await driver.wait(
      until.elementLocated(By.xpath(primarySuggestionXpath)),
      7000
    );
  } catch {
    // Fallback: any suggestion that contains the first word
    const firstWord = targetLocation.split(/\s+/)[0] || targetLocation;
    const firstWordLower = firstWord.toLowerCase();
    const anyLocXpath =
      `//*[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "${firstWordLower}") and not(self::input) and not(ancestor::input)][1]`;
    suggestion = await driver.wait(
      until.elementLocated(By.xpath(anyLocXpath)),
      7000
    );
  }

  // Scroll suggestion into view and wait for any overlays to disappear
  await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', suggestion);
  await driver.sleep(1000);
  
  // Wait for element to be visible and clickable
  await driver.wait(until.elementIsVisible(suggestion), 5000);
  
  // Try to close any overlays that might be blocking
  try {
    const overlays = await driver.findElements(
      By.xpath('//div[contains(@class, "overlay")] | //div[contains(@class, "backdrop")] | //div[contains(@style, "z-index") and number(translate(substring-after(@style, "z-index:"), " ", "")) > 1000]')
    );
    for (const overlay of overlays) {
      try {
        const isDisplayed = await overlay.isDisplayed();
        if (isDisplayed) {
          // Try to click outside or close it
          await driver.executeScript('arguments[0].style.display = "none";', overlay);
        }
      } catch (e) {
        // Ignore overlay errors
      }
    }
  } catch (e) {
    // No overlays found, continue
  }
  
  await driver.sleep(500);
  
  // Try clicking with multiple strategies
  let clicked = false;
  try {
    await suggestion.click();
    clicked = true;
  } catch (clickError) {
    // If regular click fails, try JavaScript click
    try {
      await driver.executeScript('arguments[0].click();', suggestion);
      clicked = true;
      console.log('✓ Location suggestion clicked using JavaScript');
    } catch (jsClickError) {
      // If JavaScript click also fails, try moving to element and clicking
      try {
        const actions = driver.actions();
        await actions.move({ origin: suggestion }).click().perform();
        clicked = true;
        console.log('✓ Location suggestion clicked using actions');
      } catch (actionsError) {
        console.log('⚠️  Could not click location suggestion, trying Enter key...');
        // Last resort: press Enter on the input
        try {
          await locationInput.sendKeys(Key.ENTER);
          clicked = true;
          console.log('✓ Location selected using Enter key');
        } catch (enterError) {
          throw new Error(`Could not select location suggestion: ${clickError.message}`);
        }
      }
    }
  }
  
  if (clicked) {
    await driver.sleep(1500);
  }

  // Click "Confirm location" / "Confirm" if present
  const confirmXpath =
    '//*[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "confirm location") or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "confirm")][1]';

  try {
    const confirmBtn = await driver.wait(
      until.elementLocated(By.xpath(confirmXpath)),
      8000
    );
    await driver.sleep(500);
    
    // Try multiple click strategies for confirm button too
    try {
      await confirmBtn.click();
      } catch (e) {
      try {
        await driver.executeScript('arguments[0].click();', confirmBtn);
      } catch (e2) {
        const actions = driver.actions();
        await actions.move({ origin: confirmBtn }).click().perform();
      }
    }
    
    await driver.sleep(3000);
  } catch {
    // If confirm is not visible, assume location is already set
  }
  
  // Verify location was actually set
  await driver.sleep(2000);
  const locationSet = await driver.executeScript(`
    try {
      const location = localStorage.getItem('swiggy_location') || 
                       localStorage.getItem('instamart_location') ||
                       sessionStorage.getItem('swiggy_location') ||
                       sessionStorage.getItem('instamart_location');
      return location !== null && location !== '';
    } catch (e) {
            return false;
          }
  `);
  
  if (!locationSet) {
    console.log('⚠️  Warning: Location may not have been set correctly in browser storage');
  } else {
    console.log('✓ Location verified in browser storage after setting');
  }
}

// Search for a product (e.g. "lays"), extract products and click cards to get clean URLs
async function searchAndExtract(driver, productName = 'lays') {
  const query = productName || 'lays';

  // Verify location is set before searching
  const locationBeforeSearch = await driver.executeScript(`
    try {
      const location = localStorage.getItem('swiggy_location') || 
                       localStorage.getItem('instamart_location') ||
                       sessionStorage.getItem('swiggy_location') ||
                       sessionStorage.getItem('instamart_location');
      return location || null;
        } catch (e) {
      return null;
    }
  `);
  
  if (!locationBeforeSearch) {
    console.log('⚠️  Location not found in storage before search, but continuing...');
  } else {
    console.log(`✓ Location found in storage: ${locationBeforeSearch}`);
  }

  // Go directly to Instamart search page (more robust than clicking header button)
  await driver.get('https://www.swiggy.com/instamart/search?custom_back=true');
  await driver.sleep(3000);
  await recoverFromErrorPage(driver);
  
  // Verify location is still set after navigation
  const locationAfterNav = await driver.executeScript(`
    try {
      const location = localStorage.getItem('swiggy_location') || 
                       localStorage.getItem('instamart_location') ||
                       sessionStorage.getItem('swiggy_location') ||
                       sessionStorage.getItem('instamart_location');
      return location || null;
    } catch (e) {
      return null;
    }
  `);
  
  if (!locationAfterNav) {
    console.log('⚠️  Location lost after navigation! This may cause search to fail.');
  }

  const searchInput = await driver.wait(
    until.elementLocated(
      By.xpath(
        '//input | //*[@contenteditable="true"] | //*[@role="textbox" and contains(@aria-label, "Search")]'
      )
    ),
      10000
    );

  // Type the query and submit
  try {
    await searchInput.clear();
  } catch {
    // ignore
  }
  for (const ch of query) {
    await searchInput.sendKeys(ch);
      await driver.sleep(80 + Math.random() * 120);
  }
  await driver.sleep(2500);

  // Try to click a suggestion matching the product name
    let suggestionClicked = false;
  try {
    const pattern =
      query.toLowerCase().includes('lay') ? "Lay'" : query;
    const suggestionXpath =
      `//*[contains(text(), "${pattern}") or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "${query.toLowerCase()}")][1]`;
          const suggestion = await driver.wait(
      until.elementLocated(By.xpath(suggestionXpath)),
      5000
          );
    
    // Scroll into view and wait
            await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', suggestion);
            await driver.sleep(500);
    await driver.wait(until.elementIsVisible(suggestion), 3000);
    
    // Try multiple click strategies
            try {
              await suggestion.click();
              suggestionClicked = true;
    } catch (clickError) {
      try {
              await driver.executeScript('arguments[0].click();', suggestion);
              suggestionClicked = true;
      } catch (jsError) {
        try {
          const actions = driver.actions();
          await actions.move({ origin: suggestion }).click().perform();
          suggestionClicked = true;
        } catch (actionsError) {
          // Will fall back to Enter key
        }
      }
    }
  } catch {
    // Fallback: press Enter if suggestion not found
    }

    if (!suggestionClicked) {
    await searchInput.sendKeys(Key.ENTER);
  }

  await driver.sleep(5000);
  await recoverFromErrorPage(driver);

  const searchResultsUrl = await driver.getCurrentUrl();
  console.log(`✅ Reached search results page for "${query}":`, searchResultsUrl);

  // Check if we're on an error page
  const isErrorPage = await driver.executeScript(`
    return document.body.innerText.includes('Something went wrong') || 
           document.body.innerText.includes('went wrong') ||
           document.querySelector('#errorDiv')?.style.display !== 'none' ||
           document.querySelector('.errorContainer') !== null;
  `);
  
  if (isErrorPage) {
    console.log('⚠️  Error page detected, attempting recovery...');
    await recoverFromErrorPage(driver, 5);
    await driver.sleep(5000);
    
    // Check again
    const stillError = await driver.executeScript(`
      return document.body.innerText.includes('Something went wrong') || 
             document.body.innerText.includes('went wrong');
    `);
    if (stillError) {
      throw new Error('Page is showing error state and could not recover. Location may not be set correctly or service may be unavailable.');
    }
  }

  // Verify location is set by checking localStorage or URL
  const locationVerified = await driver.executeScript(`
    try {
      const location = localStorage.getItem('swiggy_location') || 
                       localStorage.getItem('instamart_location') ||
                       sessionStorage.getItem('swiggy_location');
      return location !== null && location !== '';
    } catch (e) {
      return false;
    }
  `);
  
  if (!locationVerified) {
    console.log('⚠️  Location may not be set correctly, but continuing...');
  } else {
    console.log('✓ Location verified in browser storage');
  }

  // Wait for products to actually load (React app needs time to render)
  console.log('⏳ Waiting for products to load...');
  
  // Wait for product cards to appear in the DOM
  let productsLoaded = false;
    try {
      await driver.wait(async () => {
        try {
        // First check if we're still on error page
        const hasError = await driver.executeScript(`
          return document.body.innerText.includes('Something went wrong') || 
                 document.body.innerText.includes('went wrong');
        `);
        if (hasError) {
          return false; // Don't proceed if error page
        }
        
        // Check for product cards
        const cards = await driver.findElements(
          By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"] | //a[contains(@href, "/instamart/item/")]')
        );
        if (cards.length > 0) {
          productsLoaded = true;
          console.log(`✓ Found ${cards.length} product cards`);
          return true;
        }
        
        // Also check for product links in the page
        const productLinks = await driver.executeScript(`
          return document.querySelectorAll('a[href*="/instamart/item/"]').length;
        `);
        if (productLinks > 0) {
          productsLoaded = true;
          console.log(`✓ Found ${productLinks} product links`);
          return true;
        }
        
        // Check for any product-related elements
        const hasProducts = await driver.executeScript(`
          const hasCards = document.querySelectorAll('[data-testid*="item"], [data-testid*="product"], [class*="product-card"], [class*="item-card"]').length > 0;
          const hasLinks = document.querySelectorAll('a[href*="/item/"], a[href*="/product/"]').length > 0;
          return hasCards || hasLinks;
        `);
        if (hasProducts) {
          productsLoaded = true;
          console.log(`✓ Found product-related elements`);
          return true;
        }
        
        return false;
        } catch (e) {
          return false;
        }
    }, 30000); // Wait up to 30 seconds for products to load
    } catch (e) {
    console.log('⚠️  Timeout waiting for products, continuing anyway...');
    // Take a screenshot for debugging
    try {
      const screenshot = await driver.takeScreenshot();
      fs.writeFileSync('instamart-no-products-timeout.png', screenshot, 'base64');
      console.log('📸 Debug screenshot saved: instamart-no-products-timeout.png');
    } catch (screenshotError) {
      // Ignore
    }
  }

  // Scroll to trigger lazy loading
  console.log('📜 Scrolling to load more products...');
  await driver.executeScript('window.scrollTo(0, document.body.scrollHeight);');
  await driver.sleep(2000);
  await driver.executeScript('window.scrollTo(0, 0);');
  await driver.sleep(2000);

  // Wait a bit more for any remaining products to render
  await driver.sleep(3000);

  // Get full HTML of the page (now that products should be loaded)
  const html = await driver.getPageSource();

  // Extract product data from raw HTML using extractProductsEnhanced
  let products = extractProductsEnhanced(html);

  console.log(`\n📦 Extracted ${products.length} products from HTML\n`);

  // If HTML extraction returned 0 products, try extracting directly from DOM
  if (products.length === 0) {
    console.log('⚠️  HTML extraction returned 0 products, trying DOM extraction...');
    try {
      const domProducts = await driver.executeScript(`
        const products = [];
        const excludedTexts = ['Careers', 'Swiggy One', 'Swiggy Instamart', 'Home', 'Cart', 'Search', 'Menu', 'Login', 'Sign', 'Add', 'Remove'];
        
        // Find all product links
        const productLinks = document.querySelectorAll('a[href*="/instamart/item/"]');
    const seenUrls = new Set();

        productLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (!href || seenUrls.has(href)) return;
          seenUrls.add(href);
          
          // Extract product info from the link's context
          const card = link.closest('[data-testid*="item-collection-card"], [data-testid*="item"], [class*="card"]') || link.parentElement;
          if (!card) return;
          
          const product = { url: href.startsWith('http') ? href : 'https://www.swiggy.com' + href };
          
          // Try to find product name
          const nameEl = card.querySelector('[class*="name"], [class*="title"], h1, h2, h3, h4');
          if (nameEl) {
            const name = nameEl.innerText?.trim();
            if (name && name.length > 2 && name.length < 200 && !excludedTexts.some(ex => name.includes(ex))) {
              product.name = name;
            }
          }
          
          // Try to find price
          const priceEl = card.querySelector('[class*="price"], [class*="amount"]');
          if (priceEl) {
            const priceText = priceEl.innerText || priceEl.textContent || '';
            const priceMatch = priceText.match(/₹\\s*(\\d+)/) || priceText.match(/Rs\\.?\\s*(\\d+)/i) || priceText.match(/(\\d+)/);
            if (priceMatch) {
              product.price = '₹' + priceMatch[1];
            }
          }
          
          // If no price found, try searching the whole card
          if (!product.price) {
            const cardText = card.innerText || card.textContent || '';
            const priceMatch = cardText.match(/₹\\s*(\\d+)/) || cardText.match(/(\\d+)/);
            if (priceMatch) {
              const price = parseInt(priceMatch[1]);
              if (price >= 1 && price <= 10000) {
                product.price = '₹' + price;
              }
            }
          }
          
          // Try to find image - check multiple sources
          let imageUrl = null;
          
          // Try direct img element
          const imgEl = card.querySelector('img');
          if (imgEl) {
            imageUrl = imgEl.src || imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src');
          }
          
          // If no image found, try background-image style
          if (!imageUrl) {
            const bgEl = card.querySelector('[style*="background-image"], [style*="backgroundImage"]');
            if (bgEl) {
              const style = bgEl.getAttribute('style') || window.getComputedStyle(bgEl).backgroundImage;
              const bgMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
              if (bgMatch && bgMatch[1]) {
                imageUrl = bgMatch[1];
              }
            }
          }
          
          // Try data attributes
          if (!imageUrl) {
            imageUrl = card.getAttribute('data-image') || 
                      card.getAttribute('data-img') || 
                      card.getAttribute('data-image-url');
          }
          
          // Try finding image in nested elements
          if (!imageUrl) {
            const nestedImg = card.querySelector('[class*="image"], [class*="img"], [class*="product-image"], [class*="item-image"]');
            if (nestedImg) {
              const nestedImgEl = nestedImg.querySelector('img');
              if (nestedImgEl) {
                imageUrl = nestedImgEl.src || nestedImgEl.getAttribute('src') || nestedImgEl.getAttribute('data-src');
              } else if (nestedImg.style.backgroundImage) {
                const bgMatch = nestedImg.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
                if (bgMatch && bgMatch[1]) {
                  imageUrl = bgMatch[1];
                }
              }
            }
          }
          
          if (imageUrl && imageUrl.startsWith('http')) {
            product.image_url = imageUrl;
          } else if (imageUrl && imageUrl.startsWith('//')) {
            product.image_url = 'https:' + imageUrl;
          } else if (imageUrl && imageUrl.startsWith('/')) {
            product.image_url = 'https://www.swiggy.com' + imageUrl;
          }
          
          if (product.url) {
            products.push(product);
          }
        });
        
        return products;
      `);
      
      if (domProducts && domProducts.length > 0) {
        products = domProducts;
        console.log(`✓ Extracted ${domProducts.length} products from DOM\n`);
      } else {
        console.log(`⚠️  DOM extraction returned ${domProducts?.length || 0} products`);
        
        // Additional debugging - check what's actually on the page
        const pageInfo = await driver.executeScript(`
          return {
            url: window.location.href,
            title: document.title,
            hasErrorDiv: document.getElementById('errorDiv')?.style.display !== 'none',
            hasErrorContainer: document.querySelector('.errorContainer') !== null,
            bodyText: document.body.innerText.substring(0, 500),
            productLinks: document.querySelectorAll('a[href*="/instamart/item/"]').length,
            productLinks2: document.querySelectorAll('a[href*="/item/"]').length,
            cards: document.querySelectorAll('[data-testid*="item"], [data-testid*="product"]').length,
            allLinks: document.querySelectorAll('a[href]').length
          };
        `);
        console.log('📊 Page info:', JSON.stringify(pageInfo, null, 2));
      }
    } catch (domError) {
      console.log(`⚠️  DOM extraction failed: ${domError.message}`);
      console.log(`Stack: ${domError.stack}`);
    }
  }

  // Normalize URLs from extractProductsEnhanced first
  const normalizeUrl = (url) => {
    if (!url) return null;
    let normalized = url;
    // Convert /product/ to /instamart/item/
    if (normalized.includes('/product/') && !normalized.includes('/instamart/item/')) {
      normalized = normalized.replace(/\/product\//, '/instamart/item/');
    }
    // Convert /item/ to /instamart/item/
    if (normalized.includes('/item/') && !normalized.includes('/instamart/item/')) {
      normalized = normalized.replace(/\/item\//, '/instamart/item/');
    }
    // Ensure full URL
    if (!normalized.startsWith('http')) {
      if (normalized.startsWith('//')) {
        normalized = 'https:' + normalized;
      } else if (normalized.startsWith('/')) {
        normalized = 'https://www.swiggy.com' + normalized;
                  } else {
        normalized = 'https://www.swiggy.com/instamart/item/' + normalized;
      }
    }
    return normalized;
  };

  // First pass: normalize URLs from HTML extraction
  const updatedProducts = products.map((product, idx) => {
    const normalizedUrl = normalizeUrl(product.url);
    if (normalizedUrl && normalizedUrl.includes('/instamart/item/')) {
      return {
        ...product,
        url: normalizedUrl,
        productUrl: normalizedUrl
      };
    }
    return product;
  });

  console.log(`📊 Products with URLs from HTML: ${updatedProducts.filter(p => p.url).length}/${updatedProducts.length}\n`);

  // Find all product cards on the page
  let productCards = await driver.findElements(
    By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
  );

  console.log(`Found ${productCards.length} product cards on page\n`);

  // Second pass: For products without URLs, try to extract from cards or click
  console.log('🔍 Extracting URLs for products missing URLs...\n');

  const maxToProcess = Math.min(productCards.length, updatedProducts.length);
  let processedCount = 0;

  for (let i = 0; i < maxToProcess && processedCount < 20; i++) {
    const product = updatedProducts[i];
    
    // Skip if product already has a valid URL
    if (product.url && product.url.includes('/instamart/item/')) {
      console.log(`[${i + 1}/${maxToProcess}] ✓ Already has URL: ${product.name || 'Unknown'}`);
      continue;
    }

    try {
      // Re-fetch cards each iteration to avoid stale references
      productCards = await driver.findElements(
        By.xpath('//*[@data-testid="item-collection-card-full"] | //*[@data-testid="item-collection-card"]')
      );

      if (i >= productCards.length) {
        // Try to extract URL from HTML using regex as fallback
        const htmlUrlMatch = html.match(new RegExp(`(https://www\\.swiggy\\.com/instamart/item/[A-Z0-9]+)`, 'gi'));
        if (htmlUrlMatch && htmlUrlMatch[i]) {
          updatedProducts[i].url = htmlUrlMatch[i];
          updatedProducts[i].productUrl = htmlUrlMatch[i];
          console.log(`[${i + 1}/${maxToProcess}] ✓ Extracted URL from HTML regex: ${product.name || 'Unknown'}`);
          continue;
        }
        break;
      }

      const card = productCards[i];
      console.log(`[${i + 1}/${maxToProcess}] Processing: ${product.name || 'Unknown'}`);

      // First try to extract URL from card HTML (faster, no navigation needed)
      let productUrl = null;
              try {
                const cardHtml = await driver.executeScript('return arguments[0].outerHTML;', card);
        const hrefMatches = [
          cardHtml.match(/href=["']([^"']*instamart[^"']*item[^"']*[A-Z0-9]+)["']/i),
          cardHtml.match(/href=["']([^"']*\/item\/[A-Z0-9]+)["']/i),
          cardHtml.match(/\/instamart\/item\/([A-Z0-9]+)/i),
          cardHtml.match(/\/item\/([A-Z0-9]+)/i)
        ];
        
        for (const match of hrefMatches) {
          if (match && match[1]) {
            let href = match[1];
                    if (!href.startsWith('http')) {
              if (href.startsWith('/')) {
                        href = 'https://www.swiggy.com' + href;
              } else if (href.includes('/instamart/item/')) {
                href = 'https://www.swiggy.com' + href;
              } else if (href.match(/^[A-Z0-9]+$/)) {
                href = `https://www.swiggy.com/instamart/item/${href}`;
                      } else {
                        href = 'https://www.swiggy.com/instamart/item/' + href;
                      }
                    }
            // Normalize
            href = normalizeUrl(href);
            if (href && href.includes('/instamart/item/')) {
                    productUrl = href;
                    break;
            }
                  }
                }
              } catch (extractError) {
        // Continue to clicking strategy
      }

      // If we got URL from HTML, use it
      if (productUrl) {
        updatedProducts[i].url = productUrl;
        updatedProducts[i].productUrl = productUrl;
        console.log(`  ✅ Extracted URL from card HTML: ${productUrl}`);
        processedCount++;
        continue;
      }

      // If HTML extraction failed, try clicking the card
      await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', card);
      await driver.sleep(1000);

      // Disable any buttons inside the card
                await driver.executeScript(`
                  const card = arguments[0];
                  const buttons = card.querySelectorAll('button, [role="button"]');
                  buttons.forEach(btn => {
                    if (btn.textContent.includes('Add') || btn.textContent.includes('Cart') || btn.getAttribute('data-testid')?.includes('add')) {
                      btn.style.pointerEvents = 'none';
                    }
                  });
                `, card);
                
      await driver.wait(until.elementIsVisible(card), 5000);
      await driver.sleep(500);

      // Try clicking with multiple strategies
      let cardClicked = false;
      try {
                await card.click();
        cardClicked = true;
      } catch (clickError) {
        try {
          await driver.executeScript('arguments[0].click();', card);
          cardClicked = true;
        } catch (jsError) {
          try {
            const actions = driver.actions();
            await actions.move({ origin: card }).click().perform();
            cardClicked = true;
          } catch (actionsError) {
            console.log(`  ⚠️ Could not click card, skipping...`);
          }
        }
      }

      if (cardClicked) {
        await driver.sleep(3000);
                try {
                  await driver.wait(async () => {
                    const currentUrl = await driver.getCurrentUrl();
            return currentUrl !== searchResultsUrl &&
              (currentUrl.includes('/item/') ||
               currentUrl.includes('/instamart/item/') ||
               currentUrl.includes('/product/'));
          }, 10000);
        } catch {
          // Timeout, but continue
        }

        productUrl = normalizeUrl(await driver.getCurrentUrl());
        if (productUrl && productUrl.includes('/instamart/item/')) {
          updatedProducts[i].url = productUrl;
          updatedProducts[i].productUrl = productUrl;
          console.log(`  ✅ Got URL from navigation: ${productUrl}`);
          processedCount++;
        }

        // Navigate back
                await driver.get(searchResultsUrl);
        await driver.sleep(2000);
        await recoverFromErrorPage(driver);
      }

      await driver.sleep(1000);
    } catch (error) {
      console.log(`  ❌ Error processing card ${i + 1}: ${error.message}`);
      // Try to navigate back
      try {
        const currentUrl = await driver.getCurrentUrl();
        if (currentUrl !== searchResultsUrl) {
          await driver.get(searchResultsUrl);
          await driver.sleep(2000);
        }
      } catch (navError) {
        // Ignore
      }
    }
  }

  // If we have fewer updated products than original, add the remaining ones
  if (updatedProducts.length < products.length) {
    for (let i = updatedProducts.length; i < products.length; i++) {
      updatedProducts.push(products[i]);
    }
  }

  console.log(`\n📦 Final product list (${updatedProducts.length} products):\n`);
  updatedProducts.forEach((p, i) => {
    console.log(
      `${i + 1}. ${p.name || 'Unknown'} - ${p.price || 'N/A'}${p.url ? ` [${p.url}]` : ''}`
    );
  });

  // HTML and JSON files are not saved locally (disabled per user request)
  return updatedProducts;
}

// Public API: used by the orchestrator
async function scrapeInstamartProducts(locationName = 'Mumbai', productName = 'lays') {
  let driver;

  try {
    const options = new chrome.Options();

    // Headless toggle via environment variable: HEADLESS=false will show browser
    const isHeadless = process.env.HEADLESS !== 'false';
    if (isHeadless) {
      options.addArguments('--headless=new');
      // Provide a fixed window size for consistent layout in headless mode
      options.addArguments('--window-size=1920,1080');
      console.log('🔇 Swiggy Instamart: running Chrome in headless mode');
    } else {
      options.addArguments('--start-maximized');
      console.log('🖥️ Swiggy Instamart: running Chrome with visible window');
    }

    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-gpu');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments(
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    // @ts-ignore – excludeSwitches exists at runtime
    options.excludeSwitches('enable-automation');

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    await executeStealthScripts(driver);

    // Set location (defaults to Mumbai if caller passes nothing)
    await setLocation(driver, locationName);

    // Search and extract products
    const products = await searchAndExtract(driver, productName);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const jsonData = {
      website: 'Swiggy Instamart',
      location: locationName,
      product: productName,
      timestamp,
      products,
      totalProducts: products.length,
      extractionMethod: 'Selenium (HTML parsing + card clicking)'
    };

    console.log(`\n📊 Total products extracted: ${products.length}`);
    // HTML and JSON files are not saved locally (disabled per user request)

    return jsonData;
  } catch (err) {
    console.error('❌ Error in Instamart scraper:', err);
    throw err;
  } finally {
    if (driver) {
      try {
        await driver.quit();
      } catch {
        // ignore
      }
    }
  }
}

// CLI entrypoint for standalone runs
async function main() {
  const args = process.argv.slice(2);
  const locationArg = args[0] || 'Mumbai';
  const productArg = args[1] || 'lays';

  try {
    await scrapeInstamartProducts(locationArg, productArg);
    console.log('\n✅ Instamart scraping flow completed successfully!');
  } catch (error) {
    console.error('\n❌ Instamart scraping failed:', error.message || error);
    process.exit(1);
  }
}

// Run only if this file is executed directly with Node
const __filename_check = fileURLToPath(import.meta.url);
const __basename = path.basename(__filename_check);
let isMainModule = false;
if (process.argv[1]) {
  try {
    const mainFile = path.resolve(process.argv[1]);
    const currentFile = path.resolve(__filename_check);
    isMainModule =
      mainFile === currentFile || path.basename(mainFile) === __basename;
  } catch (e) {
    isMainModule =
      process.argv[1].endsWith('instamart-location-selector.js') ||
      process.argv[1].includes('instamart-location-selector.js');
  }
}

if (isMainModule) {
  main().catch(console.error);
}

export { scrapeInstamartProducts };



// Dynamic imports - only load the module needed based on website name
import {Builder, By, Key} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

/**
 * PARALLELISM PATTERN - Based on Java Thread/Runnable Pattern
 * 
 * Java Example:
 * ============
 * public class ParallelismDemo {
 *     static class Task implements Runnable {
 *         private String taskName;
 *         Task(String taskName) { this.taskName = taskName; }
 *         @Override
 *         public void run() {
 *             System.out.println(taskName + " running on " + Thread.currentThread().getName());
 *         }
 *     }
 *     public static void main(String[] args) {
 *         Thread t1 = new Thread(new Task("Task 1"));
 *         Thread t2 = new Thread(new Task("Task 2"));
 *         Thread t3 = new Thread(new Task("Task 3"));
 *         t1.start();  // Start parallel execution
 *         t2.start();  // Start parallel execution
 *         t3.start();  // Start parallel execution
 *     }
 * }
 * 
 * JavaScript Equivalent:
 * =====================
 * class WebsiteScrapingTask {
 *     constructor(websiteName, productName, locationName) { ... }
 *     async run() { ... }  // Equivalent to Runnable.run()
 * }
 * 
 * // Create tasks (like Thread t1 = new Thread(new Task("Task 1")))
 * const task1 = new WebsiteScrapingTask("dmart", productName, locationName);
 * const task2 = new WebsiteScrapingTask("jiomart", productName, locationName);
 * const task3 = new WebsiteScrapingTask("naturesbasket", productName, locationName);
 * 
 * // Start all tasks in parallel (like t1.start(); t2.start(); t3.start();)
 * await ParallelExecutor.executeAll([task1, task2, task3]);
 * 
 * This pattern ensures:
 * 1. Each task runs independently (like Java Threads)
 * 2. Tasks execute in parallel (like Thread.start())
 * 3. We wait for all to complete (like Thread.join())
 */

/**
 * Unified orchestrator for location selection and product search across multiple e-commerce sites
 * 
 * Usage:
 *   node location-selector-orchestrator.js <website> <product> <location>
 * 
 * Example:
 *   node location-selector-orchestrator.js dmart potato Mumbai
 *   node location-selector-orchestrator.js jiomart tomato Mumbai
 *   node location-selector-orchestrator.js naturesbasket tomato Mumbai
 *   node location-selector-orchestrator.js zepto Paracetamol Mumbai
 *   node location-selector-orchestrator.js swiggy lays "RT Nagar"
 */

/**
 * Validates website name and returns normalized site identifier
 */
function determineSite(websiteName) {
  const websiteLower = websiteName.toLowerCase().trim();
  
  if (websiteLower === 'dmart' || websiteLower === 'd-mart') {
    return 'dmart';
  } else if (websiteLower === 'jiomart' || websiteLower === 'jeomart') {
    return 'jiomart';
  } else if (websiteLower === 'naturesbasket' || websiteLower === "nature's basket") {
    return 'naturesbasket';
  } else if (websiteLower === 'zepto') {
    return 'zepto';
  } else if (websiteLower === 'swiggy') {
    return 'swiggy';
  } else {
    throw new Error(`Unsupported website: ${websiteName}. Supported websites: dmart, jiomart, naturesbasket, zepto, swiggy`);
  }
}

/**
 * Swiggy Instamart location selection and product search
 */
async function selectLocationAndSearchOnSwiggy(locationName, productName) {
  // Configure Chrome with stealth options to bypass bot detection
  const chromeOptions = new chrome.Options();
  
  // Set binary path if CHROME_BIN environment variable is set
  if (process.env.CHROME_BIN) {
    chromeOptions.setChromeBinaryPath(process.env.CHROME_BIN);
  }
  
  // Anti-detection options
  // Add headless mode if HEADLESS is set
  if (process.env.HEADLESS === 'true') {
    chromeOptions.addArguments('--headless=new');
  }
  chromeOptions.addArguments('--disable-blink-features=AutomationControlled');
  chromeOptions.addArguments('--disable-dev-shm-usage');
  chromeOptions.addArguments('--no-sandbox');
  chromeOptions.addArguments('--disable-setuid-sandbox');
  chromeOptions.addArguments('--disable-web-security');
  chromeOptions.addArguments('--disable-features=IsolateOrigins,site-per-process');
  chromeOptions.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  chromeOptions.excludeSwitches('enable-automation');

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(chromeOptions)
    .build();

  try {
    // Execute script to hide webdriver property
    await driver.executeScript('Object.defineProperty(navigator, "webdriver", {get: () => undefined})');
    
    console.log('Step 1: Navigating to Swiggy Instamart...');
    await driver.get('https://www.swiggy.com/instamart');
    await driver.sleep(5000);

    console.log('Step 2: Clicking on "Search for an area or address"...');
    await driver.sleep(2000);
    const searchArea = await driver.findElement(By.xpath('//*[contains(text(), "Search for an area") or contains(@placeholder, "Search for an area") or contains(@placeholder, "area or address")]'));
    await searchArea.click();
    await driver.sleep(2000);

    console.log(`Step 3: Typing "${locationName}"...`);
    const input = await driver.findElement(By.xpath('//input | //*[@contenteditable="true"] | //*[@role="textbox"]'));
    await input.sendKeys(locationName);
    await driver.sleep(3000);

    console.log(`Step 4: Selecting ${locationName} from suggestions...`);
    // Generate location name variations
    const locationVariations = [
      locationName,
      locationName.replace(/\s+/g, ''),
      locationName.replace(/\s+/g, ' '),
      locationName.toLowerCase(),
      locationName.toUpperCase()
    ];
    const uniqueVariations = [...new Set(locationVariations)];
    
    // Try multiple strategies to find and click suggestion
    let suggestionClicked = false;
    const suggestionStrategies = [];
    
    for (const loc of uniqueVariations) {
      suggestionStrategies.push(`//*[contains(text(), "${loc}")]`);
      suggestionStrategies.push(`//li[contains(text(), "${loc}")]`);
      suggestionStrategies.push(`//div[contains(text(), "${loc}") and not(ancestor::input)]`);
      suggestionStrategies.push(`//*[contains(text(), "${loc}") and not(self::input) and not(ancestor::input)]`);
    }
    
    for (const selector of suggestionStrategies) {
      try {
        const suggestion = await driver.findElement(By.xpath(selector));
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
      } catch (e) {
        continue;
      }
    }
    
    if (!suggestionClicked) {
      throw new Error(`Could not click location suggestion for: ${locationName}`);
    }
    await driver.sleep(2000);

    console.log('Step 5: Clicking Confirm location...');
    const confirmBtn = await driver.findElement(By.xpath('//button[contains(text(), "Confirm")] | //*[contains(text(), "Confirm Location")] | //button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "confirm")]'));
    try {
      await confirmBtn.click();
    } catch (e) {
      await driver.executeScript('arguments[0].click();', confirmBtn);
    }
    await driver.sleep(3000);

    console.log('Step 6: Closing any modal overlay if present...');
    try {
      const closeModal = await driver.findElement(By.xpath('//button[contains(@aria-label, "Close")] | //*[@data-testid="modal-overlay"]'));
      await driver.executeScript('arguments[0].click();', closeModal);
      await driver.sleep(1000);
    } catch (e) {
      // No modal to close
    }

    console.log('Step 6.5: Waiting for page to settle after location confirmation...');
    await driver.sleep(3000);
    
    // Wait for page to be ready after location confirmation
    try {
      await driver.wait(async () => {
        const readyState = await driver.executeScript('return document.readyState');
        return readyState === 'complete';
      }, 10000);
      console.log('✓ Page ready after location confirmation');
    } catch (e) {
      console.log('⚠️  Page ready check timeout, continuing...');
    }

    console.log('Step 7: Finding and clicking search button/icon...');
    // Try multiple strategies to find the search button/icon
    let searchBar = null;
    const searchBarSelectors = [
      '//button[contains(text(), "Search")]',
      '//*[contains(@aria-label, "Search")]',
      '//*[contains(@class, "search") and (self::button or @role="button")]',
      '//button[@type="button" and contains(@class, "search")]',
      '//*[@role="button" and contains(@class, "search")]',
      '//svg[contains(@class, "search")]',
      '//*[contains(@class, "search-icon")]',
      '//button[contains(@class, "icon")]',
      '//*[@data-testid*="search"]',
      '//input[@type="search"]/following-sibling::button',
      '//input[@type="search"]/parent::*/button',
      '//*[contains(@class, "SearchIcon")]',
      '//*[contains(@class, "searchIcon")]'
    ];
    
    for (const selector of searchBarSelectors) {
      try {
        const elements = await driver.findElements(By.xpath(selector));
        for (const element of elements) {
          try {
            const isDisplayed = await element.isDisplayed();
            if (isDisplayed) {
              searchBar = element;
              console.log(`✓ Found search button using: ${selector.substring(0, 60)}...`);
              break;
            }
          } catch (e) {
            continue;
          }
        }
        if (searchBar) break;
      } catch (e) {
        continue;
      }
    }
    
    if (searchBar) {
      try {
        await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', searchBar);
        await driver.sleep(500);
        await searchBar.click();
        console.log('✓ Search button clicked');
        await driver.sleep(2000);
      } catch (e) {
        try {
          await driver.executeScript('arguments[0].click();', searchBar);
          console.log('✓ Search button clicked using JavaScript');
          await driver.sleep(2000);
        } catch (e2) {
          console.log('⚠️  Could not click search button, will try input directly...');
        }
      }
    } else {
      console.log('⚠️  Search button not found - this is okay, will proceed directly to search input');
    }
    
    await driver.sleep(1500);

    console.log(`Step 8: Finding search input field...`);
    // Try multiple strategies to find the search input
    let searchInput = null;
    const inputSelectors = [
      '//input[@type="text" or @type="search" or not(@type)]',
      '//input[contains(@placeholder, "Search") or contains(@placeholder, "search")]',
      '//input[@class and contains(@class, "search")]',
      '//*[@contenteditable="true" and contains(@class, "search")]',
      '//*[@role="textbox" and contains(@class, "search")]',
      '//input[contains(@placeholder, "Search for")]',
      '//input[contains(@placeholder, "What are you looking for")]',
      '//input',
      '//*[@contenteditable="true"]',
      '//*[@role="textbox"]',
      '//*[@data-testid*="search"]',
      '//*[@aria-label*="search" or @aria-label*="Search"]'
    ];
    
    // Wait a bit for search input to appear
    await driver.sleep(2000);
    
    for (const selector of inputSelectors) {
      try {
        const inputs = await driver.findElements(By.xpath(selector));
        for (const input of inputs) {
          try {
            const isDisplayed = await input.isDisplayed();
            if (isDisplayed) {
              // Check if it's actually a search input (not hidden, has reasonable size)
              const rect = await input.getRect();
              if (rect.width > 50 && rect.height > 10) {
                searchInput = input;
                console.log(`✓ Found search input using: ${selector.substring(0, 60)}...`);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
        if (searchInput) break;
      } catch (e) {
        continue;
      }
    }
    
    if (!searchInput) {
      console.log('⚠️  Could not find search input, trying to navigate directly to search URL...');
      // Fallback: try to navigate directly to search URL
      const searchUrl = `https://www.swiggy.com/search?query=${encodeURIComponent(productName)}`;
      try {
        await driver.get(searchUrl);
        await driver.sleep(5000);
        console.log('✓ Navigated directly to search URL');
        // Try to find search input again after navigation
        for (const selector of inputSelectors) {
          try {
            const input = await driver.findElement(By.xpath(selector));
            const isDisplayed = await input.isDisplayed();
            if (isDisplayed) {
              searchInput = input;
              console.log(`✓ Found search input after navigation using: ${selector.substring(0, 60)}...`);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        throw new Error('Could not find search input field and navigation to search URL failed');
      }
    }
    
    if (!searchInput) {
      throw new Error('Could not find search input field after all attempts');
    }

    console.log(`Step 9: Clicking on search input to focus...`);
    try {
      await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', searchInput);
      await driver.sleep(500);
      await searchInput.click();
      await driver.sleep(1000);
      console.log('✓ Search input clicked and focused');
    } catch (e) {
      try {
        await driver.executeScript('arguments[0].click();', searchInput);
        await driver.sleep(1000);
        console.log('✓ Search input clicked using JavaScript');
      } catch (e2) {
        console.log('⚠️  Could not click search input, will try typing anyway...');
      }
    }
    
    console.log(`Step 10: Typing "${productName}" slowly in search...`);
    try {
      await searchInput.clear();
      await driver.sleep(500);
    } catch (e) {
      // If clear fails, try selecting all and deleting
      try {
        await searchInput.sendKeys(Key.CONTROL + 'a');
        await driver.sleep(200);
        await searchInput.sendKeys(Key.DELETE);
        await driver.sleep(500);
      } catch (e2) {
        console.log('⚠️  Could not clear search input, will type anyway...');
      }
    }
    
    // Type slowly character by character
    for (let i = 0; i < productName.length; i++) {
      try {
        await searchInput.sendKeys(productName[i]);
        await driver.sleep(300);
      } catch (e) {
        console.log(`⚠️  Error typing character ${i + 1}, continuing...`);
      }
    }
    
    console.log('✓ Product name typed in search');
    console.log('Step 11: Waiting for suggestions to appear...');
    await driver.sleep(4000);

    console.log(`Step 12: Finding and clicking on "${productName}" suggestion...`);
    let productSuggestionClicked = false;
    
    // First, check if suggestions are visible
    try {
      await driver.wait(
        until.elementsLocated(By.xpath('//*[contains(@class, "suggestion") or contains(@class, "autocomplete") or @role="option"]')),
        5000
      );
      console.log('✓ Suggestions dropdown appeared');
    } catch (e) {
      console.log('⚠️  Suggestions dropdown not found, will try pressing Enter...');
    }
    
    const suggestionSelectors = [
      `//div[contains(text(), "${productName}") and not(contains(text(), "display"))]`,
      `//li[contains(text(), "${productName}")]`,
      `//a[contains(text(), "${productName}")]`,
      `//*[@role="option" and contains(text(), "${productName}")]`,
      `//*[contains(., "${productName}") and (self::div or self::li or self::a) and not(ancestor::script)]`,
      `//*[contains(@class, "suggestion") and contains(text(), "${productName}")]`,
      `//*[contains(@class, "autocomplete") and contains(text(), "${productName}")]`
    ];
    
    for (const selector of suggestionSelectors) {
      try {
        const suggestions = await driver.findElements(By.xpath(selector));
        for (const productSuggestion of suggestions) {
          try {
            const isDisplayed = await productSuggestion.isDisplayed();
            if (isDisplayed) {
              await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', productSuggestion);
              await driver.sleep(1000);
              try {
                await productSuggestion.click();
                productSuggestionClicked = true;
                console.log(`✓ Product suggestion clicked: ${productName}`);
                break;
              } catch (e) {
                await driver.executeScript('arguments[0].click();', productSuggestion);
                productSuggestionClicked = true;
                console.log(`✓ Product suggestion clicked (JS): ${productName}`);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
        if (productSuggestionClicked) break;
      } catch (e) {
        continue;
      }
    }
    
    if (!productSuggestionClicked) {
      console.log('⚠️  Product suggestion not found, pressing Enter to search...');
      try {
        await searchInput.sendKeys(Key.ENTER);
        await driver.sleep(3000);
        console.log('✓ Enter pressed to trigger search');
      } catch (e) {
        console.log('⚠️  Could not press Enter, will wait for page to load...');
        await driver.sleep(3000);
      }
    } else {
      console.log('✓ Waiting for search results after clicking suggestion...');
      await driver.sleep(5000);
    }

    console.log('Step 13: Waiting for page to fully load after search...');
    // Wait for URL to change or for search results to appear
    try {
      await driver.wait(async () => {
        const currentUrl = await driver.getCurrentUrl();
        return currentUrl.includes('search') || currentUrl.includes('query');
      }, 10000);
      console.log('✓ URL changed to search page');
    } catch (e) {
      console.log('⚠️  URL check timeout, continuing...');
    }
    
    await driver.sleep(3000);

    console.log('Step 14: Checking for error page...');
    let hasError = false;
    try {
      const errorElement = await driver.findElement(By.xpath('//*[contains(text(), "Something went wrong")] | //*[contains(text(), "Try Again")] | //*[contains(@class, "error")]'));
      hasError = true;
      console.log('Error page detected!');
      await driver.sleep(2000);
      
      let tryAgainClicked = false;
      const tryAgainSelectors = [
        '//button[contains(text(), "Try Again")]',
        '//button[contains(., "Try Again")]',
        '//*[contains(text(), "Try Again") and (@role="button" or self::button)]',
        '//*[@class and contains(text(), "Try Again")]'
      ];
      
      for (const selector of tryAgainSelectors) {
        try {
          const tryAgainButton = await driver.findElement(By.xpath(selector));
          await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', tryAgainButton);
          await driver.sleep(1000);
          try {
            await tryAgainButton.click();
            tryAgainClicked = true;
            break;
          } catch (e) {
            await driver.executeScript('arguments[0].click();', tryAgainButton);
            tryAgainClicked = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (tryAgainClicked) {
        await driver.sleep(5000);
        try {
          const errorCheck = await driver.findElement(By.xpath('//*[contains(text(), "Something went wrong")]'));
          await driver.sleep(5000);
          for (const selector of tryAgainSelectors) {
            try {
              const tryAgainButton2 = await driver.findElement(By.xpath(selector));
              await driver.executeScript('arguments[0].click();', tryAgainButton2);
              await driver.sleep(5000);
              break;
            } catch (e2) {
              continue;
            }
          }
        } catch (e) {
          hasError = false;
        }
      }
    } catch (e) {
      // No error page
    }
    
    if (!hasError) {
      await driver.sleep(3000);
    }

    console.log('Step 15: Waiting for product elements to render...');
    // Wait for product elements to appear (like D-Mart and JioMart)
    try {
      await driver.wait(
        until.elementsLocated(By.css('[data-testid*="product"], [class*="product"], [class*="item-card"], [class*="item"], [class*="ProductCard"]')),
        15000
      );
      console.log('✓ Product elements found');
    } catch (e) {
      console.log('⚠️  Product elements not found, trying alternative selectors...');
      // Try alternative selectors
      try {
        await driver.wait(
          until.elementsLocated(By.xpath('//*[contains(@class, "product") or contains(@class, "item")]')),
          10000
        );
        console.log('✓ Product elements found with alternative selector');
      } catch (e2) {
        console.log('⚠️  Product elements still not found, continuing anyway...');
      }
    }
    
    // Wait for network to be idle
    try {
      await driver.executeScript(`
        return new Promise((resolve) => {
          if (document.readyState === 'complete') {
            setTimeout(resolve, 2000);
          } else {
            window.addEventListener('load', () => setTimeout(resolve, 2000));
          }
        });
      `);
      console.log('✓ Page fully loaded');
    } catch (e) {
      console.log('⚠️  Page load check failed, continuing...');
    }
    
    // Additional wait to ensure all dynamic content is loaded (like D-Mart)
    console.log('Waiting 3 seconds for dynamic content to fully load...');
    await driver.sleep(3000);
    
    console.log('Getting final page HTML...');
    const html = await driver.getPageSource();
    
    await driver.quit();
    return html;
    
  } catch (error) {
    await driver.quit();
    throw error;
  }
}


/**
 * Execute location selection and product search on a single website
 */
async function executeOnWebsite(websiteName, productName, locationName) {
  const site = determineSite(websiteName);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${websiteName.toUpperCase()}`);
  console.log(`Product: ${productName}`);
  console.log(`Location: ${locationName}`);
  console.log(`${'='.repeat(60)}\n`);

  let pageHtml;

  try {
    let jsonData = null;
    
    if (site === 'dmart') {
      console.log(`Loading D-Mart location selector module...`);
      const { selectLocationAndSearchOnDmart } = await import('./dmart-location-selector.js');
      console.log(`Calling D-Mart location selector and product search...`);
      const result = await selectLocationAndSearchOnDmart(locationName, productName);
      // D-Mart returns JSON object, not HTML
      if (typeof result === 'object' && result !== null) {
        jsonData = result;
        pageHtml = JSON.stringify(result, null, 2);
      } else {
        pageHtml = result;
      }
    } else if (site === 'jiomart') {
      console.log(`Loading JioMart location selector module...`);
      const { selectLocationOnJioMart } = await import('./jiomart-location-selector.js');
      console.log(`Calling JioMart location selector with product: ${productName}...`);
      const result = await selectLocationOnJioMart(locationName, productName);
      // JioMart returns JSON object, not HTML
      if (typeof result === 'object' && result !== null) {
        jsonData = result;
        pageHtml = JSON.stringify(result, null, 2);
      } else {
        pageHtml = result;
      }
    } else if (site === 'naturesbasket') {
      console.log(`Loading Nature's Basket location selector module...`);
      const { selectLocationOnNaturesBasket } = await import('./naturesbasket-location-selector.js');
      console.log(`Calling Nature's Basket location selector with product: ${productName}...`);
      const result = await selectLocationOnNaturesBasket(locationName, productName);
      // Nature's Basket returns JSON object, not HTML
      if (typeof result === 'object' && result !== null) {
        jsonData = result;
        pageHtml = JSON.stringify(result, null, 2);
      } else {
        pageHtml = result;
      }
    } else if (site === 'zepto') {
      console.log(`Loading Zepto location selector module...`);
      const { selectLocationOnZepto } = await import('./zepto-location-selector.js');
      console.log(`Calling Zepto location selector with product: ${productName}...`);
      const result = await selectLocationOnZepto(locationName, productName);
      // Zepto returns JSON object, not HTML
      if (typeof result === 'object' && result !== null) {
        jsonData = result;
        pageHtml = JSON.stringify(result, null, 2);
      } else {
        pageHtml = result;
      }
    } else if (site === 'swiggy') {
      // Swiggy Instamart runs last, after all other websites complete
      console.log(`Running Swiggy Instamart full scraper (executed last after DMart, JioMart, Nature's Basket, and Zepto)...`);
      console.log(`Loading Swiggy Instamart scraper module...`);
      const { scrapeInstamartProducts } = await import('./instamart-location-selector.js');
      console.log(`Calling Swiggy Instamart scraper with location: ${locationName}, product: ${productName}...`);
      // scrapeInstamartProducts returns JSON data, not HTML
      jsonData = await scrapeInstamartProducts(locationName, productName);
      // Convert JSON to string for consistency with other scrapers
      pageHtml = JSON.stringify(jsonData, null, 2);
      console.log(`\n✅ ${websiteName.toUpperCase()} - Process Completed Successfully`);
      console.log(`Products extracted: ${jsonData.products?.length || 0}`);
      console.log(`JSON data length: ${pageHtml.length} characters`);
      console.log(`${'='.repeat(60)}\n`);
      return { website: websiteName, success: true, html: pageHtml, error: null, jsonData: jsonData };
    } else {
      throw new Error(`Unknown site: ${site}`);
    }

    console.log(`\n✅ ${websiteName.toUpperCase()} - Process Completed Successfully`);
    if (jsonData) {
      console.log(`Products extracted: ${jsonData.products?.length || 0}`);
      console.log(`JSON data length: ${pageHtml.length} characters`);
    } else {
      console.log(`Final HTML length: ${pageHtml.length} characters`);
    }
    console.log(`${'='.repeat(60)}\n`);

    return { website: websiteName, success: true, html: pageHtml, error: null, jsonData: jsonData };

  } catch (error) {
    console.error(`\n❌ ${websiteName.toUpperCase()} - Error Occurred`);
    console.error(`Error: ${error.message}`);
    console.error(`${'='.repeat(60)}\n`);
    return { website: websiteName, success: false, html: null, error: error.message };
  }
}

/**
 * Task class - represents a website scraping task (similar to Java Runnable)
 * Each task runs independently and can be executed in parallel
 * 
 * This follows the Java pattern:
 * class Task implements Runnable {
 *   public void run() { ... }
 * }
 */
class WebsiteScrapingTask {
  constructor(websiteName, productName, locationName) {
    this.websiteName = websiteName;
    this.productName = productName;
    this.locationName = locationName;
    this.taskName = `Task ${websiteName.toUpperCase()}`;
  }

  /**
   * Run method - executes the website scraping task
   * Similar to Java's Runnable.run() method
   * This is the equivalent of: public void run() { ... }
   */
  async run() {
    const threadName = `Thread-${this.websiteName}`;
    console.log(`${this.taskName} running on ${threadName}`);
    
    try {
      const result = await executeOnWebsite(this.websiteName, this.productName, this.locationName);
      return result;
    } catch (error) {
      console.error(`${this.taskName} failed on ${threadName}: ${error.message}`);
      return {
        website: this.websiteName,
        success: false,
        html: null,
        error: error.message,
        jsonData: null
      };
    }
  }

  /**
   * Get task name for logging
   */
  getName() {
    return this.taskName;
  }
}

/**
 * Parallel Executor - mimics Java's Thread.start() behavior
 * In Java: Thread t = new Thread(new Task("Task 1")); t.start();
 * In JavaScript: We use Promises to achieve parallel execution
 */
class ParallelExecutor {
  /**
   * Execute multiple tasks in parallel (similar to Thread.start() in Java)
   * @param {Array<WebsiteScrapingTask>} tasks - Array of tasks to execute
   * @returns {Promise<Array>} - Array of results from all tasks
   */
  static async executeAll(tasks) {
    // Start all tasks in parallel (like Thread.start() in Java)
    const promises = tasks.map(task => {
      // This is equivalent to: Thread t = new Thread(task); t.start();
      return task.run();
    });
    
    // Wait for all tasks to complete (like Thread.join() in Java)
    return await Promise.all(promises);
  }

  /**
   * Execute a single task (for sequential execution)
   * @param {WebsiteScrapingTask} task - Task to execute
   * @returns {Promise} - Result from the task
   */
  static async execute(task) {
    return await task.run();
  }
}

/**
 * Main orchestrator function - runs websites in parallel using Task pattern
 * Execution: DMart, JioMart, Nature's Basket, Zepto (parallel) -> Swiggy Instamart (last)
 * 
 * This follows the Java parallelism pattern:
 * 1. Create Task instances (like Java Runnable)
 * 2. Execute all tasks in parallel (like Java Thread.start())
 * 3. Wait for all to complete (like Java Thread.join())
 */
async function selectLocationAndSearchOnAllWebsites(productName, locationName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`LOCATION SELECTOR ORCHESTRATOR`);
  console.log(`Product: ${productName}`);
  console.log(`Location: ${locationName}`);
  console.log(`Running websites in parallel using Task pattern...`);
  console.log(`Execution: DMart, JioMart, Nature's Basket, Zepto (parallel) -> Swiggy Instamart (last)`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];

  // Phase 1: Create and run tasks in parallel (similar to Java Thread pattern)
  // This follows the Java pattern:
  //   Thread t1 = new Thread(new Task("Task 1"));
  //   Thread t2 = new Thread(new Task("Task 2"));
  //   Thread t3 = new Thread(new Task("Task 3"));
  //   t1.start(); t2.start(); t3.start();
  
  const parallelWebsites = ['dmart', 'jiomart', 'naturesbasket', 'zepto'];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 PHASE 1: Creating ${parallelWebsites.length} tasks and running in parallel...`);
  console.log(`${'='.repeat(60)}\n`);

  // Step 1: Create Task instances (like creating Thread objects with Runnable in Java)
  // Java: Thread t1 = new Thread(new Task("Task 1"));
  // JS:   const task1 = new WebsiteScrapingTask("dmart", productName, locationName);
  const tasks = parallelWebsites.map(website => 
    new WebsiteScrapingTask(website, productName, locationName)
  );

  console.log(`Created ${tasks.length} tasks:`);
  tasks.forEach((task, index) => {
    console.log(`  ${index + 1}. ${task.getName()}`);
  });
  console.log('');

  // Step 2: Start all tasks in parallel (like Thread.start() in Java)
  // Java: t1.start(); t2.start(); t3.start();
  // JS:   ParallelExecutor.executeAll(tasks) - starts all tasks in parallel
  const parallelStartTime = Date.now();
  console.log('Starting all tasks in parallel (equivalent to Thread.start())...\n');
  
  // Execute all tasks in parallel using ParallelExecutor (mimics Thread.start())
  const parallelResults = await ParallelExecutor.executeAll(tasks);
  results.push(...parallelResults);

  const parallelDuration = ((Date.now() - parallelStartTime) / 1000).toFixed(2);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ PHASE 1 COMPLETED: All ${parallelWebsites.length} tasks finished in ${parallelDuration}s`);
  console.log(`${'='.repeat(60)}\n`);

  // Phase 2: Run Swiggy Instamart last (after all others complete)
  // This runs sequentially after parallel tasks complete - NO PARALLELISM PATTERN
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 PHASE 2: All previous tasks completed. Now running Swiggy Instamart (last)...`);
  console.log(`${'='.repeat(60)}\n`);

  // Run Swiggy Instamart directly (no Task pattern, no parallelism)
  console.log(`Running Swiggy Instamart scraper directly (no parallelism pattern)...`);
  console.log(`Loading Swiggy Instamart scraper module...`);
  const { scrapeInstamartProducts } = await import('./instamart-location-selector.js');
  console.log(`Calling Swiggy Instamart scraper with location: ${locationName}, product: ${productName}...`);
  
  try {
    // Call scrapeInstamartProducts directly (returns JSON data)
    const jsonData = await scrapeInstamartProducts(locationName, productName);
    const pageHtml = JSON.stringify(jsonData, null, 2);
    
    console.log(`\n✅ SWIGGY INSTAMART - Process Completed Successfully`);
    console.log(`Products extracted: ${jsonData.products?.length || 0}`);
    console.log(`JSON data length: ${pageHtml.length} characters`);
    console.log(`${'='.repeat(60)}\n`);
    
    const swiggyResult = {
      website: 'swiggy',
      success: true,
      html: pageHtml,
      error: null,
      jsonData: jsonData
    };
    results.push(swiggyResult);
  } catch (error) {
    console.error(`\n❌ SWIGGY INSTAMART - Error Occurred`);
    console.error(`Error: ${error.message}`);
    console.error(`${'='.repeat(60)}\n`);
    const swiggyResult = {
      website: 'swiggy',
      success: false,
      html: null,
      error: error.message,
      jsonData: null
    };
    results.push(swiggyResult);
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`EXECUTION SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total websites: ${results.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`${'='.repeat(60)}\n`);

  // Print details
  results.forEach(result => {
    if (result.success) {
      if (result.website === 'swiggy' && result.jsonData) {
        console.log(`✅ ${result.website}: Success (${result.jsonData.products?.length || 0} products extracted)`);
      } else if (result.html && typeof result.html === 'string') {
        console.log(`✅ ${result.website}: Success (HTML length: ${result.html.length} chars)`);
      } else {
        console.log(`✅ ${result.website}: Success (files saved by scraper)`);
      }
    } else {
      console.log(`❌ ${result.website}: Failed - ${result.error}`);
    }
  });

  return results;
}

/**
 * Main execution function
 */
async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node location-selector-orchestrator.js <product> <location>');
    console.error('');
    console.error('Description:');
    console.error('  Automatically selects location and searches for product on ALL websites sequentially.');
    console.error('  URLs are constructed internally based on the website and product name.');
    console.error('');
    console.error('Arguments:');
    console.error('  product   - Product name to search (required)');
    console.error('  location  - Location name to select (required)');
    console.error('');
    console.error('Examples:');
    console.error('  node location-selector-orchestrator.js potato Mumbai');
    console.error('  node location-selector-orchestrator.js tomato Mumbai');
    console.error('  node location-selector-orchestrator.js lays "RT Nagar"');
    console.error('');
    console.error('This will run on all websites:');
    console.error('  - D-Mart');
    console.error('  - JioMart');
    console.error('  - Nature\'s Basket');
    console.error('  - Zepto');
    console.error('  - Swiggy');
    process.exit(1);
  }

  const productName = args[0];
  const locationName = args[1];

  // Validate inputs
  if (!productName || !locationName) {
    console.error('\n❌ Error: Product name and location are required');
    process.exit(1);
  }

  try {
    const results = await selectLocationAndSearchOnAllWebsites(productName, locationName);
    
    // Save HTML files for successful results
    const fsModule = await import('fs');
    const fs = fsModule.default || fsModule;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // HTML and JSON files are not saved locally (disabled per user request)
    // Results are returned in memory only
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`ALL OPERATIONS COMPLETED`);
    console.log(`${'='.repeat(60)}\n`);
    
    return results;
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the script only if called directly (not when imported as a module)
// Check if this file is being run directly
const isMainModule = () => {
  try {
    if (!process.argv[1]) return false;
    const runFile = process.argv[1].replace(/\\/g, '/');
    return runFile.endsWith('location-selector-orchestrator.js') ||
           runFile.includes('location-selector-orchestrator.js');
  } catch (e) {
    return false;
  }
};

if (isMainModule()) {
  main().catch(console.error);
}

/**
 * Extract data from HTML string directly (without file I/O)
 * This function is used by the API to extract data from HTML in memory
 */
async function extractDataFromHtml(html, website, filename = null) {
  try {
    if (!website) {
      console.warn(`⚠️  Website not specified for HTML extraction`);
      return null;
    }

    // Import extraction functions from html-data-selector
    const { extractFromDmart, extractFromJioMart, extractFromNaturesBasket, extractFromZepto, extractFromSwiggy } = await import('./html-data-selector.js');

    let result;
    switch (website.toLowerCase()) {
      case 'dmart':
        result = extractFromDmart(html, filename || 'dmart-page.html');
        break;
      case 'jiomart':
        result = extractFromJioMart(html, filename || 'jiomart-page.html');
        break;
      case 'naturesbasket':
        result = extractFromNaturesBasket(html, filename || 'naturesbasket-page.html');
        break;
      case 'zepto':
        result = extractFromZepto(html, filename || 'zepto-page.html');
        break;
      case 'swiggy':
        result = extractFromSwiggy(html, filename || 'swiggy-page.html');
        break;
      default:
        console.warn(`⚠️  Unknown website: ${website}`);
        return null;
    }

    if (result) {
      console.log(`Extracted data for ${website}: ${result.products?.length || 0} products, location: ${result.location || 'Not found'}`);
    }
    return result;
  } catch (error) {
    console.error(`❌ Error processing HTML for ${website}:`, error.message);
    console.error(`Error stack:`, error.stack);
    return null;
  }
}

export { selectLocationAndSearchOnAllWebsites, executeOnWebsite, determineSite, extractDataFromHtml };

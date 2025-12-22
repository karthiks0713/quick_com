import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { fileURLToPath } from 'url';
import path from 'path';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

/**
 * Selenium WebDriver script to automate location selection and product extraction on JioMart
 * This script:
 * 1. Opens JioMart search page
 * 2. Selects a location
 * 3. Scrolls to load all products and images
 * 4. Extracts product data (name, price, productUrl, imageUrl)
 * 5. Returns structured JSON data
 */
async function selectLocationOnJioMart(locationName, productName = 'tomato') {
  // Construct search URL from product name
  const searchUrl = `https://www.jiomart.com/search?q=${encodeURIComponent(productName)}`;
  
  // Setup Chrome options
  const chromeOptions = new chrome.Options();
  
  // Use headless mode by default (set HEADLESS=false to disable)
  const isHeadless = process.env.HEADLESS !== 'false';
  if (isHeadless) {
    chromeOptions.addArguments('--headless=new');
  } else {
    chromeOptions.addArguments('--start-maximized');
  }
  
  // Docker-specific Chrome arguments
  chromeOptions.addArguments('--disable-blink-features=AutomationControlled');
  chromeOptions.addArguments('--disable-dev-shm-usage');
  chromeOptions.addArguments('--no-sandbox');
  chromeOptions.addArguments('--disable-gpu');
  chromeOptions.addArguments('--disable-software-rasterizer');
  chromeOptions.addArguments('--window-size=1920,1080');
  
  // Set Chrome binary path for Docker (if CHROME_BIN is set)
  if (process.env.CHROME_BIN) {
    chromeOptions.setChromeBinaryPath(process.env.CHROME_BIN);
    console.log(`Using Chrome binary from: ${process.env.CHROME_BIN}`);
  }
  
  // Set user agent to look like a real browser
  chromeOptions.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Exclude automation flags
  chromeOptions.excludeSwitches('enable-automation');
  
  // Launch Chrome browser
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(chromeOptions)
    .build();

  try {
    // Set window size
    await driver.manage().window().setRect({ width: 1920, height: 1080 });
    
    // Get the original window handle to ensure we stay in the same window
    const originalWindow = await driver.getWindowHandle();

    console.log(`Navigating to JioMart search page...`);
    console.log(`URL: ${searchUrl}`);
    
    // Execute script to hide webdriver property
    await driver.executeScript('Object.defineProperty(navigator, "webdriver", {get: () => undefined})');
    
    // Navigate to JioMart search page
    await driver.get(searchUrl);
    
    // Wait for page to be fully loaded
    await driver.executeScript('return document.readyState').then(state => {
      console.log(`Page ready state: ${state}`);
    });
    
    // Wait longer for dynamic content to load in headless mode
    await driver.sleep(5000);
    
    // Wait for page to be interactive
    try {
      await driver.wait(async () => {
        const readyState = await driver.executeScript('return document.readyState');
        return readyState === 'complete';
      }, 10000);
    } catch (e) {
      console.log('Page ready state check timed out, continuing...');
    }
    
    // Ensure we're still on the original window (close any popups/tabs that might have opened)
    const allWindows = await driver.getAllWindowHandles();
    if (allWindows.length > 1) {
      for (const window of allWindows) {
        if (window !== originalWindow) {
          await driver.switchTo().window(window);
          await driver.close();
        }
      }
      await driver.switchTo().window(originalWindow);
    }

    console.log(`Opening location selector...`);
    // Try multiple selectors for the Location button (headless mode might render differently)
    const locationSelectors = [
      "//button[contains(text(), 'Location')]",
      "//button[contains(., 'Location')]",
      "//*[contains(@class, 'location') and (self::button or self::div or self::span)]",
      "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'location')]",
      "//*[@role='button' and contains(text(), 'Location')]",
      "//a[contains(text(), 'Location')]"
    ];
    
    let locationButton = null;
    let locationClicked = false;
    
    for (const selector of locationSelectors) {
      try {
        console.log(`Trying selector: ${selector}`);
        locationButton = await driver.wait(
          until.elementLocated(By.xpath(selector)),
          8000
        );
        await driver.wait(until.elementIsVisible(locationButton), 5000);
        locationClicked = true;
        console.log(`✓ Found location button using: ${selector}`);
        break;
      } catch (e) {
        console.log(`Selector failed: ${selector}`);
        continue;
      }
    }
    
    if (!locationClicked || !locationButton) {
      // Take a screenshot to debug
      const screenshot = await driver.takeScreenshot();
      const fsModule = await import('fs');
      const fs = fsModule.default || fsModule;
      fs.writeFileSync('jiomart-location-button-not-found.png', screenshot, 'base64');
      console.log('Screenshot saved: jiomart-location-button-not-found.png');
      
      // Try to get page source for debugging
      const pageSource = await driver.getPageSource();
      fs.writeFileSync('jiomart-page-source.html', pageSource, 'utf8');
      console.log('Page source saved: jiomart-page-source.html');
      
      throw new Error('Location button not found with any selector');
    }
    
    // Use JavaScript click to avoid opening new tabs/windows
    await driver.executeScript("arguments[0].click();", locationButton);
    console.log(`✓ Location selector clicked`);
    
    // Wait a moment and check if any new windows/tabs opened
    await driver.sleep(500);
    const windowsAfterClick = await driver.getAllWindowHandles();
    if (windowsAfterClick.length > 1) {
      // Switch back to original window and close others
      for (const window of windowsAfterClick) {
        if (window !== originalWindow) {
          await driver.switchTo().window(window);
          await driver.close();
        }
      }
      await driver.switchTo().window(originalWindow);
    }

    console.log(`Waiting for location modal to open...`);
    // Wait for the location search input field - verified working selector from MCP
    // MCP verified: //input[contains(@placeholder, 'Search for area') or contains(@placeholder, 'landmark')]
    const locationInput = await driver.wait(
      until.elementLocated(By.xpath("//input[contains(@placeholder, 'Search for area') or contains(@placeholder, 'landmark')]")),
      10000
    );
    await driver.wait(until.elementIsVisible(locationInput), 5000);

    console.log(`Typing location: ${locationName}`);
    // Scroll element into view and use JavaScript click to avoid viewport issues
    await driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", locationInput);
    await driver.sleep(500);
    // Use JavaScript click to avoid viewport issues
    await driver.executeScript("arguments[0].click();", locationInput);
    await locationInput.clear();
    // Type slowly character by character for better reliability
    for (const char of locationName) {
      await locationInput.sendKeys(char);
      await driver.sleep(100);
    }

    console.log(`Waiting for location suggestions to appear...`);
    // Wait longer for suggestions dropdown to appear and populate
    let suggestionsVisible = false;
    const dropdownSelectors = [
      "//ul[contains(@class, 'suggestion') or contains(@class, 'dropdown') or contains(@class, 'list')]",
      "//div[contains(@class, 'suggestion') or contains(@class, 'dropdown') or contains(@class, 'autocomplete')]",
      "//*[@role='listbox' or @role='menu']",
      "//ul[li]", // Any ul with list items
      "//div[contains(@class, 'location')]//ul",
      "//div[contains(@class, 'location')]//li",
    ];
    
    // Wait up to 10 seconds for suggestions to appear
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const dropdownSelector of dropdownSelectors) {
        try {
          const dropdown = await driver.findElement(By.xpath(dropdownSelector));
          const isDisplayed = await dropdown.isDisplayed();
          if (isDisplayed) {
            // Check if it has child elements (actual suggestions)
            const childCount = await driver.executeScript(
              'return arguments[0].children.length;', 
              dropdown
            );
            if (childCount > 0) {
              suggestionsVisible = true;
              console.log(`✓ Suggestions dropdown found with ${childCount} items`);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
      if (suggestionsVisible) break;
      console.log(`Waiting for suggestions... (attempt ${attempt + 1}/5)`);
      await driver.sleep(2000);
    }
    
    if (!suggestionsVisible) {
      console.log(`⚠️  Suggestions dropdown not found, waiting additional time...`);
      await driver.sleep(3000);
    }

    // Wait a bit more for suggestions to fully load and be interactive
    await driver.sleep(2000);

    // Wait for suggestions to appear and select the location
    let suggestionClicked = false;
    
    // Try multiple approaches to find the suggestion
    const locationVariations = [
      locationName,                    // Exact match
      locationName.replace(/\s+/g, ''), // Without spaces (RTnagar)
      locationName.replace(/\s+/g, ' '), // Normalized spaces (RT Nagar)
      locationName.toUpperCase(),       // Uppercase
      locationName.toLowerCase(),       // Lowercase
    ];
    
    // First, try to find all suggestions and iterate through them
    console.log(`Trying to find all suggestions and match location...`);
    try {
      // Wait a bit more for suggestions to fully render
      await driver.sleep(1000);
      
      // Try multiple selectors to find suggestions - prioritize more specific ones
      const suggestionContainerSelectors = [
        "//ul[li and (contains(@class, 'suggestion') or contains(@class, 'dropdown') or contains(@class, 'list') or contains(@class, 'location'))]//li",
        "//div[contains(@class, 'suggestion') or contains(@class, 'autocomplete')]//li",
        "//div[contains(@class, 'location')]//li",
        "//*[@role='listbox']//*[@role='option']",
        "//*[@role='option']",
        "//li[contains(@class, 'suggestion') or contains(@class, 'item') or contains(@class, 'location')]",
        "//div[contains(@class, 'dropdown')]//li",
        "//ul[li]//li",
        "//li[not(ancestor::input)]",
        "//div[contains(@class, 'suggestion')]",
      ];
      
      let allSuggestions = [];
      for (const containerSelector of suggestionContainerSelectors) {
        try {
          const suggestions = await driver.findElements(By.xpath(containerSelector));
          // Filter to only visible suggestions
          const visibleSuggestions = [];
          for (const suggestion of suggestions) {
            try {
              const isDisplayed = await suggestion.isDisplayed();
              if (isDisplayed) {
                visibleSuggestions.push(suggestion);
              }
            } catch (e) {
              continue;
            }
          }
          if (visibleSuggestions.length > 0) {
            allSuggestions = visibleSuggestions;
            console.log(`Found ${allSuggestions.length} visible suggestion elements using: ${containerSelector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (allSuggestions.length === 0) {
        // Fallback: try to find any clickable element near the input, but filter for visibility
        const allElements = await driver.findElements(By.xpath("//li | //div[contains(@class, 'suggestion')] | //div[contains(@class, 'item')] | //*[@role='option']"));
        for (const elem of allElements) {
          try {
            if (await elem.isDisplayed()) {
              allSuggestions.push(elem);
            }
          } catch (e) {
            continue;
          }
        }
        console.log(`Found ${allSuggestions.length} visible suggestion elements (fallback)`);
      }
      
      // Try clicking each suggestion element
      for (let i = 0; i < allSuggestions.length && i < 30; i++) {
        try {
          // Check if element is visible
          const isDisplayed = await allSuggestions[i].isDisplayed();
          if (!isDisplayed) {
            continue;
          }
          
          // Get text from element
          let suggestionText = '';
          try {
            suggestionText = await allSuggestions[i].getText();
          } catch (e) {
            // Try getting text via JavaScript
            try {
              suggestionText = await driver.executeScript('return arguments[0].textContent || arguments[0].innerText || "";', allSuggestions[i]);
            } catch (e2) {
              suggestionText = '';
            }
          }
          
          const normalizedText = suggestionText.trim().toLowerCase();
          console.log(`Checking suggestion ${i + 1}: "${suggestionText.substring(0, 50)}"`);
          
          // Check if any location variation matches (more flexible matching)
          let shouldClick = false;
          const locationLower = locationName.toLowerCase();
          
          for (const locVar of locationVariations) {
            const locVarLower = locVar.toLowerCase();
            // More flexible matching - check if location appears in suggestion text
            if ((normalizedText.includes(locVarLower) || 
                 normalizedText.includes(locationLower) ||
                 locVarLower.includes(normalizedText.substring(0, Math.min(5, normalizedText.length))) ||
                 normalizedText.substring(0, Math.min(10, normalizedText.length)).includes(locVarLower.substring(0, Math.min(5, locVarLower.length)))) && 
                !normalizedText.includes('airport') && 
                !normalizedText.includes('railway') && 
                !normalizedText.includes('station') &&
                !normalizedText.includes('temple') &&
                !normalizedText.includes('select') &&
                !normalizedText.includes('search') &&
                normalizedText.length > 2) {
              shouldClick = true;
              console.log(`✓ Matched location "${locVar}" in suggestion: "${suggestionText}"`);
              break;
            }
          }
          
          // If no text match but we have few suggestions, try clicking the first visible one
          if (!shouldClick && allSuggestions.length <= 5 && normalizedText.length > 0 && 
              !normalizedText.includes('search') && !normalizedText.includes('select') &&
              !normalizedText.includes('enter') && !normalizedText.includes('type')) {
            console.log(`⚠️  Text doesn't match exactly, but trying first visible suggestion: "${suggestionText}"`);
            shouldClick = true;
          }
          
          // If still no match and we have very few suggestions, try the first one
          if (!shouldClick && allSuggestions.length <= 3 && i === 0) {
            console.log(`⚠️  Trying first suggestion as fallback: "${suggestionText}"`);
            shouldClick = true;
          }
          
          if (shouldClick) {
            console.log(`Attempting to click suggestion: "${suggestionText}"`);
            
            // Scroll into view with more options
            try {
              await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', allSuggestions[i]);
            } catch (e) {
              try {
                await driver.executeScript('arguments[0].scrollIntoView(true);', allSuggestions[i]);
              } catch (e2) {
                console.log(`⚠️  Could not scroll suggestion into view`);
              }
            }
            await driver.sleep(1000); // Increased wait time
            
            // Ensure element is still visible and clickable
            try {
              const isStillDisplayed = await allSuggestions[i].isDisplayed();
              if (!isStillDisplayed) {
                console.log(`⚠️  Suggestion is no longer visible, skipping...`);
                continue;
              }
            } catch (e) {
              console.log(`⚠️  Could not verify visibility, continuing anyway...`);
            }
            
            // Try multiple click strategies with more options
            const clickStrategies = [
              // Strategy 1: Regular click
              async () => {
                await allSuggestions[i].click();
              },
              // Strategy 2: JavaScript click
              async () => {
                await driver.executeScript('arguments[0].click();', allSuggestions[i]);
              },
              // Strategy 3: Mouse event
              async () => {
                await driver.executeScript(`
                  var evt = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                  });
                  arguments[0].dispatchEvent(evt);
                `, allSuggestions[i]);
              },
              // Strategy 4: Click on parent if element is not directly clickable
              async () => {
                const parent = await driver.executeScript('return arguments[0].parentElement;', allSuggestions[i]);
                if (parent) {
                  await driver.executeScript('arguments[0].click();', parent);
                } else {
                  throw new Error('No parent element');
                }
              },
              // Strategy 5: Focus and Enter key
              async () => {
                await driver.executeScript('arguments[0].focus();', allSuggestions[i]);
                await driver.sleep(200);
                await allSuggestions[i].sendKeys(Key.ENTER);
              },
              // Strategy 6: Touch event (for mobile-like interactions)
              async () => {
                await driver.executeScript(`
                  var touch = new Touch({
                    identifier: Date.now(),
                    target: arguments[0],
                    clientX: arguments[0].getBoundingClientRect().left + arguments[0].offsetWidth / 2,
                    clientY: arguments[0].getBoundingClientRect().top + arguments[0].offsetHeight / 2,
                    radiusX: 2.5,
                    radiusY: 2.5,
                    rotationAngle: 10,
                    force: 0.5
                  });
                  var touchEvent = new TouchEvent('touchend', {
                    cancelable: true,
                    bubbles: true,
                    touches: [touch],
                    targetTouches: [touch],
                    changedTouches: [touch]
                  });
                  arguments[0].dispatchEvent(touchEvent);
                `, allSuggestions[i]);
              }
            ];
            
            for (let strategyIndex = 0; strategyIndex < clickStrategies.length; strategyIndex++) {
              try {
                await clickStrategies[strategyIndex]();
                await driver.sleep(1500); // Wait to see if click worked
                
                // Verify if click worked by checking if modal closed or input changed
                try {
                  const inputValue = await locationInput.getAttribute('value');
                  if (inputValue && inputValue.toLowerCase().includes(locationName.toLowerCase().substring(0, 3))) {
                    suggestionClicked = true;
                    console.log(`✓ Location suggestion clicked successfully: "${suggestionText}" (strategy ${strategyIndex + 1})`);
                    break;
                  }
                } catch (e) {
                  // If we can't verify, assume it worked if no error
                  suggestionClicked = true;
                  console.log(`✓ Location suggestion clicked: "${suggestionText}" (strategy ${strategyIndex + 1})`);
                  break;
                }
              } catch (e) {
                if (strategyIndex === clickStrategies.length - 1) {
                  console.log(`⚠️  All click strategies failed for suggestion ${i + 1}: ${e.message}`);
                }
                continue;
              }
            }
            
            if (suggestionClicked) break;
          }
        } catch (e) {
          console.log(`⚠️  Error processing suggestion ${i + 1}: ${e.message}`);
          continue;
        }
      }
    } catch (e) {
      console.log(`⚠️  Could not iterate through suggestions: ${e.message}, trying selectors...`);
    }
    
    // If not found by iteration, try XPath selectors
    if (!suggestionClicked) {
      console.log(`Trying XPath selectors for suggestions...`);
      const suggestionStrategies = [
        // Strategy 1: Find in list items (most common)
        ...locationVariations.map(loc => `//li[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${loc.toLowerCase()}')]`),
        // Strategy 2: Find in divs with location text
        ...locationVariations.map(loc => `//div[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${loc.toLowerCase()}') and not(ancestor::input)]`),
        // Strategy 3: Find any clickable element with location text
        ...locationVariations.map(loc => `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${loc.toLowerCase()}') and not(self::input) and not(ancestor::input) and (self::li or self::div or self::button or self::a)]`),
        // Strategy 4: Try indices 2-10 (skip input field)
        ...Array.from({length: 9}, (_, i) => i + 2).map(i => 
          locationVariations.map(loc => `(//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${loc.toLowerCase()}') and not(self::input)])[${i}]`)
        ).flat(),
      ];
      
      for (const selector of suggestionStrategies) {
        try {
          const suggestion = await driver.wait(
            until.elementLocated(By.xpath(selector)),
            2000
          );
          await driver.wait(until.elementIsVisible(suggestion), 1000);
          
          const suggestionText = await suggestion.getText();
          // Skip if it contains excluded words
          if (suggestionText.toLowerCase().includes('airport') || 
              suggestionText.toLowerCase().includes('railway') || 
              suggestionText.toLowerCase().includes('station') ||
              suggestionText.toLowerCase().includes('temple')) {
            continue;
          }
          
          // Scroll into view
          await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', suggestion);
          await driver.sleep(500);
          
          // Try regular click first
          try {
            await suggestion.click();
            suggestionClicked = true;
            console.log(`✓ Location suggestion clicked using selector: "${suggestionText}"`);
            break;
          } catch (e) {
            // If regular click fails, use JavaScript click
            await driver.executeScript('arguments[0].click();', suggestion);
            suggestionClicked = true;
            console.log(`✓ Location suggestion clicked using JavaScript: "${suggestionText}"`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }

    // If still not clicked, try pressing Enter or selecting first visible suggestion
    if (!suggestionClicked) {
      console.log(`⚠️  Could not click suggestion by matching text. Trying alternative methods...`);
      
      // Strategy 1: Try clicking suggestions by index (2nd, 3rd, 4th, etc. - skip the input field)
      console.log(`Trying to click suggestions by index...`);
      for (let index = 2; index <= 10; index++) {
        try {
          const indexSelectors = [
            `(//li[not(ancestor::input)])[${index}]`,
            `(//div[contains(@class, 'suggestion') or contains(@class, 'item')])[${index}]`,
            `(//*[@role='option'])[${index}]`,
            `(//li | //div[contains(@class, 'suggestion')])[${index}]`
          ];
          
          for (const indexSelector of indexSelectors) {
            try {
              const suggestionByIndex = await driver.findElement(By.xpath(indexSelector));
              const isDisplayed = await suggestionByIndex.isDisplayed();
              if (isDisplayed) {
                const suggestionText = await suggestionByIndex.getText();
                console.log(`Trying suggestion at index ${index}: "${suggestionText.substring(0, 50)}"`);
                
                await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', suggestionByIndex);
                await driver.sleep(800);
                
                // Try clicking
                try {
                  await driver.executeScript('arguments[0].click();', suggestionByIndex);
                  await driver.sleep(1500);
                  suggestionClicked = true;
                  console.log(`✓ Clicked suggestion at index ${index}: "${suggestionText}"`);
                  break;
                } catch (e) {
                  continue;
                }
              }
            } catch (e) {
              continue;
            }
          }
          if (suggestionClicked) break;
        } catch (e) {
          continue;
        }
      }
      
      // Strategy 2: Try pressing Enter to select the first suggestion
      if (!suggestionClicked) {
        try {
          console.log(`Trying Enter key...`);
          await locationInput.sendKeys(Key.ENTER);
          await driver.sleep(2000);
          suggestionClicked = true;
          console.log(`✓ Pressed Enter to select first suggestion`);
        } catch (e) {
          console.log(`⚠️  Enter key didn't work: ${e.message}`);
        }
      }
      
      // Strategy 3: Try clicking the first visible suggestion element
      if (!suggestionClicked) {
        console.log(`Trying to click first visible suggestion...`);
        try {
          const firstSuggestionSelectors = [
            "(//li[not(ancestor::input)])[1]",
            "(//div[contains(@class, 'suggestion')])[1]",
            "(//div[contains(@class, 'item')])[1]",
            "(//*[@role='option'])[1]",
            "(//li | //div[contains(@class, 'suggestion')] | //div[contains(@class, 'item')] | //*[@role='option'])[1]"
          ];
          
          for (const selector of firstSuggestionSelectors) {
            try {
              const firstSuggestion = await driver.findElement(By.xpath(selector));
              const isDisplayed = await firstSuggestion.isDisplayed();
              if (isDisplayed) {
                const suggestionText = await firstSuggestion.getText();
                console.log(`Found first visible suggestion: "${suggestionText.substring(0, 50)}"`);
                
                await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', firstSuggestion);
                await driver.sleep(800);
                await driver.executeScript('arguments[0].click();', firstSuggestion);
                await driver.sleep(1500);
                suggestionClicked = true;
                console.log(`✓ Clicked first visible suggestion`);
                break;
              }
            } catch (e) {
              continue;
            }
          }
        } catch (e2) {
          console.log(`⚠️  Could not click first suggestion: ${e2.message}`);
        }
      }
      
      // Strategy 4: Try Arrow Down + Enter
      if (!suggestionClicked) {
        try {
          console.log(`Trying Arrow Down + Enter...`);
          await locationInput.sendKeys(Key.ARROW_DOWN);
          await driver.sleep(500);
          await locationInput.sendKeys(Key.ENTER);
          await driver.sleep(2000);
          suggestionClicked = true;
          console.log(`✓ Used Arrow Down + Enter to select suggestion`);
        } catch (e) {
          console.log(`⚠️  Arrow Down + Enter didn't work: ${e.message}`);
        }
      }
    }
    
    if (!suggestionClicked) {
      throw new Error(`Could not click location suggestion for: ${locationName}`);
    }

    console.log(`Waiting for location to be applied...`);
    // Wait a moment for the location to be applied
    await driver.sleep(1000);

    console.log(`Clicking confirm location button...`);
    // Wait a moment for the confirm button to appear
    await driver.sleep(2000);
    
    // Find and click the "Confirm Location" button with multiple strategies
    let confirmClicked = false;
    
    // Strategy 1: Try to find all buttons and match by text
    try {
      const allButtons = await driver.findElements(By.xpath("//button | //*[@role='button'] | //*[@type='button']"));
      for (const button of allButtons) {
        try {
          const isDisplayed = await button.isDisplayed();
          if (isDisplayed) {
            const buttonText = await button.getText();
            const lowerText = (buttonText || '').toLowerCase();
            if (lowerText.includes('confirm') || lowerText.includes('done') || lowerText.includes('apply') || lowerText.includes('select')) {
              await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', button);
              await driver.sleep(500);
              await driver.executeScript('arguments[0].click();', button);
              await driver.sleep(1000);
              confirmClicked = true;
              console.log(`✓ Confirm location button clicked (matched: "${buttonText?.substring(0, 30)}")`);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      // Continue to other strategies
    }
    
    // Strategy 2: Try specific XPath selectors
    if (!confirmClicked) {
    const confirmSelectors = [
      "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm')]",
      "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm location')]",
      "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm') and contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'location')]",
      "//*[@type='button' and contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm')]",
        "//button[contains(@class, 'confirm') or contains(@class, 'submit') or contains(@class, 'apply')]",
      "//*[@role='button' and contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'confirm')]",
        "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'done')]",
        "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'apply')]",
        "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'select')]",
        "//button[not(@disabled) and (contains(@class, 'primary') or contains(@class, 'btn-primary') or contains(@class, 'submit'))]",
    ];
    
    for (const selector of confirmSelectors) {
      try {
        const confirmButton = await driver.wait(
          until.elementLocated(By.xpath(selector)),
          3000
        );
        await driver.wait(until.elementIsVisible(confirmButton), 2000);
        
        // Scroll into view
        await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', confirmButton);
        await driver.sleep(500);
        
        // Try regular click first
        try {
          await confirmButton.click();
          confirmClicked = true;
          console.log(`✓ Confirm location button clicked`);
          break;
        } catch (e) {
          // If regular click fails, use JavaScript click
          await driver.executeScript('arguments[0].click();', confirmButton);
          confirmClicked = true;
          console.log(`✓ Confirm location button clicked using JavaScript`);
          break;
        }
      } catch (e) {
        continue;
        }
      }
    }
    
    // Strategy 3: If still not found, try pressing Enter or clicking the first primary button
    if (!confirmClicked) {
      try {
        // Try pressing Enter
        await locationInput.sendKeys(Key.ENTER);
        await driver.sleep(2000);
        confirmClicked = true;
        console.log(`✓ Pressed Enter to confirm location`);
      } catch (e) {
        // Try finding primary/submit button
        try {
          const primaryButtons = await driver.findElements(By.xpath("//button[contains(@class, 'primary') or contains(@class, 'btn-primary') or contains(@class, 'submit')]"));
          if (primaryButtons.length > 0) {
            const firstButton = primaryButtons[0];
            if (await firstButton.isDisplayed()) {
              await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"});', firstButton);
              await driver.sleep(500);
              await driver.executeScript('arguments[0].click();', firstButton);
              await driver.sleep(1000);
              confirmClicked = true;
              console.log(`✓ Clicked primary button as fallback`);
            }
          }
        } catch (e2) {
          // Continue
        }
      }
    }
    
    if (!confirmClicked) {
      // Log debug info before throwing error
      try {
        const allButtons = await driver.findElements(By.xpath("//button"));
        console.log(`⚠️  Found ${allButtons.length} buttons on page`);
        for (let i = 0; i < Math.min(allButtons.length, 5); i++) {
          try {
            const text = await allButtons[i].getText();
            console.log(`   Button ${i + 1}: "${text?.substring(0, 50)}"`);
          } catch (e) {
            // Skip
          }
        }
      } catch (e) {
        // Skip debug
      }
      throw new Error(`Could not find or click confirm location button`);
    }

    console.log(`Waiting for location to be confirmed and page to update...`);
    // Wait for the modal to close and page to update
    await driver.sleep(3000);
    
    // Wait for page to be ready (check if location is displayed in the header)
    // Try multiple verification strategies
    let locationVerified = false;
    
    // Strategy 1: Check for "Delivery to" text
    try {
      await driver.wait(
        until.elementLocated(By.xpath("//*[contains(text(), 'Delivery to') or contains(text(), 'Delivering to') or contains(text(), 'Deliver to')]")),
        5000
      );
      locationVerified = true;
      console.log(`✓ Location confirmed - found "Delivery to" in header`);
    } catch (e) {
      // Try next strategy
    }
    
    // Strategy 2: Check if location name appears in header/navigation
    if (!locationVerified) {
      try {
        const locationInHeader = await driver.findElement(
          By.xpath(`//*[contains(text(), '${locationName}')]`)
        );
        if (locationInHeader) {
          locationVerified = true;
          console.log(`✓ Location confirmed - found "${locationName}" in page`);
        }
      } catch (e) {
        // Try next strategy
      }
    }
    
    // Strategy 3: Check if products are showing (indicates location is set)
    if (!locationVerified) {
      try {
        await driver.wait(
          until.elementsLocated(By.xpath('//*[contains(@class, "product") or contains(@class, "item") or contains(@class, "result")]')),
          5000
        );
        locationVerified = true;
        console.log(`✓ Location likely set - products are showing on page`);
      } catch (e) {
        // Location verification failed
      }
    }
    
    // Strategy 4: Check localStorage for location data (via JavaScript)
    if (!locationVerified) {
      try {
        const locationData = await driver.executeScript(`
          return localStorage.getItem('nms_mgo_pincode') || 
                 localStorage.getItem('nms_mgo_city') || 
                 localStorage.getItem('nms_delivery_config_info');
        `);
        if (locationData) {
          locationVerified = true;
          console.log(`✓ Location confirmed - found in localStorage`);
        }
      } catch (e) {
        // Ignore
      }
    }
    
    if (!locationVerified) {
      console.log(`⚠️ Could not verify location in header, but proceeding anyway...`);
      console.log(`   (Location may still be set - products are being extracted)`);
    }
    
    // Ensure we're on the original window
    await driver.switchTo().window(originalWindow);
    
    // Wait for page to be fully loaded and rendered
    console.log(`Waiting for page to fully load...`);
    await driver.sleep(3000);
    
    // Wait for products to be rendered before extracting HTML
    console.log(`Waiting for products to be rendered...`);
    try {
      await driver.wait(
        until.elementLocated(By.xpath('//*[contains(@class, "product") or contains(@class, "item") or contains(@class, "result")]')),
        15000
      );
      console.log(`✓ Products found on page`);
    } catch (e) {
      console.log(`⚠️ Products not found, continuing anyway...`);
    }
    await driver.sleep(2000);
    
    // Scroll slowly from top to bottom to load all images and product URLs
    console.log(`Scrolling slowly from top to bottom to load all content...`);
    await driver.executeScript(`
      return new Promise((resolve) => {
        const scrollHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        const scrollSteps = 10;
        let currentStep = 0;
        
        const scrollInterval = setInterval(() => {
          const scrollPosition = (scrollHeight / scrollSteps) * currentStep;
          window.scrollTo(0, scrollPosition);
          currentStep++;
          
          if (currentStep > scrollSteps) {
            // Scroll back to top
            window.scrollTo(0, 0);
            clearInterval(scrollInterval);
            setTimeout(resolve, 1000);
          }
        }, 500); // Scroll every 500ms
      });
    `);
    await driver.sleep(2000);
    
    // Extract product URLs from page using JavaScript before getting HTML
    console.log(`\nExtracting product URLs from page...`);
    const productUrlsMap = await driver.executeScript(() => {
      const urlsMap = {};
      
      // Find all product links - JioMart uses /p/ pattern
      const productLinks = document.querySelectorAll('a[href*="/p/"]');
      
      productLinks.forEach((link) => {
        const href = link.getAttribute('href');
        if (!href || !href.includes('/p/')) return;
        
        // Skip if it's not a product page (avoid category pages)
        if (href.includes('/p/homeandkitchen/') || href.match(/\/p\/[^\/]+\/[^\/]+\/\d+$/)) {
          // This looks like a product URL
        } else if (!href.match(/\/p\/[^\/]+\/[^\/]+\/\d+$/)) {
          return; // Skip if it doesn't match product URL pattern
        }
        
        // Try to find product name near the link
        let productName = null;
        
        // Strategy 1: Look for product name in parent container
        let parent = link.closest('[class*="product"], [class*="item"], [class*="card"], [data-testid*="product"]');
        if (parent) {
          // Try multiple selectors for product name
          const nameSelectors = [
            '[class*="title"]',
            '[class*="name"]',
            '[class*="product-title"]',
            '[class*="product-name"]',
            'h1, h2, h3, h4, h5, h6',
            '[data-testid*="title"]',
            '[data-testid*="name"]'
          ];
          
          for (const selector of nameSelectors) {
            const nameElement = parent.querySelector(selector);
            if (nameElement) {
              let nameText = nameElement.textContent.trim();
              // Clean up product name - remove price, discount, "Add" button text
              nameText = nameText.replace(/₹\s*\d+[.,]?\d*/g, '').trim();
              nameText = nameText.replace(/\d+%?\s*OFF/g, '').trim();
              nameText = nameText.replace(/\b(Add|Get|Code|OFF|Flat|Rs)\b/gi, '').trim();
              nameText = nameText.replace(/\s+/g, ' ').trim();
              
              if (nameText && nameText.length > 5) {
                productName = nameText;
                break;
              }
            }
          }
        }
        
        // Strategy 2: Look for product name in link's title or aria-label
        if (!productName) {
          productName = link.getAttribute('title') || link.getAttribute('aria-label');
          if (productName) {
            productName = productName.replace(/₹\s*\d+[.,]?\d*/g, '').trim();
            productName = productName.replace(/\d+%?\s*OFF/g, '').trim();
            productName = productName.replace(/\b(Add|Get|Code|OFF|Flat|Rs)\b/gi, '').trim();
            productName = productName.replace(/\s+/g, ' ').trim();
          }
        }
        
        // Strategy 3: Extract from link text (clean it)
        if (!productName) {
          let linkText = link.textContent.trim();
          if (linkText) {
            // Remove price patterns, discount, buttons
            linkText = linkText.replace(/₹\s*\d+[.,]?\d*/g, '').trim();
            linkText = linkText.replace(/\d+%?\s*OFF/g, '').trim();
            linkText = linkText.replace(/\b(Add|Get|Code|OFF|Flat|Rs|Buy)\b/gi, '').trim();
            linkText = linkText.split('\n')[0].trim(); // Take first line only
            linkText = linkText.replace(/\s+/g, ' ').trim();
            
            if (linkText && linkText.length > 5) {
              productName = linkText;
            }
          }
        }
        
        // Convert relative URLs to absolute
        let productUrl = href;
        if (!productUrl.startsWith('http')) {
          if (productUrl.startsWith('//')) {
            productUrl = 'https:' + productUrl;
          } else if (productUrl.startsWith('/')) {
            productUrl = 'https://www.jiomart.com' + productUrl;
          } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
            productUrl = 'https://www.jiomart.com/' + productUrl;
          }
        }
        
        // Store URL with cleaned product name
        if (productName && productName.length > 5) {
          urlsMap[productName] = productUrl;
        }
        
        // Also store by partial match (first few words) for better matching
        if (productName) {
          const firstWords = productName.split(' ').slice(0, 5).join(' ');
          if (firstWords.length > 10) {
            urlsMap[firstWords] = productUrl;
          }
        }
      });
      
      return urlsMap;
    });
    
    console.log(`Extracted ${Object.keys(productUrlsMap).length} product URLs from page`);
    
    // Wait for images to load after scrolling
    console.log(`Waiting for images to load...`);
    await driver.sleep(3000);
    
    // Take a screenshot of the final state
    console.log(`Taking final screenshot...`);
    const screenshot = await driver.takeScreenshot();
    const screenshotPath = `jiomart-${locationName.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-')}-search-results.png`;
    fs.writeFileSync(screenshotPath, screenshot, 'base64');
    console.log(`✓ Screenshot saved: ${screenshotPath}`);

    // Get the HTML of the final page
    console.log(`Getting final page HTML...`);
    const pageHtml = await driver.executeScript(() => {
      return document.documentElement.outerHTML;
    });
    
    // Ensure output directory exists
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save HTML file
    const htmlPath = path.join(outputDir, `jiomart-${locationName.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-')}-search-results.html`);
    fs.writeFileSync(htmlPath, pageHtml, 'utf8');
    console.log(`Search results HTML saved: ${htmlPath}`);

    // Parse HTML to extract product data
    console.log(`\nExtracting product data from HTML...`);
    const productData = parseJioMartProducts(pageHtml, locationName, productName, productUrlsMap);
    
    // Save JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(outputDir, `jiomart-${locationName.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(productData, null, 2), 'utf8');
    console.log(`Product data JSON saved: ${jsonPath}`);
    console.log(`Found ${productData.products.length} products`);

    console.log(`\n✅ Location "${locationName}" selected and product "${productName}" searched successfully!`);

    // Return the structured product data
    return productData;

  } catch (error) {
    console.error('Error occurred:', error);
    try {
      const screenshot = await driver.takeScreenshot();
      fs.writeFileSync('jiomart-error.png', screenshot, 'base64');
      console.log('Error screenshot saved: jiomart-error.png');
    } catch (e) {
      // Ignore screenshot errors
    }
    throw error;
  } finally {
    // Always close browser in finally block with timeout to prevent hanging
    console.log('\n=== Closing browser ===');
    try {
      // Add timeout to prevent hanging (5 seconds should be enough)
      const quitPromise = driver.quit();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Browser close timeout')), 5000)
      );
      await Promise.race([quitPromise, timeoutPromise]);
      console.log('Browser closed successfully.');
    } catch (e) {
      console.log('Browser close timed out or failed, attempting force cleanup...');
      try {
        // Try to close all windows individually
        const windows = await driver.getAllWindowHandles();
        for (const window of windows) {
          try {
            await driver.switchTo().window(window);
            await driver.close();
          } catch (e2) {
            // Ignore individual window close errors
          }
        }
        console.log('Browser windows closed individually.');
      } catch (e3) {
        console.log('Could not close browser windows, process may need manual cleanup.');
      }
    }
  }
}

// Main execution
async function main() {
  // Example: Select different locations
  const locations = ['Mumbai', 'Bangalore', 'Chennai', 'Delhi'];
  
  // Get location and product from command line arguments
  const locationToSelect = process.argv[2] || locations[0];
  const productName = process.argv[3] || 'tomato';
  
  console.log(`Starting location selection for: ${locationToSelect}`);
  console.log(`Product: ${productName}`);
  const productData = await selectLocationOnJioMart(locationToSelect, productName);
  console.log(`\n✅ Extraction complete!`);
  console.log(`   Location: ${productData.location}`);
  console.log(`   Product: ${productData.product}`);
  console.log(`   Total products found: ${productData.totalProducts}`);
  return productData;
}

// Run the script only if called directly (not when imported as a module)
const __filename = fileURLToPath(import.meta.url);
const __basename = path.basename(__filename);

// Check if this file is being run directly (not imported)
// When imported, process.argv[1] will be the orchestrator file, not this file
let isMainModule = false;
if (process.argv[1]) {
  try {
    const mainFile = path.resolve(process.argv[1]);
    const currentFile = path.resolve(__filename);
    // Only run main() if this exact file is being executed
    isMainModule = mainFile === currentFile;
  } catch (e) {
    // If path resolution fails, check by filename only
    const mainBasename = path.basename(process.argv[1]);
    isMainModule = mainBasename === __basename;
  }
}

// Only run main() if this file is executed directly
if (isMainModule) {
  main().catch(console.error);
}

/**
 * Parse JioMart HTML to extract product data
 */
function parseJioMartProducts(html, locationName, productName, productUrlsMap = {}) {
  const $ = cheerio.load(html);
  const products = [];
  
  // Common navigation/menu items to exclude
  const excludeTexts = ['Home', 'Shop By Category', 'My Orders', 'My List', 'Wishlist', 'Cart', 
                        'Sign In', 'Register', 'Login', 'Search', 'Menu', 'Categories'];
  
  // Extract products from JioMart - look for product cards
  $('[class*="product"], [class*="item-card"], [class*="jm-product"], [data-testid*="product"]').each((index, element) => {
    const $el = $(element);
    const text = $el.text().trim();
    
    // Skip if it's too short or matches excluded navigation items
    if (text.length < 10 || excludeTexts.some(exclude => text === exclude || text.startsWith(exclude))) {
      return;
    }
    
    // Look for price indicators (₹ symbol or price patterns)
    const hasPrice = $el.find('*').text().match(/₹\s*\d+|\d+\s*₹|price|MRP|Rs\./i);
    if (!hasPrice) return;
    
    // Try to extract product name
    let productNameText = $el.find('[class*="product-title"], [class*="product-name"], [class*="item-title"], [class*="title"], h1, h2, h3, h4, h5, h6').first().text().trim() ||
                          $el.find('a[href*="/p/"], a[href*="product"]').text().trim() ||
                          text.split('\n')[0].trim();
    
    // Clean up product name - remove prices, discounts, button text
    if (productNameText) {
      productNameText = productNameText.replace(/₹\s*\d+[.,]?\d*/g, '').trim();
      productNameText = productNameText.replace(/\d+%?\s*OFF/g, '').trim();
      productNameText = productNameText.replace(/\b(Add|Get|Code|OFF|Flat|Rs|Buy|Cart)\b/gi, '').trim();
      productNameText = productNameText.replace(/\s+/g, ' ').trim();
    }
    
    if (!productNameText || productNameText.length < 3 || excludeTexts.includes(productNameText)) return;
    
    // Extract prices - JioMart typically shows: ₹price ₹MRP or ₹MRP ₹price
    let mrp = null;
    let price = null;
    const priceText = $el.text();
    const priceMatches = priceText.match(/₹\s*(\d+(?:[.,]\d+)?)/g);
    
    if (priceMatches && priceMatches.length > 0) {
      const prices = priceMatches.map(m => parseFloat(m.replace(/[₹\s,]/g, ''))).filter(p => !isNaN(p) && p > 0);
      if (prices.length > 0) {
        const hasStrike = $el.find('s, del, [style*="line-through"], [class*="strike"], [class*="mrp"]').length > 0;
        
        // JioMart pattern: Usually shows selling price first, then MRP (strikethrough)
        // Or: MRP (strikethrough) first, then selling price
        if (hasStrike && prices.length > 1) {
          // Find which price has strikethrough
          const priceElements = $el.find('*').filter((i, el) => {
            const $el = $(el);
            return $el.text().match(/₹\s*\d+/) && 
                   ($el.is('s, del') || $el.hasClass('mrp') || $el.css('text-decoration').includes('line-through'));
          });
          
          if (priceElements.length > 0) {
            // First price with strike is MRP
            mrp = prices[0];
            price = prices[1] || prices[0];
          } else {
            // Assume first is MRP (strikethrough), second is selling price
            mrp = prices[0];
            price = prices[1];
          }
        } else if (prices.length > 1) {
          // If no strikethrough but multiple prices, assume first is selling, second is MRP
          price = prices[0];
          mrp = prices[1];
        } else {
          // Single price - it's the selling price
          price = prices[0];
        }
      }
    }
    
    const isOutOfStock = $el.find('[class*="out"], [class*="stock"], [class*="unavailable"]').length > 0 ||
                        text.toLowerCase().includes('out of stock') ||
                        text.toLowerCase().includes('currently unavailable');
    
    // Extract image URL - try multiple strategies
    let imageUrl = null;
    
    // Strategy 1: Look for img tag in product container
    const $img = $el.find('img').not('img[alt*="logo"], img[alt*="icon"], img[src*="logo"], img[src*="icon"]').first();
    if ($img.length > 0) {
      imageUrl = $img.attr('src') || 
                 $img.attr('data-src') || 
                 $img.attr('data-lazy-src') || 
                 $img.attr('data-original') ||
                 $img.attr('data-image') ||
                 $img.attr('data-img') ||
                 $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
    }
    
    // Strategy 2: Look for background-image style
    if (!imageUrl) {
      const bgImageMatch = $el.attr('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
      if (bgImageMatch) {
        imageUrl = bgImageMatch[1];
      }
    }
    
    // Strategy 3: Look in child elements with background images
    if (!imageUrl) {
      $el.find('[style*="background-image"], [style*="backgroundImage"], [class*="image"]').each((i, el) => {
        const style = $(el).attr('style') || '';
        const bgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (bgMatch && !imageUrl) {
          imageUrl = bgMatch[1];
          return false; // break
        }
      });
    }
    
    // Strategy 4: Look for picture element
    if (!imageUrl) {
      const $picture = $el.find('picture').first();
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
    
    // Convert relative URLs to absolute
    if (imageUrl && !imageUrl.startsWith('http')) {
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        imageUrl = 'https://www.jiomart.com' + imageUrl;
      } else if (!imageUrl.includes('://')) {
        imageUrl = 'https://www.jiomart.com/' + imageUrl;
      }
    }
    
    // Clean up image URL
    if (imageUrl) {
      imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
        p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=') || p.startsWith('fit=')
      ).join('&') : '');
    }
    
    // Extract product URL from link or use the map
    let productUrl = null;
    
    // Strategy 1: Look for anchor tag with product URL (JioMart uses /p/ pattern)
    const $link = $el.find('a[href*="/p/"]').first();
    if ($link.length > 0) {
      const href = $link.attr('href');
      // Verify it's a product URL (has pattern like /p/category/product-name/id)
      if (href && (href.match(/\/p\/[^\/]+\/[^\/]+\/\d+$/) || href.includes('/p/homeandkitchen/') || href.includes('/p/groceries/'))) {
        productUrl = href;
      }
    }
    
    // Strategy 2: Try to find any link with /p/ pattern in the element
    if (!productUrl) {
      const $anyLink = $el.find('a[href*="/p/"]').first();
      if ($anyLink.length > 0) {
        const href = $anyLink.attr('href');
        if (href && (href.match(/\/p\/[^\/]+\/[^\/]+\/\d+$/) || href.includes('/p/homeandkitchen/') || href.includes('/p/groceries/'))) {
          productUrl = href;
        }
      }
    }
    
    // Strategy 3: Use product URL from the map extracted via Selenium
    // Try exact match first
    if (!productUrl && productUrlsMap[productNameText]) {
      productUrl = productUrlsMap[productNameText];
    }
    
    // Strategy 4: Try partial match (first few words)
    if (!productUrl) {
      const firstWords = productNameText.split(' ').slice(0, 5).join(' ');
      if (firstWords.length > 10 && productUrlsMap[firstWords]) {
        productUrl = productUrlsMap[firstWords];
      }
    }
    
    // Strategy 5: Try fuzzy matching - find URL where product name contains key words
    if (!productUrl) {
      const nameWords = productNameText.toLowerCase().split(' ').filter(w => w.length > 3);
      for (const [mapName, mapUrl] of Object.entries(productUrlsMap)) {
        const mapNameLower = mapName.toLowerCase();
        // Check if at least 2 key words match
        const matchingWords = nameWords.filter(word => mapNameLower.includes(word));
        if (matchingWords.length >= 2) {
          productUrl = mapUrl;
          break;
        }
      }
    }
    
    // Convert relative URLs to absolute
    if (productUrl && !productUrl.startsWith('http')) {
      if (productUrl.startsWith('//')) {
        productUrl = 'https:' + productUrl;
      } else if (productUrl.startsWith('/')) {
        productUrl = 'https://www.jiomart.com' + productUrl;
      } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
        productUrl = 'https://www.jiomart.com/' + productUrl;
      }
    }
    
    // Only add if we have at least a product name and price
    if (productNameText && price) {
      products.push({
        name: productNameText,
        price: price,
        mrp: mrp,
        discount: mrp && price ? mrp - price : null,
        discountAmount: mrp && price ? mrp - price : null,
        isOutOfStock: isOutOfStock,
        imageUrl: imageUrl || null,
        productUrl: productUrl || null
      });
    }
  });
  
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
    website: 'JioMart',
    location: locationName,
    product: productName,
    timestamp: timestamp,
    products: uniqueProducts,
    totalProducts: uniqueProducts.length
  };
}

export { selectLocationOnJioMart, parseJioMartProducts };

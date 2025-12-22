import { selectLocationOnZepto } from './zepto-location-selector.js';
import { selectLocationOnNaturesBasket } from './naturesbasket-location-selector.js';
import { selectLocationOnJioMart } from './jiomart-location-selector.js';
import { selectLocationAndSearchOnDmart } from './dmart-location-selector.js';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Sequential Location Selector Orchestrator
 * 
 * This script runs all four location selector scripts sequentially:
 * 1. Zepto
 * 2. Nature's Basket
 * 3. JioMart
 * 4. D-Mart
 * 
 * Usage:
 *   node sequential-location-selector.js [location] [product]
 * 
 * Examples:
 *   node sequential-location-selector.js Mumbai Chaas
 *   node sequential-location-selector.js Bangalore tomato
 *   node sequential-location-selector.js Chennai potato
 */

// Default values
const DEFAULT_LOCATION = 'Mumbai';
const DEFAULT_PRODUCT = 'Chaas';

// Website configurations
const WEBSITES = [
  {
    name: 'Zepto',
    selector: selectLocationOnZepto,
    defaultProduct: 'Chaas'
  },
  {
    name: "Nature's Basket",
    selector: selectLocationOnNaturesBasket,
    defaultProduct: 'tomato'
  },
  {
    name: 'JioMart',
    selector: selectLocationOnJioMart,
    defaultProduct: 'tomato'
  },
  {
    name: 'D-Mart',
    selector: selectLocationAndSearchOnDmart,
    defaultProduct: 'potato'
  }
];

/**
 * Run location selection for a single website
 */
async function runWebsiteSelector(website, locationName, productName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🛍️  Processing: ${website.name.toUpperCase()}`);
  console.log(`📍 Location: ${locationName}`);
  console.log(`🔍 Product: ${productName}`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();
  
  try {
    const result = await website.selector(locationName, productName);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ ${website.name} completed successfully in ${duration}s`);
    console.log(`   Products extracted: ${result.products?.length || result.totalProducts || 0}`);
    
    return {
      success: true,
      website: website.name,
      location: locationName,
      product: productName,
      duration: duration,
      result: result,
      error: null
    };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.error(`\n❌ ${website.name} failed after ${duration}s`);
    console.error(`   Error: ${error.message}`);
    
    return {
      success: false,
      website: website.name,
      location: locationName,
      product: productName,
      duration: duration,
      result: null,
      error: error.message
    };
  }
}

/**
 * Main function to run all location selectors sequentially
 */
export async function runAllSelectors(locationName, productName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 SEQUENTIAL LOCATION SELECTOR ORCHESTRATOR`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📍 Location: ${locationName}`);
  console.log(`🔍 Product: ${productName}`);
  console.log(`📊 Websites: ${WEBSITES.length}`);
  console.log(`${'='.repeat(80)}\n`);

  const overallStartTime = Date.now();
  const results = [];

  // Run each website sequentially
  for (let i = 0; i < WEBSITES.length; i++) {
    const website = WEBSITES[i];
    console.log(`\n[${i + 1}/${WEBSITES.length}] Starting ${website.name}...`);
    
    // Use default product for each website if productName matches the default product pattern
    // Otherwise use the provided productName
    const siteProduct = productName || website.defaultProduct;
    
    const result = await runWebsiteSelector(website, locationName, siteProduct);
    results.push(result);
    
    // Add a small delay between websites to avoid overwhelming the system
    if (i < WEBSITES.length - 1) {
      console.log(`\n⏳ Waiting 2 seconds before next website...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  const overallDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 EXECUTION SUMMARY`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Total Duration: ${overallDuration}s`);
  console.log(`\nResults:`);
  
  let successCount = 0;
  let totalProducts = 0;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const productCount = result.result?.products?.length || 
                        result.result?.totalProducts || 
                        0;
    totalProducts += productCount;
    
    if (result.success) successCount++;
    
    console.log(`  ${index + 1}. ${status} ${result.website.padEnd(20)} | ` +
                `Products: ${String(productCount).padStart(4)} | ` +
                `Duration: ${result.duration}s`);
    
    if (!result.success) {
      console.log(`     Error: ${result.error}`);
    }
  });
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Success: ${successCount}/${WEBSITES.length} websites`);
  console.log(`Total Products Extracted: ${totalProducts}`);
  console.log(`${'='.repeat(80)}\n`);

  return {
    location: locationName,
    product: productName,
    totalDuration: overallDuration,
    successCount: successCount,
    totalWebsites: WEBSITES.length,
    totalProducts: totalProducts,
    results: results
  };
}

/**
 * Main execution
 */
async function main() {
  // Get location and product from command line arguments
  const locationToSelect = process.argv[2] || DEFAULT_LOCATION;
  const productName = process.argv[3] || DEFAULT_PRODUCT;
  
  try {
    const summary = await runAllSelectors(locationToSelect, productName);
    
    // Return summary for potential programmatic use
    return summary;
  } catch (error) {
    console.error('\n❌ Fatal error in orchestrator:', error);
    throw error;
  }
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
    isMainModule = process.argv[1].endsWith('sequential-location-selector.js') || 
                   process.argv[1].includes('sequential-location-selector.js');
  }
}

if (isMainModule) {
  main().catch(console.error);
}

export { runWebsiteSelector };

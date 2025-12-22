import * as cheerio from 'cheerio';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Extract data from D-Mart HTML
 */
function extractFromDmart(html, filename) {
  const $ = cheerio.load(html);
  const products = [];
  const location = extractLocationFromDmart($);
  console.log(`[DMart] Extracting from HTML (${html.length} chars), location: ${location || 'not found'}`);

  // Strategy 1: Extract from __NEXT_DATA__ JSON (Next.js app)
  try {
    const nextDataScript = $('script#__NEXT_DATA__').html();
    if (nextDataScript) {
      const nextData = JSON.parse(nextDataScript);
      
      // Recursive function to find products in JSON
      const findProductsInObject = (obj, path = '', depth = 0) => {
        if (depth > 15 || !obj || typeof obj !== 'object') return;
        
        if (Array.isArray(obj)) {
          obj.forEach((item, idx) => {
            if (item && typeof item === 'object') {
              // Check if this looks like a product
              const productName = item.name || item.title || item.productName || item.displayName || 
                                item.itemName || item.productTitle || item.product_name || null;
              
              if (productName && typeof productName === 'string' && productName.trim().length > 3 &&
                  (item.price !== undefined || item.sellingPrice !== undefined || item.dmartPrice !== undefined || 
                   item.mrp !== undefined || item.listPrice !== undefined)) {
                const trimmedName = productName.trim();
                
                // Filter out invalid product names (labels, metadata, etc.)
                const invalidNames = ['MRP', 'DMart', 'Price', '₹', 'Rs', 'INR', 'Rupees', 
                                     'Add to Cart', 'Buy Now', 'View Details', 'Out of Stock',
                                     'In Stock', 'Available', 'Unavailable'];
                if (invalidNames.some(invalid => trimmedName === invalid || trimmedName.match(new RegExp(`^${invalid}$`, 'i')))) {
                  return; // Skip this item
                }
                
                // Skip if name is just numbers, symbols, or common labels
                if (trimmedName.match(/^[\d\s₹\-.,]+$/) || // Just numbers and symbols
                    trimmedName.match(/^(MRP|Price|₹|Rs|INR)$/i) ||
                    trimmedName.length < 5) { // Too short to be a real product
                  return;
                }
                
                if (!products.some(p => p.name === trimmedName)) {
                  // Extract image URL from item - try multiple fields (D-Mart specific)
                  let imageUrl = item.image || 
                                item.imageUrl || 
                                item.img || 
                                item.photo || 
                                item.picture || 
                                item.productImage ||
                                item.productImageUrl ||
                                item.thumbnail ||
                                item.thumbnailUrl ||
                                item.media?.image ||
                                item.media?.url ||
                                item.media?.src ||
                                item.images?.[0] ||
                                (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null) ||
                                item.imageUrl || // D-Mart might use this
                                item.product?.image ||
                                item.product?.imageUrl ||
                                item.product?.thumbnail ||
                                null;
                  
                  // If imageUrl is an object, try to get URL from it
                  if (imageUrl && typeof imageUrl === 'object') {
                    imageUrl = imageUrl.url || imageUrl.src || imageUrl.image || imageUrl.original || imageUrl.secure_url || null;
                  }
                  
                  // If imageUrl is an array, get the first element
                  if (Array.isArray(imageUrl) && imageUrl.length > 0) {
                    imageUrl = imageUrl[0];
                    if (typeof imageUrl === 'object') {
                      imageUrl = imageUrl.url || imageUrl.src || imageUrl.image || null;
                    }
                  }
                  
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
                  
                  // Extract product URL from JSON data
                  let productUrl = item.url || item.link || item.href || item.productUrl || item.productLink || 
                                  item.slug ? `https://www.dmart.in/${item.slug}` : null;
                  
                  // Convert relative URLs to absolute
                  if (productUrl && !productUrl.startsWith('http')) {
                    if (productUrl.startsWith('//')) {
                      productUrl = 'https:' + productUrl;
                    } else if (productUrl.startsWith('/')) {
                      productUrl = 'https://www.dmart.in' + productUrl;
                    } else if (!productUrl.includes('://')) {
                      productUrl = 'https://www.dmart.in/' + productUrl;
                    }
                  }
                  
                  products.push({
                    name: trimmedName,
                    price: item.price || item.sellingPrice || item.dmartPrice || item.currentPrice || null,
                    mrp: item.mrp || item.listPrice || item.originalPrice || null,
                    website: 'DMart',
                    imageUrl: imageUrl,
                    productUrl: productUrl
                  });
                }
              } else {
                findProductsInObject(item, `${path}[${idx}]`, depth + 1);
              }
            }
          });
        } else {
          Object.keys(obj).forEach(key => {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('product') || keyLower.includes('item') || 
                keyLower.includes('search') || keyLower.includes('listing') ||
                keyLower.includes('result') || keyLower.includes('data') ||
                keyLower.includes('pageprops') || keyLower.includes('props')) {
              findProductsInObject(obj[key], `${path}.${key}`, depth + 1);
            }
          });
        }
      };
      
      findProductsInObject(nextData);
      console.log(`[DMart] Strategy 1 (JSON): Found ${products.length} products`);
    }
  } catch (e) {
    // JSON parsing failed, continue to DOM extraction
    console.log(`[DMart] Strategy 1 (JSON): Failed - ${e.message}`);
  }

  // Strategy 2: Extract from DOM using specific class names (if products not found in JSON)
  if (products.length === 0) {
    console.log(`[DMart] Trying Strategy 2 (DOM class names)...`);
    // Extract products from vertical cards (grid view)
    $('[class*="vertical-card"][class*="title"]').each((index, element) => {
      const productName = $(element).text().trim();
      if (!productName || productName.length < 3) return;
      
      // Filter out invalid product names (labels, metadata, etc.)
      const invalidNames = ['MRP', 'DMart', 'Price', '₹', 'Rs', 'INR', 'Rupees', 
                           'Add to Cart', 'Buy Now', 'View Details', 'Out of Stock',
                           'In Stock', 'Available', 'Unavailable'];
      if (invalidNames.some(invalid => productName === invalid || productName.match(new RegExp(`^${invalid}$`, 'i')))) {
        return; // Skip this element
      }
      
      // Skip if name is just numbers, symbols, or common labels
      if (productName.match(/^[\d\s₹\-.,]+$/) || // Just numbers and symbols
          productName.match(/^(MRP|Price|₹|Rs|INR)$/i) ||
          productName.length < 5) { // Too short to be a real product
        return;
      }
      
      const productCard = $(element).closest('[class*="vertical-card"], [class*="card"]').first();
      
      let price = null;
      let mrp = null;
      
      // Try to find price in the same card
      const priceContainer = productCard.find('[class*="price"]');
      if (priceContainer.length > 0) {
        const priceText = priceContainer.text();
        const priceMatches = priceText.match(/₹\s*(\d+[.,]?\d*)/g);
        if (priceMatches && priceMatches.length > 0) {
          const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null);
          if (prices.length > 1) {
            mrp = prices[0];
            price = prices[1];
          } else if (prices.length === 1) {
            price = prices[0];
          }
        }
      }

      // Extract image URL - try multiple strategies for D-Mart
      let imageUrl = null;
      
      // Strategy 1: Look for image in product image container
      const $imageContainer = productCard.find('[class*="image"], [class*="img"], [class*="product-image"], [class*="thumbnail"]').first();
      if ($imageContainer.length > 0) {
        const $img = $imageContainer.find('img').not('img[alt*="logo"], img[alt*="icon"]').first();
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
      
      // Strategy 2: Find img tag (exclude logos/icons) - prioritize src attribute
      if (!imageUrl) {
        // Try to find img with actual src first
        let $img = productCard.find('img[src]').not('img[alt*="logo"], img[alt*="icon"], img[src*="logo"], img[src*="icon"], img[src^="data:image/svg"], img[width="1"], img[height="1"]').first();
        if ($img.length === 0 || !$img.attr('src') || $img.attr('src').trim() === '') {
          // Fallback to any img tag
          $img = productCard.find('img').not('img[alt*="logo"], img[alt*="icon"], img[src*="logo"], img[src*="icon"], img[width="1"], img[height="1"]').first();
        }
        if ($img.length > 0) {
          // Prioritize src over data attributes
          imageUrl = $img.attr('src') || 
                     $img.attr('data-src') || 
                     $img.attr('data-lazy-src') || 
                     $img.attr('data-original') ||
                     $img.attr('data-image') ||
                     $img.attr('data-img') ||
                     $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
        }
      }
      
      // Strategy 3: Look for picture element
      if (!imageUrl) {
        const $picture = productCard.find('picture').first();
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
      
      // Strategy 4: Look for Next.js optimized images
      if (!imageUrl) {
        const $nextImg = productCard.find('img[src*="dmart"], img[data-src*="dmart"], img[src*="cdn"], img[data-src*="cdn"], img[src*="vercel"]').first();
        if ($nextImg.length > 0) {
          imageUrl = $nextImg.attr('src') || $nextImg.attr('data-src') || $nextImg.attr('data-lazy-src');
        }
      }
      
      // Strategy 5: Background image
      if (!imageUrl) {
        const bgMatch = productCard.attr('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (bgMatch) {
          imageUrl = bgMatch[1];
        }
      }
      
      // Strategy 6: Look in child elements with background images
      if (!imageUrl) {
        productCard.find('[style*="background-image"], [style*="backgroundImage"]').each((i, el) => {
          const style = $(el).attr('style') || '';
          const bgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (bgMatch && !imageUrl) {
            imageUrl = bgMatch[1];
            return false;
          }
        });
      }
      
      // Convert and clean URL
      if (imageUrl && !imageUrl.startsWith('http')) {
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          imageUrl = 'https://www.dmart.in' + imageUrl;
        } else if (!imageUrl.includes('://')) {
          imageUrl = 'https://www.dmart.in/' + imageUrl;
        }
      }
      
      if (imageUrl) {
        imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
          p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
        ).join('&') : '');
      }
      
      // Extract product URL from link
      let productUrl = null;
      const $link = productCard.find('a[href*="/product"], a[href*="/p/"], a[href*="/item"]').first();
      if ($link.length > 0) {
        productUrl = $link.attr('href');
      } else {
        // Try to find any link in the card
        const $anyLink = productCard.find('a[href]').first();
        if ($anyLink.length > 0) {
          const href = $anyLink.attr('href');
          // Only use if it looks like a product URL
          if (href && (href.includes('/product') || href.includes('/p/') || href.includes('/item') || !href.startsWith('#'))) {
            productUrl = href;
          }
        }
      }
      
      // Convert relative URLs to absolute
      if (productUrl && !productUrl.startsWith('http')) {
        if (productUrl.startsWith('//')) {
          productUrl = 'https:' + productUrl;
        } else if (productUrl.startsWith('/')) {
          productUrl = 'https://www.dmart.in' + productUrl;
        } else if (!productUrl.includes('://') && !productUrl.startsWith('#')) {
          productUrl = 'https://www.dmart.in/' + productUrl;
        }
      }
      
      // Final validation - filter out invalid product names
      const invalidNames = ['MRP', 'DMart', 'Price', '₹', 'Rs', 'INR', 'Rupees', 
                           'Add to Cart', 'Buy Now', 'View Details', 'Out of Stock',
                           'In Stock', 'Available', 'Unavailable'];
      if (invalidNames.some(invalid => productName === invalid || productName.match(new RegExp(`^${invalid}$`, 'i')))) {
        return; // Skip this product
      }
      
      // Skip if name is just numbers, symbols, or common labels
      if (productName.match(/^[\d\s₹\-.,]+$/) || // Just numbers and symbols
          productName.match(/^(MRP|Price|₹|Rs|INR)$/i) ||
          productName.length < 5) { // Too short to be a real product
        return;
      }
        
        if (productName && !products.some(p => p.name === productName)) {
          products.push({
            name: productName,
            price: price,
            mrp: mrp,
            website: 'DMart',
            imageUrl: imageUrl,
            productUrl: productUrl
          });
        }
    });

    // Also extract from stretched cards (list view)
    $('[class*="stretched-card"][class*="title"]').each((index, element) => {
      const productName = $(element).text().trim();
      if (productName && productName.length > 3 && !products.some(p => p.name === productName)) {
        const productCard = $(element).closest('[class*="stretched-card"], [class*="card"]').first();
        
        let price = null;
        let mrp = null;
        // Try to find price in stretched card
        const priceText = productCard.text();
        const priceMatches = priceText.match(/₹\s*(\d+[.,]?\d*)/g);
        if (priceMatches && priceMatches.length > 0) {
          const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null);
          if (prices.length > 1) {
            mrp = prices[0];
            price = prices[1];
          } else if (prices.length === 1) {
            price = prices[0];
          }
        }

        // Extract image URL - try multiple strategies
        let imageUrl = null;
        const $img = productCard.find('img').not('img[alt*="logo"], img[alt*="icon"], img[src*="logo"], img[src*="icon"]').first();
        if ($img.length > 0) {
          imageUrl = $img.attr('src') || 
                     $img.attr('data-src') || 
                     $img.attr('data-lazy-src') || 
                     $img.attr('data-original') ||
                     $img.attr('data-image') ||
                     $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
        }
        
        if (!imageUrl) {
          const $picture = productCard.find('picture').first();
          if ($picture.length > 0) {
            const $img = $picture.find('img').first();
            if ($img.length > 0) {
              imageUrl = $img.attr('src') || $img.attr('data-src');
            }
          }
        }
        
        if (imageUrl && !imageUrl.startsWith('http')) {
          if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl;
          } else if (imageUrl.startsWith('/')) {
            imageUrl = 'https://www.dmart.in' + imageUrl;
          } else if (!imageUrl.includes('://')) {
            imageUrl = 'https://www.dmart.in/' + imageUrl;
          }
        }
        
        if (imageUrl) {
          imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
            p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
          ).join('&') : '');
        }

        // Extract product URL from link
        let productUrl = null;
        const $link = productCard.find('a[href*="/product"], a[href*="/p/"], a[href*="/item"]').first();
        if ($link.length > 0) {
          productUrl = $link.attr('href');
        } else {
          const $anyLink = productCard.find('a[href]').first();
          if ($anyLink.length > 0) {
            const href = $anyLink.attr('href');
            if (href && (href.includes('/product') || href.includes('/p/') || href.includes('/item') || !href.startsWith('#'))) {
              productUrl = href;
            }
          }
        }
        
        // Convert relative URLs to absolute
        if (productUrl && !productUrl.startsWith('http')) {
          if (productUrl.startsWith('//')) {
            productUrl = 'https:' + productUrl;
          } else if (productUrl.startsWith('/')) {
            productUrl = 'https://www.dmart.in' + productUrl;
          } else if (!productUrl.includes('://') && !productUrl.startsWith('#')) {
            productUrl = 'https://www.dmart.in/' + productUrl;
          }
        }

        products.push({
          name: productName,
          price: price,
          mrp: mrp,
          website: 'DMart',
          imageUrl: imageUrl,
          productUrl: productUrl
        });
      }
    });
    console.log(`[DMart] Strategy 2 (DOM): Found ${products.length} products`);
  }

  // Strategy 3: Generic extraction - look for any elements with product-like patterns
  if (products.length === 0) {
    console.log(`[DMart] Trying Strategy 3 (Generic extraction)...`);
    const excludedTexts = ['Home', 'Cart', 'Search', 'Menu', 'Login', 'Sign', 'Register', 'Categories', 'All'];
    
    // Look for elements that contain both text and price
    $('div, article, section, li').each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      
      // Skip if too short or matches excluded items
      if (text.length < 10 || excludedTexts.some(ex => text === ex || text.startsWith(ex))) {
        return;
      }
      
      // Look for price indicators
      const hasPrice = text.match(/₹\s*\d+|\d+\s*₹/);
      if (!hasPrice) return;
      
      // Try to extract product name
      const productName = $el.find('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"]').first().text().trim() ||
                          text.split('\n')[0].trim().split('₹')[0].trim();
      
      if (!productName || productName.length < 3 || excludedTexts.includes(productName)) return;
      
      // Extract prices
      let mrp = null;
      let price = null;
      const priceMatches = text.match(/₹\s*(\d+(?:[.,]\d+)?)/g);
      
      if (priceMatches && priceMatches.length > 0) {
        const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null);
        if (prices.length > 1) {
          mrp = prices[0];
          price = prices[1];
        } else if (prices.length === 1) {
          price = prices[0];
        }
      }

      // Extract image URL - try multiple strategies
      let imageUrl = null;
      const $img = $el.find('img').not('img[alt*="logo"], img[alt*="icon"], img[src*="logo"], img[src*="icon"]').first();
      if ($img.length > 0) {
        imageUrl = $img.attr('src') || 
                   $img.attr('data-src') || 
                   $img.attr('data-lazy-src') || 
                   $img.attr('data-original') ||
                   $img.attr('data-image') ||
                   $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
      }
      
      if (!imageUrl) {
        const $picture = $el.find('picture').first();
        if ($picture.length > 0) {
          const $img = $picture.find('img').first();
          if ($img.length > 0) {
            imageUrl = $img.attr('src') || $img.attr('data-src');
          }
        }
      }
      
      if (imageUrl && !imageUrl.startsWith('http')) {
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          imageUrl = 'https://www.dmart.in' + imageUrl;
        } else if (!imageUrl.includes('://')) {
          imageUrl = 'https://www.dmart.in/' + imageUrl;
        }
      }
      
      if (imageUrl) {
        imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
          p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
        ).join('&') : '');
      }
      
      // Extract product URL from link
      let productUrl = null;
      const $link = $el.find('a[href*="/product"], a[href*="/p/"], a[href*="/item"]').first();
      if ($link.length > 0) {
        productUrl = $link.attr('href');
      } else {
        const $anyLink = $el.find('a[href]').first();
        if ($anyLink.length > 0) {
          const href = $anyLink.attr('href');
          if (href && (href.includes('/product') || href.includes('/p/') || href.includes('/item') || !href.startsWith('#'))) {
            productUrl = href;
          }
        }
      }
      
      // Convert relative URLs to absolute
      if (productUrl && !productUrl.startsWith('http')) {
        if (productUrl.startsWith('//')) {
          productUrl = 'https:' + productUrl;
        } else if (productUrl.startsWith('/')) {
          productUrl = 'https://www.dmart.in' + productUrl;
        } else if (!productUrl.includes('://') && !productUrl.startsWith('#')) {
          productUrl = 'https://www.dmart.in/' + productUrl;
        }
      }
      
      // Only add if we haven't seen this product name before and it's not a navigation item
      if (!products.some(p => p.name === productName) && 
          !excludedTexts.some(ex => productName.includes(ex))) {
        products.push({
          name: productName,
          price: price,
          mrp: mrp,
          website: 'DMart',
          imageUrl: imageUrl,
          productUrl: productUrl
        });
      }
    });
    console.log(`[DMart] Strategy 3 (Generic): Found ${products.length} products`);
  }

  console.log(`[DMart] Final result: ${products.length} products extracted`);
  return {
    website: 'DMart',
    location: location,
    products: products,
    filename: filename
  };
}

/**
 * Extract location from D-Mart HTML
 */
function extractLocationFromDmart($) {
  // Try to find location in header - pincode element
  const pincodeElement = $('.header_pincode__KryhE').first();
  if (pincodeElement.length > 0) {
    let locationText = pincodeElement.text().trim();
    // Clean up the location text - remove extra whitespace and format
    locationText = locationText.replace(/\s+/g, ' ').trim();
    
    // Format pincode+city to readable format (e.g., "400053Mumbai" -> "Mumbai (400053)")
    const pincodeMatch = locationText.match(/^(\d{6})([A-Za-z]+)$/);
    if (pincodeMatch) {
      const pincode = pincodeMatch[1];
      const city = pincodeMatch[2];
      return `${city} (${pincode})`;
    }
    
    // If it's just pincode, try to map to city
    if (locationText.match(/^\d{6}$/)) {
      const pincode = locationText;
      // Common pincode ranges
      if (pincode.startsWith('400')) return `Mumbai (${pincode})`;
      if (pincode.startsWith('560')) return `Bengaluru (${pincode})`;
      if (pincode.startsWith('600')) return `Chennai (${pincode})`;
      if (pincode.startsWith('110')) return `Delhi (${pincode})`;
      if (pincode.startsWith('700')) return `Kolkata (${pincode})`;
      return locationText; // Return as-is if can't map
    }
    
    if (locationText && locationText.length < 100) {
      return locationText;
    }
  }
  
  // Try to find in any location-related element in header
  const headerLocation = $('header [class*="pincode"], header [class*="location"], header [class*="area"]').first();
  if (headerLocation.length > 0) {
    let locationText = headerLocation.text().trim().replace(/\s+/g, ' ');
    
    // Format pincode+city
    const pincodeMatch = locationText.match(/^(\d{6})([A-Za-z]+)$/);
    if (pincodeMatch) {
      const pincode = pincodeMatch[1];
      const city = pincodeMatch[2];
      return `${city} (${pincode})`;
    }
    
    if (locationText && locationText.length < 100) {
      return locationText;
    }
  }
  
  // Try to extract from JSON data (__NEXT_DATA__)
  try {
    const nextDataScript = $('script#__NEXT_DATA__').html();
    if (nextDataScript) {
      const nextData = JSON.parse(nextDataScript);
      // Look for location/pincode in the JSON structure
      const findLocation = (obj, depth = 0) => {
        if (depth > 15 || !obj || typeof obj !== 'object') return null;
        if (typeof obj === 'string') {
          // Check if it's a pincode or location
          if (obj.match(/^\d{6}[A-Za-z]+$/) || obj.match(/^\d{6}$/)) {
            const pincodeMatch = obj.match(/^(\d{6})([A-Za-z]+)$/);
            if (pincodeMatch) {
              return `${pincodeMatch[2]} (${pincodeMatch[1]})`;
            }
            return obj;
          }
          return null;
        }
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const loc = findLocation(item, depth + 1);
            if (loc) return loc;
          }
        } else {
          for (const key in obj) {
            if (key.toLowerCase().includes('pincode') || key.toLowerCase().includes('location') || 
                key.toLowerCase().includes('city') || key.toLowerCase().includes('area')) {
              const loc = findLocation(obj[key], depth + 1);
              if (loc) return loc;
            }
          }
        }
        return null;
      };
      const loc = findLocation(nextData);
      if (loc) return loc;
    }
  } catch (e) {
    // Ignore JSON parsing errors
  }
  
  return null;
}

/**
 * Extract data from JioMart HTML
 */
function extractFromJioMart(html, filename) {
  const $ = cheerio.load(html);
  const products = [];
  const location = extractLocationFromJioMart($);

  // JioMart product selectors - look for specific product card patterns
  // Filter out navigation items and other non-product elements
  const excludedTexts = ['Home', 'Shop By Category', 'My Orders', 'My Account', 'Cart', 'Login', 'Sign Up', 'Search', 'Menu'];
  
  $('[class*="product"], [class*="item-card"], [class*="jm-product"], [data-testid*="product"]').each((index, element) => {
    const $el = $(element);
    
    // Skip if it's clearly a navigation element
    const elementText = $el.text().trim();
    if (excludedTexts.some(text => elementText.includes(text) && elementText.length < 50)) {
      return;
    }
    
    // Try multiple selectors for product name - look for product-specific classes
    const productName = $el.find('[class*="product-title"], [class*="product-name"], [class*="item-title"], [class*="title"]').first().text().trim();
    
    // If no specific product title found, try to find any heading that's not too short
    const fallbackName = productName || $el.find('h2, h3, h4, h5, [class*="name"]').first().text().trim();
    
    // Validate product name - should be meaningful and not a navigation item
    if (fallbackName && fallbackName.length > 5 && 
        !excludedTexts.some(text => fallbackName.includes(text)) &&
        !fallbackName.match(/^(Home|Shop|My|Cart|Login|Sign|Search|Menu)$/i)) {
      
      // Try to find price
      let price = null;
      let mrp = null;
      
      // Look for price in specific price containers
      const priceElement = $el.find('[class*="price"], [class*="amount"], [class*="cost"]').first();
      if (priceElement.length > 0) {
        const priceText = priceElement.text();
        const priceMatches = priceText.match(/₹\s*(\d+[.,]?\d*)/g);
        if (priceMatches && priceMatches.length > 0) {
          const prices = priceMatches.map(m => extractPrice(m));
          if (prices.length > 1) {
            mrp = prices[0];
            price = prices[1];
          } else {
            price = prices[0];
          }
        }
      } else {
        // Fallback: search in entire element text
        const priceText = $el.text();
        const priceMatches = priceText.match(/₹\s*(\d+[.,]?\d*)/g);
        if (priceMatches && priceMatches.length > 0) {
          const prices = priceMatches.map(m => extractPrice(m));
          if (prices.length > 1) {
            mrp = prices[0];
            price = prices[1];
          } else {
            price = prices[0];
          }
        }
      }

      // Extract image URL - try multiple strategies for JioMart
      let imageUrl = null;
      
      // Strategy 1: Look for image in product image container
      const $imageContainer = $el.find('[class*="image"], [class*="img"], [class*="product-image"], [class*="product-img"], [class*="item-image"], [class*="thumbnail"]').first();
      if ($imageContainer.length > 0) {
        const $img = $imageContainer.find('img').not('img[alt*="logo"], img[alt*="icon"]').first();
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
      
      // Strategy 2: Find img tag (exclude logos/icons)
      if (!imageUrl) {
        const $img = $el.find('img').not('img[alt*="logo"], img[alt*="icon"], img[src*="logo"], img[src*="icon"], img[width="1"], img[height="1"]').first();
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
      
      // Strategy 3: Look for product image with alt matching product name
      if (!imageUrl && fallbackName) {
        const $productImg = $el.find('img[alt*="' + fallbackName.substring(0, 15) + '"]').first();
        if ($productImg.length > 0) {
          imageUrl = $productImg.attr('src') || $productImg.attr('data-src') || $productImg.attr('data-lazy-src');
        }
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
      
      // Strategy 5: Look for Next.js optimized images
      if (!imageUrl) {
        const $nextImg = $el.find('img[src*="jiomart"], img[data-src*="jiomart"], img[src*="cdn"], img[data-src*="cdn"], img[src*="vercel"]').first();
        if ($nextImg.length > 0) {
          imageUrl = $nextImg.attr('src') || $nextImg.attr('data-src') || $nextImg.attr('data-lazy-src');
        }
      }
      
      // Strategy 6: Background image
      if (!imageUrl) {
        const bgMatch = $el.attr('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (bgMatch) {
          imageUrl = bgMatch[1];
        }
      }
      
      // Strategy 7: Look in child elements with background images
      if (!imageUrl) {
        $el.find('[style*="background-image"], [style*="backgroundImage"], [class*="image"]').each((i, el) => {
          const style = $(el).attr('style') || '';
          const bgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (bgMatch && !imageUrl) {
            imageUrl = bgMatch[1];
            return false;
          }
        });
      }
      
      // Convert and clean URL
      if (imageUrl && !imageUrl.startsWith('http')) {
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          imageUrl = 'https://www.jiomart.com' + imageUrl;
        } else if (!imageUrl.includes('://')) {
          imageUrl = 'https://www.jiomart.com/' + imageUrl;
        }
      }
      
      if (imageUrl) {
        imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
          p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
        ).join('&') : '');
      }
      
      // Extract product URL from link
      let productUrl = null;
      const $link = $el.find('a[href*="/p/"], a[href*="/product"], a[href*="/pd/"]').first();
      if ($link.length > 0) {
        productUrl = $link.attr('href');
      } else {
        const $anyLink = $el.find('a[href]').first();
        if ($anyLink.length > 0) {
          const href = $anyLink.attr('href');
          if (href && (href.includes('/p/') || href.includes('/product') || href.includes('/pd/') || (!href.startsWith('#') && !href.startsWith('javascript:')))) {
            productUrl = href;
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
      
      // Only add if we haven't seen this product name before
      if (!products.some(p => p.name === fallbackName)) {
        products.push({
          name: fallbackName,
          price: price,
          mrp: mrp,
          website: 'JioMart',
          imageUrl: imageUrl,
          productUrl: productUrl
        });
      }
    }
  });

  return {
    website: 'JioMart',
    location: location,
    products: products,
    filename: filename
  };
}

/**
 * Extract location from JioMart HTML
 */
function extractLocationFromJioMart($) {
  // Try to find location in header or location selector
  // Exclude delivery time text and extract only location name
  const locationSelectors = [
    // Header location (most reliable)
    'header [class*="location"]:not([class*="delivery"]):not([class*="time"])',
    'header [class*="pincode"]',
    'header [class*="area"]',
    'header [class*="address"]',
    // Location selector button (before clicking)
    '[class*="location"][class*="selector"]:not([class*="delivery"])',
    '[class*="location"][class*="button"]:not([class*="delivery"])',
    // General location elements (but exclude delivery time)
    '[class*="location"]:not([class*="delivery"]):not([class*="time"]):not([class*="minutes"])',
    '[class*="pincode"]',
    '[class*="area"]',
    '[class*="address"]',
    '[data-testid*="location"]'
  ];

  const excludedPatterns = [
    /^\d+\s*-\s*\d+\s*Minutes/i, // "10 - 30 Minutes"
    /Scheduled delivery/i,
    /Delivering to/i,
    /Delivery time/i,
    /Minutes/i
  ];

  for (const selector of locationSelectors) {
    const elements = $(selector);
    elements.each((i, el) => {
      let text = $(el).text().trim();
      
      // Remove delivery time information
      // Pattern: "10 - 30 Minutes    Scheduled delivery to:  Jayanagar, Kalasipalyam New..."
      // Extract only the location part after "to:"
      const deliveryMatch = text.match(/Scheduled delivery to:\s*(.+)/i);
      if (deliveryMatch) {
        text = deliveryMatch[1].trim();
      }
      
      // Remove "Delivering to:" prefix
      text = text.replace(/^Delivering to:\s*/i, '').trim();
      
      // Remove delivery time patterns
      text = text.replace(/\d+\s*-\s*\d+\s*Minutes\s*/i, '').trim();
      text = text.replace(/Scheduled delivery to:\s*/i, '').trim();
      
      // Check if text matches excluded patterns
      const isExcluded = excludedPatterns.some(pattern => pattern.test(text));
      if (isExcluded) return; // Skip this element
      
      // Extract location name (take first part before comma or common separators)
      if (text.includes(',')) {
        text = text.split(',')[0].trim();
      }
      if (text.includes('...')) {
        text = text.split('...')[0].trim();
      }
      
      if (text && 
          text.length > 3 && 
          text.length < 100 &&
          !text.match(/^(Select|Location|Change|Update|Delivery|Pickup|Cart|Home|Menu)$/i) &&
          !text.match(/^\d+\s*-\s*\d+\s*Minutes$/i) && // Not just delivery time
          text.match(/[A-Za-z]/)) { // Has letters
        return text;
      }
    });
  }

  return null;
}

/**
 * Extract data from Nature's Basket HTML
 */
function extractFromNaturesBasket(html, filename) {
  const $ = cheerio.load(html);
  const products = [];
  const location = extractLocationFromNaturesBasket($);

  // Nature's Basket uses product links with h3 tags inside
  // Structure: <a href="/product-detail/..."><h3>Product Name</h3></a>
  $('a[href*="/product-detail/"]').each((index, element) => {
    const $link = $(element);
    
    // Extract product name from h3 tag inside the link
    const productName = $link.find('h3').first().text().trim() || 
                       $link.text().trim();
    
    if (!productName || productName.length < 3) return;
    
    // Extract product URL from the link
    let productUrl = $link.attr('href');
    
    // Convert relative URLs to absolute
    if (productUrl && !productUrl.startsWith('http')) {
      if (productUrl.startsWith('//')) {
        productUrl = 'https:' + productUrl;
      } else if (productUrl.startsWith('/')) {
        productUrl = 'https://www.naturesbasket.co.in' + productUrl;
      } else if (!productUrl.includes('://') && !productUrl.startsWith('#')) {
        productUrl = 'https://www.naturesbasket.co.in/' + productUrl;
      }
    }
    
    // Find the parent container that likely contains price information
    const $container = $link.closest('div, article, section, li');
    
    // Extract prices from the container
    let mrp = null;
    let price = null;
    const containerText = $container.text();
    const priceMatches = containerText.match(/₹\s*(\d+(?:\.\d+)?)/g);
    
    if (priceMatches && priceMatches.length > 0) {
      const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null && p > 0);
      if (prices.length > 0) {
        // Check for strikethrough (MRP) vs regular price
        const hasStrike = $container.find('s, del, [style*="line-through"], [style*="text-decoration: line-through"], [class*="strike"], [class*="line-through"]').length > 0;
        if (hasStrike && prices.length > 1) {
          // First price with strike is MRP, second is selling price
          mrp = prices[0];
          price = prices[1];
        } else if (prices.length > 1) {
          // If multiple prices, assume first is MRP, second is selling price
          mrp = prices[0];
          price = prices[1];
        } else {
          // Single price - assume it's the selling price
          price = prices[0];
        }
      }
    }

    // Extract image URL - try multiple strategies for Nature's Basket
    let imageUrl = null;
    
    // Strategy 1: Find img in container or link - prioritize src attribute
    let $img = $container.find('img[src]').not('img[src^="data:image/svg"]').first();
    if ($img.length === 0 || !$img.attr('src') || $img.attr('src').trim() === '') {
      $img = $container.find('img').first();
    }
    if ($img.length === 0) {
      let $linkImg = $link.find('img[src]').not('img[src^="data:image/svg"]').first();
      if ($linkImg.length === 0 || !$linkImg.attr('src') || $linkImg.attr('src').trim() === '') {
        $linkImg = $link.find('img').first();
      }
      if ($linkImg.length > 0) {
        imageUrl = $linkImg.attr('src') || 
                   $linkImg.attr('data-src') || 
                   $linkImg.attr('data-lazy-src') || 
                   $linkImg.attr('data-original') ||
                   $linkImg.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
      }
    } else {
      // Prioritize src over data attributes
      imageUrl = $img.attr('src') || 
                 $img.attr('data-src') || 
                 $img.attr('data-lazy-src') || 
                 $img.attr('data-original') ||
                 $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
    }
    
    // Strategy 2: Look for product image in link
    if (!imageUrl) {
      const $productImg = $link.find('img[src*="product"], img[data-src*="product"]').first();
      if ($productImg.length > 0) {
        imageUrl = $productImg.attr('src') || $productImg.attr('data-src');
      }
    }
    
    // Strategy 3: Background image
    if (!imageUrl) {
      const bgMatch = $container.attr('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
      if (bgMatch) {
        imageUrl = bgMatch[1];
      }
    }
    
    // Convert and clean URL
    if (imageUrl && !imageUrl.startsWith('http')) {
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        imageUrl = 'https://www.naturesbasket.co.in' + imageUrl;
      } else if (!imageUrl.includes('://')) {
        imageUrl = 'https://www.naturesbasket.co.in/' + imageUrl;
      }
    }
    
    if (imageUrl) {
      imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
        p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
      ).join('&') : '');
    }
    
    // Only add if we have a product name and price
    if (productName && price && productName.length >= 3) {
      // Remove duplicates
      if (!products.some(p => p.name === productName)) {
        products.push({
          name: productName,
          price: price,
          mrp: mrp,
          website: 'naturesbasket',
          imageUrl: imageUrl,
          productUrl: productUrl
        });
      }
    }
  });

  // Remove duplicates
  const uniqueProducts = [];
  const seenNames = new Set();
  for (const product of products) {
    const normalizedName = product.name.toLowerCase().trim();
    if (!seenNames.has(normalizedName) && product.name.length > 3) {
      seenNames.add(normalizedName);
      uniqueProducts.push(product);
    }
  }

  return {
    website: 'naturesbasket',
    location: location,
    products: uniqueProducts,
    filename: filename
  };
}

/**
 * Extract location from Nature's Basket HTML
 */
function extractLocationFromNaturesBasket($) {
  // Nature's Basket location selectors - try multiple strategies
  const locationSelectors = [
    // Header location elements
    'header [class*="location"]',
    'header [class*="pincode"]',
    'header [class*="area"]',
    'header [class*="address"]',
    'header [class*="city"]',
    // Location selector button/text
    '[class*="location"][class*="selector"]',
    '[class*="location"][class*="button"]',
    '[id*="location"]',
    // Delivery address elements
    '[class*="delivery"][class*="address"]',
    '[class*="delivery"][class*="location"]',
    // General location elements
    '[class*="location"]:not([class*="select"]):not([class*="button"]):not([class*="icon"])',
    '[class*="pincode"]',
    '[class*="area"]',
    '[class*="address"]',
    '[class*="city"]'
  ];

  const excludedTexts = [
    'Select Location', 'Select', 'Location', 'Change Location',
    'Update Location', 'Delivery', 'Pickup', 'Cart', 'Home', 'Menu'
  ];

  for (const selector of locationSelectors) {
    const elements = $(selector);
    elements.each((i, el) => {
      const text = $(el).text().trim();
      // Filter out excluded texts and ensure it looks like a location
      if (text && 
          text.length > 3 && 
          text.length < 100 &&
          !excludedTexts.some(excluded => text.toLowerCase() === excluded.toLowerCase() || text.includes(excluded)) &&
          !text.match(/^(Select|Location|Change|Update|Delivery|Pickup|Cart|Home|Menu)$/i) &&
          // Should contain location-like text
          text.match(/[A-Za-z]/)) {
        return text;
      }
    });
  }

  // Try to extract from meta tags or JSON data
  try {
    const jsonScripts = $('script[type="application/json"], script#__NEXT_DATA__');
    jsonScripts.each((i, script) => {
      try {
        const jsonData = JSON.parse($(script).html());
        // Recursively search for location in JSON
        const findLocation = (obj, depth = 0) => {
          if (depth > 10 || !obj || typeof obj !== 'object') return null;
          if (typeof obj === 'string' && obj.length > 3 && obj.length < 100 && 
              obj.match(/[A-Za-z]/) && !excludedTexts.some(t => obj.includes(t))) {
            return obj;
          }
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const loc = findLocation(item, depth + 1);
              if (loc) return loc;
            }
          } else {
            for (const key in obj) {
              if (key.toLowerCase().includes('location') || key.toLowerCase().includes('address') || 
                  key.toLowerCase().includes('city') || key.toLowerCase().includes('area') ||
                  key.toLowerCase().includes('pincode') || key.toLowerCase().includes('delivery')) {
                const loc = findLocation(obj[key], depth + 1);
                if (loc) return loc;
              }
            }
          }
          return null;
        };
        const loc = findLocation(jsonData);
        if (loc) return loc;
      } catch (e) {
        // Not valid JSON, continue
      }
    });
  } catch (e) {
    // Ignore JSON parsing errors
  }

  return null;
}

/**
 * Extract data from Zepto HTML
 */
function extractFromZepto(html, filename) {
  const $ = cheerio.load(html);
  const products = [];
  const location = extractLocationFromZepto($);

  // Zepto uses data-slot-id="ProductName" for product names
  // Product names are also in img alt/title attributes
  // Strategy 1: Find products by img alt/title (primary method for Zepto)
  $('img[alt], img[title]').each((index, element) => {
    const $img = $(element);
    let productName = $img.attr('alt')?.trim() || $img.attr('title')?.trim();
    
    if (!productName || productName.length < 3) return;
    
    // Skip if it's not a product image (check for common non-product alt text)
    if (productName.match(/^(P3|Ad|logo|icon|button|arrow|close|menu|search|Zepto)$/i) || 
        productName.match(/\.(png|jpg|jpeg|gif|svg)$/i) || // Skip image filenames
        productName.length < 5) return;
    
    // Find the parent container - look for a div that contains both the img and price
    let $container = $img.parent();
    let depth = 0;
    const maxDepth = 5;
    
    // Walk up the DOM tree to find a container with price
    while (depth < maxDepth && $container.length > 0) {
      const containerText = $container.text();
      const hasPrice = containerText.match(/₹\s*\d+/);
      
      if (hasPrice) {
        break; // Found a container with price
      }
      
      $container = $container.parent();
      depth++;
    }
    
    // If no container with price found, try siblings
    if (!$container.text().match(/₹\s*\d+/)) {
      $container = $img.closest('div, article, section');
    }
    
    // Must have price in the container
    const hasPrice = $container.text().match(/₹\s*\d+/);
    if (!hasPrice) return;
    
    // Extract prices
    let mrp = null;
    let price = null;
    const containerText = $container.text();
    const priceMatches = containerText.match(/₹\s*(\d+(?:\.\d+)?)/g);
    
    if (priceMatches && priceMatches.length > 0) {
      const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null && p > 0);
      if (prices.length > 0) {
        const hasStrike = $container.find('s, del, [style*="line-through"], [class*="strike"]').length > 0;
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
    
    // Extract image URL
    let imageUrl = null;
    if ($img.length > 0) {
      imageUrl = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('data-original');
      if (imageUrl && !imageUrl.startsWith('http')) {
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          imageUrl = 'https://www.zepto.com' + imageUrl;
        }
      }
    }
    
    // Extract product URL from link
    let productUrl = null;
    const $link = $container.find('a[href*="/product"], a[href*="/p/"], a[href*="/item"]').first();
    if ($link.length > 0) {
      productUrl = $link.attr('href');
    } else {
      // Check if container itself is a link
      if ($container.is('a')) {
        productUrl = $container.attr('href');
      } else {
        const $anyLink = $container.find('a[href]').first();
        if ($anyLink.length > 0) {
          const href = $anyLink.attr('href');
          if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            productUrl = href;
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
    
    if (productName && price && productName.length >= 3) {
      // Remove duplicates
      if (!products.some(p => p.name === productName)) {
        products.push({
          name: productName,
          price: price,
          mrp: mrp,
          website: 'Zepto',
          imageUrl: imageUrl,
          productUrl: productUrl
        });
      }
    }
  });
  
  // Strategy 2: Fallback - Find product containers using data-slot-id
  if (products.length === 0) {
    $('[data-slot-id="ProductName"]').each((index, element) => {
      const $nameContainer = $(element);
      const $productCard = $nameContainer.closest('div, article, section, a');
      
      // Extract product name from the container or nearby img
      let productName = $nameContainer.text().trim();
      
      if (!productName || productName.length < 3) {
        productName = $productCard.find('img[alt]').first().attr('alt')?.trim() ||
                     $productCard.find('img[title]').first().attr('title')?.trim();
      }
      
      if (!productName || productName.length < 3) return;
      
      // Extract prices from the product card
      let mrp = null;
      let price = null;
      const cardText = $productCard.text();
      const priceMatches = cardText.match(/₹\s*(\d+(?:\.\d+)?)/g);
      
      if (priceMatches && priceMatches.length > 0) {
        const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null && p > 0);
        if (prices.length > 0) {
          const hasStrike = $productCard.find('s, del, [style*="line-through"], [class*="strike"]').length > 0;
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
      
      // Extract image URL
      let imageUrl = null;
      const $img = $productCard.find('img').first();
      if ($img.length > 0) {
        imageUrl = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('data-original');
        if (imageUrl && !imageUrl.startsWith('http')) {
          if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl;
          } else if (imageUrl.startsWith('/')) {
            imageUrl = 'https://www.zepto.com' + imageUrl;
          }
        }
      }
      
      // Extract product URL from link
      let productUrl = null;
      if ($productCard.is('a')) {
        productUrl = $productCard.attr('href');
      } else {
        const $link = $productCard.find('a[href*="/product"], a[href*="/p/"], a[href*="/item"]').first();
        if ($link.length > 0) {
          productUrl = $link.attr('href');
        } else {
          const $anyLink = $productCard.find('a[href]').first();
          if ($anyLink.length > 0) {
            const href = $anyLink.attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
              productUrl = href;
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
      
      if (productName && price && productName.length >= 3) {
        // Remove duplicates
        if (!products.some(p => p.name === productName)) {
          products.push({
            name: productName,
            price: price,
            mrp: mrp,
            website: 'Zepto',
            imageUrl: imageUrl,
            productUrl: productUrl
          });
        }
      }
    });
  }
  
  // Remove duplicates and filter out invalid products
  const uniqueProducts = [];
  const seenNames = new Set();
  for (const product of products) {
    const normalizedName = product.name.toLowerCase().trim();
    // Additional validation: product name should not be just numbers or special chars
    if (!seenNames.has(normalizedName) && 
        product.name.length >= 3 && 
        product.name.length < 200 &&
        !product.name.match(/^[\d\s₹\-]+$/) && // Not just numbers and symbols
        product.price > 0) {
      seenNames.add(normalizedName);
      uniqueProducts.push(product);
    }
  }

  return {
    website: 'Zepto',
    location: location,
    products: uniqueProducts,
    filename: filename
  };
}

/**
 * Extract location from Zepto HTML
 */
function extractLocationFromZepto($) {
  // Zepto location is often in header or address elements
  // Try multiple strategies to find location
  const locationSelectors = [
    // Header location elements
    'header [class*="address"]',
    'header [class*="location"]',
    'header [class*="city"]',
    'header [class*="area"]',
    // Main location display elements
    '[class*="address"][class*="header"]',
    '[class*="location"][class*="header"]',
    '[class*="delivery"][class*="address"]',
    // Data attributes
    '[data-location]',
    '[data-address]',
    // General location elements (but filter out UI text)
    '[class*="location"]:not([class*="select"]):not([class*="button"])',
    '[class*="address"]:not([class*="select"]):not([class*="button"])',
    '[class*="pincode"]',
    '[class*="area"]',
    '[data-testid*="location"]'
  ];

  const excludedTexts = [
    'Select Location', 'Select', 'Location', 'Your cart is empty', 
    'Cart', 'Home', 'Menu', 'Search', 'Sign In', 'Login', 'Register',
    'Delivery', 'Pickup', 'Change', 'Update'
  ];

  for (const selector of locationSelectors) {
    const elements = $(selector);
    elements.each((i, el) => {
      const text = $(el).text().trim();
      // Filter out excluded texts and ensure it looks like a location
      if (text && 
          text.length > 3 && 
          text.length < 100 &&
          !excludedTexts.some(excluded => text.toLowerCase() === excluded.toLowerCase() || text.includes(excluded)) &&
          !text.match(/^(Select|Location|Cart|Home|Menu|Search|Sign|Login|Register|Delivery|Pickup|Change|Update)$/i) &&
          // Should contain location-like text (city name, area, address)
          (text.match(/[A-Za-z]/) || text.match(/\d{6}/))) { // Has letters or pincode
        return text;
      }
    });
  }

  // Try to extract from meta tags or JSON data
  try {
    const jsonScripts = $('script[type="application/json"], script#__NEXT_DATA__');
    jsonScripts.each((i, script) => {
      try {
        const jsonData = JSON.parse($(script).html());
        // Recursively search for location in JSON
        const findLocation = (obj, depth = 0) => {
          if (depth > 10 || !obj || typeof obj !== 'object') return null;
          if (typeof obj === 'string' && obj.length > 3 && obj.length < 100 && 
              obj.match(/[A-Za-z]/) && !excludedTexts.some(t => obj.includes(t))) {
            return obj;
          }
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const loc = findLocation(item, depth + 1);
              if (loc) return loc;
            }
          } else {
            for (const key in obj) {
              if (key.toLowerCase().includes('location') || key.toLowerCase().includes('address') || 
                  key.toLowerCase().includes('city') || key.toLowerCase().includes('area')) {
                const loc = findLocation(obj[key], depth + 1);
                if (loc) return loc;
              }
            }
          }
          return null;
        };
        const loc = findLocation(jsonData);
        if (loc) return loc;
      } catch (e) {
        // Not valid JSON, continue
      }
    });
  } catch (e) {
    // Ignore JSON parsing errors
  }

  return null;
}

/**
 * Extract data from Swiggy HTML
 */
function extractFromSwiggy(html, filename) {
  const $ = cheerio.load(html);
  const products = [];
  const location = extractLocationFromSwiggy($, html);
  console.log(`[Swiggy] Extracting from HTML (${html.length} chars), location: ${location || 'not found'}`);

  // Swiggy Instamart uses obfuscated class names, so we need multiple strategies
  // Exclude navigation and UI elements
  const excludedTexts = ['Careers', 'Swiggy One', 'Swiggy Instamart', 'Home', 'Cart', 'Search', 'Menu', 
                         'Login', 'Sign', 'Add', 'Remove', 'Quantity', 'View Cart', 'Checkout', 
                         'Delivery', 'Pickup', 'Filters', 'Sort', 'Categories'];
  
  // Excluded patterns for UI elements and non-products
  const excludedPatterns = [
    /^FREE DELIVERY/i,
    /on orders above/i,
    /FREE DELIVERY on orders/i,
    /^Delivery/i,
    /^Pickup/i,
    /^View Cart/i,
    /^Checkout/i,
    /^Add to Cart/i,
    /^Remove/i,
    /^Quantity/i,
    /^Filters/i,
    /^Sort/i,
    /^Categories/i,
    /^Home$/i,
    /^Cart$/i,
    /^Search$/i,
    /^Menu$/i,
    /^Login$/i,
    /^Sign/i,
    /^Swiggy/i,
    /^Instamart$/i
  ];
  
  // Strategy 1: Look for data-testid attributes related to products
  $('[data-testid*="product"], [data-testid*="item-card"], [data-testid*="search-item"]').each((index, element) => {
    const $el = $(element);
    const productName = $el.find('[class*="title"], [class*="name"], h2, h3, h4').first().text().trim();
    
    // Validate product name - must be a real product, not UI element
    if (!productName || productName.length < 5) return;
    
    // Check excluded texts
    if (excludedTexts.some(text => productName.includes(text))) return;
    
    // Check excluded patterns
    if (excludedPatterns.some(pattern => pattern.test(productName))) return;
    
    // Must not match common UI patterns
    if (productName.match(/^(Home|Cart|Search|Menu|Login|Sign|Add|Remove|View|Checkout|Delivery|Pickup|FREE|DELIVERY|on orders|above|₹)$/i)) return;
    
    // Must have actual product-like content (not just delivery messages)
    if (productName.match(/^FREE\s+DELIVERY/i)) return;
    if (productName.match(/on\s+orders\s+above/i)) return;
    if (productName.length < 10 && productName.match(/^(FREE|DELIVERY|Delivery|Pickup|Cart|Home|Menu)$/i)) return;
      
      let price = null;
      let mrp = null;
      
      // Look for price in the element
      const priceText = $el.text();
      const priceMatches = priceText.match(/₹\s*(\d+[.,]?\d*)/g);
      if (priceMatches && priceMatches.length > 0) {
        const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null);
        if (prices.length > 1) {
          // Usually first is MRP, second is selling price
          mrp = prices[0];
          price = prices[1];
        } else if (prices.length === 1) {
          price = prices[0];
        }
      }

      // Extract image URL - try multiple strategies for Swiggy
      let imageUrl = null;
      
      // Strategy 1: Find img tag
      const $img = $el.find('img').first();
      if ($img.length > 0) {
        imageUrl = $img.attr('src') || 
                   $img.attr('data-src') || 
                   $img.attr('data-lazy-src') || 
                   $img.attr('data-original') ||
                   $img.attr('data-image') ||
                   $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
      }
      
      // Strategy 2: Look for product image specifically
      if (!imageUrl) {
        const $productImg = $el.find('img[src*="product"], img[data-src*="product"], img[src*="cdn"], img[data-src*="cdn"]').first();
        if ($productImg.length > 0) {
          imageUrl = $productImg.attr('src') || $productImg.attr('data-src');
        }
      }
      
      // Strategy 3: Background image
      if (!imageUrl) {
        const bgMatch = $el.attr('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (bgMatch) {
          imageUrl = bgMatch[1];
        }
      }
      
      // Convert and clean URL
      if (imageUrl && !imageUrl.startsWith('http')) {
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          imageUrl = 'https://www.swiggy.com' + imageUrl;
        } else if (!imageUrl.includes('://')) {
          imageUrl = 'https://www.swiggy.com/' + imageUrl;
        }
      }
      
      if (imageUrl) {
        imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
          p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
        ).join('&') : '');
      }

      // Extract product URL from link
      let productUrl = null;
      const $link = $el.find('a[href*="/product"], a[href*="/p/"], a[href*="/item"]').first();
      if ($link.length > 0) {
        productUrl = $link.attr('href');
      } else {
        // Check if element itself is a link
        if ($el.is('a')) {
          productUrl = $el.attr('href');
        } else {
          const $anyLink = $el.find('a[href]').first();
          if ($anyLink.length > 0) {
            const href = $anyLink.attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
              productUrl = href;
            }
          }
        }
      }
      
      // Convert relative URLs to absolute
      if (productUrl && !productUrl.startsWith('http')) {
        if (productUrl.startsWith('//')) {
          productUrl = 'https:' + productUrl;
        } else if (productUrl.startsWith('/')) {
          productUrl = 'https://www.swiggy.com' + productUrl;
        } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
          productUrl = 'https://www.swiggy.com/' + productUrl;
        }
      }
      
      // Final validation before adding product
      // Must have valid product name and price
      if (!productName || productName.length < 5) return;
      if (!price || price <= 0) return; // Must have valid price
      
      // Additional filtering for Swiggy-specific UI elements
      if (excludedPatterns.some(pattern => pattern.test(productName))) return;
      if (excludedTexts.some(text => productName.includes(text))) return;
      
      // Must not be just delivery messages or UI text
      if (productName.match(/^(FREE|DELIVERY|Delivery|Pickup|Cart|Home|Menu|Login|Sign|Add|Remove|View|Checkout|₹)$/i)) return;
      if (productName.match(/^FREE\s+DELIVERY/i)) return;
      if (productName.match(/on\s+orders\s+above/i)) return;
      
      // Product name should have meaningful content (not just symbols/numbers)
      if (productName.match(/^[\d\s₹\-.,]+$/)) return;
      
      // Only add if we have a price (products should have prices)
      if (price !== null && !products.some(p => p.name === productName)) {
        products.push({
          name: productName,
          price: price,
          mrp: mrp,
          website: 'swiggy',
          imageUrl: imageUrl,
          productUrl: productUrl
        });
      }
    }
  });

  // Strategy 2: Look for elements with price patterns and meaningful text
  console.log(`[Swiggy] Strategy 1 found ${products.length} products, trying Strategy 2...`);
  $('div, section, article, li').each((index, element) => {
    const $el = $(element);
    const text = $el.text().trim();
    
    // Check if this element contains a price and meaningful product-like text
    if (text.match(/₹\s*\d+/) && text.length > 10 && text.length < 500) {
      // Extract potential product name (text before price)
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const priceLineIndex = lines.findIndex(l => l.match(/₹\s*\d+/));
      
      if (priceLineIndex >= 0) {
        // Try to find product name - look at lines before price
        let productName = null;
        for (let i = priceLineIndex - 1; i >= 0 && i >= priceLineIndex - 3; i--) {
          const candidate = lines[i];
          if (candidate && candidate.length > 3 && candidate.length < 100 &&
              !candidate.match(/^(Home|Cart|Search|Menu|Login|Sign|Add|Remove|Quantity|₹|Rs|Price|MRP)$/i) &&
              !excludedTexts.some(ex => candidate.includes(ex))) {
            productName = candidate;
            break;
          }
        }
        
        // If no good name found before price, try first line
        if (!productName && lines.length > 0) {
          const firstLine = lines[0];
          if (firstLine && firstLine.length > 3 && firstLine.length < 100 &&
              !firstLine.match(/^(Home|Cart|Search|Menu|Login|Sign|Add|Remove|Quantity|₹|Rs|Price|MRP)$/i) &&
              !excludedTexts.some(ex => firstLine.includes(ex))) {
            productName = firstLine;
          }
        }
        
        // Validate it's a product name - stricter filtering
        if (!productName || productName.length < 5) return;
        if (excludedPatterns.some(pattern => pattern.test(productName))) return;
        if (excludedTexts.some(ex => productName.includes(ex))) return;
        if (productName.match(/^(Home|Cart|Search|Menu|Login|Sign|Add|Remove|Quantity|₹|Rs|Price|MRP|FREE|DELIVERY|Delivery|Pickup)$/i)) return;
        if (productName.match(/^FREE\s+DELIVERY/i)) return;
        if (productName.match(/on\s+orders\s+above/i)) return;
        if (productName.match(/^[\d\s₹\-.,]+$/)) return; // Not just numbers/symbols
        if (!price || price <= 0) return; // Must have valid price
        
        if (productName && !products.some(p => p.name === productName)) {
          
          let price = null;
          let mrp = null;
          
          const priceMatches = text.match(/₹\s*(\d+[.,]?\d*)/g);
          if (priceMatches && priceMatches.length > 0) {
            const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null && p > 0);
            if (prices.length > 1) {
              // Usually first is MRP, second is selling price
              mrp = prices[0];
              price = prices[1];
            } else if (prices.length === 1) {
              price = prices[0];
            }
          }

          // Add product even if price is null initially (we'll filter later)
            // Extract image URL - try multiple strategies for Swiggy
            let imageUrl = null;
            
            // Strategy 1: Find img tag
            const $img = $el.find('img').first();
            if ($img.length > 0) {
              imageUrl = $img.attr('src') || 
                         $img.attr('data-src') || 
                         $img.attr('data-lazy-src') || 
                         $img.attr('data-original') ||
                         $img.attr('data-image') ||
                         $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
            }
            
            // Strategy 2: Look for product image specifically
            if (!imageUrl) {
              const $productImg = $el.find('img[src*="product"], img[data-src*="product"], img[src*="cdn"], img[data-src*="cdn"]').first();
              if ($productImg.length > 0) {
                imageUrl = $productImg.attr('src') || $productImg.attr('data-src');
              }
            }
            
            // Strategy 3: Background image
            if (!imageUrl) {
              const bgMatch = $el.attr('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
              if (bgMatch) {
                imageUrl = bgMatch[1];
              }
            }
            
            // Convert and clean URL
            if (imageUrl && !imageUrl.startsWith('http')) {
              if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
              } else if (imageUrl.startsWith('/')) {
                imageUrl = 'https://www.swiggy.com' + imageUrl;
              } else if (!imageUrl.includes('://')) {
                imageUrl = 'https://www.swiggy.com/' + imageUrl;
              }
            }
            
            if (imageUrl) {
              imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
                p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
              ).join('&') : '');
            }
            
            if (price !== null || productName.length > 10) {
              products.push({
                name: productName,
                price: price,
                mrp: mrp,
                website: 'swiggy',
                imageUrl: imageUrl
              });
            }
        }
      }
    }
  });
  
  // Strategy 2.5: More aggressive DOM search - look for any element with price and reasonable text
  console.log(`[Swiggy] Strategy 2 found ${products.length} products`);
  if (products.length === 0) {
    console.log(`[Swiggy] Trying Strategy 2.5 (aggressive DOM search)...`);
    $('*').each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      const children = $el.children();
      
      // Skip if has too many children (likely a container)
      if (children.length > 10) return;
      
      // Look for price pattern
      if (text.match(/₹\s*\d+/) && text.length > 15 && text.length < 300) {
        const priceMatches = text.match(/₹\s*(\d+[.,]?\d*)/g);
        if (priceMatches && priceMatches.length > 0) {
          const prices = priceMatches.map(m => extractPrice(m)).filter(p => p !== null && p > 0);
          if (prices.length > 0) {
            // Try to extract product name
            const textParts = text.split(/₹/).map(p => p.trim()).filter(p => p.length > 0);
            if (textParts.length > 0) {
              // First part before first price might be product name
              const candidateName = textParts[0].split('\n')[0].trim();
              if (candidateName && candidateName.length > 5 && candidateName.length < 100 &&
                  !candidateName.match(/^(Home|Cart|Search|Menu|Login|Sign|Add|Remove|Quantity|Price|MRP)$/i) &&
                  !excludedTexts.some(ex => candidateName.includes(ex)) &&
                  !products.some(p => p.name === candidateName)) {
                
                const price = prices.length > 1 ? prices[1] : prices[0];
                const mrp = prices.length > 1 ? prices[0] : null;
                
                // Extract image URL - try multiple strategies
                let imageUrl = null;
                const $img = $el.find('img').first();
                if ($img.length > 0) {
                  imageUrl = $img.attr('src') || 
                             $img.attr('data-src') || 
                             $img.attr('data-lazy-src') || 
                             $img.attr('data-original') ||
                             $img.attr('data-image') ||
                             $img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
                }
                
                if (!imageUrl) {
                  const $productImg = $el.find('img[src*="product"], img[data-src*="product"], img[src*="cdn"]').first();
                  if ($productImg.length > 0) {
                    imageUrl = $productImg.attr('src') || $productImg.attr('data-src');
                  }
                }
                
                if (!imageUrl) {
                  const bgMatch = $el.attr('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
                  if (bgMatch) {
                    imageUrl = bgMatch[1];
                  }
                }
                
                if (imageUrl && !imageUrl.startsWith('http')) {
                  if (imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                  } else if (imageUrl.startsWith('/')) {
                    imageUrl = 'https://www.swiggy.com' + imageUrl;
                  } else if (!imageUrl.includes('://')) {
                    imageUrl = 'https://www.swiggy.com/' + imageUrl;
                  }
                }
                
                if (imageUrl) {
                  imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
                    p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
                  ).join('&') : '');
                }
                // Extract product URL
                let productUrl = null;
                const $link = $el.find('a[href]').first();
                if ($link.length > 0) {
                  const href = $link.attr('href');
                  if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    productUrl = href;
                  }
                }
                
                // Convert relative URLs to absolute
                if (productUrl && !productUrl.startsWith('http')) {
                  if (productUrl.startsWith('//')) {
                    productUrl = 'https:' + productUrl;
                  } else if (productUrl.startsWith('/')) {
                    productUrl = 'https://www.swiggy.com' + productUrl;
                  } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
                    productUrl = 'https://www.swiggy.com/' + productUrl;
                  }
                }
                
                products.push({
                  name: candidateName,
                  price: price,
                  mrp: mrp,
                  website: 'swiggy',
                  imageUrl: imageUrl,
                  productUrl: productUrl
                });
              }
            }
          }
        }
      }
    });
  }

  // Strategy 3: Try to extract from JSON state if available
  try {
    // Try multiple JSON extraction patterns
    let state = null;
    
    // Pattern 1: window.___INITIAL_STATE___
    const jsonMatch1 = html.match(/window\.___INITIAL_STATE___\s*=\s*(\{[\s\S]*?\n\s*\});/);
    if (jsonMatch1 && jsonMatch1[1]) {
      try {
        state = JSON.parse(jsonMatch1[1]);
      } catch (e) {
        // Try to extract with balanced braces
        const startIdx = html.indexOf('window.___INITIAL_STATE___ = {');
        if (startIdx !== -1) {
          let braceCount = 0;
          let inString = false;
          let escapeNext = false;
          let jsonStr = '';
          
          for (let i = startIdx + 'window.___INITIAL_STATE___ = '.length; i < html.length; i++) {
            const char = html[i];
            jsonStr += char;
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"') {
              inString = !inString;
              continue;
            }
            
            if (!inString) {
              if (char === '{') braceCount++;
              if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  try {
                    state = JSON.parse(jsonStr);
                    break;
                  } catch (e2) {
                    // Continue trying
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Pattern 2: Look for __NEXT_DATA__ or other JSON patterns
    if (!state) {
      const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextDataMatch && nextDataMatch[1]) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          if (nextData.props && nextData.props.pageProps) {
            state = nextData.props.pageProps;
          }
        } catch (e) {
          // Continue
        }
      }
    }
    
    // Pattern 3: Look for script tags with JSON data
    if (!state) {
      const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g);
      for (const match of scriptMatches) {
        const scriptContent = match[1];
        if (scriptContent.includes('items') && scriptContent.includes('price')) {
          try {
            const jsonInScript = scriptContent.match(/\{[\s\S]*"items"[\s\S]*\}/);
            if (jsonInScript) {
              const parsed = JSON.parse(jsonInScript[0]);
              if (parsed.items && Array.isArray(parsed.items)) {
                parsed.items.forEach(item => {
                  if (item && item.name && !products.some(p => p.name === item.name)) {
                    // Extract image URL from item - try multiple fields
                    let imageUrl = item.image || 
                                  item.imageUrl || 
                                  item.img || 
                                  item.photo || 
                                  item.picture ||
                                  item.productImage ||
                                  item.productImageUrl ||
                                  item.thumbnail ||
                                  item.thumbnailUrl ||
                                  item.media?.image ||
                                  item.media?.url ||
                                  item.images?.[0] ||
                                  (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null) ||
                                  null;
                    
                    // If imageUrl is an object, try to get URL from it
                    if (imageUrl && typeof imageUrl === 'object') {
                      imageUrl = imageUrl.url || imageUrl.src || imageUrl.image || imageUrl.original || null;
                    }
                    
                    if (imageUrl && !imageUrl.startsWith('http')) {
                      if (imageUrl.startsWith('//')) {
                        imageUrl = 'https:' + imageUrl;
                      } else if (imageUrl.startsWith('/')) {
                        imageUrl = 'https://www.swiggy.com' + imageUrl;
                      } else if (!imageUrl.includes('://')) {
                        imageUrl = 'https://www.swiggy.com/' + imageUrl;
                      }
                    }
                    
                    if (imageUrl) {
                      imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
                        p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
                      ).join('&') : '');
                    }
                    
                    // Extract product URL from JSON or DOM
                    let productUrl = item.url || item.link || item.href || item.productUrl || (item.slug ? `https://www.swiggy.com/product/${item.slug}` : null);
                    
                    // Convert relative URLs to absolute
                    if (productUrl && !productUrl.startsWith('http')) {
                      if (productUrl.startsWith('//')) {
                        productUrl = 'https:' + productUrl;
                      } else if (productUrl.startsWith('/')) {
                        productUrl = 'https://www.swiggy.com' + productUrl;
                      } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
                        productUrl = 'https://www.swiggy.com/' + productUrl;
                      }
                    }
                    
                    products.push({
                      name: item.name,
                      price: item.price || item.finalPrice || item.sellingPrice || null,
                      mrp: item.mrp || item.originalPrice || null,
                      website: 'swiggy',
                      imageUrl: imageUrl,
                      productUrl: productUrl
                    });
                  }
                });
              }
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }
    
    if (state) {
      // Extract products from search results if available
      if (state.searchPLV2 && state.searchPLV2.data && state.searchPLV2.data.items) {
        state.searchPLV2.data.items.forEach(item => {
          if (item && item.name && !products.some(p => p.name === item.name)) {
            // Extract image URL from item
            // Extract image URL - try multiple fields
            let imageUrl = item.image || 
                          item.imageUrl || 
                          item.img || 
                          item.photo || 
                          item.picture ||
                          item.productImage ||
                          item.productImageUrl ||
                          item.thumbnail ||
                          item.thumbnailUrl ||
                          item.media?.image ||
                          item.media?.url ||
                          item.images?.[0] ||
                          (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null) ||
                          null;
            
            // If imageUrl is an object, try to get URL from it
            if (imageUrl && typeof imageUrl === 'object') {
              imageUrl = imageUrl.url || imageUrl.src || imageUrl.image || imageUrl.original || null;
            }
            
            if (imageUrl && !imageUrl.startsWith('http')) {
              if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
              } else if (imageUrl.startsWith('/')) {
                imageUrl = 'https://www.swiggy.com' + imageUrl;
              } else if (!imageUrl.includes('://')) {
                imageUrl = 'https://www.swiggy.com/' + imageUrl;
              }
            }
            
            if (imageUrl) {
              imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
                p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
              ).join('&') : '');
            }
            
            // Extract product URL from JSON
            let productUrl = item.url || item.link || item.href || item.productUrl || (item.slug ? `https://www.swiggy.com/product/${item.slug}` : null);
            
            // Convert relative URLs to absolute
            if (productUrl && !productUrl.startsWith('http')) {
              if (productUrl.startsWith('//')) {
                productUrl = 'https:' + productUrl;
              } else if (productUrl.startsWith('/')) {
                productUrl = 'https://www.swiggy.com' + productUrl;
              } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
                productUrl = 'https://www.swiggy.com/' + productUrl;
              }
            }
            
            products.push({
              name: item.name,
              price: item.price || item.finalPrice || item.sellingPrice || null,
              mrp: item.mrp || item.originalPrice || null,
              website: 'swiggy',
              imageUrl: imageUrl,
              productUrl: productUrl
            });
          }
        });
      }
      
      // Extract from product listing if available
      if (state.categoryListingV2 && state.categoryListingV2.data && state.categoryListingV2.data.items) {
        state.categoryListingV2.data.items.forEach(item => {
          if (item && item.name && !products.some(p => p.name === item.name)) {
            // Extract image URL from item
            // Extract image URL - try multiple fields
            let imageUrl = item.image || 
                          item.imageUrl || 
                          item.img || 
                          item.photo || 
                          item.picture ||
                          item.productImage ||
                          item.productImageUrl ||
                          item.thumbnail ||
                          item.thumbnailUrl ||
                          item.media?.image ||
                          item.media?.url ||
                          item.images?.[0] ||
                          (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null) ||
                          null;
            
            // If imageUrl is an object, try to get URL from it
            if (imageUrl && typeof imageUrl === 'object') {
              imageUrl = imageUrl.url || imageUrl.src || imageUrl.image || imageUrl.original || null;
            }
            
            if (imageUrl && !imageUrl.startsWith('http')) {
              if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
              } else if (imageUrl.startsWith('/')) {
                imageUrl = 'https://www.swiggy.com' + imageUrl;
              } else if (!imageUrl.includes('://')) {
                imageUrl = 'https://www.swiggy.com/' + imageUrl;
              }
            }
            
            if (imageUrl) {
              imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
                p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
              ).join('&') : '');
            }
            
            // Extract product URL from JSON
            let productUrl = item.url || item.link || item.href || item.productUrl || (item.slug ? `https://www.swiggy.com/product/${item.slug}` : null);
            
            // Convert relative URLs to absolute
            if (productUrl && !productUrl.startsWith('http')) {
              if (productUrl.startsWith('//')) {
                productUrl = 'https:' + productUrl;
              } else if (productUrl.startsWith('/')) {
                productUrl = 'https://www.swiggy.com' + productUrl;
              } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
                productUrl = 'https://www.swiggy.com/' + productUrl;
              }
            }
            
            products.push({
              name: item.name,
              price: item.price || item.finalPrice || item.sellingPrice || null,
              mrp: item.mrp || item.originalPrice || null,
              website: 'swiggy',
              imageUrl: imageUrl,
              productUrl: productUrl
            });
          }
        });
      }
      
      // Extract from campaign listing
      if (state.campaignListingV2 && state.campaignListingV2.data && state.campaignListingV2.data.items) {
        state.campaignListingV2.data.items.forEach(item => {
          if (item && item.name && !products.some(p => p.name === item.name)) {
            // Extract image URL from item
            // Extract image URL - try multiple fields
            let imageUrl = item.image || 
                          item.imageUrl || 
                          item.img || 
                          item.photo || 
                          item.picture ||
                          item.productImage ||
                          item.productImageUrl ||
                          item.thumbnail ||
                          item.thumbnailUrl ||
                          item.media?.image ||
                          item.media?.url ||
                          item.images?.[0] ||
                          (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null) ||
                          null;
            
            // If imageUrl is an object, try to get URL from it
            if (imageUrl && typeof imageUrl === 'object') {
              imageUrl = imageUrl.url || imageUrl.src || imageUrl.image || imageUrl.original || null;
            }
            
            if (imageUrl && !imageUrl.startsWith('http')) {
              if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
              } else if (imageUrl.startsWith('/')) {
                imageUrl = 'https://www.swiggy.com' + imageUrl;
              } else if (!imageUrl.includes('://')) {
                imageUrl = 'https://www.swiggy.com/' + imageUrl;
              }
            }
            
            if (imageUrl) {
              imageUrl = imageUrl.split('?')[0] + (imageUrl.includes('?') ? '?' + imageUrl.split('?')[1].split('&').filter(p => 
                p.startsWith('w=') || p.startsWith('h=') || p.startsWith('q=')
              ).join('&') : '');
            }
            
            // Extract product URL from JSON
            let productUrl = item.url || item.link || item.href || item.productUrl || (item.slug ? `https://www.swiggy.com/product/${item.slug}` : null);
            
            // Convert relative URLs to absolute
            if (productUrl && !productUrl.startsWith('http')) {
              if (productUrl.startsWith('//')) {
                productUrl = 'https:' + productUrl;
              } else if (productUrl.startsWith('/')) {
                productUrl = 'https://www.swiggy.com' + productUrl;
              } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
                productUrl = 'https://www.swiggy.com/' + productUrl;
              }
            }
            
            products.push({
              name: item.name,
              price: item.price || item.finalPrice || item.sellingPrice || null,
              mrp: item.mrp || item.originalPrice || null,
              website: 'swiggy',
              imageUrl: imageUrl,
              productUrl: productUrl
            });
          }
        });
      }
      
      // Try other possible paths in the state
      if (state.instamart && state.instamart.searchResults && Array.isArray(state.instamart.searchResults)) {
        state.instamart.searchResults.forEach(item => {
          if (item && item.name && !products.some(p => p.name === item.name)) {
            // Extract product URL from JSON
            let productUrl = item.url || item.link || item.href || item.productUrl || (item.slug ? `https://www.swiggy.com/product/${item.slug}` : null);
            
            // Convert relative URLs to absolute
            if (productUrl && !productUrl.startsWith('http')) {
              if (productUrl.startsWith('//')) {
                productUrl = 'https:' + productUrl;
              } else if (productUrl.startsWith('/')) {
                productUrl = 'https://www.swiggy.com' + productUrl;
              } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
                productUrl = 'https://www.swiggy.com/' + productUrl;
              }
            }
            
            products.push({
              name: item.name,
              price: item.price || item.finalPrice || item.sellingPrice || null,
              mrp: item.mrp || item.originalPrice || null,
              website: 'swiggy',
              productUrl: productUrl
            });
          }
        });
      }
      
      // Try nested paths - more aggressive search
      const findProductsInObject = (obj, path = '', depth = 0) => {
        if (depth > 10 || !obj || typeof obj !== 'object') return; // Limit depth
        
        if (Array.isArray(obj)) {
          obj.forEach((item, idx) => {
            if (item && typeof item === 'object') {
              // Check if this looks like a product
              if (item.name && (item.price !== undefined || item.finalPrice !== undefined || item.sellingPrice !== undefined)) {
                if (!products.some(p => p.name === item.name)) {
                  // Extract image URL from item
                  let imageUrl = item.image || item.imageUrl || item.img || item.photo || item.picture || null;
                  if (imageUrl && !imageUrl.startsWith('http')) {
                    if (imageUrl.startsWith('//')) {
                      imageUrl = 'https:' + imageUrl;
                    } else if (imageUrl.startsWith('/')) {
                      imageUrl = 'https://www.swiggy.com' + imageUrl;
                    }
                  }
                  
            // Extract product URL from JSON
            let productUrl = item.url || item.link || item.href || item.productUrl || (item.slug ? `https://www.swiggy.com/product/${item.slug}` : null);
                  
                  // Convert relative URLs to absolute
                  if (productUrl && !productUrl.startsWith('http')) {
                    if (productUrl.startsWith('//')) {
                      productUrl = 'https:' + productUrl;
                    } else if (productUrl.startsWith('/')) {
                      productUrl = 'https://www.swiggy.com' + productUrl;
                    } else if (!productUrl.includes('://') && !productUrl.startsWith('#') && !productUrl.startsWith('javascript:')) {
                      productUrl = 'https://www.swiggy.com/' + productUrl;
                    }
                  }
                  
                  products.push({
                    name: item.name,
                    price: item.price || item.finalPrice || item.sellingPrice || null,
                    mrp: item.mrp || item.originalPrice || null,
                    website: 'swiggy',
                    imageUrl: imageUrl,
                    productUrl: productUrl
                  });
                }
              } else {
                findProductsInObject(item, `${path}[${idx}]`, depth + 1);
              }
            }
          });
        } else {
          Object.keys(obj).forEach(key => {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('product') || keyLower.includes('item') || 
                keyLower.includes('search') || keyLower.includes('listing') ||
                keyLower.includes('data') || keyLower.includes('result')) {
              findProductsInObject(obj[key], `${path}.${key}`, depth + 1);
            }
          });
        }
      };
      
      // Only do deep search if we haven't found products yet
      if (products.length === 0) {
        findProductsInObject(state);
      }
    }
  } catch (e) {
    // JSON extraction failed, continue with DOM extraction
    console.error(`Error extracting Swiggy JSON state: ${e.message}`);
  }

  // Final cleanup: Remove duplicates and invalid products
  const uniqueProducts = [];
  const seenNames = new Set();
  
  for (const product of products) {
    const normalizedName = product.name.toLowerCase().trim();
    
    // Only add if:
    // - Not a duplicate
    // - Has a valid name (3-200 chars)
    // - Has a valid price (or at least a name that looks like a product)
    if (!seenNames.has(normalizedName) && 
        product.name && product.name.trim().length >= 3 && 
        product.name.trim().length < 200 &&
        (product.price !== null && product.price > 0 || 
         (product.name.length > 10 && !excludedTexts.some(ex => product.name.includes(ex))))) {
      
      // If no price but has a good name, try to extract price from name or set to 0
      if (product.price === null || product.price === undefined) {
        const priceInName = product.name.match(/₹\s*(\d+)/);
        if (priceInName) {
          product.price = parseFloat(priceInName[1]);
        } else {
          // Skip products without prices unless they're very likely products
          if (product.name.length < 15) continue;
        }
      }
      
      seenNames.add(normalizedName);
      uniqueProducts.push({
        name: product.name.trim(),
        price: product.price || null,
        mrp: product.mrp || null,
        website: 'swiggy',
        imageUrl: product.imageUrl || null,
        productUrl: product.productUrl || null
      });
    }
  }

  console.log(`[Swiggy] Final result: ${uniqueProducts.length} unique products extracted (from ${products.length} total found)`);
  return {
    website: 'swiggy',
    location: location,
    products: uniqueProducts,
    filename: filename
  };
}

/**
 * Extract location from Swiggy HTML
 */
function extractLocationFromSwiggy($, html) {
  // Strategy 1: Try to extract from JSON state (most reliable for Swiggy)
  try {
    const jsonMatch = html.match(/window\.___INITIAL_STATE___\s*=\s*({.+?});/);
    if (jsonMatch) {
      const state = JSON.parse(jsonMatch[1]);
      if (state.userLocation && state.userLocation.address) {
        return state.userLocation.address;
      }
      if (state.userLocation && state.userLocation.annotation) {
        return state.userLocation.annotation;
      }
    }
    
    // Also check App.userLocation
    const appLocationMatch = html.match(/userLocation:\s*({[^}]+})/);
    if (appLocationMatch) {
      try {
        const locationObj = eval('(' + appLocationMatch[1] + ')');
        if (locationObj.address) {
          return locationObj.address;
        }
        if (locationObj.annotation) {
          return locationObj.annotation;
        }
      } catch (e) {
        // Try JSON parse
        try {
          const locationObj = JSON.parse(appLocationMatch[1]);
          if (locationObj.address) {
            return locationObj.address;
          }
          if (locationObj.annotation) {
            return locationObj.annotation;
          }
        } catch (e2) {
          // Continue to DOM extraction
        }
      }
    }
  } catch (e) {
    // JSON extraction failed, try DOM
  }

  // Strategy 2: Try DOM selectors
  const locationSelectors = [
    '[class*="location"]',
    '[class*="pincode"]',
    '[class*="area"]',
    '[class*="address"]',
    '[data-testid*="location"]',
    '[aria-label*="location"]',
    '[aria-label*="address"]'
  ];

  for (const selector of locationSelectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      const text = element.text().trim();
      if (text && text.length > 3 && text.length < 100) {
        return text;
      }
    }
  }

  return null;
}

/**
 * Extract price from text string
 */
function extractPrice(priceText) {
  if (!priceText) return null;
  
  // Remove currency symbols and extract numbers
  const match = priceText.match(/₹?\s*(\d+(?:[.,]\d+)?)/);
  if (match) {
    const priceStr = match[1].replace(/,/g, '');
    const price = parseFloat(priceStr);
    // Round to 2 decimal places if it's a valid number
    return isNaN(price) ? null : Math.round(price * 100) / 100;
  }
  
  return null;
}

/**
 * Determine website from filename
 */
function determineWebsite(filename) {
  const lowerFilename = filename.toLowerCase();
  if (lowerFilename.includes('dmart')) return 'dmart';
  if (lowerFilename.includes('jiomart')) return 'jiomart';
  if (lowerFilename.includes('naturesbasket')) return 'naturesbasket';
  if (lowerFilename.includes('zepto')) return 'zepto';
  if (lowerFilename.includes('swiggy')) return 'swiggy';
  return null;
}

/**
 * Extract data from a single HTML file
 */
function extractDataFromFile(filepath, filename) {
  try {
    const html = readFileSync(filepath, 'utf8');
    const website = determineWebsite(filename);
    
    if (!website) {
      console.warn(`⚠️  Could not determine website for file: ${filename}`);
      return null;
    }

    let result;
    switch (website) {
      case 'dmart':
        result = extractFromDmart(html, filename);
        break;
      case 'jiomart':
        result = extractFromJioMart(html, filename);
        break;
      case 'naturesbasket':
        result = extractFromNaturesBasket(html, filename);
        break;
      case 'zepto':
        result = extractFromZepto(html, filename);
        break;
      case 'swiggy':
        result = extractFromSwiggy(html, filename);
        break;
      default:
        console.warn(`⚠️  Unknown website: ${website}`);
        return null;
    }

    return result;
  } catch (error) {
    console.error(`❌ Error processing ${filename}:`, error.message);
    return null;
  }
}

/**
 * Extract data from all HTML files in the output directory
 */
function extractDataFromAllFiles(outputDir = 'output') {
  const results = [];
  
  try {
    const files = readdirSync(outputDir);
    const htmlFiles = files.filter(file => file.endsWith('.html'));
    
    // Also check root directory for Swiggy files if outputDir is 'output'
    let rootSwiggyFiles = [];
    if (outputDir === 'output') {
      try {
        const rootFiles = readdirSync('.');
        rootSwiggyFiles = rootFiles.filter(file => 
          file.endsWith('.html') && 
          file.toLowerCase().includes('swiggy')
        ).map(file => ({ file, path: file }));
      } catch (e) {
        // Root directory not accessible, continue
      }
    }
    
    const allFiles = [
      ...htmlFiles.map(file => ({ file, path: join(outputDir, file) })),
      ...rootSwiggyFiles
    ];
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 HTML Data Selector`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Found ${allFiles.length} HTML file(s) to process\n`);

    for (const { file, path: filepath } of allFiles) {
      console.log(`Processing: ${file}...`);
      
      const result = extractDataFromFile(filepath, file);
      if (result) {
        results.push(result);
        console.log(`  ✅ Extracted ${result.products.length} product(s), Location: ${result.location || 'Not found'}`);
      } else {
        console.log(`  ⚠️  Failed to extract data`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 SUMMARY`);
    console.log(`${'='.repeat(60)}\n`);

    results.forEach(result => {
      console.log(`\n${result.website.toUpperCase()}:`);
      console.log(`  Location: ${result.location || 'Not found'}`);
      console.log(`  Products: ${result.products.length}`);
      if (result.products.length > 0) {
        console.log(`  Sample products:`);
        result.products.slice(0, 3).forEach((product, index) => {
          console.log(`    ${index + 1}. ${product.name}`);
          console.log(`       Price: ${product.price ? '₹' + product.price : 'N/A'}`);
          if (product.mrp) {
            console.log(`       MRP: ₹${product.mrp}`);
          }
        });
        if (result.products.length > 3) {
          console.log(`    ... and ${result.products.length - 3} more`);
        }
      }
    });

    // Return results for programmatic use
    return results;
  } catch (error) {
    console.error(`❌ Error reading output directory:`, error.message);
    return [];
  }
}

/**
 * Main function
 */
async function main() {
  // Parse arguments - filter out flags
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  const outputDir = args[0] || 'output';
  const saveJson = process.argv.includes('--json') || process.argv.includes('-j');
  
  const results = extractDataFromAllFiles(outputDir);
  
  // Optionally save results to JSON
  if (saveJson) {
    const fs = await import('fs');
    const jsonPath = join(outputDir, 'extracted-data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\n💾 Results saved to: ${jsonPath}`);
  }
  
  return results;
}

// Run if called directly (not when imported)
const isMainModule = () => {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const runFile = process.argv[1] ? fileURLToPath(`file:///${process.argv[1]}`) : '';
    return currentFile === runFile || process.argv[1]?.endsWith('html-data-selector.js');
  } catch (e) {
    return false;
  }
};

if (isMainModule()) {
  main().catch(console.error);
}

export {
  extractDataFromFile,
  extractDataFromAllFiles,
  extractFromDmart,
  extractFromJioMart,
  extractFromNaturesBasket,
  extractFromZepto,
  extractFromSwiggy
};


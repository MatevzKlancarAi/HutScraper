const { chromium } = require('playwright');

async function findAustrianHuts() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect all API requests
  const apiRequests = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('hut')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          apiRequests.push({
            url,
            status: response.status(),
            data
          });
          console.log(`\n📡 API Response: ${url}`);
          console.log(`Status: ${response.status()}`);
          console.log(`Data preview:`, JSON.stringify(data).substring(0, 200));
        }
      } catch (e) {
        // Not JSON or error reading response
      }
    }
  });

  console.log('🌐 Navigating to hut-reservation.org...');
  await page.goto('https://www.hut-reservation.org', { waitUntil: 'networkidle' });

  // Wait for Angular to load
  await page.waitForTimeout(3000);

  console.log('\n📸 Taking screenshot of homepage...');
  await page.screenshot({ path: 'homepage.png', fullPage: true });

  // Try to find navigation to huts list
  console.log('\n🔍 Looking for hut listing page...');

  // Check for common routes
  const routesToTry = [
    '/huts',
    '/search',
    '/browse',
    '/hut-list',
    '/directory',
    '/#/huts',
    '/#/search'
  ];

  for (const route of routesToTry) {
    try {
      console.log(`\nTrying route: ${route}`);
      await page.goto(`https://www.hut-reservation.org${route}`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(2000);

      const title = await page.title();
      console.log(`Page title: ${title}`);

      // Check if we found a hut listing
      const hasHutList = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('hut') && (text.includes('list') || text.includes('search') || text.includes('browse'));
      });

      if (hasHutList) {
        console.log(`✅ Found potential hut listing at ${route}`);
        await page.screenshot({ path: `route-${route.replace(/\//g, '-')}.png`, fullPage: true });
        break;
      }
    } catch (e) {
      console.log(`❌ Route ${route} failed: ${e.message}`);
    }
  }

  // Try to find and click on navigation links
  console.log('\n🔍 Looking for navigation links...');
  const links = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a'));
    return allLinks.map(a => ({
      text: a.innerText.trim(),
      href: a.href
    })).filter(l => l.text && l.href);
  });

  console.log('\n📋 Found links:');
  links.forEach(link => {
    console.log(`  - ${link.text}: ${link.href}`);
  });

  // Look for search or browse functionality
  const searchOrBrowseLink = links.find(l =>
    l.text.toLowerCase().includes('search') ||
    l.text.toLowerCase().includes('browse') ||
    l.text.toLowerCase().includes('hut') ||
    l.text.toLowerCase().includes('find')
  );

  if (searchOrBrowseLink) {
    console.log(`\n✅ Found link: ${searchOrBrowseLink.text} -> ${searchOrBrowseLink.href}`);
    await page.click(`a[href="${searchOrBrowseLink.href}"]`);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'after-click.png', fullPage: true });
  }

  // Check if there's an Angular route we can access directly
  console.log('\n🔍 Checking page source for API endpoints...');
  const pageContent = await page.content();

  // Look for API URLs in the page source
  const apiMatches = pageContent.match(/\/api\/[^"'\s]+/g);
  if (apiMatches) {
    console.log('\n📡 Found API endpoints in page source:');
    [...new Set(apiMatches)].forEach(api => console.log(`  - ${api}`));
  }

  // Check Angular routes
  const routeMatches = pageContent.match(/path:\s*['"]([^'"]+)['"]/g);
  if (routeMatches) {
    console.log('\n🛤️  Found Angular routes:');
    [...new Set(routeMatches)].forEach(route => console.log(`  - ${route}`));
  }

  console.log('\n\n📊 Summary of API Requests:');
  console.log(JSON.stringify(apiRequests, null, 2));

  // Try to access hut data directly via JavaScript
  console.log('\n🔍 Checking for Angular app data...');
  const angularData = await page.evaluate(() => {
    // Try to find Angular app data
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      if (script.innerText.includes('hut') || script.innerText.includes('api')) {
        return script.innerText.substring(0, 1000);
      }
    }
    return null;
  });

  if (angularData) {
    console.log('Found Angular data:', angularData);
  }

  console.log('\n⏳ Waiting 10 seconds for you to manually explore...');
  await page.waitForTimeout(10000);

  console.log('\n\n📊 Final API Requests Summary:');
  apiRequests.forEach((req, i) => {
    console.log(`\n${i + 1}. ${req.url}`);
    console.log(`   Status: ${req.status}`);
    console.log(`   Data:`, JSON.stringify(req.data, null, 2).substring(0, 500));
  });

  await browser.close();

  return apiRequests;
}

findAustrianHuts().then(data => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

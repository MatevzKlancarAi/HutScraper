const { chromium } = require('playwright');
const fs = require('fs');

async function extractAustrianHuts() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  let hutData = null;

  // Intercept API responses
  page.on('response', async (response) => {
    const url = response.url();

    // Look for hut-related API endpoints
    if (url.includes('/api/') && url.includes('hut')) {
      try {
        const data = await response.json();
        console.log(`\n📡 Found API endpoint: ${url}`);
        console.log(`Response:`, JSON.stringify(data, null, 2).substring(0, 500));

        if (Array.isArray(data) && data.length > 0 && data[0].id) {
          hutData = data;
          console.log(`✅ Found ${data.length} huts!`);
        }
      } catch (e) {
        // Not JSON
      }
    }
  });

  console.log('🌐 Loading homepage...');
  await page.goto('https://www.hut-reservation.org', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Try to access the main JS bundle to find API routes
  console.log('\n🔍 Looking for Angular app code...');
  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
  });

  console.log('Found scripts:', scripts);

  // Download and search main bundle for API endpoints
  for (const scriptUrl of scripts) {
    if (scriptUrl.includes('main') || scriptUrl.includes('bundle')) {
      console.log(`\n📥 Analyzing ${scriptUrl}...`);
      try {
        const scriptContent = await page.evaluate(async (url) => {
          const response = await fetch(url);
          return await response.text();
        }, scriptUrl);

        // Look for API route patterns
        const apiPatterns = scriptContent.match(/\/api\/v\d+\/[^"'\s]+/g);
        if (apiPatterns) {
          console.log('Found API patterns:', [...new Set(apiPatterns)].slice(0, 20));
        }

        // Look for hut-related endpoints
        const hutEndpoints = scriptContent.match(/\/api\/[^"'\s]*hut[^"'\s]*/gi);
        if (hutEndpoints) {
          console.log('Hut-related endpoints:', [...new Set(hutEndpoints)]);
        }
      } catch (e) {
        console.log(`Error analyzing script: ${e.message}`);
      }
    }
  }

  // Try to directly call the API (we'll need to find the correct endpoint)
  console.log('\n🧪 Attempting to fetch hut list via API...');

  const apiEndpointsToTry = [
    '/api/v1/huts',
    '/api/v1/guest/huts',
    '/api/v1/public/huts',
    '/api/huts',
    '/api/guest/huts',
    '/webclient/api/huts',
    '/webclient/api/v1/huts'
  ];

  for (const endpoint of apiEndpointsToTry) {
    try {
      console.log(`\nTrying: ${endpoint}`);
      const response = await page.evaluate(async (ep) => {
        try {
          const res = await fetch(`https://www.hut-reservation.org${ep}`);
          return {
            status: res.status,
            data: await res.json()
          };
        } catch (e) {
          return { error: e.message };
        }
      }, endpoint);

      console.log(`Response:`, JSON.stringify(response).substring(0, 300));

      if (response.data && Array.isArray(response.data)) {
        hutData = response.data;
        console.log(`✅ SUCCESS! Found ${hutData.length} huts at ${endpoint}`);
        break;
      }
    } catch (e) {
      console.log(`Failed: ${e.message}`);
    }
  }

  // Try navigating to a known hut page to trigger API calls
  console.log('\n🔍 Trying to navigate to a known hut...');
  await page.goto('https://www.hut-reservation.org/reservation/book-hut/648/wizard', {
    waitUntil: 'networkidle',
    timeout: 15000
  }).catch(e => console.log('Navigation error:', e.message));

  await page.waitForTimeout(3000);

  // Check local storage or session storage
  console.log('\n🔍 Checking browser storage...');
  const storage = await page.evaluate(() => {
    return {
      localStorage: JSON.stringify(localStorage),
      sessionStorage: JSON.stringify(sessionStorage)
    };
  });
  console.log('Storage:', storage);

  // Try to find hut data in Angular app state
  console.log('\n🔍 Checking Angular app state...');
  const angularState = await page.evaluate(() => {
    // Look for Angular elements
    const ngElements = document.querySelectorAll('[ng-version]');
    if (ngElements.length > 0) {
      return 'Angular app found with version: ' + ngElements[0].getAttribute('ng-version');
    }
    return 'No Angular elements found';
  });
  console.log(angularState);

  console.log('\n⏳ Waiting 15 seconds for manual exploration...');
  console.log('You can interact with the page now. Check the Network tab for API calls.');
  await page.waitForTimeout(15000);

  await browser.close();

  if (hutData) {
    // Filter Austrian huts
    const austrianHuts = hutData.filter(hut =>
      hut.country === 'AT' ||
      hut.country === 'Austria' ||
      (hut.address && hut.address.country === 'AT')
    );

    const result = {
      austrianHutIds: austrianHuts.map(h => h.id),
      totalCount: austrianHuts.length,
      allHutsCount: hutData.length,
      source: 'Extracted from hut-reservation.org API',
      sample: austrianHuts.slice(0, 3)
    };

    fs.writeFileSync('austrian-huts.json', JSON.stringify(result, null, 2));
    console.log('\n✅ Results saved to austrian-huts.json');
    console.log(JSON.stringify(result, null, 2));

    return result;
  } else {
    console.log('\n❌ Could not find hut data');
    return null;
  }
}

extractAustrianHuts().then(() => {
  console.log('\n✅ Done');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

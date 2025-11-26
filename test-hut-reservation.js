const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const page = await browser.newPage();

  // Monitor network requests to find API calls
  const apiCalls = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('availability') || url.includes('booking')) {
      apiCalls.push({
        url: url,
        method: request.method(),
        resourceType: request.resourceType()
      });
    }
  });

  console.log('Navigating to hut reservation site...');
  await page.goto('https://www.hut-reservation.org/reservation/book-hut/648/wizard', {
    waitUntil: 'networkidle'
  });

  // Wait for the page to load
  await page.waitForTimeout(5000);

  // Try to extract information about the booking system
  const pageInfo = await page.evaluate(() => {
    const info = {
      title: document.title,
      url: window.location.href,
      frameworks: [],
      apiEndpoints: [],
      hutInfo: {},
      bookingSteps: [],
      selectors: {}
    };

    // Check for Angular
    if (window.ng || window.angular || document.querySelector('[ng-app]')) {
      info.frameworks.push('Angular');
    }

    // Check for React
    if (window.React || document.querySelector('[data-reactroot]')) {
      info.frameworks.push('React');
    }

    // Look for hut name and details
    const hutName = document.querySelector('h1, h2, .hut-name, .title')?.textContent;
    if (hutName) info.hutInfo.name = hutName.trim();

    // Look for calendar or date picker elements
    const calendar = document.querySelector('.calendar, .datepicker, mat-calendar, [role="grid"]');
    if (calendar) {
      info.selectors.calendar = calendar.className || calendar.tagName;
    }

    // Look for room selection
    const roomSelect = document.querySelector('select, mat-select, .room-type');
    if (roomSelect) {
      info.selectors.roomSelect = roomSelect.className || roomSelect.tagName;
    }

    // Look for wizard steps
    const steps = document.querySelectorAll('.step, .wizard-step, mat-step');
    steps.forEach(step => {
      info.bookingSteps.push(step.textContent?.trim());
    });

    // Check for any API calls in scripts
    const scripts = Array.from(document.querySelectorAll('script'));
    scripts.forEach(script => {
      const text = script.textContent || '';
      // Look for API endpoints
      const apiMatches = text.match(/https?:\/\/[^'"]+api[^'"]+/gi);
      if (apiMatches) {
        info.apiEndpoints.push(...apiMatches);
      }
    });

    return info;
  });

  console.log('Page Information:', JSON.stringify(pageInfo, null, 2));

  // Log API calls
  console.log('\nAPI Calls detected:', JSON.stringify(apiCalls, null, 2));

  // Try to interact with the booking wizard
  console.log('\nAnalyzing booking steps...');

  // Look for date selection
  const hasDatePicker = await page.locator('input[type="date"], .date-picker, mat-datepicker-toggle, input[placeholder*="date" i], input[placeholder*="datum" i]').count();
  console.log('Date picker found:', hasDatePicker > 0);

  // Look for room/accommodation selection
  const hasRoomSelect = await page.locator('select, mat-select, input[type="radio"][name*="room"], .room-selection').count();
  console.log('Room selection found:', hasRoomSelect > 0);

  // Look for next/continue buttons
  const hasNextButton = await page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Weiter")').count();
  console.log('Next button found:', hasNextButton > 0);

  // Try to find the list of all huts - check different possible URLs
  console.log('\nNavigating to find hut listings...');

  // Try the main page
  await page.goto('https://www.hut-reservation.org', {
    waitUntil: 'networkidle'
  });
  await page.waitForTimeout(3000);

  // Look for navigation links to hut listings
  const navigationLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a').forEach(a => {
      const href = a.href;
      const text = a.textContent?.trim();
      if (href && (
        href.includes('hut') ||
        href.includes('list') ||
        href.includes('browse') ||
        href.includes('search') ||
        text?.toLowerCase().includes('hut') ||
        text?.toLowerCase().includes('browse')
      )) {
        links.push({ text, href });
      }
    });
    return links;
  });

  console.log('\nNavigation links found:', JSON.stringify(navigationLinks, null, 2));

  // Try to find huts on current page
  const hutsList = await page.evaluate(() => {
    const huts = [];
    // Look for any links that contain book-hut pattern
    document.querySelectorAll('a[href*="/book-hut/"], a[href*="/reservation/"]').forEach(link => {
      const hutId = link.href.match(/book-hut\/(\d+)/)?.[1];
      if (hutId) {
        huts.push({
          id: hutId,
          url: link.href,
          text: link.textContent?.trim()
        });
      }
    });

    // Also check for any hut cards or listings
    document.querySelectorAll('[class*="hut"], [class*="cabin"], [class*="refuge"]').forEach(element => {
      const link = element.querySelector('a');
      if (link?.href) {
        huts.push({
          url: link.href,
          text: element.textContent?.trim().substring(0, 100)
        });
      }
    });

    return huts;
  });

  console.log('\nHuts found on page:', JSON.stringify(hutsList, null, 2));

  // Try search/browse page
  console.log('\nTrying to find search or browse page...');
  await page.goto('https://www.hut-reservation.org/search', {
    waitUntil: 'networkidle'
  }).catch(e => console.log('Search page not found'));

  await page.goto('https://www.hut-reservation.org/browse', {
    waitUntil: 'networkidle'
  }).catch(e => console.log('Browse page not found'));

  await page.goto('https://www.hut-reservation.org/huts', {
    waitUntil: 'networkidle'
  }).catch(e => console.log('Huts page not found'));

  // Take screenshots for reference
  await page.screenshot({ path: 'screenshots/hut-reservation-wizard.png', fullPage: true });

  await browser.close();
})();
const { chromium } = require('playwright');
const axios = require('axios');

async function analyzeBookingFlow() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000
  });

  const page = await browser.newPage();

  // Monitor all API calls
  const apiCalls = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/')) {
      apiCalls.push({
        url: url,
        method: request.method(),
        postData: request.postData()
      });
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/') && url.includes('availability')) {
      try {
        const data = await response.json();
        console.log('\nAvailability Response:', url);
        console.log(JSON.stringify(data, null, 2).substring(0, 500));
      } catch (e) {}
    }
  });

  // Test with a specific hut
  const hutId = 648; // Sulzenauhütte
  console.log(`Testing booking flow for hut ${hutId}...\n`);

  await page.goto(`https://www.hut-reservation.org/reservation/book-hut/${hutId}/wizard`, {
    waitUntil: 'networkidle'
  });

  // Wait for the page to stabilize
  await page.waitForTimeout(3000);

  // Step 1: Analyze date selection
  console.log('\n=== STEP 1: DATE SELECTION ===');

  // Look for date input fields
  const dateInputs = await page.locator('input[type="date"], input[formcontrolname*="date"], mat-datepicker-toggle').all();
  console.log(`Found ${dateInputs.length} date-related inputs`);

  // Try to open date picker
  const datePicker = await page.locator('mat-datepicker-toggle, button[aria-label*="date"]').first();
  if (await datePicker.count() > 0) {
    console.log('Opening date picker...');
    await datePicker.click();
    await page.waitForTimeout(2000);

    // Check if calendar is visible
    const calendar = await page.locator('mat-calendar, .mat-calendar').first();
    if (await calendar.count() > 0) {
      console.log('Calendar opened successfully');

      // Look for available/unavailable dates
      const calendarCells = await page.locator('.mat-calendar-body-cell').all();
      console.log(`Found ${calendarCells.length} calendar cells`);

      // Check classes on calendar cells
      if (calendarCells.length > 0) {
        const firstCell = calendarCells[0];
        const classes = await firstCell.getAttribute('class');
        console.log('Sample cell classes:', classes);
      }
    }
  }

  // Try to select arrival date (pick a date in the future)
  const today = new Date();
  const arrivalDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  const departureDate = new Date(today.getTime() + 32 * 24 * 60 * 60 * 1000); // 32 days from now

  // Format dates
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  console.log(`\nTrying to select dates: ${formatDate(arrivalDate)} to ${formatDate(departureDate)}`);

  // Try different methods to input dates
  const arrivalInput = await page.locator('input[formcontrolname="arrivalDate"], input[name="arrival"], input[placeholder*="arrival"]').first();
  if (await arrivalInput.count() > 0) {
    await arrivalInput.fill(formatDate(arrivalDate));
  }

  const departureInput = await page.locator('input[formcontrolname="departureDate"], input[name="departure"], input[placeholder*="departure"]').first();
  if (await departureInput.count() > 0) {
    await departureInput.fill(formatDate(departureDate));
  }

  // Step 2: Look for room/bed selection
  console.log('\n=== STEP 2: ACCOMMODATION SELECTION ===');

  // Wait a bit for any dynamic loading
  await page.waitForTimeout(2000);

  // Look for room category selection
  const roomSelectors = await page.locator('mat-select, select, input[type="radio"][name*="room"], .room-category, .bed-category').all();
  console.log(`Found ${roomSelectors.length} room selection elements`);

  // Look for guest number inputs
  const guestInputs = await page.locator('input[type="number"], mat-form-field:has-text("guest"), input[formcontrolname*="guest"]').all();
  console.log(`Found ${guestInputs.length} guest number inputs`);

  // Try to proceed to next step
  const nextButton = await page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Weiter"), button[type="submit"]').first();
  if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
    console.log('\nClicking next button...');
    await nextButton.click();
    await page.waitForTimeout(3000);
  }

  // Log all API calls made
  console.log('\n=== API CALLS SUMMARY ===');
  const uniqueApis = [...new Set(apiCalls.map(c => `${c.method} ${c.url.split('?')[0]}`))];
  uniqueApis.forEach(api => console.log(api));

  // Take screenshot
  await page.screenshot({ path: 'screenshots/booking-flow-analysis.png', fullPage: true });

  await browser.close();

  // Now test direct API access with authentication
  console.log('\n\n=== TESTING DIRECT API ACCESS ===');

  try {
    // Get CSRF token
    const csrfResponse = await axios.get('https://www.hut-reservation.org/api/v1/csrf');
    const csrfToken = csrfResponse.data.token;
    console.log('Got CSRF token:', csrfToken.substring(0, 20) + '...');

    // Try to get availability with CSRF token
    const headers = {
      'X-XSRF-TOKEN': csrfToken,
      'Cookie': csrfResponse.headers['set-cookie']?.join('; ') || ''
    };

    // Test availability endpoint
    const availabilityUrl = `https://www.hut-reservation.org/api/v1/reservation/availability/${hutId}`;
    const availResponse = await axios.get(availabilityUrl, { headers });
    console.log('\nAvailability response:', availResponse.status);
    console.log(JSON.stringify(availResponse.data, null, 2).substring(0, 500));
  } catch (error) {
    console.log('API test error:', error.response?.status, error.message);
  }
}

analyzeBookingFlow().catch(console.error);
const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Test Authentication Requirements for hut-reservation.org
 *
 * This script determines:
 * 1. Can we see availability calendar without login?
 * 2. What data is accessible through the booking wizard without auth?
 * 3. What additional features/data would be accessible with authentication?
 * 4. Is there a login/registration flow and what does it provide?
 */

async function testAuthRequirements() {
  const results = {
    timestamp: new Date().toISOString(),
    testHutId: 648, // Sulzenauhütte
    testHutName: 'Sulzenauhütte',
    tests: {
      publicAvailabilityCalendar: null,
      publicBookingWizard: null,
      publicApiAccess: null,
      loginFlowExists: null,
      authenticationRequired: null
    },
    findings: [],
    recommendations: []
  };

  console.log('='.repeat(80));
  console.log('AUTHENTICATION REQUIREMENTS TEST FOR HUT-RESERVATION.ORG');
  console.log('='.repeat(80));
  console.log(`Test Hut: ${results.testHutName} (ID: ${results.testHutId})`);
  console.log('='.repeat(80));

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Track all network activity
  const networkLog = [];
  page.on('request', request => {
    networkLog.push({
      type: 'request',
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType()
    });
  });

  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      const entry = {
        type: 'response',
        url: response.url(),
        status: response.status(),
        headers: {}
      };

      // Check for auth-related headers
      ['authorization', 'x-xsrf-token', 'set-cookie'].forEach(header => {
        const value = response.headers()[header];
        if (value) {
          entry.headers[header] = value.substring(0, 50) + '...';
        }
      });

      networkLog.push(entry);
    }
  });

  // =========================================================================
  // TEST 1: Check if availability calendar is visible WITHOUT login
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: Accessing Availability Calendar WITHOUT Authentication');
  console.log('='.repeat(80));

  try {
    await page.goto(`https://www.hut-reservation.org/reservation/book-hut/${results.testHutId}/wizard`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    // Check if we can see the page content
    const pageTitle = await page.title();
    const bodyText = await page.textContent('body').catch(() => '');

    console.log(`Page Title: ${pageTitle}`);
    console.log(`Page loaded successfully: ${bodyText.length > 0}`);

    // Check for login requirement indicators
    const loginRequired = await page.locator('form[action*="login"], input[type="password"], .login-required, :text("login"), :text("sign in")').count();
    console.log(`Login form detected: ${loginRequired > 0}`);

    // Check for calendar/date picker elements
    const calendarElements = await page.locator('mat-calendar, .calendar, mat-datepicker, input[type="date"]').count();
    console.log(`Calendar elements found: ${calendarElements}`);

    // Check for availability information
    const availabilityInfo = await page.locator('.availability, .available, .unavailable, mat-calendar-body').count();
    console.log(`Availability indicators found: ${availabilityInfo}`);

    // Try to open date picker
    let calendarOpened = false;
    const datePickerToggle = page.locator('mat-datepicker-toggle, button[aria-label*="calendar"]').first();
    if (await datePickerToggle.count() > 0) {
      try {
        await datePickerToggle.click();
        await page.waitForTimeout(2000);

        const calendarVisible = await page.locator('mat-calendar, .mat-calendar-content').isVisible().catch(() => false);
        calendarOpened = calendarVisible;
        console.log(`Calendar opened successfully: ${calendarOpened}`);

        if (calendarOpened) {
          // Check for available/unavailable date indicators
          const calendarCells = await page.locator('.mat-calendar-body-cell').all();
          console.log(`Calendar cells found: ${calendarCells.length}`);

          // Sample a few cells to check for availability classes
          if (calendarCells.length > 0) {
            const sampleCell = calendarCells[Math.min(15, calendarCells.length - 1)];
            const cellClasses = await sampleCell.getAttribute('class');
            const cellAria = await sampleCell.getAttribute('aria-label');
            console.log(`Sample calendar cell classes: ${cellClasses}`);
            console.log(`Sample calendar cell aria-label: ${cellAria}`);

            // Check if cells have availability styling
            const hasAvailabilityClasses = cellClasses?.includes('available') ||
                                          cellClasses?.includes('unavailable') ||
                                          cellClasses?.includes('disabled') ||
                                          cellClasses?.includes('booked');
            console.log(`Cells have availability styling: ${hasAvailabilityClasses}`);
          }
        }
      } catch (e) {
        console.log(`Failed to open calendar: ${e.message}`);
      }
    }

    results.tests.publicAvailabilityCalendar = {
      accessible: loginRequired === 0 && calendarElements > 0,
      calendarFound: calendarElements > 0,
      calendarOpened: calendarOpened,
      availabilityVisible: availabilityInfo > 0,
      loginRequired: loginRequired > 0
    };

    results.findings.push(
      loginRequired === 0
        ? '✅ Availability calendar is accessible without login'
        : '❌ Login appears to be required to access calendar'
    );

    await page.screenshot({
      path: 'screenshots/test-auth-step1-calendar.png',
      fullPage: true
    });

  } catch (error) {
    console.error(`Error in Test 1: ${error.message}`);
    results.tests.publicAvailabilityCalendar = { error: error.message };
  }

  // =========================================================================
  // TEST 2: Check booking wizard access WITHOUT authentication
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Booking Wizard Navigation WITHOUT Authentication');
  console.log('='.repeat(80));

  try {
    // Try to interact with the booking form
    const bookingFormElements = {
      dateInputs: await page.locator('input[type="date"], input[formcontrolname*="date"]').count(),
      roomSelectors: await page.locator('mat-select, select, input[type="radio"]').count(),
      guestInputs: await page.locator('input[type="number"], input[formcontrolname*="guest"]').count(),
      nextButton: await page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Weiter")').count(),
      submitButton: await page.locator('button[type="submit"], button:has-text("Book"), button:has-text("Submit")').count()
    };

    console.log('Booking form elements found:');
    console.log(JSON.stringify(bookingFormElements, null, 2));

    // Try to fill in dates
    let dateSelectionWorks = false;
    const arrivalInput = page.locator('input[formcontrolname="arrivalDate"], input[name="arrival"]').first();
    if (await arrivalInput.count() > 0) {
      try {
        const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const dateStr = futureDate.toISOString().split('T')[0];
        await arrivalInput.fill(dateStr);
        await page.waitForTimeout(1000);

        const inputValue = await arrivalInput.inputValue();
        dateSelectionWorks = inputValue.length > 0;
        console.log(`Date input works: ${dateSelectionWorks} (value: ${inputValue})`);
      } catch (e) {
        console.log(`Date input error: ${e.message}`);
      }
    }

    // Try to proceed through wizard
    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Weiter")').first();
    let canProceed = false;
    if (await nextBtn.count() > 0) {
      const isEnabled = await nextBtn.isEnabled().catch(() => false);
      const isVisible = await nextBtn.isVisible().catch(() => false);
      canProceed = isEnabled && isVisible;
      console.log(`Next button accessible: ${canProceed}`);

      if (canProceed) {
        try {
          await nextBtn.click();
          await page.waitForTimeout(2000);

          // Check if we progressed to next step
          const urlChanged = page.url().includes('step') || page.url() !== `https://www.hut-reservation.org/reservation/book-hut/${results.testHutId}/wizard`;
          console.log(`Progressed to next step: ${urlChanged}`);
        } catch (e) {
          console.log(`Failed to proceed: ${e.message}`);
        }
      }
    }

    results.tests.publicBookingWizard = {
      accessible: Object.values(bookingFormElements).some(count => count > 0),
      formElements: bookingFormElements,
      dateSelectionWorks: dateSelectionWorks,
      canProceedThroughSteps: canProceed
    };

    results.findings.push(
      bookingFormElements.nextButton > 0
        ? '✅ Booking wizard is accessible and functional without login'
        : '⚠️ Booking wizard has limited functionality'
    );

    await page.screenshot({
      path: 'screenshots/test-auth-step2-wizard.png',
      fullPage: true
    });

  } catch (error) {
    console.error(`Error in Test 2: ${error.message}`);
    results.tests.publicBookingWizard = { error: error.message };
  }

  // =========================================================================
  // TEST 3: Check API access without authentication
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Direct API Access WITHOUT Authentication');
  console.log('='.repeat(80));

  try {
    const apiTests = {
      csrf: null,
      hutInfo: null,
      availability: null
    };

    // Test CSRF endpoint
    try {
      const csrfResponse = await axios.get('https://www.hut-reservation.org/api/v1/csrf');
      apiTests.csrf = {
        status: csrfResponse.status,
        tokenReceived: !!csrfResponse.data?.token,
        requiresAuth: false
      };
      console.log(`✅ CSRF endpoint accessible: ${csrfResponse.status}`);
    } catch (error) {
      apiTests.csrf = {
        status: error.response?.status,
        requiresAuth: error.response?.status === 401 || error.response?.status === 403
      };
      console.log(`❌ CSRF endpoint error: ${error.response?.status || error.message}`);
    }

    // Test hut info endpoint
    try {
      const hutResponse = await axios.get(`https://www.hut-reservation.org/api/v1/reservation/hutInfo/${results.testHutId}`);
      apiTests.hutInfo = {
        status: hutResponse.status,
        dataReceived: !!hutResponse.data,
        requiresAuth: false
      };
      console.log(`✅ Hut info endpoint accessible: ${hutResponse.status}`);
      console.log(`Hut name: ${hutResponse.data?.name || hutResponse.data?.hutName || 'N/A'}`);
    } catch (error) {
      apiTests.hutInfo = {
        status: error.response?.status,
        requiresAuth: error.response?.status === 401 || error.response?.status === 403
      };
      console.log(`❌ Hut info endpoint error: ${error.response?.status || error.message}`);
    }

    // Test availability endpoint
    const availabilityEndpoints = [
      '/reservation/availability',
      '/reservation/getHutAvailability',
      '/reservation/calendar'
    ];

    for (const endpoint of availabilityEndpoints) {
      try {
        const url = `https://www.hut-reservation.org/api/v1${endpoint}`;
        const response = await axios.get(url, {
          params: { hutId: results.testHutId }
        });
        apiTests.availability = {
          endpoint: endpoint,
          status: response.status,
          dataReceived: !!response.data,
          requiresAuth: false
        };
        console.log(`✅ Availability endpoint accessible: ${endpoint} (${response.status})`);
        break;
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          apiTests.availability = {
            endpoint: endpoint,
            status: error.response.status,
            requiresAuth: true
          };
          console.log(`🔒 Availability endpoint requires auth: ${endpoint} (${error.response.status})`);
        } else {
          console.log(`❌ Availability endpoint error: ${endpoint} (${error.response?.status || error.message})`);
        }
      }
    }

    results.tests.publicApiAccess = apiTests;

    if (apiTests.availability?.requiresAuth) {
      results.findings.push('🔒 API availability endpoint requires authentication');
    } else if (apiTests.availability?.dataReceived) {
      results.findings.push('✅ Availability data accessible via public API');
    }

  } catch (error) {
    console.error(`Error in Test 3: ${error.message}`);
    results.tests.publicApiAccess = { error: error.message };
  }

  // =========================================================================
  // TEST 4: Check for login/registration flow
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: Login/Registration Flow Discovery');
  console.log('='.repeat(80));

  try {
    // Navigate to main page
    await page.goto('https://www.hut-reservation.org', {
      waitUntil: 'networkidle'
    });

    await page.waitForTimeout(2000);

    // Look for login/register links
    const authLinks = {
      loginLinks: await page.locator('a:has-text("Login"), a:has-text("Sign in"), a:has-text("Anmelden"), a[href*="login"]').count(),
      registerLinks: await page.locator('a:has-text("Register"), a:has-text("Sign up"), a:has-text("Registrieren"), a[href*="register"]').count(),
      accountLinks: await page.locator('a:has-text("Account"), a:has-text("Profile"), a:has-text("My bookings"), a[href*="account"]').count()
    };

    console.log('Authentication links found:');
    console.log(JSON.stringify(authLinks, null, 2));

    // Try to navigate to login page
    let loginPageExists = false;
    let loginPageUrl = null;
    const loginLink = page.locator('a:has-text("Login"), a:has-text("Sign in"), a:has-text("Anmelden"), a[href*="login"]').first();

    if (await loginLink.count() > 0) {
      try {
        await loginLink.click();
        await page.waitForTimeout(2000);
        loginPageUrl = page.url();
        loginPageExists = true;

        console.log(`Login page URL: ${loginPageUrl}`);

        // Analyze login form
        const loginForm = {
          usernameField: await page.locator('input[type="email"], input[type="text"][name*="user"], input[name*="email"]').count(),
          passwordField: await page.locator('input[type="password"]').count(),
          submitButton: await page.locator('button[type="submit"], input[type="submit"]').count(),
          socialLogin: await page.locator('[class*="social"], [class*="oauth"], button:has-text("Google"), button:has-text("Facebook")').count()
        };

        console.log('Login form elements:');
        console.log(JSON.stringify(loginForm, null, 2));

        await page.screenshot({
          path: 'screenshots/test-auth-step4-login.png',
          fullPage: true
        });

      } catch (e) {
        console.log(`Failed to access login page: ${e.message}`);
      }
    } else {
      // Try direct login URL patterns
      const loginUrls = [
        'https://www.hut-reservation.org/login',
        'https://www.hut-reservation.org/auth/login',
        'https://www.hut-reservation.org/account/login'
      ];

      for (const url of loginUrls) {
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
          const hasLoginForm = await page.locator('input[type="password"]').count() > 0;
          if (hasLoginForm) {
            loginPageExists = true;
            loginPageUrl = url;
            console.log(`✅ Found login page at: ${url}`);
            break;
          }
        } catch (e) {
          // Continue to next URL
        }
      }
    }

    results.tests.loginFlowExists = {
      loginPageExists: loginPageExists,
      loginPageUrl: loginPageUrl,
      authLinks: authLinks,
      hasRegistration: authLinks.registerLinks > 0
    };

    if (loginPageExists) {
      results.findings.push(`ℹ️ Login page exists at: ${loginPageUrl}`);
    } else {
      results.findings.push('ℹ️ No login page found - site may be fully public');
    }

  } catch (error) {
    console.error(`Error in Test 4: ${error.message}`);
    results.tests.loginFlowExists = { error: error.message };
  }

  await browser.close();

  // =========================================================================
  // ANALYSIS & RECOMMENDATIONS
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('FINAL ANALYSIS & RECOMMENDATIONS');
  console.log('='.repeat(80));

  // Determine if authentication is required
  const calendarAccessible = results.tests.publicAvailabilityCalendar?.accessible;
  const wizardAccessible = results.tests.publicBookingWizard?.accessible;
  const apiPublic = !results.tests.publicApiAccess?.availability?.requiresAuth;

  results.tests.authenticationRequired = !calendarAccessible || !wizardAccessible;

  console.log('\n📊 SUMMARY:');
  console.log(`1. Can we see availability without login? ${calendarAccessible ? '✅ YES' : '❌ NO'}`);
  console.log(`2. Can we access booking wizard without login? ${wizardAccessible ? '✅ YES' : '❌ NO'}`);
  console.log(`3. Is availability data public via API? ${apiPublic ? '✅ YES' : '❌ NO'}`);
  console.log(`4. Does a login system exist? ${results.tests.loginFlowExists?.loginPageExists ? '✅ YES' : '❌ NO'}`);

  console.log('\n🎯 RECOMMENDATIONS:');

  if (calendarAccessible && wizardAccessible) {
    results.recommendations.push('✅ NO AUTHENTICATION NEEDED - Full availability data is publicly accessible');
    results.recommendations.push('✅ Use browser-based scraping to extract calendar availability');
    results.recommendations.push('✅ Can proceed through booking wizard steps without credentials');
    console.log('✅ NO AUTHENTICATION NEEDED');
    console.log('   - Full availability data is publicly accessible');
    console.log('   - Use Playwright to navigate wizard and extract calendar data');
    console.log('   - No need for username/password credentials');
  } else if (apiPublic) {
    results.recommendations.push('⚠️ LIMITED AUTHENTICATION - Calendar requires login but API is public');
    results.recommendations.push('✅ Use direct API calls with CSRF token to get availability');
    results.recommendations.push('⚠️ May need to monitor for API changes or rate limiting');
    console.log('⚠️ LIMITED AUTHENTICATION');
    console.log('   - Calendar UI requires login but API is public');
    console.log('   - Use API endpoints directly with CSRF token');
    console.log('   - Consider fallback to browser scraping if API access changes');
  } else {
    results.recommendations.push('🔒 AUTHENTICATION REQUIRED - Credentials needed for full access');
    results.recommendations.push('🔒 Need to implement login flow before scraping');
    results.recommendations.push('🔒 Consider automated account creation or manual account setup');
    results.recommendations.push('⚠️ Monitor for session expiration and re-authentication needs');
    console.log('🔒 AUTHENTICATION REQUIRED');
    console.log('   - Credentials needed to access availability data');
    console.log('   - Must implement login flow in scraper');
    console.log('   - Need to maintain session state across requests');
    console.log('   - Consider session expiration and re-authentication');
  }

  // Additional benefits of authentication
  console.log('\n💡 ADDITIONAL FEATURES WITH AUTHENTICATION:');
  if (results.tests.loginFlowExists?.loginPageExists) {
    console.log('   - Ability to make actual bookings');
    console.log('   - Access to booking history and saved preferences');
    console.log('   - Potential priority access or exclusive availability');
    console.log('   - User-specific pricing or discounts');
  } else {
    console.log('   - No login system detected, likely fully public platform');
  }

  // Save results to file
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const resultsFile = path.join(resultsDir, 'auth-requirements-analysis.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n📄 Full results saved to: ${resultsFile}`);

  // Log all network activity to file
  const networkLogFile = path.join(resultsDir, 'auth-test-network-log.json');
  fs.writeFileSync(networkLogFile, JSON.stringify(networkLog, null, 2));
  console.log(`📄 Network log saved to: ${networkLogFile}`);

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));

  return results;
}

// Run the tests
if (require.main === module) {
  testAuthRequirements()
    .then(results => {
      console.log('\n✅ All tests completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testAuthRequirements };

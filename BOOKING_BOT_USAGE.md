# Mountain Hut Booking Bot Usage Guide

This document provides comprehensive instructions for using the MicrogrammBookingBot to automate mountain hut reservations on the Microgramm booking system.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Programmatic Usage](#programmatic-usage)
- [Test Scripts](#test-scripts)
- [Configuration](#configuration)
- [Current Capabilities](#current-capabilities)
- [Known Issues](#known-issues)
- [Troubleshooting](#troubleshooting)

## Overview

The MicrogrammBookingBot automates the booking process for mountain huts using the Microgramm booking system (https://reservations.microgramm.si/). It handles:

- Authentication via HTTP Basic Auth
- Hut and room type selection
- Date selection using calendar navigation
- Guest information form filling
- Payment method selection
- Captcha solving (mathematical expressions)
- Multi-step form navigation

## Prerequisites

1. **Node.js** (version 16 or higher)
2. **Playwright** browsers installed:
   ```bash
   npx playwright install chromium
   ```
3. **Environment setup** (optional):
   ```bash
   # .env file
   MICROGRAMM_USERNAME=your_username
   MICROGRAMM_PASSWORD=your_password
   ```

## Quick Start

### 1. Run the Complete Demo

The fastest way to see the booking bot in action:

```bash
node src/test/finalDemoTest.js
```

This runs a complete booking flow for Aljaž's House (Aljazev_dom_v_Vratih) with:
- Room: 3-bed room (Triposteljna soba)
- Dates: September 23-24, 2025
- Test guest information

The browser will open and stay open for inspection. Press `Ctrl+C` to close.

### 2. Run Basic Booking Test

For a more controlled test with options:

```bash
node src/test/bookingTest.js
```

## Programmatic Usage

### Basic Example

```javascript
const MicrogrammBookingBot = require('./src/MicrogrammBookingBot');

async function bookHut() {
    const bookingBot = new MicrogrammBookingBot();

    const bookingData = {
        hutName: 'Aljazev_dom_v_Vratih',
        roomType: 'Triposteljna soba',
        arrivalDate: '23.09.2025',
        departureDate: '24.09.2025',
        guestName: 'John Doe',
        country: 'Slovenia',
        email: 'john.doe@example.com',
        phone: '+386 40 123 456'
    };

    try {
        // Initialize browser
        await bookingBot.initialize();

        // Authenticate
        await bookingBot.login();

        // Execute booking flow
        await bookingBot.selectHut(bookingData.hutName);
        await bookingBot.selectRoomType(bookingData.roomType);
        await bookingBot.selectDates(bookingData.arrivalDate, bookingData.departureDate);
        await bookingBot.fillGuestInfo(bookingData);
        await bookingBot.selectPaymentMethod();

        // Proceed to final form (with captcha)
        await bookingBot.proceedToNextStep();

        console.log('✅ Booking flow completed successfully');
        console.log('📋 Check browser for final form state');

    } catch (error) {
        console.error('❌ Booking failed:', error.message);
        await bookingBot.takeScreenshot('booking-error');
    }
}

bookHut();
```

### Step-by-Step Usage

```javascript
const bookingBot = new MicrogrammBookingBot({
    // Override default config
    booking: {
        browser: {
            headless: false,  // Set to true for production
            slowMo: 200       // Delay between actions (ms)
        }
    }
});

// 1. Initialize
await bookingBot.initialize();

// 2. Login
await bookingBot.login();

// 3. Select hut
await bookingBot.selectHut('Aljazev_dom_v_Vratih');

// 4. Select room type
await bookingBot.selectRoomType('Triposteljna soba');

// 5. Select dates
await bookingBot.selectDates('23.09.2025', '24.09.2025');

// 6. Fill guest information
await bookingBot.fillGuestInfo({
    guestName: 'John Doe',
    country: 'Slovenia',
    email: 'john@example.com',
    phone: '+386 40 123 456'
});

// 7. Select payment method
await bookingBot.selectPaymentMethod();

// 8. Proceed to final form
await bookingBot.proceedToNextStep();

// 9. Take screenshot for verification
await bookingBot.takeScreenshot('final-form');
```

## Test Scripts

The project includes several test scripts for different scenarios:

### Available Test Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `finalDemoTest.js` | Complete booking demo | `node src/test/finalDemoTest.js` |
| `bookingTest.js` | Configurable booking test | `node src/test/bookingTest.js [--dry-run] [--submit]` |
| `captchaDebugTest.js` | Test captcha solving | `node src/test/captchaDebugTest.js` |
| `interactiveTest.js` | Step-by-step interactive test | `node src/test/interactiveTest.js` |
| `formStepsTest.js` | Test form navigation | `node src/test/formStepsTest.js` |

### Test Script Examples

#### Final Demo (Recommended)
```bash
node src/test/finalDemoTest.js
```
- Runs complete booking flow
- Uses known working hut/dates
- Browser stays open for inspection
- Best for demonstration purposes

#### Booking Test with Options
```bash
# Dry run (no actual booking)
node src/test/bookingTest.js --dry-run

# Live test (attempts actual booking)
node src/test/bookingTest.js --submit
```

#### Captcha Testing
```bash
node src/test/captchaDebugTest.js
```
- Tests captcha detection and solving
- Useful for debugging captcha issues

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Authentication (optional - defaults provided)
MICROGRAMM_USERNAME=hud
MICROGRAMM_PASSWORD=kozarja14hud

# Database (if using database features)
DATABASE_URL=postgresql://user:password@localhost:5432/mountain_huts
```

### Configuration Options

The bot can be configured via the constructor:

```javascript
const bookingBot = new MicrogrammBookingBot({
    booking: {
        browser: {
            headless: false,    // Show browser window
            slowMo: 200,        // Delay between actions (ms)
            timeout: 15000      // Default timeout (ms)
        },
        delays: {
            afterLogin: 500,      // Wait after login (ms)
            afterSelection: 300,  // Wait after selections (ms)
            afterInput: 100,      // Wait after input (ms)
            beforeSubmit: 300     // Wait before submit (ms)
        },
        retries: {
            maxLoginAttempts: 3,
            maxCaptchaAttempts: 20,
            maxFormSubmitAttempts: 3
        },
        captcha: {
            maxNumber: 20,
            startNumber: 0,
            delayBetweenAttempts: 100
        }
    }
});
```

## Current Capabilities

### ✅ Working Features

- **Authentication**: HTTP Basic Auth login
- **Hut Selection**: Navigate and select mountain huts
- **Room Selection**: Choose from available room types
- **Date Selection**: Calendar-based date picking for arrival/departure
- **Guest Information**: Fill personal details forms
- **Phone Field Handling**: Proper order (country → phone type → number)
- **Captcha Solving**: Mathematical expression solving (0-20 range)
- **Multi-step Navigation**: Handle complex multi-page forms
- **Error Handling**: Screenshots and error logging
- **Session Tracking**: Unique session IDs and step tracking

### 🔄 Partially Working

- **Payment Method Selection**: Detects payment options but may have visibility issues
- **Form Validation**: Handles most validation but some edge cases remain

### 📋 Supported Mountain Huts

Currently tested with:
- **Aljaž's House** (`Aljazev_dom_v_Vratih`) - Recommended for testing
- Other huts on the Microgramm system (may require testing)

### 🏠 Supported Room Types

- `Triposteljna soba` (3-bed room)
- `Dvoposteljna soba` (2-bed room)
- `Dvoposteljna soba - zakonska postelja` (2-bed room - double bed)
- Other room types (check specific hut availability)

## Known Issues

### 🚨 Current Problems

1. **Payment Method Selection**
   - Radio buttons may not be visible/clickable
   - Requires manual verification in browser

2. **Captcha Expression Parsing**
   - Issues with expressions like "52 +0000" (octal interpretation)
   - Falls back to brute force solving (0-20)

3. **Form Timing**
   - Some forms may require longer load times
   - Iframe loading can be inconsistent

### ⚠️ Limitations

- Only works with Microgramm booking system
- Requires visible browser window for debugging
- Mathematical captchas only (0-20 range)
- Date format must be DD.MM.YYYY
- Phone numbers must include country code

## Troubleshooting

### Common Issues

#### Browser Not Opening
```bash
# Install Playwright browsers
npx playwright install chromium
```

#### Timeout Errors
```javascript
// Increase timeouts in configuration
const bookingBot = new MicrogrammBookingBot({
    booking: {
        browser: { timeout: 30000 },
        delays: { afterLogin: 2000 }
    }
});
```

#### Captcha Solving Fails
- Check if expression is mathematical (e.g., "2+3+5")
- Verify iframe context is correct
- May fall back to brute force (0-20)

#### Payment Method Not Selected
- Check browser window manually
- Radio button may be hidden/disabled
- Continue with booking flow anyway

### Debug Mode

Run with verbose logging:

```javascript
// Enable debug mode
process.env.DEBUG = 'booking:*';

// Or check specific components
node src/test/captchaDebugTest.js  // For captcha issues
node src/test/formStepsTest.js     // For form navigation
```

### Screenshots

The bot automatically takes screenshots on errors:
- Location: `screenshots/bookings/`
- Format: `error-type-sessionId-timestamp.png`

### Logs

Check logs for detailed information:
- Console output shows step-by-step progress
- Error messages include context and screenshots
- Session IDs help track specific booking attempts

## Advanced Usage

### Custom Configuration File

Create a custom config file:

```javascript
// custom-booking.config.js
module.exports = {
    ...require('./config/booking.config.js'),
    booking: {
        browser: {
            headless: true,
            slowMo: 100
        },
        delays: {
            afterLogin: 1000
        }
    }
};

// Use custom config
const bookingBot = new MicrogrammBookingBot(require('./custom-booking.config.js'));
```

### Batch Booking

```javascript
const bookings = [
    { hutName: 'Aljazev_dom_v_Vratih', dates: ['23.09.2025', '24.09.2025'] },
    { hutName: 'Another_Hut', dates: ['25.09.2025', '26.09.2025'] }
];

for (const booking of bookings) {
    const bot = new MicrogrammBookingBot();
    await bot.initialize();
    // ... execute booking
    await bot.cleanup();
}
```

### Integration with Existing Systems

```javascript
// Express.js endpoint example
app.post('/api/book-hut', async (req, res) => {
    const { hutName, roomType, arrivalDate, departureDate, guestInfo } = req.body;

    const bookingBot = new MicrogrammBookingBot();

    try {
        await bookingBot.initialize();
        await bookingBot.login();

        const result = await bookingBot.book({
            hutName,
            roomType,
            arrivalDate,
            departureDate,
            ...guestInfo
        });

        res.json({ success: true, bookingId: result.sessionId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
```

---

## Support

For issues and questions:
1. Check the [Known Issues](#known-issues) section
2. Review error screenshots in `screenshots/bookings/`
3. Check console logs for detailed error information
4. Test with the recommended demo script first

**Last Updated**: September 2025
**Version**: Current implementation status
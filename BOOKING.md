# Mountain Hut Booking Automation

This document describes the automated booking system for mountain huts using the Microgramm reservation platform.

## 🎯 Overview

The booking automation system can:
- Log into the Microgramm reservation system
- Navigate through the booking form
- Fill in guest details
- Solve mathematical captchas automatically
- Prepare bookings for submission (stops before final submit by default)
- Submit bookings when explicitly requested

## 🚀 Quick Start

### 1. Setup

```bash
# Copy environment template
cp .env.booking.template .env

# Install dependencies (if not already done)
npm install

# Install Playwright browsers
npx playwright install chromium
```

### 2. Test the System

```bash
# Test login and navigation (safe - no booking)
node src/bookingCli.js test

# Test full form filling and captcha solving (no submission)
node src/bookingCli.js test --live

# Test API endpoints (requires server running)
npm start  # In one terminal
node src/bookingCli.js test-api  # In another terminal
```

### 3. Make a Booking

```bash
# Interactive booking (will prompt for details)
node src/bookingCli.js book

# Booking with all parameters
node src/bookingCli.js book \
  --hut-name "Triglavski Dom" \
  --room-type "Dvoposteljna soba - zakonska postelja" \
  --arrival "01.12.2025" \
  --departure "02.12.2025" \
  --guest-name "John Doe" \
  --country "Slovenia" \
  --email "john@example.com" \
  --phone "+386 40 123 456"
```

## 📡 API Usage

### Start the Server

```bash
npm start
```

The server will be available at `http://localhost:3000`

### API Endpoints

#### 1. Create Booking (Fill Form + Solve Captcha)

```bash
POST /api/v1/booking/create
Content-Type: application/json

{
  "hutName": "Triglavski Dom",
  "roomType": "Dvoposteljna soba - zakonska postelja",
  "arrivalDate": "01.12.2025",
  "departureDate": "02.12.2025",
  "guestName": "John Doe",
  "country": "Slovenia",
  "email": "john@example.com",
  "phone": "+386 40 123 456"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "sessionId": "booking_1234567890_abc123",
    "status": "ready_to_submit",
    "captchaSolved": true,
    "captchaAnswer": 7,
    "message": "Booking form filled successfully..."
  }
}
```

#### 2. Submit Booking (Final Step)

```bash
POST /api/v1/booking/submit/{sessionId}
```

#### 3. Check Booking Status

```bash
GET /api/v1/booking/status/{sessionId}
```

#### 4. List Active Sessions

```bash
GET /api/v1/booking/sessions
```

#### 5. Cancel Session

```bash
DELETE /api/v1/booking/session/{sessionId}
```

## 🧮 Captcha Solving

The system automatically solves mathematical captchas using two approaches:

1. **Smart solving**: Extracts the math expression from the page and calculates the result
2. **Brute force**: Tries numbers 0-20 incrementally, monitoring error message disappearance

The captcha solver:
- Waits 500ms between attempts
- Monitors for the error message "vnesite rezultat seštevka s slike" to disappear
- Takes screenshots for debugging
- Returns the correct answer when found

## 🛡️ Security & Safety

### Default Behavior
- **NEVER submits bookings automatically**
- Stops at captcha solving by default
- Requires explicit submission via API or CLI
- Takes screenshots at each step for verification

### Credentials
Store credentials in `.env` file:
```
MICROGRAMM_USERNAME=your_username
MICROGRAMM_PASSWORD=your_password
```

### Rate Limiting
- Sessions automatically expire after 1 hour
- Maximum 10 concurrent sessions (configurable)
- Random delays between actions to avoid detection

## 📁 File Structure

```
src/
├── MicrogrammBookingBot.js      # Main booking automation class
├── bookingCli.js                # Command-line interface
├── services/
│   └── captchaSolver.js         # Captcha solving logic
├── server/
│   └── routes/
│       └── booking.js           # API endpoints
└── test/
    └── bookingTest.js           # Test scripts

config/
└── booking.config.js            # Configuration settings

screenshots/bookings/            # Screenshots saved here
results/bookings/               # Booking data saved here
```

## 🧪 Testing

### CLI Testing
```bash
# Dry run (safe)
node src/bookingCli.js test

# Full test (fills form, solves captcha)
node src/bookingCli.js test --live

# With submission (MAKES REAL BOOKING!)
node src/bookingCli.js test --live --submit
```

### API Testing
```bash
# Test all endpoints
node src/test/bookingTest.js api

# Or use the CLI
node src/bookingCli.js test-api
```

### Direct Testing
```javascript
const MicrogrammBookingBot = require('./src/MicrogrammBookingBot');

const bot = new MicrogrammBookingBot();
const result = await bot.makeBooking({
  hutName: "Triglavski Dom",
  roomType: "Dvoposteljna soba - zakonska postelja",
  // ... other parameters
});
```

## 🔧 Configuration

Edit `config/booking.config.js` to customize:

- **Selectors**: CSS selectors for form elements
- **Delays**: Timing between actions
- **Retry limits**: Maximum attempts for operations
- **Browser settings**: Headless mode, slowmo, etc.
- **Countries**: Country name mappings

## 📸 Screenshots & Logging

The system automatically saves:
- Screenshots at each major step
- Error screenshots when failures occur
- Detailed booking data in JSON format
- Step-by-step logs of the process

Files are saved to:
- `screenshots/bookings/` - PNG screenshots
- `results/bookings/` - JSON booking data
- `logs/` - Server logs

## ⚠️ Important Notes

1. **This creates REAL bookings** when submitted
2. Always test with `--dry-run` or `test` first
3. The system fills forms but stops before submission by default
4. Use `--submit` flag only when you want actual bookings
5. Sessions expire after 1 hour automatically
6. Browser runs in non-headless mode by default for debugging

## 🐛 Troubleshooting

### Common Issues

**Login fails**
- Check credentials in `.env` file
- Verify the login URL is correct
- Check if the site structure has changed

**Captcha solving fails**
- The system tries both smart and brute-force methods
- Check screenshots in `screenshots/bookings/`
- May need to adjust selectors if site changes

**Form filling fails**
- Site selectors may have changed
- Update `config/booking.config.js`
- Check browser screenshots for debugging

### Debug Mode

Run with environment variables for more debugging:
```bash
LOG_LEVEL=debug node src/bookingCli.js test --live
```

### Browser Debugging

Set headless to false in config for visual debugging:
```javascript
browser: {
  headless: false,
  slowMo: 2000  // Slow down for observation
}
```

## 📞 Support

If you encounter issues:
1. Check the screenshots in `screenshots/bookings/`
2. Review the booking data in `results/bookings/`
3. Check server logs in `logs/`
4. Test with `--dry-run` first to isolate issues
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mountain Hut Scraper is a Node.js application that scrapes availability data from the Bentral booking system used by mountain huts. It uses Playwright for browser automation to extract accurate calendar-based availability rather than relying on unreliable API responses.

## Key Commands

### Running the Scraper
```bash
# Standard run with default room type
npm start

# Run with specific room type
node src/index.js "Dvoposteljna soba - zakonska postelja"

# Alternative command aliases
npm run scrape
npm run scrape:double-room
```

### Development Commands
```bash
# Install dependencies
npm install

# Install Playwright browsers (required before first run)
npx playwright install chromium

# Note: No test suite or linting is configured yet
npm test    # Currently exits with "No tests specified"
npm run lint # Currently exits with "No linting configured"
```

## Architecture & Core Logic

### Availability Detection Strategy
The scraper solves a critical problem: Bentral's API returns pricing data even for unavailable dates. Instead of relying on the API, it:

1. **Loads the Bentral iframe directly** - Bypasses the parent site to access the booking calendar
2. **Analyzes pre-rendered HTML** - Reads the server-rendered calendar state before JavaScript modifications
3. **Uses CSS class logic** - Determines availability based on specific class combinations:
   - Available: Has `"day"` class WITHOUT `"unavail"`, `"disabled"`, `"old"`, or `"new"` classes
   - Also excludes dates with `title="Zasedeno"` (occupied in Slovenian)

### Key Components

**MountainHutScraper.js** (src/MountainHutScraper.js)
- Main class handling the entire scraping lifecycle
- Core methods:
  - `initialize()` - Sets up Playwright browser
  - `selectRoomType()` - Selects room from dropdown using configured room ID
  - `navigateToMonth()` - Clicks through calendar to reach target months
  - `extractMonthAvailability()` - Evaluates DOM to extract availability using CSS class logic
  - `scrape()` - Orchestrates the full scraping process

**Configuration** (config/scraper.config.js)
- Central configuration for URLs, selectors, and scraping behavior
- Key sections:
  - `bentral.iframeUrl` - Direct URL to booking iframe
  - `bentral.roomTypes` - Map of room names to internal IDs
  - `bentral.availability` - CSS class logic for determining availability
  - `scraper.targetMonths` - Which months to scrape

### Output Structure

Results are saved to `results/` directory with timestamp:
- JSON file with detailed availability data per month
- Screenshots saved to `screenshots/` for visual verification
- Summary includes total availability rate and list of all available dates

## Important Implementation Details

- **Browser mode**: Currently runs with `headless: false` and `slowMo: 1000` for debugging (config/scraper.config.js:51-52)
- **Month navigation**: Uses a click-based navigation with max 24 attempts (2 years)
- **Room IDs**: Must be extracted from the Bentral dropdown's option values
- **Error handling**: Takes error screenshots and includes proper cleanup in finally blocks

## Extending to Other Mountain Huts

To add support for another Bentral-based hut:
1. Find the Bentral iframe URL on their website
2. Extract room type IDs from the dropdown element
3. Update `config/scraper.config.js` with new URLs and room mappings
4. Test month navigation as date formats may vary by locale
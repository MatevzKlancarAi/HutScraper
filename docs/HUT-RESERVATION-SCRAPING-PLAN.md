# Hut-Reservation.org Scraping Implementation Plan

## Executive Summary
Platform contains **666 mountain huts** across 4 countries (AT: 149, CH: 270, DE: 191, IT: 56). The system uses a REST API with Angular frontend and requires browser-based scraping due to authentication requirements.

## Technical Architecture

### Platform Stack
- **Frontend**: Angular-based SPA
- **API**: REST API at `https://www.hut-reservation.org/api/v1/`
- **Authentication**: CSRF token-based (X-XSRF-TOKEN header)
- **Booking System**: Multi-step wizard with calendar-based availability

### Key API Endpoints Discovered
```
GET /api/v1/csrf                          - Get CSRF token
GET /api/v1/reservation/hutInfo/{id}      - Get hut details (public)
GET /api/v1/reservation/getHutAvailability - Get availability (requires auth)
```

## Implementation Strategy

### Phase 1: Core Infrastructure (Week 1)
1. **Create base scraper class for hut-reservation.org**
   - Browser session management with Playwright
   - CSRF token handling
   - Session persistence

2. **Implement availability extraction**
   - Calendar navigation logic
   - Date availability detection from DOM classes
   - Multi-month scraping

3. **Database schema updates**
   ```sql
   - Add 'platform' field to huts table
   - Add country/region fields
   - Support for multiple bed categories per hut
   ```

### Phase 2: Scraper Implementation (Week 2)
1. **Single hut scraper**
   - Navigate to hut booking page
   - Extract calendar availability
   - Handle different bed categories
   - Save results to database

2. **Batch processing system**
   - Queue management for 666 huts
   - Rate limiting (suggested: 1 hut per 30 seconds)
   - Error recovery and retries
   - Progress tracking

3. **Data persistence**
   - Store hut metadata
   - Daily availability snapshots
   - Historical tracking

### Phase 3: Optimization & Scaling (Week 3)
1. **Performance improvements**
   - Parallel browser instances (max 3-5)
   - Caching of static data
   - Incremental updates

2. **Monitoring & alerts**
   - Availability change detection
   - Error reporting
   - Success metrics

## Priority Huts for Initial Testing

### High-Priority (Popular Alpine Huts)
1. **Switzerland**
   - Hörnlihütte (Matterhorn base) - ID: TBD
   - Monte Rosa Hütte - ID: TBD
   - Cabane des Vignettes - ID: TBD

2. **Austria**
   - Sulzenauhütte - ID: 648
   - Franz-Senn-Hütte - ID: TBD
   - Heidelberger Hütte - ID: TBD

3. **Germany**
   - Münchner Haus (Zugspitze) - ID: TBD
   - Reintalangerhütte - ID: TBD

4. **Italy**
   - Rifugio Guide del Cervino - ID: TBD

## Technical Challenges & Solutions

### Challenge 1: Authentication
- **Problem**: API requires valid session and CSRF token
- **Solution**: Use Playwright to maintain browser session, extract tokens from cookies

### Challenge 2: Calendar Navigation
- **Problem**: Dynamic calendar loading, varying date formats
- **Solution**: Wait for calendar render, use stable selectors, handle multiple locales

### Challenge 3: Rate Limiting
- **Problem**: 666 huts × daily updates = heavy load
- **Solution**:
  - Implement intelligent scheduling
  - Check popular huts more frequently
  - Less popular huts weekly

### Challenge 4: Multi-language Support
- **Problem**: Huts display in different languages (DE, EN, FR, IT)
- **Solution**: Use language-agnostic selectors, store all language variants

## Database Design

```javascript
// Hut model extension
{
  platform: 'hut-reservation.org',
  platformId: 648,
  country: 'AT',
  languages: ['DE', 'EN', 'FR', 'IT'],
  bedCategories: [
    {
      name: 'Dormitory',
      beds: 56,
      nameTranslations: {
        DE: 'Matratzenlager',
        FR: 'Dortoirs',
        IT: 'Dormitorio'
      }
    }
  ],
  coordinates: {
    lat: 46.995920,
    lng: 11.181911
  },
  altitude: 2191,
  maxNights: 20,
  tenant: 'DAV' // German Alpine Club, SAC, etc.
}
```

## Estimated Timeline

### Week 1: Foundation
- Day 1-2: Core scraper architecture
- Day 3-4: Availability detection logic
- Day 5: Database updates

### Week 2: Implementation
- Day 1-2: Single hut scraper completion
- Day 3-4: Batch processing
- Day 5: Testing with 10 sample huts

### Week 3: Production
- Day 1-2: Full deployment (all 666 huts)
- Day 3-4: Monitoring setup
- Day 5: Documentation & handover

## Success Metrics
- Successfully scrape 95%+ of huts daily
- Availability accuracy > 99%
- Average scraping time < 30 seconds per hut
- System uptime > 99%

## Next Steps
1. ✅ Platform research complete
2. ✅ Hut discovery complete (666 huts found)
3. ⏳ Implement core scraper class
4. ⏳ Test with Sulzenauhütte (ID: 648)
5. ⏳ Scale to full platform

## Code Architecture Recommendation

```javascript
// src/providers/HutReservationScraper.js
class HutReservationScraper {
  async initialize() {
    // Setup Playwright browser
    // Get CSRF token
  }

  async scrapeHut(hutId) {
    // Navigate to booking page
    // Select dates
    // Extract availability
    // Return structured data
  }

  async extractCalendarAvailability() {
    // Parse calendar DOM
    // Identify available dates
    // Handle multiple months
  }
}

// src/core/HutReservationOrchestrator.js
class HutReservationOrchestrator {
  async scrapeAllHuts() {
    // Load hut list from database
    // Queue scraping jobs
    // Handle retries
    // Save results
  }
}
```
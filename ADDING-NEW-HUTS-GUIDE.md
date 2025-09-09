# Adding New Mountain Huts - Complete Guide

This comprehensive guide documents the entire process of adding new mountain huts to the scraping system. Follow this guide to ensure you never forget the process and can successfully integrate new huts.

---

## 🎯 Overview

The Mountain Hut Scraper system supports multiple huts that use the Bentral booking system. Adding a new hut involves:

1. **Finding the Bentral ID** from the hut's website
2. **Adding configuration** to the system
3. **Discovering room types** using automated scripts
4. **Creating custom script** with explicit IDs (REQUIRED due to sequence issues)
5. **Verifying** the hut works in production scraping

**Current System Status**: 12 huts with 102 total room types

**🚨 CRITICAL WARNING**: Both `properties` and `room_types` database sequences are broken! You CANNOT use the standard `ensureProperty()` or `ensureRoomType()` methods. You MUST create custom scripts with explicit IDs for both property and room types. This guide has been updated to reflect this reality.

---

## 📋 Step-by-Step Process

### Step 1: Find the Bentral ID

Most mountain huts in Slovenia use the Bentral booking system. You need to find the Bentral embed URL.

**Method 1: Check the Hut's Website**
1. Visit the hut's official website (usually listed on pzs.si)
2. Look for a "Rezervacija" (Reservation) or "Booking" section
3. Inspect the page source for Bentral iframe URLs

**Method 2: Check PZS Directory**
1. Go to `https://www.pzs.si/koce.php?pid=XXX` (where XXX is the hut ID)
2. Look for the reservation iframe in the middle of the page
3. Right-click and inspect the iframe element

**What You're Looking For:**
```html
<iframe src="https://www.bentral.com/service/embed/booking.html?id=BENTRAL_ID&key=BOOKING_KEY&...">
```

**Extract These Values:**
- `id=` - This is the **Bentral ID** (e.g., `5f4451354d415f4e`)
- `key=` - This is the **Booking Key** (e.g., `5e0a7793825c4fa8db8bc8c8fe69ec42`)

### Step 2: Add Hut Configuration

**File**: `/config/huts-bentral-ids.json`

Add a new entry to the `huts` array:

```json
{
  "name": "Exact Hut Name",
  "urlSlug": "URL_friendly_slug",
  "bentralId": "BENTRAL_ID_FROM_STEP_1",
  "key": "BOOKING_KEY_FROM_STEP_1",
  "bentralIframeUrl": "https://www.bentral.com/service/embed/booking.html?id=BENTRAL_ID&title=0&width=full&header-bg=edeff4&header-color=363c49&header2-bg=edeff4&header2-color=363c49&table-bg=edeff4&table-color=363c49&btn-bg=12509b&border-width=0&poweredby=0&lang=sl&key=BOOKING_KEY"
}
```

**Example (Prešernova koča na Stolu):**
```json
{
  "name": "Prešernova koča na Stolu",
  "urlSlug": "Presernova_koca_na_Stolu",
  "bentralId": "5f4451354d415f4e",
  "key": "5e0a7793825c4fa8db8bc8c8fe69ec42",
  "bentralIframeUrl": "https://www.bentral.com/service/embed/booking.html?id=5f4451354d415f4e&title=0&width=full&header-bg=edeff4&header-color=363c49&header2-bg=edeff4&header2-color=363c49&table-bg=edeff4&table-color=363c49&btn-bg=12509b&border-width=0&poweredby=0&lang=sl&key=5e0a7793825c4fa8db8bc8c8fe69ec42"
}
```

### Step 3: Discover Room Types

Run the automated room type discovery script:

```bash
node scripts/discover-all-hut-room-types.js
```

**What This Script Does:**
- Loads all huts from `huts-bentral-ids.json`
- Uses Playwright to visit each Bentral booking page
- Extracts room types from the dropdown (`select[name="unit[]"]`)
- Saves results to `config/all-huts-room-types.json`

**Expected Output:**
```
🔍 Discovering room types for all huts...

📍 Processing: Prešernova koča na Stolu
   URL: https://www.bentral.com/service/embed/booking.html?...
   ✅ Found 6 room types:
      - Zasebna 4 posteljna soba (03) [ID: 5f5441344e44634d]
      - Zasebna 4 posteljna soba (06) [ID: 5f5441344e44674d]
      - 6 posteljna soba (01) [ID: 5f5441344e446b4d]
      - 6 posteljna soba (05) [ID: 5f5441344e54414d]
      - 6 posteljna soba (07) [ID: 5f5441344e54454d]
      - Soba za 10 oseb [ID: 5f5441344e54494d]

✅ Discovery complete! Results saved to config/all-huts-room-types.json
```

**If Discovery Fails:**
- Check that the Bentral iframe URL is correct
- Verify the hut's booking system is actually Bentral
- Look for errors in the console output

### Step 4: Check Current Database IDs

**🚨 CRITICAL**: Both properties and room_types sequences are out of sync! You MUST use explicit IDs for both.

First, check what IDs to use:

```bash
node -e "
const db = require('./src/services/database');
db.initialize().then(async () => {
  const propResult = await db.query('SELECT MAX(id) as max_id FROM availability.properties');
  const roomResult = await db.query('SELECT MAX(id) as max_id FROM availability.room_types');
  console.log('Next property ID:', parseInt(propResult.rows[0].max_id) + 1);
  console.log('Next room_type ID:', parseInt(roomResult.rows[0].max_id) + 1);
  await db.close();
});
"
```

**Note these IDs** - you'll need both for the next step.

### Step 5: Create Custom Script (REQUIRED - No Shortcuts!)

**Why Custom Script is Required:**
- `ensureProperty()` will fail with "permission denied for sequence properties_id_seq"
- `ensureRoomType()` will fail with "permission denied for sequence room_types_id_seq"
- Both sequences are out of sync from previous explicit ID insertions
- You MUST create both property and room types with explicit IDs

**Create the Script:**

```bash
# Use the Krnska jezera script as a template
cp scripts/add-krnska-jezera.js scripts/add-YOUR-HUT-name.js
```

**Edit the script and modify these values:**
- `hutName` - Exact hut name from discovery
- `propertyId` - Next property ID from Step 4
- `roomTypeId` - Next room type ID from Step 4

**Run Your Custom Script:**
```bash
node scripts/add-YOUR-HUT-name.js
```

**Expected Output:**
```
🏠 Initializing database connection...
📊 Adding property and room types for Your Hut Name...

🏔️  Processing: Your Hut Name
    Property ID: 13
    Starting room type ID: 103
    Room types to add: 7

📝 Creating property...
   ✅ Property created with ID: 13

   📝 Adding room 103: Room Type Name
      - External ID: 5f54557a4d675f4f
      - Capacity: 2, Category: private, Bed Type: double_bed
      ✅ Room type added with ID: 103

...

🎉 Successfully added 7 room types for Your Hut Name
✅ Verification: Property 13 now has 7 room types
```

**⚠️ If You Get Permission Errors:**
- This means you tried to use `ensureProperty()` or `ensureRoomType()` instead of explicit IDs
- The sequences are broken and cannot auto-increment
- You MUST use the custom script approach with explicit IDs
- This is not a "permission issue" - it's a sequence sync issue

### Step 6: Verify Integration

Check that the hut appears in the production system:

```bash
node src/multiHutCli.js --list-huts
```

**Expected Output:**
```
🏔️  Available Mountain Huts:

  1. Triglavski Dom (15 room types)
  2. Aljažev dom v Vratih (5 room types)
  ...
  11. Your New Hut (6 room types)

Total: 11 huts with 101 room types
```

### Step 7: Test Scraping

Test that the new hut can be scraped:

```bash
node src/multiHutCli.js --huts "Your New Hut Name" --test --concurrency 1
```

**Expected Output:**
```
🏔️  Multi-Hut Scraper Starting...
📋 Configuration:
  Mode: TEST (September 2025 only)
  Target huts: Your New Hut Name
  Concurrency: 1

...

✅ Successfully scraped room type: Room Name (70.0% availability)
...

🎉 Multi-Hut Scraping Complete!
```

---

## 🔧 Production Scraping System

### Main Command

**For Production (All Huts, All Months):**
```bash
node src/multiHutCli.js --full --concurrency 2
```

**For Testing (All Huts, September Only):**
```bash
node src/multiHutCli.js --test --concurrency 2
```

### Command Options

```bash
# List all available huts
node src/multiHutCli.js --list-huts

# Scrape specific huts only
node src/multiHutCli.js --huts "Hut1,Hut2" --test

# Adjust concurrency (max browsers)
node src/multiHutCli.js --test --concurrency 3

# Add delays between huts/rooms
node src/multiHutCli.js --test --delay-huts 10000 --delay-rooms 3000
```

### Scheduled Production Runs

**Recommended Cron Setup (Twice Daily):**
```bash
# Add to crontab -e
0 6,18 * * * cd /path/to/HutScraper && node src/multiHutCli.js --full --concurrency 2 >> logs/scraper.log 2>&1
```

This runs at 6 AM and 6 PM daily with:
- **Full scraping** (12 months of data)
- **2 concurrent browsers** (balance speed/resources)
- **Logging** to `logs/scraper.log`

### Performance

- **Test Mode** (September only): ~5-10 minutes for all huts
- **Full Mode** (12 months): ~30-45 minutes for all huts
- **Memory Usage**: ~400MB for 2 concurrent browsers
- **Database**: Smart updates only affect scraped date ranges

---

## 🗃️ Database Schema

### Key Tables

**properties**
```sql
id | name                    | slug                    | is_active
11 | Prešernova koča na Stolu| presernova-koca-na-stolu| true
```

**room_types**
```sql
id | property_id | external_id        | name                    | capacity
96 | 11         | 5f5441344e44634d   | Zasebna 4 posteljna soba| 4
```

**available_dates**
```sql
room_type_id | date       | can_checkin | can_checkout | scraped_at
96          | 2025-09-15 | true        | true         | 2025-01-04 09:29:01
```

### Database Verification Queries

**Check hut exists:**
```sql
SELECT id, name FROM availability.properties WHERE name LIKE '%HUT_NAME%';
```

**Check room types:**
```sql
SELECT rt.id, rt.name, rt.external_id, rt.capacity 
FROM availability.room_types rt 
JOIN availability.properties p ON rt.property_id = p.id 
WHERE p.name = 'HUT_NAME';
```

**Check availability data:**
```sql
SELECT rt.name, COUNT(ad.date) as available_dates, MAX(ad.scraped_at) as last_updated
FROM availability.room_types rt 
LEFT JOIN availability.available_dates ad ON rt.id = ad.room_type_id
JOIN availability.properties p ON rt.property_id = p.id
WHERE p.name = 'HUT_NAME'
GROUP BY rt.id, rt.name;
```

---

## 🚨 Troubleshooting

### Common Issues

#### 1. "Permission denied for sequence" Errors

**Symptoms**: 
- "Permission denied for sequence properties_id_seq"
- "Permission denied for sequence room_types_id_seq"

**Root Cause**: Both database sequences are out of sync because previous huts were added with explicit IDs, but the sequences weren't updated.

**Solution**: 
- ❌ **DO NOT** try to use `ensureProperty()` or `ensureRoomType()`
- ✅ **ALWAYS** create custom scripts with explicit IDs (Step 5)
- This is not a permissions issue - it's a sequence synchronization issue
- The sequences think the next ID should be ~15, but we're actually at ~102

#### 2. Room Types Not Discovered

**Symptoms**: Discovery script returns 0 room types or errors.

**Solutions**:
- Verify Bentral iframe URL is accessible
- Check that the hut uses Bentral (not another booking system)
- Try navigating to the URL manually in a browser
- Look for JavaScript errors in the console

#### 3. Hut Not Appearing in --list-huts

**Symptoms**: Hut added to config but not showing in CLI.

**Solutions**:
- Verify the property was created in database (Step 4)
- Check that room types were successfully added (Step 5)
- Run the verification queries in the Database section

#### 4. Scraping Fails with Room Selection Error

**Symptoms**: "Room type not found" or "Cannot select room" errors.

**Solutions**:
- Verify external IDs match between discovery and database
- Check that room names match exactly
- Test the Bentral URL manually to ensure rooms are available

#### 5. No Availability Data After Scraping

**Symptoms**: Scraping completes but no dates in database.

**Solutions**:
- Check if the hut has any available dates in the target period
- Verify the calendar navigation is working (check screenshots)
- Ensure date parsing is working correctly for the hut's format

### Debug Mode

**Enable browser debugging:**
```javascript
// In MountainHutScraper.js, modify launch options:
const browser = await chromium.launch({
    headless: false,  // See browser
    slowMo: 2000     // Slow down actions
});
```

---

## 📁 Key Files and Locations

### Configuration Files
- `/config/huts-bentral-ids.json` - Main hut configuration
- `/config/all-huts-room-types.json` - Discovered room types (auto-generated)
- `/.env` - Database connection settings

### Scripts
- `/scripts/discover-all-hut-room-types.js` - Room type discovery
- `/scripts/populate-all-huts.js` - Database population
- `/scripts/add-presernova-room-types.js` - Example custom insertion script

### Production System
- `/src/multiHutCli.js` - Main CLI interface
- `/src/multiHutScraper.js` - Multi-hut scraping engine
- `/src/MountainHutScraper.js` - Core scraper class
- `/src/services/database.js` - Database operations

### Database Schema
- `/prisma/schema.prisma` - Prisma schema definition

---

## ✅ Quick Reference Checklist

When adding a new hut, follow this checklist:

### Pre-Requirements
- [ ] Hut uses Bentral booking system
- [ ] Can access hut's reservation page
- [ ] Database is accessible and up-to-date

### Adding Process
- [ ] **Step 1**: Found Bentral ID and key from hut website
- [ ] **Step 2**: Added configuration to `huts-bentral-ids.json`
- [ ] **Step 3**: Ran `discover-all-hut-room-types.js` successfully
- [ ] **Step 4**: Created property in database (noted ID)
- [ ] **Step 5**: Added room types with explicit IDs
- [ ] **Step 6**: Verified hut appears in `--list-huts`
- [ ] **Step 7**: Successfully tested scraping

### Verification
- [ ] Hut shows correct number of room types in CLI
- [ ] Test scraping returns availability data
- [ ] Database contains property, room_types, and available_dates
- [ ] No errors in production scraping test

### Final Steps
- [ ] Updated any relevant documentation
- [ ] Tested with production scraper command
- [ ] Ready for scheduled runs

---

## 🎉 Success!

Once you've completed all steps and verified the integration, your new mountain hut is ready for production scraping! The system will now:

- Include the hut in twice-daily automated runs
- Scrape all room types and availability data
- Store data in the PostgreSQL database
- Make data available to frontend applications

**Current System Capacity**: Supports unlimited huts with Bentral booking systems.

**Next Hut**: Follow this guide again - the process is repeatable and documented.

---

## 📞 Support

If you encounter issues not covered in the troubleshooting section:

1. Check the console output for specific error messages
2. Verify each step was completed correctly
3. Test individual components (discovery, database, scraping) separately
4. Review the database state using the verification queries

Remember: This guide was created based on the successful integration of Prešernova koča na Stolu and Planinski dom Krnska jezera. The sequence issues were discovered and resolved during Planinski dom Krnska jezera integration - all steps are now battle-tested and account for the database sequence problems.
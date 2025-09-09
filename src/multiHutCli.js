#!/usr/bin/env node

const MultiHutScraper = require('./multiHutScraper');
const database = require('./services/database');

/**
 * Multi-Hut Scraper CLI
 * 
 * Command-line interface for scraping multiple mountain huts
 */

function printUsage() {
    console.log(`
🏔️  Multi-Hut Scraper CLI

Usage: node src/multiHutCli.js [options]

Options:
  --huts <names>        Comma-separated list of hut names to scrape (default: all)
  --test               Test mode: only scrape September 2025 (default: false)
  --full               Full mode: scrape 12 months (September 2025 - August 2026)
  --concurrency <n>    Max concurrent browsers (default: 2)
  --delay-huts <ms>    Delay between huts in milliseconds (default: 5000)
  --delay-rooms <ms>   Delay between room types in milliseconds (default: 2000)
  --list-huts          List all available huts and exit
  --help               Show this help message

Examples:
  node src/multiHutCli.js --test                          # All huts, September only
  node src/multiHutCli.js --full                          # All huts, 12 months
  node src/multiHutCli.js --huts "Triglavski Dom" --test  # One hut, September only
  node src/multiHutCli.js --huts "Vodnikov dom,Koča na Doliču" --test  # Two huts
  node src/multiHutCli.js --list-huts                     # List available huts

Available Huts:
  1. Triglavski Dom (15 room types)
  2. Aljažev dom v Vratih (5 room types) 
  3. Koča pod Bogatinom (9 room types)
  4. Vodnikov dom (11 room types)
  5. Planinska koča na Uskovnici (10 room types)
  6. Dom Planika pod Triglavom (7 room types)
  7. Koča na Doliču (8 room types)
  8. Koča na Golici (6 room types)
  9. Dom na Komni (7 room types)
  10. Koča pri Triglavskih jezerih (11 room types)
`);
}

async function listHuts() {
    try {
        console.log('🏔️  Available Mountain Huts:\n');
        
        await database.initialize();
        const properties = await database.query(`
            SELECT 
                p.id,
                p.name,
                COUNT(rt.id) as room_types_count
            FROM properties p
            LEFT JOIN room_types rt ON p.id = rt.property_id AND rt.is_active = true
            WHERE p.is_active = true
            GROUP BY p.id, p.name
            ORDER BY p.id
        `);
        
        properties.rows.forEach((hut, index) => {
            console.log(`  ${index + 1}. ${hut.name} (${hut.room_types_count} room types)`);
        });
        
        console.log(`\nTotal: ${properties.rows.length} huts with ${properties.rows.reduce((sum, h) => sum + parseInt(h.room_types_count), 0)} room types\n`);
        
    } catch (error) {
        console.error('❌ Error listing huts:', error.message);
    } finally {
        await database.close();
    }
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        huts: null,
        testMode: false,
        fullMode: false,
        concurrency: 2,
        delayBetweenHuts: 5000,
        delayBetweenRooms: 2000,
        listHuts: false,
        help: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--huts':
                if (i + 1 < args.length) {
                    options.huts = args[++i].split(',').map(h => h.trim());
                } else {
                    console.error('❌ --huts requires a value');
                    process.exit(1);
                }
                break;
            
            case '--test':
                options.testMode = true;
                break;
            
            case '--full':
                options.fullMode = true;
                break;
            
            case '--concurrency':
                if (i + 1 < args.length) {
                    options.concurrency = parseInt(args[++i]);
                    if (isNaN(options.concurrency) || options.concurrency < 1) {
                        console.error('❌ --concurrency must be a positive number');
                        process.exit(1);
                    }
                } else {
                    console.error('❌ --concurrency requires a value');
                    process.exit(1);
                }
                break;
            
            case '--delay-huts':
                if (i + 1 < args.length) {
                    options.delayBetweenHuts = parseInt(args[++i]);
                    if (isNaN(options.delayBetweenHuts) || options.delayBetweenHuts < 0) {
                        console.error('❌ --delay-huts must be a non-negative number');
                        process.exit(1);
                    }
                } else {
                    console.error('❌ --delay-huts requires a value');
                    process.exit(1);
                }
                break;
            
            case '--delay-rooms':
                if (i + 1 < args.length) {
                    options.delayBetweenRooms = parseInt(args[++i]);
                    if (isNaN(options.delayBetweenRooms) || options.delayBetweenRooms < 0) {
                        console.error('❌ --delay-rooms must be a non-negative number');
                        process.exit(1);
                    }
                } else {
                    console.error('❌ --delay-rooms requires a value');
                    process.exit(1);
                }
                break;
            
            case '--list-huts':
                options.listHuts = true;
                break;
            
            case '--help':
                options.help = true;
                break;
            
            default:
                console.error(`❌ Unknown option: ${arg}`);
                process.exit(1);
        }
    }
    
    // Validation
    if (options.testMode && options.fullMode) {
        console.error('❌ Cannot use both --test and --full modes');
        process.exit(1);
    }
    
    // Default to test mode if neither specified
    if (!options.testMode && !options.fullMode) {
        options.testMode = true;
        console.log('ℹ️  Defaulting to test mode (September only). Use --full for 12 months.');
    }
    
    return options;
}

async function main() {
    const options = parseArgs();
    
    if (options.help) {
        printUsage();
        return;
    }
    
    if (options.listHuts) {
        await listHuts();
        return;
    }
    
    try {
        console.log('🏔️  Multi-Hut Scraper Starting...\n');
        
        const scraper = new MultiHutScraper({
            maxConcurrency: options.concurrency,
            delayBetweenHuts: options.delayBetweenHuts,
            delayBetweenRooms: options.delayBetweenRooms,
            testMode: options.testMode,
            targetHuts: options.huts
        });
        
        // Print configuration
        console.log('📋 Configuration:');
        console.log('  Mode:', options.testMode ? 'TEST (September 2025 only)' : 'FULL (12 months)');
        console.log('  Target huts:', options.huts ? options.huts.join(', ') : 'ALL');
        console.log('  Concurrency:', options.concurrency);
        console.log('  Delay between huts:', options.delayBetweenHuts + 'ms');
        console.log('  Delay between rooms:', options.delayBetweenRooms + 'ms');
        console.log('');
        
        // Run the scraping
        const startTime = Date.now();
        const results = await scraper.scrapeAllHuts();
        const endTime = Date.now();
        const durationMinutes = Math.round((endTime - startTime) / 1000 / 60);
        
        // Print results
        console.log('\n\n🎉 Multi-Hut Scraping Complete!');
        console.log('='.repeat(50));
        console.log(`Duration: ${durationMinutes} minutes`);
        console.log(`Huts processed: ${results.hutsProcessed}`);
        console.log(`Room types scraped: ${results.roomTypesProcessed}`);
        console.log(`Total available dates found: ${results.totalAvailableDates}`);
        console.log(`Errors: ${results.errors.length}`);
        
        if (results.errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            results.errors.forEach(error => {
                console.log(`  - ${error.hut} (${error.roomType}): ${error.error}`);
            });
        }
        
        console.log('\n✅ Success! Availability data has been updated in the database.');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\\n⚠️  Received interrupt signal. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\\n⚠️  Received termination signal. Shutting down gracefully...');
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    main();
}
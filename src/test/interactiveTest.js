#!/usr/bin/env node

/**
 * Interactive Booking Test - Keeps browser open for manual inspection
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');
const logger = require('../services/logger');

async function interactiveTest() {
    console.log('🔍 Starting Interactive Booking Test');
    console.log('Browser will stay open for manual inspection...');
    console.log('Press Ctrl+C to close when done observing.');

    const bookingBot = new MicrogrammBookingBot();

    // Override browser settings for interactive mode
    bookingBot.config.booking.browser = {
        headless: false,
        slowMo: 2000, // Slow down for observation
        timeout: 60000
    };

    try {
        // Initialize and authenticate
        await bookingBot.initialize();
        console.log('✅ Browser initialized');

        await bookingBot.login();
        console.log('✅ Authentication successful');
        await bookingBot.takeScreenshot('interactive-auth-success');

        // Select hut
        await bookingBot.selectHut('Triglavski Dom');
        console.log('✅ Hut selected');
        await bookingBot.takeScreenshot('interactive-hut-selected');

        // Now let's examine the form structure
        console.log('🔍 Analyzing form structure...');

        // Check all select elements
        const selects = await bookingBot.page.$$('select');
        console.log(`Found ${selects.length} select elements:`);

        for (let i = 0; i < selects.length; i++) {
            const select = selects[i];
            const innerHTML = await select.innerHTML();
            const name = await select.getAttribute('name');
            const id = await select.getAttribute('id');
            console.log(`  Select ${i + 1}: name="${name}", id="${id}"`);
            console.log(`    Options: ${innerHTML.slice(0, 200)}...`);
        }

        // Wait and keep browser open
        console.log('\n🖥️  Browser is now open and ready for inspection');
        console.log('📍 Check the form elements manually');
        console.log('📸 Screenshots saved to ./screenshots/bookings/');
        console.log('\n⏳ Waiting... Press Ctrl+C to exit');

        // Keep process alive
        const keepAlive = () => {
            setTimeout(keepAlive, 10000);
        };
        keepAlive();

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        await bookingBot.takeScreenshot('interactive-error');
    }

    // Note: cleanup will happen when Ctrl+C is pressed
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
});

if (require.main === module) {
    interactiveTest().catch(console.error);
}

module.exports = interactiveTest;
#!/usr/bin/env node

/**
 * Page Progression Test - See what happens step by step
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');

async function pageProgressionTest() {
    const bookingBot = new MicrogrammBookingBot();
    bookingBot.config.booking.browser.headless = false;
    bookingBot.config.booking.browser.slowMo = 3000; // Very slow so we can see each step

    try {
        console.log('🚀 Starting page progression test...');

        await bookingBot.initialize();
        console.log('✅ Initialized');
        console.log(`📍 Current URL: ${bookingBot.page.url()}`);
        await bookingBot.takeScreenshot('step-1-initialized');

        await bookingBot.login();
        console.log('✅ Authenticated');
        console.log(`📍 Current URL: ${bookingBot.page.url()}`);
        await bookingBot.takeScreenshot('step-2-authenticated');

        await bookingBot.selectHut('Triglavski Dom');
        console.log('✅ Hut selected');
        console.log(`📍 Current URL: ${bookingBot.page.url()}`);
        await bookingBot.takeScreenshot('step-3-hut-selected');

        // Check what's actually on the page now
        const pageTitle = await bookingBot.page.title();
        console.log(`📄 Page title: ${pageTitle}`);

        // Check if we can find the room dropdown
        const roomDropdown = await bookingBot.page.$('select[name="unit[]"]');
        console.log(`🔍 Room dropdown found: ${roomDropdown ? 'YES' : 'NO'}`);

        if (!roomDropdown) {
            // Look for any select elements
            const selects = await bookingBot.page.$$('select');
            console.log(`🔍 Found ${selects.length} select elements total`);

            for (let i = 0; i < selects.length; i++) {
                const select = selects[i];
                const name = await select.getAttribute('name');
                const id = await select.getAttribute('id');
                console.log(`   Select ${i + 1}: name="${name}", id="${id}"`);
            }
        }

        console.log('\n📸 All screenshots saved. Browser staying open...');
        console.log('🔍 Manually inspect the browser to see the current state');
        console.log('Press Ctrl+C to exit.');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('progression-error');
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

pageProgressionTest().catch(console.error);
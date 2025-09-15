#!/usr/bin/env node

/**
 * Dropdown Test - Specifically test clicking the dropdown
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');

async function dropdownTest() {
    const bookingBot = new MicrogrammBookingBot();
    bookingBot.config.booking.browser.headless = false;
    bookingBot.config.booking.browser.slowMo = 1500;

    try {
        await bookingBot.initialize();
        console.log('✅ Initialized');

        await bookingBot.login();
        console.log('✅ Authenticated');

        await bookingBot.selectHut('Triglavski Dom');
        console.log('✅ Hut selected');

        // Let's try to find and click the dropdown
        console.log('🔍 Looking for the dropdown...');

        // Try different ways to find the dropdown
        const dropdownText = await bookingBot.page.$('text=izberite enoto');
        if (dropdownText) {
            console.log('Found by text, clicking...');
            await dropdownText.click();
            await bookingBot.page.waitForTimeout(2000);
        }

        // Try clicking the select element directly if it exists
        const select = await bookingBot.page.$('select');
        if (select) {
            console.log('Found select element, clicking...');
            await select.click();
            await bookingBot.page.waitForTimeout(2000);
        }

        // Take screenshot
        await bookingBot.takeScreenshot('dropdown-test-after-click');

        // Check if any options appeared
        const options = await bookingBot.page.$$('option');
        console.log(`Options found after click: ${options.length}`);

        // Wait for manual inspection
        console.log('⏳ Browser staying open for inspection. Press Ctrl+C to exit.');
        setInterval(() => {}, 10000); // Keep alive

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('dropdown-test-error');
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

dropdownTest().catch(console.error);
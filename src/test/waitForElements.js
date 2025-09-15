#!/usr/bin/env node

/**
 * Wait for Elements Test - Wait for dynamic content to load
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');

async function waitForElementsTest() {
    const bookingBot = new MicrogrammBookingBot();
    bookingBot.config.booking.browser.headless = false;
    bookingBot.config.booking.browser.slowMo = 2000;

    try {
        await bookingBot.initialize();
        await bookingBot.login();
        await bookingBot.selectHut('Triglavski Dom');

        console.log('✅ Navigation completed, now waiting for dynamic content...\n');

        // Wait longer for potential JavaScript to load
        console.log('⏳ Waiting 5 seconds for JavaScript/dynamic content...');
        await bookingBot.page.waitForTimeout(5000);

        // Try to wait for specific selectors
        const selectorsToWaitFor = [
            'select',
            '.select-unit',
            'select[name="unit[]"]',
            '[name*="unit"]'
        ];

        for (const selector of selectorsToWaitFor) {
            try {
                console.log(`⏳ Waiting for selector: ${selector}`);
                await bookingBot.page.waitForSelector(selector, { timeout: 5000 });
                console.log(`✅ Found: ${selector}`);

                const element = await bookingBot.page.$(selector);
                if (element) {
                    const innerHTML = await element.innerHTML();
                    console.log(`   Content: ${innerHTML.slice(0, 150)}...\n`);
                }
                break;
            } catch (e) {
                console.log(`❌ Timeout waiting for: ${selector}`);
            }
        }

        // Check for iframes
        console.log('🔍 Checking for iframes...');
        const iframes = await bookingBot.page.$$('iframe');
        console.log(`Found ${iframes.length} iframes on page`);

        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            const src = await iframe.getAttribute('src');
            console.log(`  Iframe ${i + 1}: src="${src}"`);
        }

        // Try to wait for the specific text we know should be there
        try {
            console.log('⏳ Waiting for "izberite enoto" text...');
            await bookingBot.page.waitForSelector('text=izberite enoto', { timeout: 10000 });
            console.log('✅ Found "izberite enoto" text!');
        } catch (e) {
            console.log('❌ "izberite enoto" text not found');
        }

        await bookingBot.takeScreenshot('wait-test');
        console.log('\n📸 Screenshot saved. Browser staying open...');
        console.log('Press Ctrl+C to exit.');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('wait-error');
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

waitForElementsTest().catch(console.error);
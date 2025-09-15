#!/usr/bin/env node

/**
 * Debug Selectors Test - Find all form elements
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');

async function debugSelectors() {
    const bookingBot = new MicrogrammBookingBot();
    bookingBot.config.booking.browser.headless = false;
    bookingBot.config.booking.browser.slowMo = 1000;

    try {
        await bookingBot.initialize();
        await bookingBot.login();
        await bookingBot.selectHut('Triglavski Dom');

        console.log('🔍 DEBUGGING ALL SELECTORS ON PAGE...\n');

        // Check all possible selectors
        const selectorsToTest = [
            'select',
            '.select-unit',
            'select[name="unit[]"]',
            'select.select-unit',
            'select[name*="unit"]',
            '[class*="select"]',
            '[name*="unit"]',
            'option'
        ];

        for (const selector of selectorsToTest) {
            try {
                const elements = await bookingBot.page.$$(selector);
                console.log(`${selector}: ${elements.length} elements found`);

                if (elements.length > 0) {
                    for (let i = 0; i < Math.min(elements.length, 3); i++) {
                        const element = elements[i];
                        const tagName = await element.evaluate(el => el.tagName);
                        const className = await element.getAttribute('class');
                        const name = await element.getAttribute('name');
                        const id = await element.getAttribute('id');
                        const innerHTML = await element.innerHTML();

                        console.log(`  Element ${i + 1}: <${tagName.toLowerCase()} class="${className}" name="${name}" id="${id}">`);
                        console.log(`    Inner HTML: ${innerHTML.slice(0, 100)}...`);
                    }
                }
            } catch (e) {
                console.log(`${selector}: Error - ${e.message}`);
            }
            console.log('');
        }

        // Also check page source
        console.log('🔍 CHECKING PAGE SOURCE FOR "select-unit"...\n');
        const pageContent = await bookingBot.page.content();
        if (pageContent.includes('select-unit')) {
            console.log('✅ Found "select-unit" in page source');
            const startIndex = pageContent.indexOf('select-unit') - 50;
            const endIndex = pageContent.indexOf('select-unit') + 200;
            console.log('Context:', pageContent.slice(startIndex, endIndex));
        } else {
            console.log('❌ "select-unit" NOT found in page source');
        }

        if (pageContent.includes('unit[]')) {
            console.log('✅ Found "unit[]" in page source');
        } else {
            console.log('❌ "unit[]" NOT found in page source');
        }

        // Check for the text we saw in the dropdown
        if (pageContent.includes('izberite enoto')) {
            console.log('✅ Found "izberite enoto" in page source');
        } else {
            console.log('❌ "izberite enoto" NOT found in page source');
        }

        if (pageContent.includes('posteljna soba')) {
            console.log('✅ Found "posteljna soba" in page source');
        } else {
            console.log('❌ "posteljna soba" NOT found in page source');
        }

        await bookingBot.takeScreenshot('debug-selectors');
        console.log('\n📸 Screenshot saved. Browser staying open for manual inspection...');
        console.log('Press Ctrl+C to exit.');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('debug-error');
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

debugSelectors().catch(console.error);
#!/usr/bin/env node

/**
 * Captcha Debug Test - Find where the captcha appears
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');

const TEST_BOOKING = {
    hutName: 'Aljazev_dom_v_Vratih',
    roomType: 'Dvoposteljna soba - zakonska postelja',
    arrivalDate: '01.12.2025',
    departureDate: '02.12.2025',
    guestName: 'John Doe',
    country: 'Slovenia',
    email: 'test@example.com',
    phone: '+386 40 123 456'
};

async function captchaDebugTest() {
    const bookingBot = new MicrogrammBookingBot();

    try {
        console.log('🚀 Starting Captcha Debug Test...');

        await bookingBot.initialize();
        console.log('✅ Initialized');

        await bookingBot.login();
        console.log('✅ Logged in');

        await bookingBot.selectHut(TEST_BOOKING.hutName);
        console.log('✅ Hut selected');

        await bookingBot.selectRoomType(TEST_BOOKING.roomType);
        console.log('✅ Room selected');

        await bookingBot.selectDates(TEST_BOOKING.arrivalDate, TEST_BOOKING.departureDate);
        console.log('✅ Dates selected');

        await bookingBot.fillGuestInfo(TEST_BOOKING);
        console.log('✅ Guest info filled');

        await bookingBot.takeScreenshot('before-next-step');
        console.log('📸 Screenshot taken');

        // Look for submit/next button and click it to see if captcha appears
        console.log('🔍 Looking for next/submit button...');

        const frame = bookingBot.page.frameLocator('iframe[src*="bentral.com"]');

        // Try to find submit buttons
        const possibleNextButtons = [
            'input[type="submit"]',
            'button[type="submit"]',
            '.btn-primary',
            'input[value*="naslednji"]',
            'input[value*="naprej"]',
            'input[value*="rezerv"]'
        ];

        let foundButton = false;
        for (const selector of possibleNextButtons) {
            try {
                const button = await frame.locator(selector).first();
                if (await button.isVisible({ timeout: 2000 })) {
                    console.log(`✅ Found button with selector: ${selector}`);
                    const text = await button.textContent();
                    console.log(`   Button text: "${text}"`);

                    await button.click();
                    foundButton = true;
                    console.log('✅ Clicked next button');
                    break;
                }
            } catch (e) {
                // Continue to next selector
            }
        }

        if (!foundButton) {
            console.log('❌ No submit button found, looking for all buttons...');

            const allButtons = await frame.locator('button, input[type="submit"], input[type="button"]').all();
            console.log(`Found ${allButtons.length} total buttons/inputs`);

            for (let i = 0; i < allButtons.length; i++) {
                const button = allButtons[i];
                try {
                    const text = await button.textContent();
                    const value = await button.getAttribute('value');
                    const type = await button.getAttribute('type');
                    console.log(`   ${i+1}. type="${type}" value="${value}" text="${text}"`);
                } catch (e) {
                    console.log(`   ${i+1}. (could not read properties)`);
                }
            }
        }

        // Wait a moment after clicking
        await bookingBot.page.waitForTimeout(3000);

        await bookingBot.takeScreenshot('after-next-click');
        console.log('📸 Post-click screenshot taken');

        // Look for captcha elements
        console.log('🔍 Looking for captcha elements...');

        const captchaSelectors = [
            'img[alt*="captcha"]',
            'img[src*="captcha"]',
            '.captcha img',
            'input[name="captcha"]',
            'input[name="security_code"]',
            '[class*="captcha"]'
        ];

        for (const selector of captchaSelectors) {
            try {
                const element = await frame.locator(selector).first();
                if (await element.isVisible({ timeout: 1000 })) {
                    console.log(`✅ Found captcha element: ${selector}`);

                    if (selector.includes('img')) {
                        const src = await element.getAttribute('src');
                        const alt = await element.getAttribute('alt');
                        console.log(`   Image src: ${src}`);
                        console.log(`   Image alt: ${alt}`);
                    }

                    if (selector.includes('input')) {
                        const name = await element.getAttribute('name');
                        const placeholder = await element.getAttribute('placeholder');
                        console.log(`   Input name: ${name}`);
                        console.log(`   Input placeholder: ${placeholder}`);
                    }
                }
            } catch (e) {
                // Continue to next selector
            }
        }

        console.log('\n📸 Browser staying open for manual inspection...');
        console.log('🔍 Check screenshots in ./screenshots/bookings/');
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

captchaDebugTest().catch(console.error);
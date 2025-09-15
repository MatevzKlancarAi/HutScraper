#!/usr/bin/env node

/**
 * Test to find the "Naslednji korak" button after filling the form
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');

const TEST_BOOKING = {
    hutName: 'Aljazev_dom_v_Vratih',
    roomType: 'Triposteljna soba',
    arrivalDate: '23.09.2025',
    departureDate: '24.09.2025',
    guestName: 'John Doe',
    country: 'Slovenia',
    email: 'test@example.com',
    phone: '+386 40 123 456'
};

async function findNextButtonTest() {
    const bookingBot = new MicrogrammBookingBot();

    try {
        console.log('🚀 Starting Find Next Button Test...');

        // Go through the complete flow up to step 2
        await bookingBot.initialize();
        await bookingBot.login();
        await bookingBot.selectHut(TEST_BOOKING.hutName);
        await bookingBot.selectRoomType(TEST_BOOKING.roomType);
        await bookingBot.selectDates(TEST_BOOKING.arrivalDate, TEST_BOOKING.departureDate);
        await bookingBot.fillGuestInfo(TEST_BOOKING);
        await bookingBot.selectPaymentMethod();

        // Proceed to step 2 (guest form)
        await bookingBot.proceedToNextStep();

        console.log('✅ Reached step 2 with filled guest information');

        // Now manually search for all buttons to find the next step button
        const frame = bookingBot.page.frameLocator('iframe[src*="bentral.com"]');

        console.log('🔍 Looking for all buttons on the page...');

        // Get all possible button elements
        const buttonSelectors = [
            'button',
            'input[type="submit"]',
            'input[type="button"]',
            '.btn',
            '[role="button"]'
        ];

        for (const selector of buttonSelectors) {
            try {
                const buttons = frame.locator(selector);
                const count = await buttons.count();
                console.log(`\n📋 Found ${count} elements with selector: ${selector}`);

                for (let i = 0; i < count; i++) {
                    const button = buttons.nth(i);
                    try {
                        const isVisible = await button.isVisible({ timeout: 500 });
                        if (isVisible) {
                            const text = await button.textContent().catch(() => '');
                            const value = await button.getAttribute('value').catch(() => '');
                            const className = await button.getAttribute('class').catch(() => '');
                            const id = await button.getAttribute('id').catch(() => '');
                            const type = await button.getAttribute('type').catch(() => '');

                            console.log(`   ${i+1}. Visible button:`);
                            console.log(`      Text: "${text}"`);
                            console.log(`      Value: "${value}"`);
                            console.log(`      Class: "${className}"`);
                            console.log(`      ID: "${id}"`);
                            console.log(`      Type: "${type}"`);

                            // Check if this looks like our next button
                            if (text && (text.toLowerCase().includes('naslednji') ||
                                        text.toLowerCase().includes('naprej') ||
                                        text.toLowerCase().includes('korak'))) {
                                console.log(`   🎯 THIS LOOKS LIKE THE NEXT BUTTON!`);
                            }
                        }
                    } catch (e) {
                        // Skip this button
                    }
                }
            } catch (e) {
                console.log(`   Error with selector ${selector}:`, e.message);
            }
        }

        // Take a final screenshot
        await bookingBot.takeScreenshot('find-next-button-debug');

        console.log('\n📸 Browser staying open for manual inspection...');
        console.log('🔍 Check screenshots in ./screenshots/bookings/');
        console.log('Press Ctrl+C to exit.');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('find-next-button-error');
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

findNextButtonTest().catch(console.error);
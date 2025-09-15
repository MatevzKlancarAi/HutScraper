#!/usr/bin/env node

/**
 * Quick test to verify step 3 user info filling works
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

async function step3Test() {
    const bookingBot = new MicrogrammBookingBot();

    try {
        console.log('🚀 Starting Step 3 Test...');

        // Get to step 3 first
        await bookingBot.initialize();
        await bookingBot.login();
        await bookingBot.selectHut(TEST_BOOKING.hutName);
        await bookingBot.selectRoomType(TEST_BOOKING.roomType);
        await bookingBot.selectDates(TEST_BOOKING.arrivalDate, TEST_BOOKING.departureDate);
        await bookingBot.fillGuestInfo(TEST_BOOKING);
        await bookingBot.selectPaymentMethod();
        await bookingBot.proceedToNextStep();

        console.log('✅ Reached step 3, form should be filled automatically');
        console.log('📝 Process completed successfully!');

        // Take final screenshot
        await bookingBot.takeScreenshot('step3-final-test');

        // Close browser
        await bookingBot.cleanup();

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('step3-test-error');
        await bookingBot.cleanup();
    }
}

step3Test().catch(console.error);
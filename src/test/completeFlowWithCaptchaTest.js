#!/usr/bin/env node

/**
 * Test the complete booking flow including user info + captcha on step 3
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

async function completeFlowTest() {
    const bookingBot = new MicrogrammBookingBot();

    try {
        console.log('🚀 Starting Complete Booking Flow Test with Captcha...');

        // Complete flow through all steps
        await bookingBot.initialize();
        await bookingBot.login();
        await bookingBot.selectHut(TEST_BOOKING.hutName);
        await bookingBot.selectRoomType(TEST_BOOKING.roomType);
        await bookingBot.selectDates(TEST_BOOKING.arrivalDate, TEST_BOOKING.departureDate);
        await bookingBot.fillGuestInfo(TEST_BOOKING);
        await bookingBot.selectPaymentMethod();

        // Proceed through all steps - this should now handle:
        // 1. Step 1 -> Step 2 (proceedToNextStep)
        // 2. Fill step 2 guest info (fillStep2GuestInfo)
        // 3. Step 2 -> Step 3 (proceedToStep3)
        // 4. Fill user info and solve captcha on step 3 (fillUserInfoAndCaptcha)
        await bookingBot.proceedToNextStep();

        console.log('✅ Complete booking flow completed successfully!');
        console.log('📝 Booking process summary:');

        const bookingData = bookingBot.getBookingData();
        console.log('Steps completed:', bookingData.steps.length);

        bookingData.steps.forEach((step, index) => {
            console.log(`  ${index + 1}. ${step.step}: ${step.details}`);
        });

        if (bookingData.errors.length > 0) {
            console.log('⚠️ Errors encountered:');
            bookingData.errors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error.step}: ${error.error}`);
            });
        }

        console.log('\\n📸 Browser staying open for manual inspection...');
        console.log('🔍 Check screenshots in ./screenshots/bookings/');
        console.log('Press Ctrl+C to exit.');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('complete-flow-error');

        console.log('\\n📝 Partial booking data:');
        const bookingData = bookingBot.getBookingData();
        console.log('Steps completed:', bookingData.steps.length);
        console.log('Errors:', bookingData.errors.length);
    }
}

process.on('SIGINT', () => {
    console.log('\\n👋 Exiting...');
    process.exit(0);
});

completeFlowTest().catch(console.error);
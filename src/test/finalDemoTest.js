#!/usr/bin/env node

/**
 * Final Demo Test - Complete working booking flow
 * Shows all fixes working together and keeps browser open
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
    phone: '+386 1 23456789'
};

async function finalDemoTest() {
    const bookingBot = new MicrogrammBookingBot();

    try {
        console.log('🎬 Starting FINAL DEMO - Complete Booking Flow...');
        console.log('📋 This will demonstrate:');
        console.log('   ✅ Complete booking navigation');
        console.log('   ✅ Fixed phone field order (type THEN number)');
        console.log('   ✅ Captcha field detection and solving');
        console.log('   ✅ All form validation resolving');
        console.log('');

        // Complete flow through all steps
        console.log('🔐 Step 1: Login...');
        await bookingBot.initialize();
        await bookingBot.login();

        console.log('🏔️ Step 2: Select hut...');
        await bookingBot.selectHut(TEST_BOOKING.hutName);

        console.log('🛏️ Step 3: Select room type...');
        await bookingBot.selectRoomType(TEST_BOOKING.roomType);

        console.log('📅 Step 4: Select dates...');
        await bookingBot.selectDates(TEST_BOOKING.arrivalDate, TEST_BOOKING.departureDate);

        console.log('👤 Step 5: Fill initial guest info...');
        await bookingBot.fillGuestInfo(TEST_BOOKING);

        console.log('💳 Step 6: Select payment method...');
        await bookingBot.selectPaymentMethod();

        console.log('➡️ Step 7: Proceed to detailed form...');
        await bookingBot.proceedToNextStep();

        console.log('');
        console.log('🎯 SUCCESS! Complete booking flow executed.');
        console.log('');
        console.log('📋 Final form should show:');
        console.log('   ✅ All personal information filled');
        console.log('   ✅ Phone number correctly preserved');
        console.log('   ✅ Captcha solved and entered');
        console.log('   ✅ Payment method selected');
        console.log('   ✅ All validation errors resolved');
        console.log('');
        console.log('🔍 Check the browser window to verify:');
        console.log('   • Phone field contains the number');
        console.log('   • Captcha field has a value');
        console.log('   • No red error messages');
        console.log('   • "Plačilo" button should be active');
        console.log('');
        console.log('📸 Browser will stay open for inspection...');
        console.log('🛑 Press Ctrl+C when done to close.');

        // Keep browser open for demonstration
        setInterval(() => {
            // Keep alive - browser stays open
        }, 10000);

    } catch (error) {
        console.error('❌ Demo failed:', error.message);
        await bookingBot.takeScreenshot('demo-error');
        console.log('📸 Error screenshot saved');

        // Keep browser open even on error so you can see what happened
        console.log('🔍 Browser staying open for debugging...');
        setInterval(() => {}, 10000);
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Demo finished! Browser will close...');
    process.exit(0);
});

finalDemoTest().catch(console.error);
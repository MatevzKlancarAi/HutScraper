#!/usr/bin/env node

/**
 * Booking System Test Script
 *
 * Tests the MicrogrammBookingBot functionality directly
 * Usage: node src/test/bookingTest.js [--dry-run] [--submit]
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');
const logger = require('../services/logger');

// Test configuration
const TEST_BOOKING = {
    hutName: 'Aljazev_dom_v_Vratih', // Use the working hut
    roomType: 'Triposteljna soba', // 3-bed room that we know is available
    arrivalDate: '24.09.2025', // Known available dates
    departureDate: '25.09.2025',
    guestName: 'John Doe',
    country: 'Slovenia',
    email: 'test@example.com',
    phone: '+386 40 123 456'
};

async function testBooking(options = {}) {
    const { dryRun = true, submit = false } = options;

    console.log('\n🧪 Starting Booking Bot Test');
    console.log('============================');
    console.log(`📋 Test Mode: ${dryRun ? 'DRY RUN (no actual booking)' : 'LIVE TEST'}`);
    console.log(`📋 Submit: ${submit ? 'YES (will actually submit)' : 'NO (stops at captcha)'}`);
    console.log(`📋 Booking Details:`, TEST_BOOKING);
    console.log('');

    const bookingBot = new MicrogrammBookingBot();
    let success = false;
    let sessionId = null;

    try {
        // Test the booking process
        if (dryRun) {
            console.log('🔍 DRY RUN: Testing login and form navigation...');

            await bookingBot.initialize();
            console.log('✅ Browser initialized');

            await bookingBot.login();
            console.log('✅ Login successful');

            // Take screenshot of logged in state
            await bookingBot.takeScreenshot('login-success-test');

            console.log('✅ Dry run completed successfully');
            success = true;

        } else {
            console.log('🚀 LIVE TEST: Running full booking process...');

            const result = await bookingBot.makeBooking(TEST_BOOKING);
            sessionId = result.sessionId;

            console.log('✅ Booking form filled successfully');
            console.log(`📝 Session ID: ${sessionId}`);
            console.log(`🧮 Captcha Solved: ${result.captchaSolved}`);
            console.log(`🔑 Captcha Answer: ${result.captchaAnswer}`);

            if (submit && result.captchaSolved) {
                console.log('⚠️  Submitting booking (THIS WILL MAKE A REAL BOOKING)...');
                const submitResult = await bookingBot.submitBooking();

                console.log(`📤 Booking submitted: ${submitResult.success}`);
                console.log(`💬 Message: ${submitResult.message}`);

                success = submitResult.success;
            } else {
                console.log('✋ Stopping before submission as requested');
                success = true;
            }
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);

        // Take error screenshot
        try {
            await bookingBot.takeScreenshot('test-error');
        } catch (screenshotError) {
            console.warn('Failed to take error screenshot:', screenshotError.message);
        }

        // Log error details if available
        const bookingData = bookingBot.getBookingData();
        if (bookingData.errors.length > 0) {
            console.log('\n🐛 Error Details:');
            bookingData.errors.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error.action}: ${error.error}`);
            });
        }

        success = false;

    } finally {
        // Clean up
        try {
            await bookingBot.cleanup();
            console.log('🧹 Cleanup completed');
        } catch (cleanupError) {
            console.warn('Failed to cleanup:', cleanupError.message);
        }

        // Print summary
        console.log('\n📊 Test Summary');
        console.log('===============');
        console.log(`Result: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
        if (sessionId) {
            console.log(`Session ID: ${sessionId}`);
        }

        const bookingData = bookingBot.getBookingData();
        console.log(`Steps completed: ${bookingData.steps.length}`);
        console.log(`Errors encountered: ${bookingData.errors.length}`);

        if (bookingData.steps.length > 0) {
            console.log('\n📝 Completed Steps:');
            bookingData.steps.forEach((step, index) => {
                console.log(`   ${index + 1}. ${step.action}: ${step.details}`);
            });
        }

        console.log(`\n🔍 Screenshots and logs saved to:`);
        console.log(`   - Screenshots: ./screenshots/bookings/`);
        console.log(`   - Booking data: ./results/bookings/`);
        console.log('');
    }

    return success;
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);

    const options = {
        dryRun: !args.includes('--live'),
        submit: args.includes('--submit')
    };

    console.log('🎯 Mountain Hut Booking Test');
    console.log('============================');

    if (options.submit) {
        console.log('⚠️  WARNING: --submit flag detected!');
        console.log('⚠️  This will make a REAL booking if the test succeeds!');
        console.log('⚠️  Press Ctrl+C within 5 seconds to cancel...');

        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    const success = await testBooking(options);
    process.exit(success ? 0 : 1);
}

// API test function for integration testing
async function testBookingAPI(baseUrl = 'http://localhost:3000') {
    console.log('\n🌐 Testing Booking API Endpoints');
    console.log('================================');

    try {
        // Test creating a booking
        console.log('1. Testing POST /api/v1/booking/create');

        const createResponse = await fetch(`${baseUrl}/api/v1/booking/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(TEST_BOOKING)
        });

        if (!createResponse.ok) {
            throw new Error(`HTTP ${createResponse.status}: ${createResponse.statusText}`);
        }

        const createData = await createResponse.json();
        console.log('✅ Booking created successfully');
        console.log(`   Session ID: ${createData.data.sessionId}`);

        const sessionId = createData.data.sessionId;

        // Test getting booking status
        console.log('2. Testing GET /api/v1/booking/status/:sessionId');

        const statusResponse = await fetch(`${baseUrl}/api/v1/booking/status/${sessionId}`);
        const statusData = await statusResponse.json();

        console.log('✅ Status retrieved successfully');
        console.log(`   Status: ${statusData.data.status}`);
        console.log(`   Steps: ${statusData.data.steps.length}`);

        // Test listing all sessions
        console.log('3. Testing GET /api/v1/booking/sessions');

        const sessionsResponse = await fetch(`${baseUrl}/api/v1/booking/sessions`);
        const sessionsData = await sessionsResponse.json();

        console.log('✅ Sessions listed successfully');
        console.log(`   Active sessions: ${sessionsData.data.totalSessions}`);

        // Test cancelling the session
        console.log('4. Testing DELETE /api/v1/booking/session/:sessionId');

        const deleteResponse = await fetch(`${baseUrl}/api/v1/booking/session/${sessionId}`, {
            method: 'DELETE'
        });

        const deleteData = await deleteResponse.json();
        console.log('✅ Session cancelled successfully');

        return true;

    } catch (error) {
        console.error('❌ API Test failed:', error.message);
        return false;
    }
}

// Export for use in other scripts
module.exports = {
    testBooking,
    testBookingAPI,
    TEST_BOOKING
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
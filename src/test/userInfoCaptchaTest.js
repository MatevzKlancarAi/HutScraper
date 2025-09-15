#!/usr/bin/env node

/**
 * Test to reach the user info + captcha page and analyze what needs to be filled
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

async function userInfoCaptchaTest() {
    const bookingBot = new MicrogrammBookingBot();

    try {
        console.log('🚀 Starting User Info + Captcha Test...');

        // Go through the complete flow to reach the captcha page
        await bookingBot.initialize();
        await bookingBot.login();
        await bookingBot.selectHut(TEST_BOOKING.hutName);
        await bookingBot.selectRoomType(TEST_BOOKING.roomType);
        await bookingBot.selectDates(TEST_BOOKING.arrivalDate, TEST_BOOKING.departureDate);
        await bookingBot.fillGuestInfo(TEST_BOOKING);
        await bookingBot.selectPaymentMethod();

        // Proceed to step 2 (guest form)
        await bookingBot.proceedToNextStep();

        console.log('✅ Reached the user info + captcha page');

        const frame = bookingBot.page.frameLocator('iframe[src*="bentral.com"]');

        // Take screenshot of current state
        await bookingBot.takeScreenshot('user-info-captcha-page');

        console.log('🔍 Analyzing form elements that need to be filled...');

        // Look for all input fields
        const inputTypes = ['input[type="text"]', 'input[type="email"]', 'input[type="tel"]', 'textarea', 'select'];

        for (const inputType of inputTypes) {
            try {
                const inputs = frame.locator(inputType);
                const count = await inputs.count();

                if (count > 0) {
                    console.log(`\n📝 Found ${count} ${inputType} elements:`);

                    for (let i = 0; i < count; i++) {
                        const input = inputs.nth(i);
                        try {
                            const isVisible = await input.isVisible({ timeout: 1000 });
                            if (isVisible) {
                                const name = await input.getAttribute('name').catch(() => '');
                                const placeholder = await input.getAttribute('placeholder').catch(() => '');
                                const id = await input.getAttribute('id').catch(() => '');
                                const value = await input.inputValue().catch(() => '');
                                const required = await input.getAttribute('required').catch(() => '');

                                console.log(`   ${i+1}. Visible input:`);
                                console.log(`      Name: "${name}"`);
                                console.log(`      Placeholder: "${placeholder}"`);
                                console.log(`      ID: "${id}"`);
                                console.log(`      Current Value: "${value}"`);
                                console.log(`      Required: ${required ? 'YES' : 'NO'}`);

                                // Check if this looks like it needs filling
                                if (!value && (required || placeholder)) {
                                    console.log(`   🎯 NEEDS TO BE FILLED!`);
                                }
                            }
                        } catch (e) {
                            // Skip this input
                        }
                    }
                }
            } catch (e) {
                console.log(`   Error with ${inputType}:`, e.message);
            }
        }

        // Look for captcha elements
        console.log('\n🔍 Looking for captcha elements...');

        const captchaSelectors = [
            'img[alt*="captcha"]', 'img[src*="captcha"]', 'img[alt*="kod"]',
            'input[name="captcha"]', 'input[name="security_code"]', 'input[name="kod"]',
            '.captcha', '[class*="captcha"]'
        ];

        for (const selector of captchaSelectors) {
            try {
                const element = frame.locator(selector);
                if (await element.isVisible({ timeout: 1000 })) {
                    console.log(`✅ Found captcha element: ${selector}`);

                    if (selector.includes('img')) {
                        const src = await element.getAttribute('src').catch(() => '');
                        const alt = await element.getAttribute('alt').catch(() => '');
                        console.log(`   Image src: ${src}`);
                        console.log(`   Image alt: ${alt}`);
                    }
                }
            } catch (e) {
                // Continue
            }
        }

        // Look for checkboxes that might need to be checked
        console.log('\n🔍 Looking for checkboxes...');

        const checkboxes = frame.locator('input[type="checkbox"]');
        const checkboxCount = await checkboxes.count();

        if (checkboxCount > 0) {
            console.log(`📋 Found ${checkboxCount} checkboxes:`);

            for (let i = 0; i < checkboxCount; i++) {
                const checkbox = checkboxes.nth(i);
                try {
                    const isVisible = await checkbox.isVisible({ timeout: 1000 });
                    if (isVisible) {
                        const name = await checkbox.getAttribute('name').catch(() => '');
                        const id = await checkbox.getAttribute('id').catch(() => '');
                        const checked = await checkbox.isChecked();
                        const required = await checkbox.getAttribute('required').catch(() => '');

                        // Try to find associated label
                        let labelText = '';
                        if (id) {
                            const label = frame.locator(`label[for="${id}"]`);
                            labelText = await label.textContent().catch(() => '');
                        }

                        console.log(`   ${i+1}. Checkbox:`);
                        console.log(`      Name: "${name}"`);
                        console.log(`      ID: "${id}"`);
                        console.log(`      Label: "${labelText}"`);
                        console.log(`      Checked: ${checked}`);
                        console.log(`      Required: ${required ? 'YES' : 'NO'}`);

                        if (required && !checked) {
                            console.log(`   🎯 REQUIRED CHECKBOX - NEEDS TO BE CHECKED!`);
                        }
                    }
                } catch (e) {
                    // Skip this checkbox
                }
            }
        }

        console.log('\n📸 Browser staying open for manual inspection...');
        console.log('🔍 Check screenshots in ./screenshots/bookings/');
        console.log('Press Ctrl+C to exit.');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('user-info-captcha-error');
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

userInfoCaptchaTest().catch(console.error);
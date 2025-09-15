#!/usr/bin/env node

/**
 * Test to analyze the captcha field after filling the form completely
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

async function captchaFieldAnalysisTest() {
    const bookingBot = new MicrogrammBookingBot();

    try {
        console.log('🚀 Starting Captcha Field Analysis Test...');

        // Complete flow to get to the final form with captcha
        await bookingBot.initialize();
        await bookingBot.login();
        await bookingBot.selectHut(TEST_BOOKING.hutName);
        await bookingBot.selectRoomType(TEST_BOOKING.roomType);
        await bookingBot.selectDates(TEST_BOOKING.arrivalDate, TEST_BOOKING.departureDate);
        await bookingBot.fillGuestInfo(TEST_BOOKING);
        await bookingBot.selectPaymentMethod();
        await bookingBot.proceedToNextStep(); // This fills the form and gets us to final page

        console.log('✅ Reached the final booking page with captcha');

        const frame = bookingBot.page.frameLocator('iframe[src*="bentral.com"]');

        // Take screenshot first
        await bookingBot.takeScreenshot('captcha-analysis-before');

        console.log('🔍 Analyzing ALL input fields on final page...');

        // Look for ALL text inputs
        const allInputs = frame.locator('input[type="text"]');
        const inputCount = await allInputs.count();
        console.log(`\\n📝 Found ${inputCount} text input elements:`);

        for (let i = 0; i < inputCount; i++) {
            const input = allInputs.nth(i);
            try {
                const isVisible = await input.isVisible({ timeout: 1000 });
                if (isVisible) {
                    const name = await input.getAttribute('name').catch(() => '');
                    const id = await input.getAttribute('id').catch(() => '');
                    const placeholder = await input.getAttribute('placeholder').catch(() => '');
                    const value = await input.inputValue().catch(() => '');
                    const className = await input.getAttribute('class').catch(() => '');

                    console.log(`   ${i+1}. Text input:`)
                    console.log(`      Name: "${name}"`);
                    console.log(`      ID: "${id}"`);
                    console.log(`      Class: "${className}"`);
                    console.log(`      Placeholder: "${placeholder}"`);
                    console.log(`      Current Value: "${value}"`);

                    // Check if this looks like a captcha field
                    if (name.toLowerCase().includes('captcha') ||
                        name.toLowerCase().includes('security') ||
                        name.toLowerCase().includes('code') ||
                        name.toLowerCase().includes('varnost') ||
                        id.toLowerCase().includes('captcha') ||
                        className.toLowerCase().includes('captcha')) {
                        console.log(`   🎯 THIS LOOKS LIKE THE CAPTCHA FIELD!`);
                    }
                }
            } catch (e) {
                // Skip this input
            }
        }

        // Look for images that might be captcha
        console.log('\\n🖼️ Looking for captcha images...');
        const images = frame.locator('img');
        const imageCount = await images.count();
        console.log(`Found ${imageCount} images:`);

        for (let i = 0; i < imageCount; i++) {
            const img = images.nth(i);
            try {
                const isVisible = await img.isVisible({ timeout: 1000 });
                if (isVisible) {
                    const src = await img.getAttribute('src').catch(() => '');
                    const alt = await img.getAttribute('alt').catch(() => '');
                    const className = await img.getAttribute('class').catch(() => '');

                    console.log(`   ${i+1}. Image:`)
                    console.log(`      Src: "${src}"`);
                    console.log(`      Alt: "${alt}"`);
                    console.log(`      Class: "${className}"`);

                    if (src.includes('captcha') || alt.includes('captcha') || className.includes('captcha')) {
                        console.log(`   🎯 THIS LOOKS LIKE THE CAPTCHA IMAGE!`);
                    }
                }
            } catch (e) {
                // Skip this image
            }
        }

        // Look for any text containing security code/captcha info
        console.log('\\n📄 Looking for security code text...');
        const textElements = frame.locator('*:has-text("Varnostna"), *:has-text("captcha"), *:has-text("security"), *:has-text("kod")');
        const textCount = await textElements.count();
        console.log(`Found ${textCount} elements with security-related text`);

        for (let i = 0; i < textCount; i++) {
            const element = textElements.nth(i);
            try {
                const text = await element.textContent();
                const tagName = await element.evaluate(el => el.tagName);
                console.log(`   ${i+1}. ${tagName}: "${text}"`);
            } catch (e) {
                // Skip
            }
        }

        console.log('\\n📸 Browser staying open for manual inspection...');
        console.log('Press Ctrl+C to exit.');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('captcha-analysis-error');
    }
}

process.on('SIGINT', () => {
    console.log('\\n👋 Exiting...');
    process.exit(0);
});

captchaFieldAnalysisTest().catch(console.error);
#!/usr/bin/env node

/**
 * Form Steps Test - Try progressing through form steps
 */

const MicrogrammBookingBot = require('../MicrogrammBookingBot');

async function formStepsTest() {
    const bookingBot = new MicrogrammBookingBot();
    bookingBot.config.booking.browser.headless = false;
    bookingBot.config.booking.browser.slowMo = 2000;

    try {
        await bookingBot.initialize();
        await bookingBot.login();
        await bookingBot.selectHut('Triglavski Dom');

        console.log('✅ On booking form, checking current state...\n');

        // Take initial screenshot
        await bookingBot.takeScreenshot('form-step-1-initial');

        // Check what step we're on
        const stepElements = await bookingBot.page.$$('.step-content');
        console.log(`Found ${stepElements.length} step elements`);

        // Check for the select-unit element specifically
        console.log('🔍 Checking for select-unit...');
        const selectUnit = await bookingBot.page.$('.select-unit');
        if (selectUnit) {
            console.log('✅ Found .select-unit immediately!');
            const innerHTML = await selectUnit.innerHTML();
            console.log('Select element content:', innerHTML.slice(0, 200) + '...');
        } else {
            console.log('❌ .select-unit not found');
        }

        // Try clicking on the dropdown area just in case
        console.log('🔍 Looking for clickable dropdown area...');
        const dropdownArea = await bookingBot.page.$('text=izberite enoto');
        if (dropdownArea) {
            console.log('✅ Found dropdown text, clicking it...');
            await dropdownArea.click();
            await bookingBot.page.waitForTimeout(2000);
            await bookingBot.takeScreenshot('after-dropdown-click');
        }

        // Look for "Next" or "Continue" buttons
        console.log('🔍 Looking for next/continue buttons...');
        const nextButtons = [
            'text=Naslednji korak',
            'text=Naprej',
            'text=Continue',
            'text=Next',
            '.btn-primary',
            'button[type="submit"]',
            'input[type="submit"]'
        ];

        for (const buttonSelector of nextButtons) {
            try {
                const button = await bookingBot.page.$(buttonSelector);
                if (button) {
                    const text = await button.textContent();
                    console.log(`✅ Found button: "${text}" with selector: ${buttonSelector}`);
                }
            } catch (e) {
                // Continue
            }
        }

        // Try to find and click the "Naslednji korak" button if it exists
        try {
            const nextButton = await bookingBot.page.$('text=Naslednji korak');
            if (nextButton) {
                console.log('🔄 Clicking "Naslednji korak" button...');
                await nextButton.click();
                await bookingBot.page.waitForTimeout(3000);
                await bookingBot.takeScreenshot('after-next-step');

                // Check if dropdown appears after moving to next step
                const selectUnitAfter = await bookingBot.page.$('.select-unit');
                if (selectUnitAfter) {
                    console.log('✅ Found .select-unit after clicking next!');
                } else {
                    console.log('❌ .select-unit still not found after next step');
                }
            }
        } catch (e) {
            console.log('No "Naslednji korak" button found or clickable');
        }

        console.log('\n📸 Screenshots saved. Browser staying open...');
        console.log('Press Ctrl+C to exit.');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await bookingBot.takeScreenshot('form-steps-error');
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

formStepsTest().catch(console.error);
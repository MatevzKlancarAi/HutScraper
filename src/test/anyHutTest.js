#!/usr/bin/env node

/**
 * Any Hut Test - Open any available hut and test the form
 */

const { chromium } = require("playwright");
const config = require("../../config/booking.config.js");

async function anyHutTest() {
    console.log('🚀 Starting Any Hut Test...');

    const browser = await chromium.launch({
        headless: false,
        slowMo: 2000
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
        // Set HTTP Basic Auth
        await page.setExtraHTTPHeaders({
            'Authorization': 'Basic ' + Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64')
        });

        console.log('📍 Going to main page...');
        await page.goto('https://reservations.microgramm.si/hud/', {
            waitUntil: 'networkidle'
        });

        await page.waitForTimeout(2000);

        // Click on the first available hut
        console.log('🏔️ Looking for hut links...');
        const hutLinks = await page.$$('a');

        if (hutLinks.length > 0) {
            const firstHut = hutLinks[0];
            const hutText = await firstHut.textContent();
            console.log(`✅ Clicking on first hut: "${hutText}"`);
            await firstHut.click();
            await page.waitForTimeout(3000);
        }

        console.log(`📍 Current URL: ${page.url()}`);

        // Wait longer for JavaScript to load the form
        console.log('⏳ Waiting for JavaScript to load the form...');
        await page.waitForTimeout(5000);

        // Wait specifically for the dropdown to appear
        console.log('🔍 Waiting for room dropdown to load...');
        try {
            await page.waitForSelector('select[name="unit[]"]', { timeout: 10000 });
            console.log('✅ Found room dropdown after waiting!');
        } catch (e) {
            console.log('❌ Timeout waiting for room dropdown');
        }

        // Try the selector from your working scraper
        const roomDropdown = await page.$('select[name="unit[]"]');
        if (roomDropdown) {
            console.log('✅ Found room dropdown using select[name="unit[]"]');
            const options = await roomDropdown.$$('option');
            console.log(`   Found ${options.length} room options`);

            // Try to select the first non-empty option
            for (const option of options) {
                const value = await option.getAttribute('value');
                const text = await option.textContent();
                if (value && value !== '') {
                    console.log(`   Selecting: "${text}" (value: ${value})`);
                    await page.selectOption('select[name="unit[]"]', value);
                    break;
                }
            }
        } else {
            console.log('❌ Room dropdown not found');

            // Check for any selects
            const allSelects = await page.$$('select');
            console.log(`   Found ${allSelects.length} total select elements`);
        }

        console.log('\n✅ Browser is open and ready for inspection');
        console.log('📸 You can manually interact with the form');
        console.log('⏳ Press Ctrl+C to exit');

        // Keep alive
        setInterval(() => {}, 10000);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

anyHutTest().catch(console.error);
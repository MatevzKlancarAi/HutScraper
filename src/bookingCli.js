#!/usr/bin/env node

/**
 * Booking CLI Tool
 *
 * Command-line interface for the mountain hut booking system
 * Usage: node src/bookingCli.js <command> [options]
 */

const MicrogrammBookingBot = require('./MicrogrammBookingBot');
const { testBooking, testBookingAPI, TEST_BOOKING } = require('./test/bookingTest');

function printHelp() {
    console.log(`
🏔️  Mountain Hut Booking CLI

USAGE:
    node src/bookingCli.js <command> [options]

COMMANDS:
    book        Create a new booking (interactive)
    test        Test the booking system
    test-api    Test the API endpoints (requires server running)
    help        Show this help message

BOOKING OPTIONS:
    --hut-name <name>       Hut name (required for book command)
    --room-type <type>      Room type (required for book command)
    --arrival <date>        Arrival date (DD.MM.YYYY format)
    --departure <date>      Departure date (DD.MM.YYYY format)
    --guest-name <name>     Guest full name
    --country <country>     Guest country
    --email <email>         Guest email address
    --phone <phone>         Guest phone number

TEST OPTIONS:
    --dry-run              Test login and navigation only (default)
    --live                 Run full booking process (fills form and solves captcha)
    --submit               Actually submit the booking (REAL BOOKING!)

API TEST OPTIONS:
    --base-url <url>       API base URL (default: http://localhost:3000)

EXAMPLES:
    # Test the booking system (dry run)
    node src/bookingCli.js test

    # Test with full process but don't submit
    node src/bookingCli.js test --live

    # Test API endpoints (server must be running)
    node src/bookingCli.js test-api

    # Make a real booking (interactive)
    node src/bookingCli.js book

    # Make a booking with all parameters
    node src/bookingCli.js book \\
        --hut-name "Triglavski Dom" \\
        --room-type "Dvoposteljna soba - zakonska postelja" \\
        --arrival "01.12.2025" \\
        --departure "02.12.2025" \\
        --guest-name "John Doe" \\
        --country "Slovenia" \\
        --email "john@example.com" \\
        --phone "+386 40 123 456"

SAFETY NOTES:
    - Always test with --dry-run first
    - Use --live to test form filling and captcha solving
    - Only use --submit when you want to make a real booking
    - The system will fill forms but stop before submission by default
`);
}

function parseArgs(args) {
    const options = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg.startsWith('--')) {
            const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                options[key] = args[i + 1];
                i++; // Skip next argument as it's the value
            } else {
                options[key] = true; // Boolean flag
            }
        }
    }

    return options;
}

function validateBookingParams(params) {
    const required = ['hutName', 'roomType', 'arrival', 'departure', 'guestName', 'country', 'email', 'phone'];
    const missing = required.filter(field => !params[field]);

    if (missing.length > 0) {
        console.error('❌ Missing required parameters:', missing.join(', '));
        return false;
    }

    // Basic email validation
    if (!params.email.includes('@')) {
        console.error('❌ Invalid email address');
        return false;
    }

    return true;
}

async function promptForMissingParams(params) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    try {
        if (!params.hutName) {
            params.hutName = await question('Hut name: ') || 'Triglavski Dom';
        }

        if (!params.roomType) {
            params.roomType = await question('Room type: ') || 'Dvoposteljna soba - zakonska postelja';
        }

        if (!params.arrival) {
            params.arrival = await question('Arrival date (DD.MM.YYYY): ') || '01.12.2025';
        }

        if (!params.departure) {
            params.departure = await question('Departure date (DD.MM.YYYY): ') || '02.12.2025';
        }

        if (!params.guestName) {
            params.guestName = await question('Guest full name: ') || 'John Doe';
        }

        if (!params.country) {
            params.country = await question('Country: ') || 'Slovenia';
        }

        if (!params.email) {
            params.email = await question('Email address: ') || 'test@example.com';
        }

        if (!params.phone) {
            params.phone = await question('Phone number: ') || '+386 40 123 456';
        }

    } finally {
        rl.close();
    }

    return params;
}

async function createBooking(options) {
    console.log('\n🏔️  Creating Mountain Hut Booking');
    console.log('==================================');

    // Prepare booking parameters
    let bookingParams = {
        hutName: options.hutName,
        roomType: options.roomType,
        arrivalDate: options.arrival,
        departureDate: options.departure,
        guestName: options.guestName,
        country: options.country,
        email: options.email,
        phone: options.phone
    };

    // Prompt for missing parameters if not provided
    if (!validateBookingParams(bookingParams)) {
        console.log('\n📝 Please provide the missing information:');
        bookingParams = await promptForMissingParams(bookingParams);
    }

    console.log('\n📋 Booking Details:');
    console.log('-------------------');
    Object.entries(bookingParams).forEach(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        console.log(`${label}: ${value}`);
    });

    console.log('\n⚠️  WARNING: This will attempt to make a REAL booking!');
    console.log('Press Ctrl+C to cancel or any key to continue...');

    // Wait for user confirmation
    await new Promise(resolve => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            resolve();
        });
    });

    console.log('\n🚀 Starting booking process...');

    const bookingBot = new MicrogrammBookingBot();

    try {
        const result = await bookingBot.makeBooking(bookingParams);

        console.log('\n✅ Booking form completed successfully!');
        console.log(`📝 Session ID: ${result.sessionId}`);
        console.log(`🧮 Captcha solved: ${result.captchaSolved}`);
        console.log(`🔑 Captcha answer: ${result.captchaAnswer}`);
        console.log('');
        console.log('🛑 STOPPED BEFORE SUBMISSION as requested');
        console.log('');
        console.log('📸 Screenshots saved to: ./screenshots/bookings/');
        console.log('💾 Booking data saved to: ./results/bookings/');
        console.log('');
        console.log('To complete the booking, you can:');
        console.log('1. Use the API: POST /api/v1/booking/submit/' + result.sessionId);
        console.log('2. Run: node src/bookingCli.js submit --session-id ' + result.sessionId);

        return true;

    } catch (error) {
        console.error('\n❌ Booking failed:', error.message);
        return false;

    } finally {
        await bookingBot.cleanup();
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        printHelp();
        return;
    }

    const command = args[0];
    const options = parseArgs(args.slice(1));

    try {
        switch (command) {
            case 'help':
            case '--help':
            case '-h':
                printHelp();
                break;

            case 'test':
                console.log('🧪 Running booking system test...');
                const testOptions = {
                    dryRun: !options.live,
                    submit: options.submit || false
                };
                const success = await testBooking(testOptions);
                process.exit(success ? 0 : 1);
                break;

            case 'test-api':
                console.log('🌐 Testing booking API...');
                const baseUrl = options.baseUrl || 'http://localhost:3000';
                const apiSuccess = await testBookingAPI(baseUrl);
                process.exit(apiSuccess ? 0 : 1);
                break;

            case 'book':
                console.log('📋 Creating booking...');
                const bookingSuccess = await createBooking(options);
                process.exit(bookingSuccess ? 0 : 1);
                break;

            default:
                console.error(`❌ Unknown command: ${command}`);
                console.log('');
                printHelp();
                process.exit(1);
        }

    } catch (error) {
        console.error('❌ Command failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    createBooking,
    validateBookingParams,
    parseArgs
};
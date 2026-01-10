// Simple local test script - run with: node test-local.js
// Set environment variables from .env
const fs = require('fs');
const envContent = fs.readFileSync('.env', 'utf8');
envContent.split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    }
});

const { lambdaHandler } = require('./src/index');

// Test phone number - change this to a real number in your Airtable
const TEST_PHONE = process.argv[2] || '+14155551234';
const TEST_MESSAGE = process.argv[3] || 'hello';

async function test() {
    const event = {
        body: `From=${encodeURIComponent(TEST_PHONE)}&Body=${encodeURIComponent(TEST_MESSAGE)}`
    };

    console.log(`\n📱 Testing with phone: ${TEST_PHONE}`);
    console.log(`💬 Message: "${TEST_MESSAGE}"\n`);

    try {
        const response = await lambdaHandler(event, {});
        console.log('Status:', response.statusCode);
        console.log('\n--- TwiML Response ---');
        // Pretty print the XML
        const xml = response.body;
        console.log(xml.replace(/<Message>/g, '\n<Message>').replace(/<\/Message>/g, '</Message>\n'));
    } catch (error) {
        console.error('Error:', error);
    }
}

test();

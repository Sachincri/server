const autocannon = require('autocannon');
require('dotenv').config();

const BASE_URL = 'http://localhost:5000/api/v1';

async function runComplexBenchmark() {
    console.log('🚀 Starting Authenticated Flow Benchmark (Bina Redis)...');
    console.log('---------------------------------------------------------');

    // 1. Login to get token
    let token = '';
    try {
        const response = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'newbenchmark@gmail.com',
                password: 'Benchmark123!'
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Login failed');
        token = data.data.token;
        console.log('✅ Logged in successfully. Token acquired.');
    } catch (err) {
        console.error('❌ Login failed. Make sure the server is running on port 5000 and test user exists.');
        console.error(err.message);
        process.exit(1);
    }

    // 2. Fetch dummy product for cart testing
    let productId = '';
    try {
        const response = await fetch(`${BASE_URL}/products`);
        const data = await response.json();
        if (data.data.products && data.data.products.length > 0) {
            productId = data.data.products[0]._id;
            console.log(`✅ Using Product ID: ${productId} for Cart/Checkout tests.`);
        }
    } catch (err) {
        console.warn('⚠️ Could not fetch product ID, cart tests might fail.');
    }

    const commonHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const tests = [
        {
            name: 'User Profile (/me)',
            url: `${BASE_URL}/auth/me`,
            method: 'GET'
        },
        {
            name: 'Add To Cart',
            url: `${BASE_URL}/cart`,
            method: 'POST',
            body: JSON.stringify({
                productId: productId,
                quantity: 1
            })
        },
        {
            name: 'Get Cart Summary',
            url: `${BASE_URL}/cart/summary`,
            method: 'GET'
        },
        {
            name: 'Create Order (Checkout)',
            url: `${BASE_URL}/orders`,
            method: 'POST',
            body: JSON.stringify({
                shippingAddress: {
                    fullName: 'Benchmark User',
                    addressLine1: 'Test Address',
                    city: 'New Delhi',
                    state: 'Delhi',
                    pincode: '110001',
                    phone: '9876543210'
                },
                paymentMethod: 'COD'
            })
        }
    ];

    const results = [];

    for (const test of tests) {
        console.log(`\n📊 Testing ${test.name}...`);
        
        const result = await autocannon({
            url: test.url,
            connections: 50, // Authenticated flows are heavier, use 50 concurrent
            duration: 10,
            method: test.method,
            body: test.body,
            headers: commonHeaders
        });

        results.push({
            'Endpoint/Flow': test.name,
            'Req/sec': result.requests.average,
            'Latency (ms)': result.latency.average,
            'Errors/Timeouts': result.errors + result.timeouts
        });
        
        console.log(`✔️ Finished ${test.name}`);
    }

    console.log('\n================ AUTH FLOW RESULTS (NO REDIS) ================');
    console.table(results);
    console.log('==============================================================');
    console.log('NOTE: Bina Redis ke Session verification aur DB writes slow hote hain.');
}

runComplexBenchmark().catch(console.error);

const autocannon = require('autocannon');
const mongoose = require('mongoose');
require('dotenv').config();

// Endpoints to test
const BASE_URL = 'http://localhost:5000/api/v1';

async function runBenchmark() {
    console.log('🚀 Starting Performance Benchmark (Bina Redis ke)...');
    console.log('--------------------------------------------------');

    // 1. Get a real product slug for detail testing
    let productSlug = 'test-product';
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const product = await db.collection('products').findOne({});
        if (product && product.slug) {
            productSlug = product.slug;
            console.log(`✅ Found test product: ${product.name} (slug: ${productSlug})`);
        } else {
            console.warn('⚠️ No products found in DB, using fallback slug.');
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ Failed to connect to DB to fetch test product:', err.message);
    }

    const tests = [
        { name: 'Home Page API', url: `${BASE_URL}/home` },
        { name: 'Product List API', url: `${BASE_URL}/products` },
        { name: 'Categories API', url: `${BASE_URL}/categories` },
        { name: 'Brands API', url: `${BASE_URL}/brands` },
        { name: 'Product Detail API', url: `${BASE_URL}/products/${productSlug}` }
    ];

    const results = [];

    for (const test of tests) {
        console.log(`\n📊 Testing ${test.name}...`);
        
        const result = await autocannon({
            url: test.url,
            connections: 20, // Reduced for stability without Redis
            duration: 10,     // Test for 10 seconds
            pipelining: 1,
        });

        results.push({
            Endpoint: test.name,
            'Req/sec': result.requests.average,
            'Latency (ms)': result.latency.average,
            'Throughput (MB/sec)': (result.throughput.average / 1024 / 1024).toFixed(2),
            'Errors': result.errors + result.timeouts
        });
        
        console.log(`✔️ Finished ${test.name}`);
    }

    console.log('\n================ FINAL RESULTS (NO REDIS) ================');
    console.table(results);
    console.log('==========================================================');
    console.log('NOTE: Bina Redis ke MongoDB par har request hit karegi.');
    console.log('Isse aap base performance dekh sakte hain.');
}

runBenchmark().catch(console.error);

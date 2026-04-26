const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName: 'eCom' });
        const db = mongoose.connection.db;
        
        const hashedPassword = await bcrypt.hash('Benchmark123!', 12);
        const email = 'newbenchmark@gmail.com';
        const phone = '9999999999';

        await db.collection('users').updateOne(
            { email: email },
            { 
                $set: { 
                    name: 'New Benchmark User',
                    email: email,
                    phone: phone,
                    password: hashedPassword, 
                    role: 'user',
                    isEmailVerified: true,
                    isPhoneVerified: true,
                    active: true,
                    updatedAt: new Date() 
                },
                $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true }
        );
        
        console.log(`✅ Fresh test user ${email} created.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

setup();

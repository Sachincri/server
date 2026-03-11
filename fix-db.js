const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI, { dbName: 'eCom' })
    .then(async () => {
        const Settings = mongoose.connection.collection('settings');

        await Settings.updateMany({}, {
            $set: { emailService: 'brevo' },
            $unset: { smtpHost: 1, smtpPort: 1, smtpUser: 1, smtpPassword: 1 }
        });

        // Check results
        const docs = await Settings.find({}).toArray();
        console.log('eCom DOCS updated:', JSON.stringify(docs, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });

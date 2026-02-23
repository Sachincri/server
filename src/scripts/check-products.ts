
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/eCom';

async function checkProducts() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const Product = mongoose.model('Product', new mongoose.Schema({}), 'products');
        const products = await Product.find().lean();
        const count = products.length; // Calculate count from fetched products
        console.log('Total Products:', count);

        products.forEach((p: any) => {
            if (p.category && !/^[0-9a-fA-F]{24}$/.test(p.category.toString())) {
                console.log(`Product ${p._id} has invalid category: ${p.category}`);
            }
        });

        if (count > 0) {
            console.log('First 3 products:', JSON.stringify(products.slice(0, 3), null, 2));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkProducts();

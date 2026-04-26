const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    const uri = process.env.MONGODB_URI || process.env.DB_URI;
    await mongoose.connect(uri, { dbName: "eCom" });
    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }));

    const products = await Product.find({ "ratings.count": { $gt: 0 } }).lean();
    console.log('--- PRODUCTS WITH RATINGS ---');
    products.forEach(p => {
      console.log(`${p.name}: Avg=${p.ratings?.average}, Count=${p.ratings?.count}`);
    });

    const sum = products.reduce((acc, p) => acc + (p.ratings?.average || 0), 0);
    console.log(`Manual Avg: ${sum} / ${products.length} = ${sum / products.length}`);

    mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();

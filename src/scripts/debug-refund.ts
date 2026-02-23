
import dotenv from "dotenv";
import Razorpay from "razorpay";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

console.log("Key ID:", RAZORPAY_KEY_ID ? "Found" : "Missing");
console.log("Key Secret:", RAZORPAY_KEY_SECRET ? "Found" : "Missing");

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.error("Please ensure .env file has RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
    process.exit(1);
}

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
});

const TEST_PAYMENT_ID = "pay_S72XfvyHbxKkYm"; // From user logs

async function debugRefund() {
    console.log(`\n--- Debugging Refund for ${TEST_PAYMENT_ID} ---\n`);

    try {
        // 1. Fetch Payment Details
        console.log("1. Fetching Payment Details...");
        const payment = await razorpay.payments.fetch(TEST_PAYMENT_ID);
        console.log("   Status:", payment.status);
        console.log("   Amount:", payment.amount);
        console.log("   Refunded:", payment.amount_refunded);
        console.log("   Remaining:", Number(payment.amount) - Number(payment.amount_refunded));

        if (payment.status !== "captured") {
            console.log("   ⚠️ Payment not captured. Cannot refund.");
            return;
        }

        let refundable = Number(payment.amount) - Number(payment.amount_refunded);
        if (refundable <= 0) {
            console.log("   ⚠️ No refundable amount left.");
            return;
        }

        // 2. Try Partial Refund (Small amount to test payload)
        // We try specifically the minimal payload that failed in the app
        let amountToRefund = Math.min(100, refundable); // 1 Rupee

        console.log(`\n2. Attempting Refund of ${amountToRefund} paise...`);

        let refundOptions = {
            amount: amountToRefund,
            // speed: "normal", // Commented out to test minimal
            // notes: { reason: "Debug Script" }
        };

        console.log("   Payload:", JSON.stringify(refundOptions));

        // @ts-ignore
        let refund = await razorpay.payments.refund(TEST_PAYMENT_ID, refundOptions);
        console.log("   ✅ Refund SUCCESS:", refund.id);

        // Update refundable amount after the first refund attempt
        refundable -= amountToRefund;

        if (refundable <= 0) {
            console.log("   ⚠️ No refundable amount left after first refund.");
            return;
        }

        // 3. Try another partial refund with NOTES to see if that breaks it
        amountToRefund = Math.min(100, refundable); // Another 1 Rupee

        console.log(`\n3. Attempting Refund of ${amountToRefund} paise WITH NOTES...`);

        const refundOptions2: any = {
            amount: amountToRefund,
            notes: {
                reason: "Debug Script with Notes"
            }
            // speed: "normal" // Keep this commented out for now
        };

        console.log("   Payload:", JSON.stringify(refundOptions2));

        // 4. Try EXACT REMAINING Refund
        // const currentRemaining = ... (Removed unused)
        // We need to account for Step 3?
        // Wait, 'refundable' variable was local in previous logic. 
        // Let's refetch to be sure.
        const p = await razorpay.payments.fetch(TEST_PAYMENT_ID);
        const finalRemaining = Number(p.amount) - Number(p.amount_refunded);

        // 4. Try ALMOST FINAL FULL Refund (Leave 100 paise)
        const almostFinal = finalRemaining - 100;
        console.log(`\n4. Attempting Refund of ${almostFinal} paise (ALMOST FINAL)...`);

        const refundOptions3: any = {
            amount: almostFinal
        };

        console.log("   Payload:", JSON.stringify(refundOptions3));

        // @ts-ignore
        refund = await razorpay.payments.refund(TEST_PAYMENT_ID, refundOptions3);
        console.log("   ✅ Refund SUCCESS:", refund.id);

    } catch (error: any) {
        console.error("\n❌ Refund FAILED:");
        if (error.statusCode) {
            console.error("   Status:", error.statusCode);
            console.error("   Error:", JSON.stringify(error.error, null, 2));
        } else {
            console.error(error);
        }
    }
}

debugRefund();

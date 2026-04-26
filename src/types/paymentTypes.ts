export interface PaymentVerificationBody {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  orderOptions: OrderOptions;
}

export interface OrderOptions {
  shippingInfo: {
    address: string;
    city: string;
    state: string;
    country: string;
    pinCode: number;
    phoneNo: string;
  };
  orderItems: Array<{
    product: string;
    name: string;
    price: number;
    quantity: number;
    image: string;
  }>;
  itemsPrice: number;
  taxPrice: number;
  shippingPrice: number;
  totalPrice: number;
  user: string;
  paymentInfo?: {
    id?: string;
    status?: string;
    method?: string;
  };
}

export interface RazorpayOrderOptions {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, any>;
}
export interface ShippingInfo {
  address: string;
  city: string;
  state: string;
  country: string;
  pinCode: number;
  phoneNo: string;
}

export interface OrderItem {
  product: string;
  name: string;
  sellingPrice: number;
  actualPrice?: number;
  quantity: number;
  image: string;
  size?: string;
  color?: string;
}

export interface PaymentInfo {
  id: string;
  status: string;
  method: string;
}

export interface OrderValidationResult {
  cart: any;
  itemsPrice: number;
  shippingCharges: number;
  totalAmountBeforeDiscount: number;
  finalAmount: number;
  couponDiscount: number;
  redeemCoins: number;
  couponCode?: string;
  coupon?: any;

}

export interface OrderData {
  shippingInfo: ShippingInfo;
  orderItems: OrderItem[];
  paymentInfo: PaymentInfo;
  itemsPrice: number;

  shippingPrice: number;
  totalPrice: number;
  paymentMethod?: string;
  redeemCoins?: number;
  couponCode?: string;
}
import { Request } from 'express';
import { IUser } from '../models/User.model';

export interface AuthRequest extends Request {
  user?: IUser;
}

export interface TokenPayload {
  id: string;
  iat?: number;
  exp?: number;
}

export interface RegisterDTO {
  name: string;
  email: string;
  phone: string;
  password: string;
  referralCode?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface CreateProductDTO {
  name: string;
  description: string;
  price: number;
  discount?: number;
  category: string;
  stock: number;
  images?: string[];
}

export interface CreateOrderDTO {
  items: Array<{
    product: string;
    quantity: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  paymentMethod: 'card' | 'upi' | 'netbanking' | 'cod';
}

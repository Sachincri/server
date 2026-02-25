import { Request, Response, NextFunction } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import ApiError from '../utils/apiError';
import ApiResponse from '../utils/response';
import Coupon from '../models/Coupon.model';
import User from '../models/User.model';
import Notification from '../models/Notification.model';
import emailService from '../services/email.Service';
import mongoose from 'mongoose';

// @desc    Create a new coupon
// @route   POST /api/v1/coupons
// @access  Admin
export const createCoupon = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { code } = req.body;

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
        return next(ApiError.conflict('Coupon with this code already exists'));
    }

    const coupon = await Coupon.create({
        ...req.body,
        code: code.toUpperCase()
    });

    res.status(201).json(ApiResponse.created(coupon, 'Coupon created successfully'));
});

// @desc    Get all coupons
// @route   GET /api/v1/coupons
// @access  Admin
// @access  Admin
export const getAllCoupons = asyncHandler(async (_req: Request, res: Response) => {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.status(200).json(ApiResponse.success(coupons, 'Coupons fetched successfully'));
});

// @desc    Update a coupon
// @route   PUT /api/v1/coupons/:id
// @access  Admin
export const updateCoupon = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    });

    if (!coupon) {
        return next(ApiError.notFound('Coupon not found'));
    }

    res.status(200).json(ApiResponse.success(coupon, 'Coupon updated successfully'));
});

// @desc    Delete a coupon
// @route   DELETE /api/v1/coupons/:id
// @access  Admin
export const deleteCoupon = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);

    if (!coupon) {
        return next(ApiError.notFound('Coupon not found'));
    }

    res.status(200).json(ApiResponse.success(null, 'Coupon deleted successfully'));
});

// @desc    Assign coupon to a specific user
// @route   POST /api/v1/coupons/assign
// @access  Admin
export const assignCouponToUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { couponId, userId } = req.body;

    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        return next(ApiError.notFound('Coupon not found'));
    }

    if (!coupon.isActive) {
        return next(ApiError.badRequest('Coupon is inactive'));
    }

    if (new Date(coupon.expiryDate) < new Date()) {
        return next(ApiError.badRequest('Coupon has expired'));
    }

    const user = await User.findById(userId);
    if (!user) {
        return next(ApiError.notFound('User not found'));
    }

    // Check if already assigned
    const alreadyAssigned = user.coupons.find(c => c.coupon.toString() === couponId);
    if (alreadyAssigned) {
        return next(ApiError.conflict('User already has this coupon'));
    }

    // Add to User's coupons
    user.coupons.push({
        coupon: coupon._id as mongoose.Types.ObjectId,
        isUsed: false,
        assignedAt: new Date()
    });
    await user.save();

    // Add to Coupon's assignedUsers
    coupon.assignedUsers.push(user._id as mongoose.Types.ObjectId);
    await coupon.save();

    // Create Notification
    await Notification.create({
        recipient: user._id,
        type: 'promotional',
        title: 'New Coupon Received! 🎉',
        message: `You've received a special coupon: ${coupon.code}. Use it to get ${coupon.discountType === 'percentage' ? coupon.discountAmount + '%' : 'FLAT ' + coupon.discountAmount} OFF!`,
    });

    // Send Email
    const emailMessage = `
    <h1>Congratulations!</h1>
    <p>You have received a special discount coupon.</p>
    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
      <h2 style="color: #4f46e5; font-size: 24px;">${coupon.code}</h2>
      <p>Use this code at checkout to get <strong>${coupon.discountType === 'percentage' ? coupon.discountAmount + '%' : '₹' + coupon.discountAmount} OFF</strong></p>
      <p style="font-size: 12px; color: #6b7280;">Valid until ${new Date(coupon.expiryDate).toLocaleDateString()}</p>
    </div>
    <p>Happy Shopping!</p>
  `;

    try {
        await emailService.sendEmail({
            email: user.email,
            subject: 'You chose a gift! 🎁',
            message: `You received a coupon: ${coupon.code}`,
            html: emailMessage
        });
    } catch (error) {
        // Log error but don't fail the request
        console.error('Failed to send coupon email', error);
    }

    res.status(200).json(ApiResponse.success(null, 'Coupon assigned to user successfully'));
});

// @desc    Validate coupon
// @route   POST /api/v1/coupons/validate
// @access  Public (Users)
export const validateCoupon = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { code, amount } = req.body;

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

    if (!coupon) {
        return next(ApiError.notFound('Invalid or inactive coupon code'));
    }

    if (new Date(coupon.expiryDate) < new Date()) {
        return next(ApiError.badRequest('Coupon has expired'));
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return next(ApiError.badRequest('Coupon usage limit exceeded'));
    }

    if (amount < coupon.minPurchaseAmount) {
        return next(ApiError.badRequest(`Minimum purchase of ₹${coupon.minPurchaseAmount} required`));
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'percentage') {
        discount = (amount * coupon.discountAmount) / 100;
        if (coupon.maxDiscountAmount) {
            discount = Math.min(discount, coupon.maxDiscountAmount);
        }
    } else {
        discount = coupon.discountAmount;
    }

    // Ensure discount doesn't exceed total amount
    discount = Math.min(discount, amount);

    res.status(200).json(ApiResponse.success({
        code: coupon.code,
        discountType: coupon.discountType,
        discountAmount: discount,
        finalAmount: amount - discount
    }, 'Coupon applied successfully'));
});

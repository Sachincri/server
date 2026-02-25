import { Request, Response, NextFunction } from 'express';
import SupportRequest from '../models/Support.model';
import asyncHandler from '../middleware/asyncHandler';
import ApiError from '../utils/apiError';

// @desc    Submit a new support request
// @route   POST /api/v1/support/request
// @access  Private
export const submitRequest = asyncHandler(async (req: any, res: Response, _next: NextFunction) => {
    const { subject, category, description, priority } = req.body;

    const request = await SupportRequest.create({
        user: req.user._id,
        subject,
        category,
        description,
        priority: priority || 'Medium',
    });

    res.status(201).json({
        status: 'success',
        message: 'Support request submitted successfully',
        data: {
            request,
        },
    });
});

// @desc    Get all support requests (User's own requests)
// @route   GET /api/v1/support/my-requests
// @access  Private
export const getMyRequests = asyncHandler(async (req: any, res: Response, _next: NextFunction) => {
    const requests = await SupportRequest.find({ user: req.user._id }).sort('-createdAt');

    res.status(200).json({
        status: 'success',
        results: requests.length,
        data: {
            requests,
        },
    });
});

// @desc    Get all support requests (Admin only)
// @route   GET /api/v1/support/all-requests
// @access  Private/Admin
export const getAllRequests = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    const requests = await SupportRequest.find().populate('user', 'name email').sort('-createdAt');

    res.status(200).json({
        status: 'success',
        results: requests.length,
        data: {
            requests,
        },
    });
});

// @desc    Update support request status (Admin only)
// @route   PATCH /api/v1/support/:id
// @access  Private/Admin
export const updateRequestStatus = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { status, priority } = req.body;

    const request = await SupportRequest.findByIdAndUpdate(
        req.params.id,
        { status, priority },
        { new: true, runValidators: true }
    );

    if (!request) {
        return next(ApiError.notFound('No support request found with that ID'));
    }

    res.status(200).json({
        status: 'success',
        data: {
            request,
        },
    });
});

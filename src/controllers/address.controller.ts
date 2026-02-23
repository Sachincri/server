import { Response } from "express";
import User from "../models/User.model";
import ApiResponse from "../utils/response";
import ApiError from "../utils/apiError";
import asyncHandler from "../middleware/asyncHandler";
import { AuthRequest } from "../types";

// @desc    Add new address
// @route   POST /api/v1/addresses
// @access  Private
export const addAddress = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const user = await User.findById(req.user!._id);

        if (!user) {
            throw ApiError.notFound("User not found");
        }

        const { name, address, city, state, country, pinCode, phoneNo, isDefault } = req.body;

        // If this is the first address or isDefault is true, unset other defaults
        if (isDefault || user.addresses.length === 0) {
            user.addresses.forEach((addr) => {
                addr.isDefault = false;
            });
        }

        user.addresses.push({
            name,
            address,
            city,
            state,
            country,
            pinCode,
            phoneNo,
            isDefault: isDefault || user.addresses.length === 0,
        } as any);

        // If user doesn't have a phone number, use the one from the address
        if (!user.phone) {
            user.phone = phoneNo;
        }

        await user.save();

        res.status(201).json(ApiResponse.created(user.addresses, "Address added successfully"));
    }
);

// @desc    Get all addresses
// @route   GET /api/v1/addresses
// @access  Private
export const getAddresses = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const user = await User.findById(req.user!._id);

        if (!user) {
            throw ApiError.notFound("User not found");
        }

        res.status(200).json(ApiResponse.success(user.addresses));
    }
);

// @desc    Update address
// @route   PUT /api/v1/addresses/:id
// @access  Private
export const updateAddress = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const user = await User.findById(req.user!._id);

        if (!user) {
            throw ApiError.notFound("User not found");
        }

        const { id } = req.params;
        const { name, address, city, state, country, pinCode, phoneNo, isDefault } = req.body;

        const addressIndex = user.addresses.findIndex(
            (addr) => addr._id.toString() === id
        );

        if (addressIndex === -1) {
            throw ApiError.notFound("Address not found");
        }

        if (isDefault) {
            user.addresses.forEach((addr) => {
                addr.isDefault = false;
            });
        }

        user.addresses[addressIndex] = {
            ...user.addresses[addressIndex],
            name: name || user.addresses[addressIndex].name,
            address: address || user.addresses[addressIndex].address,
            city: city || user.addresses[addressIndex].city,
            state: state || user.addresses[addressIndex].state,
            country: country || user.addresses[addressIndex].country,
            pinCode: pinCode || user.addresses[addressIndex].pinCode,
            phoneNo: phoneNo || user.addresses[addressIndex].phoneNo,
            isDefault: isDefault !== undefined ? isDefault : user.addresses[addressIndex].isDefault,
        } as any;

        // If user doesn't have a phone number, use the one from the updated address
        if (!user.phone && phoneNo) {
            user.phone = phoneNo;
        }

        await user.save();

        res.status(200).json(ApiResponse.success(user.addresses, "Address updated successfully"));
    }
);

// @desc    Delete address
// @route   DELETE /api/v1/addresses/:id
// @access  Private
export const deleteAddress = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const user = await User.findById(req.user!._id);

        if (!user) {
            throw ApiError.notFound("User not found");
        }

        const { id } = req.params;
        const addressToDelete = user.addresses.find(addr => addr._id.toString() === id);

        if (!addressToDelete) {
            throw ApiError.notFound("Address not found");
        }

        user.addresses = user.addresses.filter(
            (addr) => addr._id.toString() !== id
        ) as any;

        // If we deleted the default address, set another one as default if available
        if (addressToDelete.isDefault && user.addresses.length > 0) {
            user.addresses[0].isDefault = true;
        }

        await user.save();

        res.status(200).json(ApiResponse.success(user.addresses, "Address deleted successfully"));
    }
);

// @desc    Set default address
// @route   PATCH /api/v1/addresses/:id/default
// @access  Private
export const setDefaultAddress = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const user = await User.findById(req.user!._id);

        if (!user) {
            throw ApiError.notFound("User not found");
        }

        const { id } = req.params;
        const addressExists = user.addresses.some(addr => addr._id.toString() === id);

        if (!addressExists) {
            throw ApiError.notFound("Address not found");
        }

        user.addresses.forEach((addr) => {
            addr.isDefault = addr._id.toString() === id;
        });

        await user.save();

        res.status(200).json(ApiResponse.success(user.addresses, "Default address updated"));
    }
);

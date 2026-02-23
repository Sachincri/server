import { Types } from "mongoose";

/**
 * Validates if the given string is a valid MongoDB ObjectId
 * @param id The string to validate
 * @returns boolean
 */
export const isValidObjectId = (id: string): boolean => {
    return Types.ObjectId.isValid(id);
};

/**
 * Calculates pagination details
 * @param page Current page number
 * @param limit Results per page
 * @returns { skip, limit }
 */
export const getPagination = (page?: string | number, limit?: string | number) => {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 10));
    const skip = (p - 1) * l;
    return { skip, limit: l, page: p };
};

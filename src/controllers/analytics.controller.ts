import { Response } from "express";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import Settings from "../models/Settings.model";
import asyncHandler from "../middleware/asyncHandler";
// import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";
import { AuthRequest } from "../types";

export const getRealtimeTraffic = asyncHandler(async (_req: AuthRequest, res: Response) => {
    // 0. Check if GA is enabled in settings
    const settings = await Settings.findOne().sort({ createdAt: -1 });
    if (!settings || !settings.googleAnalyticsEnabled) {
        return res.status(200).json(ApiResponse.success({ activeUsers: 0 }, "GA disabled in settings"));
    }

    // 1. Get GA Creds from Env
    const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    const clientEmail = process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_ANALYTICS_PRIVATE_KEY;

    if (!propertyId || !clientEmail || !privateKey) {
        return res.status(200).json(ApiResponse.success({ activeUsers: 0 }, "GA credentials missing in environment"));
    }

    // 2. Initialize Client
    const analyticsDataClient = new BetaAnalyticsDataClient({
        credentials: {
            client_email: clientEmail,
            private_key: privateKey.replace(/\\n/g, '\n'), // Handle newlines in private key
        },
    });

    // 3. Run Report
    try {
        const [response] = await analyticsDataClient.runRealtimeReport({
            property: `properties/${propertyId}`,
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
        });

        const countryData = response.rows?.map(row => ({
            country: row.dimensionValues?.[0].value || 'Unknown',
            activeUsers: parseInt(row.metricValues?.[0].value || '0', 10),
        })) || [];

        const totalActiveUsers = countryData.reduce((acc, curr) => acc + curr.activeUsers, 0);

        return res.status(200).json(ApiResponse.success({
            totalActiveUsers,
            countryData
        }, "Realtime traffic fetched successfully"));
    } catch (error: any) {
        console.error("GA Error:", error);
        // Don't crash the dashboard if GA fails
        return res.status(200).json(ApiResponse.success({ activeUsers: 0, error: error.message }, "Failed to fetch GA data"));
    }
});

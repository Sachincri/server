import { BetaAnalyticsDataClient } from "@google-analytics/data";
import dotenv from "dotenv";

dotenv.config();

// Ensure you have credentials set up. 
// 1. Service account key file path in GOOGLE_APPLICATION_CREDENTIALS env var
// 2. OR explicit credentials passed to constructor (not recommended for production code committing)

const PROPERTY_ID = process.env.GA4_PROPERTY_ID;

let analyticsDataClient: BetaAnalyticsDataClient | null = null;

const getClient = () => {
    if (analyticsDataClient) return analyticsDataClient;

    if (!PROPERTY_ID || PROPERTY_ID === 'your_property_id') {
        return null;
    }

    try {
        // Only try to initialize if credentials might exist
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS &&
            process.env.GOOGLE_APPLICATION_CREDENTIALS !== 'path/to/credentials.json') {
            analyticsDataClient = new BetaAnalyticsDataClient();
            return analyticsDataClient;
        }
    } catch (error) {
        console.error("Failed to initialize Google Analytics client:", error);
    }
    return null;
};

if (!PROPERTY_ID || PROPERTY_ID === 'your_property_id') {
    console.warn("GA4_PROPERTY_ID is not properly set in .env. Analytics features will be disabled.");
}

export const getRealtimeActiveUsers = async () => {
    const client = getClient();
    if (!client || !PROPERTY_ID) return 0;
    try {
        const [response] = await client.runRealtimeReport({
            property: `properties/${PROPERTY_ID}`,
            metrics: [
                {
                    name: 'activeUsers',
                },
            ],
        });
        return response?.rows?.[0]?.metricValues?.[0]?.value || 0;
    } catch (error) {
        console.error("Error fetching GA4 Realtime data:", error);
        return 0;
    }
};

export const getTrafficSources = async (dateRange = { startDate: '30daysAgo', endDate: 'today' }) => {
    const client = getClient();
    if (!client || !PROPERTY_ID) return [];
    try {
        // Run report
        const [response] = await client.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [dateRange],
            dimensions: [
                {
                    name: 'sessionSource',
                },
            ],
            metrics: [
                {
                    name: 'sessions', // or activeUsers
                },
            ],
            limit: 5,
        });

        // Format
        const totalSessions = response.rows?.reduce((acc, row) => acc + Number(row.metricValues?.[0]?.value || 0), 0) || 1;

        return response.rows?.map(row => ({
            name: row.dimensionValues?.[0]?.value || 'Unknown',
            value: ((Number(row.metricValues?.[0]?.value || 0) / totalSessions) * 100).toFixed(1), // %
            count: Number(row.metricValues?.[0]?.value || 0)
        })) || [];
    } catch (error) {
        console.error("Error fetching GA4 Traffic data:", error);
        return [];
    }
};

export const getDeviceCategory = async (dateRange = { startDate: '30daysAgo', endDate: 'today' }) => {
    const client = getClient();
    if (!client || !PROPERTY_ID) return [];
    try {
        const [response] = await client.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [dateRange],
            dimensions: [
                {
                    name: 'deviceCategory',
                },
            ],
            metrics: [
                {
                    name: 'sessions',
                },
                {
                    name: 'totalRevenue', // If you have ecommerce tracking
                }
            ],
        });

        return response.rows?.map(row => ({
            device: row.dimensionValues?.[0]?.value || 'Unknown',
            sessions: Number(row.metricValues?.[0]?.value || 0),
            revenue: Number(row.metricValues?.[1]?.value || 0),
        })) || [];

    } catch (error) {
        console.error("Error fetching GA4 Device data:", error);
        return [];
    }
};

export const getCountryData = async (dateRange = { startDate: '30daysAgo', endDate: 'today' }) => {
    const client = getClient();
    if (!client || !PROPERTY_ID) return [];
    try {
        const [response] = await client.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [dateRange],
            dimensions: [
                {
                    name: 'country',
                },
            ],
            metrics: [
                {
                    name: 'totalRevenue',
                },
                {
                    name: 'sessions',
                },
            ],
            limit: 10
        });

        const totalSessions = response.rows?.reduce((acc, row) => acc + Number(row.metricValues?.[1]?.value || 0), 0) || 1;

        return response.rows?.map(row => ({
            country: row.dimensionValues?.[0]?.value || 'Unknown',
            revenue: Number(row.metricValues?.[0]?.value || 0),
            percentage: ((Number(row.metricValues?.[1]?.value || 0) / totalSessions) * 100).toFixed(1)
        })) || [];

    } catch (error) {
        console.error("Error fetching GA4 Country data:", error);
        return [];
    }
};

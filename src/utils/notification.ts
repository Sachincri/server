import logger from './logger';

// Lazy load Expo to handle ESM compatibility in CJS environment
let expo: any = null;

async function getExpo() {
  if (!expo) {
    const { Expo } = await import('expo-server-sdk');
    expo = new Expo();
  }
  return expo;
}

export interface NotificationPayload {
  to: string | string[];
  title: string;
  body: string;
  data?: any;
}

/**
 * Send push notifications to Expo Push Tokens
 */
export async function sendPushNotification(payload: NotificationPayload) {
  const { to, title, body, data } = payload;
  
  // Dynamically import types and class
  const { Expo } = await import('expo-server-sdk');
  const expoInstance = await getExpo();
  
  const tokens = Array.isArray(to) ? to : [to];
  const messages: any[] = []; // Using any because of dynamic import type issues

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      logger.error(`Push token ${token} is not a valid Expo push token`);
      continue;
    }

    messages.push({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    });
  }

  const chunks = expoInstance.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expoInstance.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      logger.error('Error sending push notification chunk:', error);
    }
  }

  return tickets;
}

import axios from "axios";

/**
 * Send WhatsApp text message via Meta Graph API
 */
export async function sendWhatsAppMessage(toPhoneNumber: string, text: string, token: string, phoneNumberId: string) {
  try {
    const response = await axios({
      method: "POST",
      url: `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: {
        messaging_product: "whatsapp",
        to: toPhoneNumber,
        text: { body: text },
      }
    });
    return response.data;
  } catch (error: any) {
    logger.error("Error sending WhatsApp message via Meta API:", error?.response?.data || error.message);
    throw error;
  }
}

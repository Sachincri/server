import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import logger from './logger';

const expo = new Expo();

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
  
  const tokens = Array.isArray(to) ? to : [to];
  const messages: ExpoPushMessage[] = [];

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

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      logger.error('Error sending push notification chunk:', error);
    }
  }

  // NOTE: You should ideally handle tickets to check for errors/unsubscriptions
  // but for basic setup, this is sufficient.
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

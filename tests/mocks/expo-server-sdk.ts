export interface ExpoPushMessage {
    to: string | string[];
    sound?: string;
    title?: string;
    body?: string;
    data?: any;
}

export class Expo {
    static isExpoPushToken(token: string): boolean {
        return typeof token === "string" && token.startsWith("ExponentPushToken");
    }

    chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][] {
        return messages.length ? [messages] : [];
    }

    async sendPushNotificationsAsync(messages: ExpoPushMessage[]) {
        return messages.map(() => ({ status: "ok" }));
    }
}

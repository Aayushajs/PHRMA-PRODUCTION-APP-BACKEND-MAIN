/*
┌────────────────────────────────────────────────────────────────────────┐
│  FCM Notification Service - Production Ready                           │
│  Handles Firebase Cloud Messaging for push notifications              │
└────────────────────────────────────────────────────────────────────────┘
*/
import { firebaseAdmin } from "./serviceAccount";
// ============================================================================
// CONSTANTS
// ============================================================================
const FCM_ERROR_CODES = {
    INVALID_TOKEN: 'messaging/invalid-registration-token',
    TOKEN_NOT_REGISTERED: 'messaging/registration-token-not-registered',
    INVALID_ARGUMENT: 'messaging/invalid-argument',
    SERVER_UNAVAILABLE: 'messaging/server-unavailable',
};
// ============================================================================
// VALIDATION
// ============================================================================
const isValidFCMToken = (token) => {
    if (!token || typeof token !== 'string')
        return false;
    if (token.trim() === '')
        return false;
    if (token.startsWith('ExponentPushToken'))
        return false; // Reject Expo tokens
    if (token.length < 100)
        return false; // FCM tokens are typically 150+ chars
    return true;
};
// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================
export const sendPushNotification = async (token, title, body, data = {}) => {
    try {
        // Validate token
        if (!isValidFCMToken(token)) {
            return {
                success: false,
                error: 'Invalid FCM token format',
                errorCode: 'INVALID_TOKEN_FORMAT'
            };
        }
        // Convert data values to strings (FCM requirement)
        const stringData = {};
        for (const [key, value] of Object.entries(data)) {
            stringData[key] = String(value);
        }
        // Add metadata
        stringData.sentAt = new Date().toISOString();
        // Build FCM message
        const message = {
            token,
            notification: {
                title,
                body,
            },
            data: stringData,
            android: {
                priority: "high",
                notification: {
                    channelId: "default",
                    sound: "default",
                    priority: "high",
                    defaultSound: true,
                    defaultVibrateTimings: true,
                },
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title,
                            body,
                        },
                        sound: "default",
                        badge: 1,
                    },
                },
                headers: {
                    "apns-priority": "10",
                },
            },
        };
        // Send notification
        const messageId = await firebaseAdmin.messaging().send(message);
        return {
            success: true,
            messageId,
        };
    }
    catch (error) {
        // Handle FCM-specific errors
        const errorCode = error.code || 'UNKNOWN_ERROR';
        let errorMessage = error.message || 'Failed to send notification';
        switch (errorCode) {
            case FCM_ERROR_CODES.INVALID_TOKEN:
            case FCM_ERROR_CODES.TOKEN_NOT_REGISTERED:
                errorMessage = 'Invalid or expired FCM token';
                break;
            case FCM_ERROR_CODES.INVALID_ARGUMENT:
                errorMessage = 'Invalid notification payload';
                break;
            case FCM_ERROR_CODES.SERVER_UNAVAILABLE:
                errorMessage = 'FCM service temporarily unavailable';
                break;
        }
        return {
            success: false,
            error: errorMessage,
            errorCode,
        };
    }
};
export const sendBulkNotifications = async (tokens, title, body, data = {}) => {
    const results = await Promise.all(tokens.map(token => sendPushNotification(token, title, body, data)));
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    return {
        successCount,
        failureCount,
        results,
    };
};

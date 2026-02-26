/*
┌────────────────────────────────────────────────────────────────────────┐
│  FCM Notification Service - Production Ready                           │
│  Handles Firebase Cloud Messaging for push notifications              │
└────────────────────────────────────────────────────────────────────────┘
*/

import { firebaseAdmin } from "./serviceAccount";
import { messaging } from "firebase-admin";

// ============================================================================
// TYPES
// ============================================================================

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FCM_ERROR_CODES = {
  INVALID_TOKEN: 'messaging/invalid-registration-token',
  TOKEN_NOT_REGISTERED: 'messaging/registration-token-not-registered',
  INVALID_ARGUMENT: 'messaging/invalid-argument',
  SERVER_UNAVAILABLE: 'messaging/server-unavailable',
} as const;

// ============================================================================
// VALIDATION
// ============================================================================

const isValidFCMToken = (fcmToken: string): boolean => {
  if (!fcmToken || typeof fcmToken !== 'string') return false;
  if (fcmToken.trim() === '') return false;
  if (fcmToken.startsWith('ExponentPushToken')) return false; // Reject Expo tokens
  if (fcmToken.length < 100) return false; // FCM tokens are typically 150+ chars
  return true;
};

// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

export const sendPushNotification = async (
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<NotificationResult> => {
  try {
    // Validate token
    if (!isValidFCMToken(fcmToken)) {
      return {
        success: false,
        error: 'Invalid FCM token format',
        errorCode: 'INVALID_TOKEN_FORMAT'
      };
    }

    // Convert data values to strings (FCM requirement)
    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      stringData[key] = String(value);
    }

    // Add metadata
    stringData.sentAt = new Date().toISOString();

    // Build FCM message
    const message: messaging.Message = {
      token: fcmToken,
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

  } catch (error: any) {
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

export const sendBulkNotifications = async (
  fcmTokens: string[],
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<{ successCount: number; failureCount: number; results: NotificationResult[] }> => {
  const results = await Promise.all(
    fcmTokens.map(fcmToken => sendPushNotification(fcmToken, title, body, data))
  );

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  return {
    successCount,
    failureCount,
    results,
  };
};
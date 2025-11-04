import axios from "axios";

export const sendPushNotification = async (
  token: string,
  title: string,
  body: string,
  data: Record<string, any> = {}
) => {
  try {
    if (!token?.startsWith("ExponentPushToken")) {
      console.warn(" Invalid Expo push token:", token);
      return;
    }

    const message = {
      to: token,
      sound: "default",
      title,
      body,
      data,
    };

    const response = await axios.post("https://exp.host/--/api/v2/push/send", message, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    console.log(" Notification sent:", response.data);
  } catch (error: any) {
    console.error(" Failed to send notification:", error.message);
  }
};
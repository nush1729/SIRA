import { env } from "../../config/env";
import { NotificationProvider } from "./NotificationProvider";
import { MockNotificationProvider } from "./MockNotificationProvider";
import { LiveNotificationProvider } from "./LiveNotificationProvider";

export * from "./NotificationProvider";

export const notificationProvider: NotificationProvider =
  env.PROVIDER_MODE === "live" ? new LiveNotificationProvider() : new MockNotificationProvider();

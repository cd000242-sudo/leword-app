import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { LewordMobileClient } from '../api/lewordClient';
import type { MobilePushSubscription } from '../contracts';

export type PushRegistrationStatus =
  | 'registered'
  | 'unavailable'
  | 'permission-denied'
  | 'missing-project-id'
  | 'failed';

export interface PushRegistrationResult {
  status: PushRegistrationStatus;
  message: string;
  subscription?: MobilePushSubscription;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function getExpoProjectId(): string {
  const constants = Constants as any;
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || constants.easConfig?.projectId
    || constants.expoConfig?.extra?.eas?.projectId
    || ''
  ).trim();
}

function getDeviceId(): string {
  return [
    Platform.OS,
    Device.brand || 'unknown-brand',
    Device.modelName || 'unknown-model',
    Device.osVersion || 'unknown-os',
  ].join(':');
}

export async function registerLeWordPushNotifications(
  client: LewordMobileClient,
): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return {
      status: 'unavailable',
      message: 'Push notifications require a real device build.',
    };
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return {
      status: 'missing-project-id',
      message: 'Set EXPO_PUBLIC_EAS_PROJECT_ID or run an EAS project build before enabling push.',
    };
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  const finalPermission = existingPermission.status === 'granted'
    ? existingPermission
    : await Notifications.requestPermissionsAsync();

  if (finalPermission.status !== 'granted') {
    return {
      status: 'permission-denied',
      message: 'Notification permission was denied on this device.',
    };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('leword-fresh-keywords', {
      name: 'LEWORD fresh keywords',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#22c55e',
    });
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const registered = await client.registerPushSubscription({
      pushToken: token.data,
      platform: 'expo',
      deviceId: getDeviceId(),
      appVersion: Constants.expoConfig?.version || undefined,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    });

    return {
      status: 'registered',
      message: 'This device is ready to receive LEWORD fresh keyword alerts.',
      subscription: registered.subscription,
    };
  } catch (err) {
    return {
      status: 'failed',
      message: (err as Error).message || 'Failed to register this device for LEWORD push alerts.',
    };
  }
}

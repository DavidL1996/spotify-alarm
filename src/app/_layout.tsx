import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useAlarmKitOpenHandler } from '@/lib/alarm-scheduler';
import { AlarmsProvider } from '@/lib/alarms-store';
import { configureNotifications, useOpenSpotifyOnNotificationTap } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';

configureNotifications();

// Root layout: every screen in src/app is rendered inside this Stack navigator.
export default function RootLayout() {
  const theme = useTheme();
  useOpenSpotifyOnNotificationTap();
  useAlarmKitOpenHandler();

  return (
    <AlarmsProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerTintColor: theme.accent,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Alarms', headerLargeTitle: true }} />
        <Stack.Screen name="alarm/[id]" options={{ presentation: 'modal' }} />
      </Stack>
    </AlarmsProvider>
  );
}

import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AlarmRow } from '@/components/AlarmRow';
import { useAlarms } from '@/lib/alarms-store';
import { describeTimeUntil, nextOccurrence } from '@/lib/time';
import { useTheme } from '@/lib/theme';

export default function AlarmListScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { alarms, loaded, notificationsAllowed, alarmKitDenied, updateAlarm } = useAlarms();

  // Re-render once a minute so "Rings in ..." stays accurate.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const nextAlarm = alarms
    .filter((a) => a.enabled)
    .map((a) => nextOccurrence(a, now))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.push('/night-test')} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.headerLink, { color: theme.accent }]}>Night test</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/alarm/new')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Add alarm"
            >
              <Text style={[styles.addButton, { color: theme.accent }]}>＋</Text>
            </Pressable>
          ),
        }}
      />

      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={alarms}
          keyExtractor={(a) => a.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={
            <>
              {notificationsAllowed === false && (
                <Pressable
                  onPress={() => Linking.openSettings()}
                  style={[styles.warning, { backgroundColor: theme.card, borderColor: theme.danger }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.warningTitle, { color: theme.danger }]}>Notifications are off</Text>
                  <Text style={[styles.warningText, { color: theme.text }]}>
                    Your alarms can’t ring. Tap to open Settings and allow notifications.
                  </Text>
                </Pressable>
              )}
              {alarmKitDenied && notificationsAllowed !== false && (
                <Pressable
                  onPress={() => Linking.openSettings()}
                  style={[styles.warning, { backgroundColor: theme.card, borderColor: theme.danger }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.warningTitle, { color: theme.danger }]}>Alarms permission is off</Text>
                  <Text style={[styles.warningText, { color: theme.text }]}>
                    Alarms ring as plain notifications, which stay quiet in silent mode and Focus. Tap to
                    open Settings and allow Alarms.
                  </Text>
                </Pressable>
              )}
              {nextAlarm && (
                <Text style={[styles.next, { color: theme.muted }]}>{describeTimeUntil(nextAlarm, now)}</Text>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No alarms yet</Text>
              <Text style={[styles.emptyText, { color: theme.muted }]}>
                Tap ＋ to add one and pick a Spotify playlist to shuffle.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <AlarmRow
              alarm={item}
              onPress={() => router.push({ pathname: '/alarm/[id]', params: { id: item.id } })}
              onToggle={(enabled) => updateAlarm(item.id, { enabled })}
            />
          )}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 48 },
  headerLink: { fontSize: 17, paddingHorizontal: 4 },
  addButton: { fontSize: 28, fontWeight: '400', paddingHorizontal: 4 },
  next: { fontSize: 15, marginBottom: 12, marginLeft: 4 },
  warning: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16, gap: 4 },
  warningTitle: { fontSize: 15, fontWeight: '600' },
  warningText: { fontSize: 14, lineHeight: 19 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '600' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
});

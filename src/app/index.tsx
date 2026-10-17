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
  const { alarms, loaded, updateAlarm } = useAlarms();

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
            nextAlarm ? (
              <Text style={[styles.next, { color: theme.muted }]}>{describeTimeUntil(nextAlarm, now)}</Text>
            ) : undefined
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
  addButton: { fontSize: 28, fontWeight: '400', paddingHorizontal: 4 },
  next: { fontSize: 15, marginBottom: 12, marginLeft: 4 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '600' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
});

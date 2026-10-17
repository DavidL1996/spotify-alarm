import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { describeRepeat, formatTime } from '@/lib/time';
import { useTheme } from '@/lib/theme';
import type { Alarm } from '@/lib/types';

type Props = {
  alarm: Alarm;
  onPress: () => void;
  onToggle: (enabled: boolean) => void;
};

export function AlarmRow({ alarm, onPress, onToggle }: Props) {
  const theme = useTheme();
  const dim = alarm.enabled ? 1 : 0.45;

  const details = [alarm.label || 'Alarm', describeRepeat(alarm.repeatDays)].join(' · ');
  const playlist = alarm.playlistId ? `♫ ${alarm.playlistName || 'Spotify playlist'}` : 'No playlist yet';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Alarm ${formatTime(alarm.hour, alarm.minute)}, ${details}`}
    >
      <View style={[styles.textCol, { opacity: dim }]}>
        <Text style={[styles.time, { color: theme.text }]}>{formatTime(alarm.hour, alarm.minute)}</Text>
        <Text style={[styles.details, { color: theme.muted }]} numberOfLines={1}>
          {details}
        </Text>
        <Text
          style={[styles.playlist, { color: alarm.playlistId ? theme.accent : theme.muted }]}
          numberOfLines={1}
        >
          {playlist}
        </Text>
      </View>
      <Switch
        value={alarm.enabled}
        onValueChange={onToggle}
        trackColor={{ true: theme.accent }}
        accessibilityLabel="Alarm on or off"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  textCol: { flex: 1, gap: 2 },
  time: { fontSize: 44, fontWeight: '300', fontVariant: ['tabular-nums'] },
  details: { fontSize: 15 },
  playlist: { fontSize: 14, fontWeight: '500', marginTop: 2 },
});

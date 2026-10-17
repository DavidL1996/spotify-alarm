import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAlarms } from '@/lib/alarms-store';
import { openPlaylistInSpotify, parsePlaylistId, playlistWebUrl } from '@/lib/spotify';
import { DAY_SHORT, describeRepeat, formatTime, WEEK_ORDER } from '@/lib/time';
import { useTheme } from '@/lib/theme';
import type { Weekday } from '@/lib/types';

// One screen for both "new" (/alarm/new) and "edit" (/alarm/<id>).
export default function EditAlarmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { getAlarm, addAlarm, updateAlarm, removeAlarm } = useAlarms();

  const existing = id && id !== 'new' ? getAlarm(id) : undefined;
  const isNew = !existing;

  // Local form state. Nothing is saved until the user taps Save.
  const [time, setTime] = useState(() => {
    const d = new Date();
    if (existing) d.setHours(existing.hour, existing.minute, 0, 0);
    else d.setHours(7, 0, 0, 0);
    return d;
  });
  const [label, setLabel] = useState(existing?.label ?? '');
  const [repeatDays, setRepeatDays] = useState<Weekday[]>(existing?.repeatDays ?? [1, 2, 3, 4, 5]);
  const [playlistInput, setPlaylistInput] = useState(
    existing?.playlistId ? playlistWebUrl(existing.playlistId) : '',
  );
  const [playlistName, setPlaylistName] = useState(existing?.playlistName ?? '');
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const playlistId = parsePlaylistId(playlistInput);
  const playlistInvalid = playlistInput.trim().length > 0 && !playlistId;

  const toggleDay = (day: Weekday) =>
    setRepeatDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));

  const onTimeChange = (_event: DateTimePickerEvent, value?: Date) => {
    setShowAndroidPicker(false);
    if (value) setTime(value);
  };

  const onSave = async () => {
    if (playlistInvalid) {
      Alert.alert('Playlist link not recognised', 'Paste a Spotify playlist link, e.g. from Share → Copy link.');
      return;
    }
    const data = {
      hour: time.getHours(),
      minute: time.getMinutes(),
      label: label.trim(),
      repeatDays,
      playlistId,
      playlistName: playlistName.trim(),
    };
    if (existing) await updateAlarm(existing.id, data);
    else await addAlarm({ ...data, enabled: true });
    router.back();
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Delete alarm?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeAlarm(existing.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isNew ? 'New Alarm' : 'Edit Alarm',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.headerButton, { color: theme.accent }]}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={onSave} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.headerButton, styles.bold, { color: theme.accent }]}>Save</Text>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Time */}
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={time}
                mode="time"
                display="spinner"
                is24Hour
                locale="sv-SE"
                onChange={onTimeChange}
                style={styles.picker}
              />
            ) : (
              <>
                <Pressable onPress={() => setShowAndroidPicker(true)}>
                  <Text style={[styles.bigTime, { color: theme.text }]}>
                    {formatTime(time.getHours(), time.getMinutes())}
                  </Text>
                </Pressable>
                {showAndroidPicker && (
                  <DateTimePicker value={time} mode="time" is24Hour onChange={onTimeChange} />
                )}
              </>
            )}
          </View>

          {/* Repeat */}
          <Text style={[styles.sectionTitle, { color: theme.muted }]}>
            REPEAT · {describeRepeat(repeatDays).toUpperCase()}
          </Text>
          <View style={styles.days}>
            {WEEK_ORDER.map((day) => {
              const selected = repeatDays.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleDay(day)}
                  style={[styles.day, { backgroundColor: selected ? theme.accent : theme.chip }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={DAY_SHORT[day]}
                >
                  <Text style={[styles.dayText, { color: selected ? theme.accentText : theme.text }]}>
                    {DAY_SHORT[day].slice(0, 2)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Label */}
          <Text style={[styles.sectionTitle, { color: theme.muted }]}>LABEL</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Alarm"
            placeholderTextColor={theme.muted}
            style={[styles.input, { backgroundColor: theme.card, color: theme.text }]}
            returnKeyType="done"
          />

          {/* Spotify */}
          <Text style={[styles.sectionTitle, { color: theme.muted }]}>SPOTIFY PLAYLIST</Text>
          <TextInput
            value={playlistInput}
            onChangeText={setPlaylistInput}
            placeholder="Paste playlist link"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              styles.input,
              { backgroundColor: theme.card, color: theme.text },
              playlistInvalid && { borderColor: theme.danger, borderWidth: 1 },
            ]}
          />
          <Text style={[styles.hint, { color: playlistInvalid ? theme.danger : theme.muted }]}>
            {playlistInvalid
              ? 'That doesn’t look like a playlist link.'
              : 'In Spotify: open the playlist → ⋯ → Share → Copy link.'}
          </Text>
          <TextInput
            value={playlistName}
            onChangeText={setPlaylistName}
            placeholder="Playlist name (optional)"
            placeholderTextColor={theme.muted}
            style={[styles.input, styles.spaced, { backgroundColor: theme.card, color: theme.text }]}
          />
          {playlistId && (
            <Pressable
              onPress={() => openPlaylistInSpotify(playlistId)}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.buttonText, { color: theme.accentText }]}>Test: open in Spotify</Text>
            </Pressable>
          )}

          {!isNew && (
            <Pressable onPress={onDelete} style={[styles.button, styles.deleteButton, { backgroundColor: theme.card }]}>
              <Text style={[styles.buttonText, { color: theme.danger }]}>Delete Alarm</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 64 },
  headerButton: { fontSize: 17, paddingHorizontal: 4 },
  bold: { fontWeight: '600' },
  card: { borderRadius: 14, alignItems: 'center', overflow: 'hidden' },
  picker: { alignSelf: 'stretch' },
  bigTime: { fontSize: 56, fontWeight: '300', paddingVertical: 16 },
  sectionTitle: { fontSize: 13, marginTop: 24, marginBottom: 8, marginLeft: 4, letterSpacing: 0.3 },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, fontWeight: '600' },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  spaced: { marginTop: 10 },
  hint: { fontSize: 13, marginTop: 6, marginLeft: 4 },
  button: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  deleteButton: { marginTop: 32 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});

import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import * as SpotifyRemote from '../../modules/spotify-remote';
import { useAlarms } from '@/lib/alarms-store';
import {
  clearNightLog,
  getNightLog,
  isNightTestRunning,
  nightTestFireAt,
  startNightTest,
  stopNightTest,
  subscribeNightLog,
  type NightLogEntry,
} from '@/lib/night-test';
import { parsePlaylistId } from '@/lib/spotify';
import {
  isWebApiConfigured,
  isWebApiLoggedIn,
  loginToWebApi,
  logoutOfWebApi,
  WEB_REDIRECT_URI,
} from '@/lib/spotify-web';
import { formatTime } from '@/lib/time';
import { useTheme } from '@/lib/theme';

const pad = (n: number) => n.toString().padStart(2, '0');
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${formatTime(d.getHours(), d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Experiment screen: can the app start Spotify by itself at alarm time? See src/lib/night-test.ts.
export default function NightTestScreen() {
  const theme = useTheme();
  const { alarms } = useAlarms();
  const playlists = alarms.filter((a) => a.playlistId);

  const [playlistInput, setPlaylistInput] = useState(playlists[0]?.playlistId ?? '');
  const [minutesInput, setMinutesInput] = useState('5');
  const [log, setLog] = useState<NightLogEntry[]>([]);
  const [running, setRunning] = useState(isNightTestRunning());
  const [webLoggedIn, setWebLoggedIn] = useState(false);
  const [busy, setBusy] = useState(false);

  // Clock for the "Spotify at hh:mm" preview.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getNightLog().then(setLog);
    isWebApiLoggedIn().then(setWebLoggedIn);
    return subscribeNightLog((entries) => {
      setLog(entries);
      setRunning(isNightTestRunning());
    });
  }, []);

  const playlistId = parsePlaylistId(playlistInput);
  const minutes = Number(minutesInput.replace(',', '.'));
  const minutesValid = Number.isFinite(minutes) && minutes >= 1 && minutes <= 16 * 60;
  const fireAt = running ? nightTestFireAt() : minutesValid ? now + minutes * 60_000 : null;
  const sdkAvailable = SpotifyRemote.isAvailable();
  const webConfigured = isWebApiConfigured();

  const onStart = async () => {
    if (!playlistId) {
      Alert.alert('Pick a playlist', 'Paste a Spotify playlist link, or tap one of your alarms’ playlists.');
      return;
    }
    if (!minutesValid) {
      Alert.alert('Minutes', 'Enter a number of minutes between 1 and 960.');
      return;
    }
    setBusy(true);
    try {
      await startNightTest({ playlistId, minutes });
    } finally {
      setRunning(isNightTestRunning());
      setBusy(false);
    }
  };

  const onStop = async () => {
    await stopNightTest('stopped by you');
    setRunning(false);
  };

  const onWebLogin = async () => {
    try {
      const ok = await loginToWebApi();
      setWebLoggedIn(ok);
      if (!ok) Alert.alert('Spotify login cancelled');
    } catch (error) {
      Alert.alert('Spotify login failed', String((error as Error)?.message ?? error));
    }
  };

  const onWebLogout = async () => {
    await logoutOfWebApi();
    setWebLoggedIn(false);
  };

  return (
    <FlatList
      data={[...log].reverse()}
      keyExtractor={(entry, index) => `${entry.at}-${index}`}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View>
          <Text style={[styles.intro, { color: theme.muted }]}>
            Tests whether the app can start Spotify by itself while the phone is locked. Start it, lock the phone, and
            don’t swipe the app away. A backup alarm rings 3 minutes after the Spotify time. The log below shows what
            happened.
          </Text>

          <Text style={[styles.sectionTitle, { color: theme.muted }]}>ROUTES</Text>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.row, { color: theme.text }]}>
              Spotify SDK: {sdkAvailable ? 'available' : 'not available (Expo Go, or no Client ID in this build)'}
            </Text>
            <Text style={[styles.row, { color: theme.text }]}>
              Web API: {!webConfigured ? 'needs a Client ID in this build' : webLoggedIn ? 'logged in' : 'not logged in'}
            </Text>
            {webConfigured && (
              <Pressable onPress={webLoggedIn ? onWebLogout : onWebLogin} hitSlop={8}>
                <Text style={[styles.link, { color: theme.accent }]}>
                  {webLoggedIn ? 'Log out of Web API' : 'Log in to Web API'}
                </Text>
              </Pressable>
            )}
            {webConfigured && !webLoggedIn && (
              <Text style={[styles.small, { color: theme.muted }]}>
                Needs this Redirect URI in the Spotify dashboard: {WEB_REDIRECT_URI}
              </Text>
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: theme.muted }]}>PLAYLIST</Text>
          {playlists.length > 0 && (
            <View style={styles.chips}>
              {playlists.map((a) => {
                const selected = a.playlistId === playlistId;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setPlaylistInput(a.playlistId ?? '')}
                    style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.chip }]}
                  >
                    <Text style={{ color: selected ? theme.accentText : theme.text }} numberOfLines={1}>
                      {a.playlistName || a.label || formatTime(a.hour, a.minute)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <TextInput
            value={playlistInput}
            onChangeText={setPlaylistInput}
            placeholder="Paste playlist link"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!running}
            style={[styles.input, { backgroundColor: theme.card, color: theme.text }]}
          />

          <Text style={[styles.sectionTitle, { color: theme.muted }]}>START SPOTIFY IN (MINUTES)</Text>
          <View style={styles.chips}>
            {['2', '5', '30', '120', '420'].map((m) => (
              <Pressable
                key={m}
                onPress={() => setMinutesInput(m)}
                disabled={running}
                style={[styles.chip, { backgroundColor: minutesInput === m ? theme.accent : theme.chip }]}
              >
                <Text style={{ color: minutesInput === m ? theme.accentText : theme.text }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={minutesInput}
            onChangeText={setMinutesInput}
            keyboardType="number-pad"
            editable={!running}
            style={[styles.input, { backgroundColor: theme.card, color: theme.text }]}
          />
          {fireAt && (
            <Text style={[styles.small, { color: theme.muted }]}>
              Spotify at {stamp(fireAt).slice(0, 5)}, backup alarm at {stamp(fireAt + 3 * 60_000).slice(0, 5)}.
            </Text>
          )}

          <Pressable
            onPress={running ? onStop : onStart}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: running ? theme.card : theme.accent, opacity: pressed || busy ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.buttonText, { color: running ? theme.danger : theme.accentText }]}>
              {busy ? 'Starting…' : running ? 'Stop night test' : 'Start night test'}
            </Text>
          </Pressable>

          <View style={styles.logHeader}>
            <Text style={[styles.sectionTitle, { color: theme.muted }]}>LOG (NEWEST FIRST)</Text>
            {log.length > 0 && !running && (
              <Pressable onPress={clearNightLog} hitSlop={8}>
                <Text style={[styles.link, { color: theme.accent }]}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={[styles.small, { color: theme.muted }]}>Nothing logged yet.</Text>}
      renderItem={({ item }) => (
        <Text style={[styles.logLine, { color: item.message.startsWith('RESULT') ? theme.accent : theme.text }]}>
          <Text style={{ color: theme.muted }}>{stamp(item.at)} </Text>
          {item.message}
        </Text>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 64 },
  intro: { fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontSize: 13, marginTop: 24, marginBottom: 8, marginLeft: 4, letterSpacing: 0.3 },
  card: { borderRadius: 14, padding: 14, gap: 6 },
  row: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  small: { fontSize: 13, marginTop: 6, marginLeft: 4, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 200 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  button: { marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  logLine: { fontSize: 13, lineHeight: 19, fontVariant: ['tabular-nums'] },
});

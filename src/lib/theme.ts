import { useColorScheme } from 'react-native';

// Small colour palette that follows the iPhone's light/dark setting.
const light = {
  background: '#F2F2F7',
  card: '#FFFFFF',
  text: '#111114',
  muted: '#6E6E76',
  border: '#E3E3E8',
  accent: '#1DB954', // Spotify-style green
  accentText: '#FFFFFF',
  danger: '#E5484D',
  chip: '#E9E9EE',
};

const dark: typeof light = {
  background: '#000000',
  card: '#1C1C1F',
  text: '#F5F5F7',
  muted: '#9A9AA2',
  border: '#2C2C30',
  accent: '#1ED760',
  accentText: '#0B0B0C',
  danger: '#FF6369',
  chip: '#2C2C30',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

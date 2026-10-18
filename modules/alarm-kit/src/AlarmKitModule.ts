import { requireOptionalNativeModule, type NativeModule } from 'expo';

import type {
  AlarmKitAlarm,
  AlarmKitAuthorizationStatus,
  AlarmKitModuleEvents,
  AlarmOpenedEvent,
  ScheduleAlarmOptions,
} from './AlarmKit.types';

declare class AlarmKitBridgeNativeModule extends NativeModule<AlarmKitModuleEvents> {
  isAvailable(): boolean;
  getAuthorizationStatus(): AlarmKitAuthorizationStatus | 'unavailable';
  requestAuthorization(): Promise<AlarmKitAuthorizationStatus | 'unavailable'>;
  scheduleAlarm(options: ScheduleAlarmOptions): Promise<string>;
  cancelAlarm(id: string): Promise<void>;
  cancelAll(): Promise<void>;
  listAlarms(): Promise<AlarmKitAlarm[]>;
  consumePendingAlarmOpen(): AlarmOpenedEvent | null;
}

// Null on Android, web, Expo Go and any build without this module: everything below then
// reports "unavailable" instead of crashing.
export default requireOptionalNativeModule<AlarmKitBridgeNativeModule>('AlarmKitBridge');

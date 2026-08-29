/**
 * RecoverAI — Centralized Policy Configuration
 * Authoritative Specification: RecoverAI-Specification.md
 */

export interface PolicyConfig {
  maxRetries: number;
  maxContactAttempts: number;
  maxContactFrequencyHours: number;
  attributionWindowHours: number;
  quietHoursStartHour: number; // e.g. 22 for 10 PM
  quietHoursEndHour: number; // e.g. 8 for 8 AM
}

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  maxRetries: 3,
  maxContactAttempts: 3,
  maxContactFrequencyHours: 24,
  attributionWindowHours: 72,
  quietHoursStartHour: 22,
  quietHoursEndHour: 8,
};

"use client";
import { Select } from "./Select";
const zones = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo", "UTC", "Europe/London", "Europe/Paris", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];
export interface TimezoneSelectProps { value: string; onChange: (timezone: string) => void; disabled?: boolean; id?: string }
export function TimezoneSelect({ value, onChange, disabled, id }: TimezoneSelectProps) {
  const options = Array.from(new Set([value, ...zones]));
  return <Select id={id} label="Your timezone" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</Select>;
}

export type CostInputs = {
  seats: number;
  seatMonthly: number;
  inputTokensM: number;
  outputTokensM: number;
  inputRatePerM: number;
  outputRatePerM: number;
};

export type CostEstimate = {
  subscription: number;
  api: number;
  total: number;
};

export type UsagePreset = {
  id: string;
  label: string;
  seats: number;
  inputTokensM: number;
  outputTokensM: number;
  notes: string;
};

export const USAGE_PRESETS: UsagePreset[] = [
  {
    id: 'solo-seat',
    label: 'Solo seat',
    seats: 1,
    inputTokensM: 0,
    outputTokensM: 0,
    notes: 'One subscription. Enter the monthly seat price from the vendor page.',
  },
  {
    id: 'small-team',
    label: 'Small team',
    seats: 5,
    inputTokensM: 0,
    outputTokensM: 0,
    notes: 'Five seats. Multiply by the per-seat price you copy from the vendor.',
  },
  {
    id: 'light-api',
    label: 'Light API',
    seats: 1,
    inputTokensM: 1,
    outputTokensM: 0.25,
    notes: 'One seat plus a light API month. Rates are yours to fill.',
  },
  {
    id: 'heavy-api',
    label: 'Heavier API',
    seats: 1,
    inputTokensM: 10,
    outputTokensM: 2,
    notes: 'One seat plus a heavier token month. Still an assumption, not a quote.',
  },
];

export function sanitizeAmount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function estimateMonthly(input: CostInputs): CostEstimate {
  const seats = sanitizeAmount(input.seats);
  const seatMonthly = sanitizeAmount(input.seatMonthly);
  const inputTokensM = sanitizeAmount(input.inputTokensM);
  const outputTokensM = sanitizeAmount(input.outputTokensM);
  const inputRatePerM = sanitizeAmount(input.inputRatePerM);
  const outputRatePerM = sanitizeAmount(input.outputRatePerM);
  const subscription = seats * seatMonthly;
  const api = inputTokensM * inputRatePerM + outputTokensM * outputRatePerM;
  return {
    subscription,
    api,
    total: subscription + api,
  };
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(sanitizeAmount(value));
}

export function hasEnteredRates(input: Pick<CostInputs, 'seatMonthly' | 'inputRatePerM' | 'outputRatePerM'>): boolean {
  return sanitizeAmount(input.seatMonthly) > 0
    || sanitizeAmount(input.inputRatePerM) > 0
    || sanitizeAmount(input.outputRatePerM) > 0;
}

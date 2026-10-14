// Amazon.com paperback printing cost and royalty estimates.
// Source: https://kdp.amazon.com/help/topic/G201834340 and royalty chart G201834330 (checked Oct 2026).
// These are estimates for the US marketplace only; KDP's own calculator is authoritative.

import { isLargeTrim } from './kdp';
import type { BookSpec } from './types';

export interface PrintCost {
  available: boolean;
  cost: number;
  note?: string;
}

export function printingCostUSD(spec: BookSpec, pageCount: number): PrintCost {
  if (spec.format === 'hardcover') {
    return { available: false, cost: 0, note: 'Use KDP’s calculator for hardcover printing costs.' };
  }
  const large = isLargeTrim(spec.trimWidth, spec.trimHeight);
  const p = pageCount;
  let cost: number;
  if (spec.ink === 'bw') {
    cost = p <= 108 ? (large ? 2.84 : 2.3) : 1 + p * (large ? 0.017 : 0.012);
  } else if (spec.ink === 'premium-color') {
    cost = p <= 40 ? (large ? 4.2 : 3.6) : 1 + p * (large ? 0.08 : 0.065);
  } else {
    cost = 1 + p * (large ? 0.0402 : 0.0255);
  }
  return { available: true, cost: round2(cost) };
}

/** 60% at $9.99 and above, 50% below (Amazon.com, since June 2025). */
export function royaltyRate(listPrice: number): number {
  return listPrice >= 9.99 ? 0.6 : 0.5;
}

export function royaltyUSD(listPrice: number, printCost: number): number {
  return round2(listPrice * royaltyRate(listPrice) - printCost);
}

/** Lowest price KDP will accept: printing cost ÷ royalty rate. */
export function minimumListPrice(printCost: number): number {
  const at50 = printCost / 0.5;
  if (at50 < 9.99) return ceil2(at50);
  return Math.max(9.99, ceil2(printCost / 0.6));
}

/** A friendly suggestion: enough to earn ~$3 per copy, ending in .99. */
export function suggestedListPrice(printCost: number): number {
  let price = Math.ceil(printCost + 3) - 0.01;
  while (royaltyUSD(price, printCost) < 3) price += 1;
  return round2(Math.max(price, minimumListPrice(printCost)));
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
function ceil2(v: number) {
  return Math.ceil(v * 100 - 1e-9) / 100;
}

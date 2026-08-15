import { config } from "./config.js";
import type { PriceRecord } from "./storage.js";

export interface Stats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface DayOverDayChange {
  previousPrice: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
}

export type TrendDirection = "bajando" | "subiendo" | "estable" | "sin_datos_suficientes";

export interface Trend {
  direction: TrendDirection;
  /** Variacion diaria promedio estimada (regresion lineal simple), en la moneda de la ruta. */
  slopePerDay: number | null;
}

export interface AlertResult {
  triggered: boolean;
  reasons: string[];
}

export function computeStats(history: PriceRecord[], windowDays: number): Stats {
  const recent = history.slice(-windowDays);
  if (recent.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
  const prices = recent.map((r) => r.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    count: prices.length,
  };
}

/** Variacion del ultimo valor de una serie vs. el penultimo. Generico para poder usarse con precios totales o de un solo tramo. */
export function computeDayOverDayForSeries(prices: number[]): DayOverDayChange {
  if (prices.length < 2) return { previousPrice: null, changeAbsolute: null, changePercent: null };
  const today = prices[prices.length - 1];
  const yesterday = prices[prices.length - 2];
  const changeAbsolute = today - yesterday;
  return {
    previousPrice: yesterday,
    changeAbsolute,
    changePercent: (changeAbsolute / yesterday) * 100,
  };
}

export function computeDayOverDay(history: PriceRecord[]): DayOverDayChange {
  return computeDayOverDayForSeries(history.map((r) => r.price));
}

/** Regresion lineal simple (minimos cuadrados) sobre los ultimos N registros para estimar tendencia. */
export function computeTrend(history: PriceRecord[], windowDays: number): Trend {
  const recent = history.slice(-windowDays);
  if (recent.length < 3) return { direction: "sin_datos_suficientes", slopePerDay: null };

  const xs = recent.map((_, i) => i);
  const ys = recent.map((r) => r.price);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);

  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;

  const avgPrice = sumY / n;
  const relativeSlope = avgPrice === 0 ? 0 : slope / avgPrice;

  let direction: TrendDirection;
  if (relativeSlope < -0.005) direction = "bajando";
  else if (relativeSlope > 0.005) direction = "subiendo";
  else direction = "estable";

  return { direction, slopePerDay: slope };
}

/**
 * Determina si se debe disparar la alerta urgente de "bajon drastico", combinando:
 * 1) nuevo minimo historico
 * 2) caida >= dropPercent% vs promedio movil de windowDays
 * 3) umbral absoluto opcional
 * Solo evalua si ya hay suficiente historial (minHistoryForAlerts), para evitar falsos positivos al inicio.
 */
export function evaluateAlert(history: PriceRecord[]): AlertResult {
  const { dropPercent, windowDays, minHistoryForAlerts, absoluteThreshold } = config.alerts;

  if (history.length < minHistoryForAlerts) {
    return { triggered: false, reasons: [] };
  }

  const current = history[history.length - 1];
  const previousHistory = history.slice(0, -1);
  const reasons: string[] = [];

  const historicalMin = Math.min(...previousHistory.map((r) => r.price));
  if (current.price < historicalMin) {
    reasons.push(`Nuevo minimo historico: ${current.price} ${current.currency} (anterior minimo: ${historicalMin})`);
  }

  const windowStats = computeStats(previousHistory, windowDays);
  if (windowStats.count > 0) {
    const dropVsAvg = ((windowStats.avg - current.price) / windowStats.avg) * 100;
    if (dropVsAvg >= dropPercent) {
      reasons.push(
        `Caida de ${dropVsAvg.toFixed(1)}% vs. el promedio de los ultimos ${windowDays} dias (${windowStats.avg.toFixed(0)} ${current.currency})`
      );
    }
  }

  if (absoluteThreshold !== undefined && current.price < absoluteThreshold) {
    reasons.push(`Precio por debajo del umbral absoluto configurado (${absoluteThreshold} ${current.currency})`);
  }

  return { triggered: reasons.length > 0, reasons };
}

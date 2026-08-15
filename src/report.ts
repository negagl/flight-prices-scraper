import { config } from "./config.js";
import type { PriceRecord } from "./storage.js";
import type { LegDetail } from "./flightSource.js";
import type { Stats, DayOverDayChange, Trend, AlertResult } from "./analysis.js";

export interface ReportInput {
  current: PriceRecord;
  history: PriceRecord[];
  stats: Stats;
  dayOverDay: DayOverDayChange;
  outboundChange: DayOverDayChange;
  inboundChange?: DayOverDayChange;
  trend: Trend;
  alert: AlertResult;
  fetchError?: string;
}

const TREND_LABEL: Record<Trend["direction"], string> = {
  bajando: "↓ Bajando",
  subiendo: "↑ Subiendo",
  estable: "→ Estable",
  sin_datos_suficientes: "Sin datos suficientes",
};

function fmt(n: number, currency: string): string {
  return `${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })} ${currency}`;
}

function changeText(change: DayOverDayChange, currency: string, vsLabel: string): string {
  if (change.changePercent === null) return "Sin dato de comparacion (primer registro).";
  const sign = change.changeAbsolute! >= 0 ? "+" : "";
  return `${sign}${fmt(change.changeAbsolute!, currency)} (${sign}${change.changePercent.toFixed(1)}%) ${vsLabel}`;
}

function legCard(title: string, leg: LegDetail, change: DayOverDayChange): string {
  const stopsNote = leg.stops > 0 ? `${leg.stops} escala${leg.stops > 1 ? "s" : ""}` : "directo";
  return `<div style="background:#f3f4f6;border-radius:8px;padding:16px;flex:1;min-width:240px;">
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px;">${title}</div>
    <div style="font-size:15px;font-weight:600;">${leg.airline} · ${leg.flightCode}</div>
    <div style="font-size:13px;color:#374151;margin-top:2px;">${leg.departureAirport} ${leg.departureTimeLocal} → ${leg.arrivalAirport} ${leg.arrivalTimeLocal} · ${stopsNote}</div>
    <div style="font-size:18px;font-weight:700;margin-top:8px;">${fmt(leg.price, leg.currency)}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:2px;">${changeText(change, leg.currency, "vs. ayer")}</div>
  </div>`;
}

/** Etiqueta compacta ida/vuelta para las filas de la tabla de historial. */
function historyLegLabel(leg: LegDetail): string {
  return `${leg.airline} ${leg.flightCode} ${leg.departureTimeLocal} · ${fmt(leg.price, leg.currency)}`;
}

export function renderReportHtml(input: ReportInput): string {
  const { current, stats, dayOverDay, outboundChange, inboundChange, trend, alert, fetchError, history } = input;
  const { origin, destination, departureDate, returnDate } = config.route;

  const alertBanner = alert.triggered
    ? `<div style="background:#fee2e2;border:2px solid #dc2626;color:#991b1b;padding:16px 20px;border-radius:8px;margin-bottom:20px;font-weight:600;">
        ⚠️ BAJON DE PRECIO DETECTADO
        <ul style="margin:8px 0 0;padding-left:20px;font-weight:400;">
          ${alert.reasons.map((r) => `<li>${r}</li>`).join("")}
        </ul>
      </div>`
    : "";

  const errorBanner = fetchError
    ? `<div style="background:#fef3c7;border:1px solid #d97706;color:#92400e;padding:12px 16px;border-radius:8px;margin-bottom:20px;">
        No se pudo consultar el precio de hoy: ${fetchError}. Se muestra el ultimo dato disponible.
      </div>`
    : "";

  // Importante: esto compara el precio TOTAL mas barato de hoy vs. el precio TOTAL mas barato
  // de ayer — no un vuelo especifico rastreado dia a dia. La aerolinea/horario ganador puede
  // cambiar de un dia a otro si eso resulta mas economico. Lo mismo aplica a cada tramo.
  const totalChangeLine = changeText(dayOverDay, current.currency, "vs. el total mas barato de ayer");

  const rows = history
    .slice(-14)
    .reverse()
    .map((r) => {
      const cell = (s: string) => `<td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${s}</td>`;
      return `<tr>${cell(r.date)}${cell(fmt(r.price, r.currency))}${cell(historyLegLabel(r.outbound))}${cell(r.inbound ? historyLegLabel(r.inbound) : "-")}</tr>`;
    })
    .join("");

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
    <h1 style="font-size:20px;margin-bottom:4px;">Monitor de precios: ${origin} → ${destination}</h1>
    <p style="color:#6b7280;margin-top:0;">Salida ${departureDate}${returnDate ? ` &middot; Regreso ${returnDate}` : ""}</p>

    ${alertBanner}
    ${errorBanner}

    <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
      ${legCard("IDA", current.outbound, outboundChange)}
      ${current.inbound && inboundChange ? legCard("VUELTA", current.inbound, inboundChange) : ""}
    </div>

    <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
      <div style="background:#111827;border-radius:8px;padding:16px;flex:1;min-width:140px;color:#f9fafb;">
        <div style="color:#9ca3af;font-size:12px;">PRECIO TOTAL (IDA${current.inbound ? " + VUELTA" : ""})</div>
        <div style="font-size:24px;font-weight:700;">${fmt(current.price, current.currency)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${totalChangeLine}</div>
      </div>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;flex:1;min-width:140px;">
        <div style="color:#6b7280;font-size:12px;">TENDENCIA (sobre el total)</div>
        <div style="font-size:24px;font-weight:700;">${TREND_LABEL[trend.direction]}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:6px 12px;color:#6b7280;">Minimo (${stats.count}d)</td>
        <td style="padding:6px 12px;font-weight:600;">${fmt(stats.min, current.currency)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px;color:#6b7280;">Maximo (${stats.count}d)</td>
        <td style="padding:6px 12px;font-weight:600;">${fmt(stats.max, current.currency)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px;color:#6b7280;">Promedio (${stats.count}d)</td>
        <td style="padding:6px 12px;font-weight:600;">${fmt(stats.avg, current.currency)}</td>
      </tr>
    </table>

    <h2 style="font-size:15px;color:#374151;">Historial reciente</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="text-align:left;color:#6b7280;">
          <th style="padding:6px 12px;">Fecha</th>
          <th style="padding:6px 12px;">Total</th>
          <th style="padding:6px 12px;">Ida</th>
          <th style="padding:6px 12px;">Vuelta</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Generado automaticamente por Flight Price Monitor.</p>
  </div>`;
}

import { config } from "./config.js";
import { fetchCheapestFare, FlightQueryError } from "./flightSource.js";
import { loadHistory, appendRecord, type PriceRecord } from "./storage.js";
import { computeStats, computeDayOverDay, computeDayOverDayForSeries, computeTrend, evaluateAlert } from "./analysis.js";
import { renderReportHtml } from "./report.js";
import { sendReportEmail } from "./email.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const { origin, destination } = config.route;
  let history = await loadHistory();
  let fetchError: string | undefined;

  try {
    const quote = await fetchCheapestFare();
    const record: PriceRecord = {
      date: todayIso(),
      timestamp: new Date().toISOString(),
      price: quote.price,
      currency: quote.currency,
      outbound: quote.outbound,
      inbound: quote.inbound,
    };
    history = await appendRecord(record);
    const legSummary = (leg: typeof quote.outbound) => `${leg.airline} ${leg.flightCode} ${leg.departureTimeLocal}`;
    const summary = quote.inbound
      ? `ida: ${legSummary(quote.outbound)} | vuelta: ${legSummary(quote.inbound)}`
      : legSummary(quote.outbound);
    console.log(`Precio consultado: ${quote.price} ${quote.currency} (${summary})`);
  } catch (err) {
    // No dejamos que un fallo de la API tumbe el proceso: seguimos con el ultimo dato conocido.
    fetchError = err instanceof FlightQueryError ? err.message : `Error inesperado: ${(err as Error).message}`;
    console.error(`[WARN] Fallo la consulta de precio: ${fetchError}`);
  }

  if (history.length === 0) {
    console.error("No hay historial ni se pudo consultar un precio nuevo. Nada que reportar. Saliendo.");
    return;
  }

  const current = history[history.length - 1];
  const stats = computeStats(history, config.alerts.windowDays);
  const dayOverDay = computeDayOverDay(history);
  const outboundChange = computeDayOverDayForSeries(history.map((r) => r.outbound.price));
  const inboundChange = current.inbound
    ? computeDayOverDayForSeries(history.map((r) => r.inbound?.price).filter((p): p is number => p !== undefined))
    : undefined;
  const trend = computeTrend(history, config.alerts.windowDays);
  const alert = evaluateAlert(history);

  const html = renderReportHtml({
    current,
    history,
    stats,
    dayOverDay,
    outboundChange,
    inboundChange,
    trend,
    alert,
    fetchError,
  });

  const subject = alert.triggered
    ? `⚠️ Bajon de precio ${origin}→${destination}: ${current.price} ${current.currency}`
    : `Reporte diario ${origin}→${destination}: ${current.price} ${current.currency}`;

  try {
    await sendReportEmail(subject, html);
    console.log("Reporte enviado por email.");
  } catch (err) {
    // Tampoco dejamos que un fallo de envio tumbe el proceso; el historial ya quedo guardado.
    console.error(`[WARN] Fallo el envio del email: ${(err as Error).message}`);
  }
}

main().catch((err) => {
  console.error("Error fatal no controlado:", err);
  process.exitCode = 1;
});

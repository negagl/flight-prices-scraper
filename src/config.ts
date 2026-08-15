import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

function optionalNumber(name: string): number | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error(`La variable ${name} debe ser numerica`);
  return n;
}

export const config = {
  ignav: {
    apiKey: required("IGNAV_API_KEY"),
  },
  route: {
    origin: required("ORIGIN"),
    destination: required("DESTINATION"),
    departureDate: required("DEPARTURE_DATE"),
    returnDate: process.env.RETURN_DATE?.trim() || undefined,
    adults: optionalNumber("ADULTS") ?? 1,
    // Codigo de pais de 2 letras que controla la moneda de los precios devueltos por Ignav (ej. "CO" -> COP).
    market: process.env.MARKET?.trim() || "CO",
  },
  alerts: {
    dropPercent: optionalNumber("ALERT_DROP_PERCENT") ?? 15,
    windowDays: optionalNumber("ALERT_WINDOW_DAYS") ?? 14,
    minHistoryForAlerts: optionalNumber("MIN_HISTORY_FOR_ALERTS") ?? 5,
    absoluteThreshold: optionalNumber("ALERT_ABSOLUTE_THRESHOLD"),
  },
  email: {
    resendApiKey: required("RESEND_API_KEY"),
    from: required("EMAIL_FROM"),
    // EMAIL_TO acepta uno o varios correos separados por comas, ej: "a@x.com,b@y.com"
    to: required("EMAIL_TO")
      .split(",")
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0),
  },
};

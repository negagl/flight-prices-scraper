import { config } from "./config.js";

const ONE_WAY_URL = "https://ignav.com/api/fares/one-way";

/** Detalle de un tramo (ida o vuelta), con precio propio, suficiente para identificar el vuelo exacto en la pagina de la aerolinea. */
export interface LegDetail {
  price: number;
  currency: string;
  airline: string;
  /** Codigos de vuelo del tramo, ej. "AV9071" o "AV9071 + AV9080" si tiene escalas. */
  flightCode: string;
  departureAirport: string;
  departureTimeLocal: string; // HH:mm
  arrivalAirport: string;
  arrivalTimeLocal: string; // HH:mm
  /** Numero de escalas (0 = vuelo directo). */
  stops: number;
}

export interface PriceQuote {
  /** Precio total (ida + vuelta, o solo ida si no hay returnDate). */
  price: number;
  currency: string;
  outbound: LegDetail;
  /** Undefined si la busqueda fue solo ida. */
  inbound?: LegDetail;
}

/** Errores esperados de la integracion con la fuente de datos (red, auth, sin resultados, etc). */
export class FlightQueryError extends Error {}

interface IgnavSegment {
  marketing_carrier_code: string;
  flight_number: string;
  operating_carrier_name: string;
  departure_airport: string;
  departure_time_local: string;
  arrival_airport: string;
  arrival_time_local: string;
}

interface IgnavItinerary {
  price: { amount: number; currency: string; status: string };
  outbound: { carrier: string; segments: IgnavSegment[] };
}

interface IgnavResponse {
  itineraries?: IgnavItinerary[];
  error?: { type: string; code: string; message: string };
}

function toLegDetail(it: IgnavItinerary): LegDetail {
  const segments = it.outbound.segments;
  const first = segments[0];
  const last = segments[segments.length - 1];
  return {
    price: it.price.amount,
    currency: it.price.currency,
    airline: it.outbound.carrier,
    flightCode: segments.map((s) => `${s.marketing_carrier_code}${s.flight_number}`).join(" + "),
    departureAirport: first.departure_airport,
    departureTimeLocal: first.departure_time_local.slice(11, 16),
    arrivalAirport: last.arrival_airport,
    arrivalTimeLocal: last.arrival_time_local.slice(11, 16),
    stops: segments.length - 1,
  };
}

/**
 * Consulta el vuelo mas barato para un tramo (una direccion, una fecha) via el endpoint
 * one-way de Ignav (https://ignav.com). Se usa por separado para ida y para vuelta, en vez
 * del endpoint round-trip, porque round-trip solo da un precio total combinado y no permite
 * mostrar el precio de cada tramo por separado. Ya verificamos que la suma de los dos
 * one-way mas baratos coincide exactamente con el total que da round-trip para las mismas
 * fechas, asi que no se pierde precision.
 */
async function fetchCheapestLeg(origin: string, destination: string, date: string): Promise<LegDetail> {
  const { adults, market } = config.route;

  let res: Response;
  try {
    res = await fetch(ONE_WAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": config.ignav.apiKey,
      },
      body: JSON.stringify({ origin, destination, departure_date: date, adults, market }),
    });
  } catch (err) {
    throw new FlightQueryError(`No se pudo conectar con Ignav (${origin}-${destination}): ${(err as Error).message}`);
  }

  const json = (await res.json().catch(() => null)) as IgnavResponse | null;

  if (!res.ok || !json) {
    const detail = json?.error?.message ?? (await res.text().catch(() => ""));
    throw new FlightQueryError(`Ignav devolvio un error (HTTP ${res.status}) para ${origin}-${destination}: ${detail}`);
  }

  if (json.error) {
    throw new FlightQueryError(`Ignav devolvio un error para ${origin}-${destination}: ${json.error.message}`);
  }

  if (!json.itineraries || json.itineraries.length === 0) {
    throw new FlightQueryError(`Ignav no devolvio itinerarios para ${origin}-${destination} en ${date}.`);
  }

  const cheapest = json.itineraries.reduce((min, it) => (it.price.amount < min.price.amount ? it : min));
  return toLegDetail(cheapest);
}

/**
 * Consulta el precio mas barato disponible para la ruta configurada: el tramo de ida mas
 * barato y, si hay returnDate, el tramo de vuelta mas barato por separado (no van
 * necesariamente en la misma aerolinea). El total es la suma de ambos. Nunca lanza para
 * errores "esperados" de la fuente de datos: los envuelve en FlightQueryError para que el
 * caller pueda decidir seguir el proceso sin caerse.
 *
 * Nota: esto es el "vuelo mas barato del dia" para cada tramo, no un vuelo especifico que
 * se sigue dia a dia — manana la aerolinea/horario ganador puede ser distinto si eso resulta
 * mas economico.
 */
export async function fetchCheapestFare(): Promise<PriceQuote> {
  const { origin, destination, departureDate, returnDate } = config.route;

  const outbound = await fetchCheapestLeg(origin, destination, departureDate);
  const inbound = returnDate ? await fetchCheapestLeg(destination, origin, returnDate) : undefined;

  return {
    price: outbound.price + (inbound?.price ?? 0),
    currency: outbound.currency,
    outbound,
    inbound,
  };
}

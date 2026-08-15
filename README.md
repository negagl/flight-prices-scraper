# Flight Price Monitor

Monitorea el precio de un vuelo (ruta y fechas fijas), guarda el historial, calcula tendencia
y envia un reporte diario por email — con alerta urgente si detecta un bajon de precio
significativo.

## Como funciona la alerta

No usa un umbral de precio fijo adivinado a ciegas. Dispara alerta urgente si ocurre
cualquiera de estas condiciones:

1. El precio de hoy es un **nuevo minimo historico** desde que empezaste a monitorear.
2. El precio cae **`ALERT_DROP_PERCENT`% o mas** vs. el promedio movil de los ultimos
   `ALERT_WINDOW_DAYS` dias.
3. (Opcional) El precio cae por debajo de `ALERT_ABSOLUTE_THRESHOLD`, si lo defines.

Los primeros `MIN_HISTORY_FOR_ALERTS` dias solo se acumula historial, sin evaluar alertas,
para evitar falsos positivos por falta de contexto.

El reporte diario (con tendencia y estadisticas) se envia siempre, dispare o no la alerta.

## Setup

### 1. Cuenta de Ignav (fuente de datos)

> Nota: originalmente este proyecto iba a usar Amadeus Self-Service, pero Amadeus
> **decomisiono ese portal el 17 de julio de 2026**. Se reemplazo por
> [Ignav](https://ignav.com), que trae datos reales verificados (confirmado con pruebas
> manuales para CTG-BOG: devuelve ~29 itinerarios con precios en COP).

1. Registrate gratis en https://ignav.com (sin tarjeta de credito).
2. Copia tu **API key** -> `IGNAV_API_KEY`.
3. Tier gratuito: 1000 requests. A razon de 1 consulta diaria, alcanza para ~2.7 anos.
4. `MARKET` controla la moneda de los precios devueltos (codigo de pais de 2 letras, ej.
   `CO` -> COP, `US` -> USD).

### 2. Cuenta de Resend (envio de email)

1. Registrate en https://resend.com (tier gratuito).
2. Genera un API Key -> `RESEND_API_KEY`.
3. Para `EMAIL_FROM` puedes usar el dominio de pruebas de Resend
   (`onboarding@resend.dev` o similar) mientras no verifiques un dominio propio.

### 3. Configuracion local

```bash
cp .env.example .env
# edita .env con tus claves y la ruta/fechas que quieras monitorear
npm install
npm run dev   # corre una vez con tsx, sin compilar
```

### 4. Programacion automatica (GitHub Actions)

1. Sube este proyecto a un repo de GitHub.
2. En **Settings → Secrets and variables → Actions → Secrets**, agrega:
   - `IGNAV_API_KEY`
   - `RESEND_API_KEY`
3. En **Settings → Secrets and variables → Actions → Variables**, agrega:
   - `EMAIL_FROM`, `EMAIL_TO` (uno o varios correos separados por coma)
   - `ORIGIN`, `DESTINATION`, `DEPARTURE_DATE`, `RETURN_DATE`, `MARKET`
   - `ALERT_DROP_PERCENT`, `ALERT_WINDOW_DAYS`, `MIN_HISTORY_FOR_ALERTS`,
     `ALERT_ABSOLUTE_THRESHOLD` (opcional, deja vacia si no la usas)
4. El workflow (`.github/workflows/monitor.yml`) corre todos los dias a las 08:00
   hora Colombia y hace commit del `data/history.json` actualizado de vuelta al repo
   — asi no se pierde el historial entre ejecuciones (el runner es efimero).
5. Tambien puedes dispararlo manualmente desde la pestaña **Actions → Flight Price
   Monitor → Run workflow**.

## Estructura

```
src/
  config.ts       # lee y valida variables de entorno
  flightSource.ts # integracion con Ignav (busqueda de tarifas ida y vuelta / one-way)
  storage.ts    # historial persistido en data/history.json
  analysis.ts   # estadisticas, variacion diaria, tendencia, deteccion de alerta
  report.ts     # genera el HTML del reporte
  email.ts      # envio via Resend
  index.ts      # orquesta todo el flujo, maneja errores sin tumbar el proceso
```

## Roadmap / mejoras futuras

- Notificacion por WhatsApp (evaluado: CallMeBot o Twilio) — pendiente, no incluido en v1.
- Prediccion mas sofisticada de "mejor fecha de compra" una vez haya suficiente historial
  acumulado (semanas/meses) — v1 solo da tendencia simple (regresion lineal de corto plazo).
- Soporte para monitorear varias rutas a la vez (hoy es una ruta fija por config).

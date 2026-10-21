# 🐾 Paw Park

App interna para la operación de Paw Park: expedientes de perritos, guardería (check-in / check-out con cobro por rango de horas), paquetes de visitas, hotel, grooming, conducta y alertas de vacunas y cumpleaños.

## Tecnología

- **React 18 + Vite** — interfaz (casi todo vive en `src/App.jsx`)
- **Firebase Firestore** — base de datos (`dogs`, `daycare_sessions`, `users`, `files`)
- **Vercel** — hosting y tarea programada del reporte diario
- **Resend** — envío del reporte diario por correo

## Estructura

```
api/daily-report.js   Reporte diario por correo (Vercel Cron, 8 pm hora CDMX)
src/App.jsx           App completa: login con PIN, perritos, guardería, paquetes, etc.
src/firebase.js       Conexión a Firestore
src/main.jsx          Punto de entrada de React
vercel.json           Programación del cron
```

## Variables de entorno (Vercel)

| Variable | Uso |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Conexión de la app a Firebase |
| `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY` | Lectura de Firestore desde el reporte diario |
| `RESEND_API_KEY` | Envío del correo del reporte diario |

## Desarrollo local

```bash
npm install
npm run dev
```

Crea un archivo `.env.local` con las variables `VITE_FIREBASE_*` para conectarte a Firebase.

## Cómo se publican los cambios

Los cambios se hacen en una rama aparte y se abren como *pull request*. Vercel genera un link de prueba para revisarlos; al aprobar (merge) el pull request en `main`, se publican en la app real.

// api/daily-report.js - Vercel Serverless Function + Cron
// Runs daily at 8pm Mexico City time (2am UTC)

export const config = {
  maxDuration: 30,
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pawpark-61797";
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const REPORT_EMAILS = ["veronica.yanezgo@gmail.com", "gdavilalimon@gmail.com"];

async function getFirestoreData(collection) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?key=${FIREBASE_API_KEY}&pageSize=300`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map(doc => {
    const fields = doc.fields || {};
    const obj = { id: doc.name.split("/").pop() };
    for (const [k, v] of Object.entries(fields)) {
      if (v.stringValue !== undefined) obj[k] = v.stringValue;
      else if (v.integerValue !== undefined) obj[k] = parseInt(v.integerValue);
      else if (v.doubleValue !== undefined) obj[k] = parseFloat(v.doubleValue);
      else if (v.booleanValue !== undefined) obj[k] = v.booleanValue;
      else if (v.nullValue !== undefined) obj[k] = null;
      else if (v.mapValue) obj[k] = v.mapValue;
      else if (v.arrayValue) obj[k] = v.arrayValue;
    }
    return obj;
  });
}

function fmtHrs(ms) {
  if (!ms) return "0h 0m";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h + "h " + m + "m";
}

function fmtMXN(n) {
  return "$" + (n || 0).toLocaleString("es-MX");
}

export default async function handler(req, res) {
  // Allow manual trigger with GET, cron uses GET too
  try {
    const today = new Date();
    const todayStr = today.toDateString();
    const dateLabel = today.toLocaleDateString("es-MX", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

    // Fetch today's daycare sessions
    const sessions = await getFirestoreData("daycare_sessions");
    const todaySessions = sessions.filter(s => {
      const d = new Date(parseInt(s.checkIn) || s.checkIn);
      return d.toDateString() === todayStr && s.status === "done";
    });

    // Fetch all dogs for package info
    const dogs = await getFirestoreData("dogs");

    // Build stats
    const totalVisits = todaySessions.length;
    const totalMs = todaySessions.reduce((acc, s) => acc + (parseInt(s.totalMs) || 0), 0);
    const totalRevenue = todaySessions.reduce((acc, s) => acc + (parseInt(s.rangePrice) || 0), 0);
    const pkgVisits = todaySessions.filter(s => s.hasPackage).length;
    const paidVisits = totalVisits - pkgVisits;

    // Package alerts
    const DAYCARE_RANGES = [{maxHrs:4,price:125},{maxHrs:6,price:150},{maxHrs:8,price:190},{maxHrs:10,price:225},{maxHrs:12,price:275}];

    const expiringPkgs = dogs.filter(d => {
      const pkg = d.package?.mapValue?.fields || d.package;
      if (!pkg) return false;
      const active = pkg.active?.booleanValue ?? pkg.active;
      const endDate = pkg.endDate?.stringValue || pkg.endDate;
      if (!active || !endDate) return false;
      const days = Math.ceil((new Date(endDate) - today) / 864e5);
      return days >= 0 && days <= 5;
    });

    const expiredPkgs = dogs.filter(d => {
      const pkg = d.package?.mapValue?.fields || d.package;
      if (!pkg) return false;
      const active = pkg.active?.booleanValue ?? pkg.active;
      const endDate = pkg.endDate?.stringValue || pkg.endDate;
      if (!active || !endDate) return false;
      const days = Math.ceil((new Date(endDate) - today) / 864e5);
      const remaining = parseInt(pkg.remainingVisits?.integerValue || pkg.remainingVisits || 0);
      return days < 0 || remaining <= 0;
    });

    // Build session rows
    const sessionRows = todaySessions.length > 0
      ? todaySessions.map(s => {
          const checkIn = new Date(parseInt(s.checkIn)).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
          const checkOut = new Date(parseInt(s.checkOut)).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
          const hrs = fmtHrs(parseInt(s.totalMs));
          const price = s.hasPackage ? "Paquete" : fmtMXN(parseInt(s.rangePrice));
          return `<tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:10px 12px;font-weight:600">${s.dogName || "—"}</td>
            <td style="padding:10px 12px;color:#6b7280">${s.ownerName || "—"}</td>
            <td style="padding:10px 12px;font-family:monospace">${checkIn} → ${checkOut}</td>
            <td style="padding:10px 12px;font-family:monospace">${hrs}</td>
            <td style="padding:10px 12px;font-weight:700;color:${s.hasPackage?"#C1712C":"#143B31"}">${price}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af">Sin visitas registradas hoy</td></tr>`;

    const pkgExpiringRows = expiringPkgs.length > 0
      ? expiringPkgs.map(d => {
          const pkg = d.package?.mapValue?.fields || d.package;
          const endDate = pkg?.endDate?.stringValue || pkg?.endDate || "";
          const days = Math.ceil((new Date(endDate) - today) / 864e5);
          const name = d.name || "—";
          const owner = d.owner || "—";
          return `<tr style="border-bottom:1px solid #fde68a"><td style="padding:8px 12px;font-weight:600">${name}</td><td style="padding:8px 12px;color:#6b7280">${owner}</td><td style="padding:8px 12px;color:#D97706;font-weight:700">Vence en ${days} día${days!==1?"s":""}</td></tr>`;
        }).join("")
      : "";

    const pkgExpiredRows = expiredPkgs.length > 0
      ? expiredPkgs.map(d => {
          const name = d.name || "—";
          const owner = d.owner || "—";
          return `<tr style="border-bottom:1px solid #fecaca"><td style="padding:8px 12px;font-weight:600">${name}</td><td style="padding:8px 12px;color:#6b7280">${owner}</td><td style="padding:8px 12px;color:#EF4444;font-weight:700">Vencido / Agotado</td></tr>`;
        }).join("")
      : "";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2EEDD;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#35201E,#143B31);border-radius:16px;padding:24px;margin-bottom:20px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">🐾</div>
      <div style="color:#F2EEDD;font-size:22px;font-weight:900;letter-spacing:-0.5px">Paw Park</div>
      <div style="color:#AACC71;font-size:11px;letter-spacing:0.2em;font-weight:700;margin-top:4px">REPORTE DIARIO</div>
      <div style="color:rgba(242,238,221,0.7);font-size:13px;margin-top:8px">${dateLabel}</div>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      <div style="background:white;border-radius:12px;padding:16px;text-align:center;border:1px solid #e5e7eb">
        <div style="font-size:28px;font-weight:900;color:#143B31">${totalVisits}</div>
        <div style="font-size:11px;color:#9ca3af;font-weight:600;margin-top:2px">VISITAS</div>
      </div>
      <div style="background:white;border-radius:12px;padding:16px;text-align:center;border:1px solid #e5e7eb">
        <div style="font-size:22px;font-weight:900;color:#143B31">${fmtHrs(totalMs)}</div>
        <div style="font-size:11px;color:#9ca3af;font-weight:600;margin-top:2px">HORAS TOTALES</div>
      </div>
      <div style="background:white;border-radius:12px;padding:16px;text-align:center;border:1px solid #e5e7eb">
        <div style="font-size:22px;font-weight:900;color:#143B31">${fmtMXN(totalRevenue)}</div>
        <div style="font-size:11px;color:#9ca3af;font-weight:600;margin-top:2px">COBRADO</div>
      </div>
    </div>

    <div style="background:white;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #e5e7eb">
      <div style="font-size:11px;color:#9ca3af;font-weight:700;margin-bottom:4px">DESGLOSE</div>
      <div style="font-size:13px;color:#374151">🎟 Visitas pagadas: <strong>${paidVisits}</strong> &nbsp;·&nbsp; ★ Con paquete: <strong style="color:#C1712C">${pkgVisits}</strong></div>
    </div>

    <!-- Visits table -->
    <div style="background:white;border-radius:12px;overflow:hidden;margin-bottom:20px;border:1px solid #e5e7eb">
      <div style="padding:14px 16px;border-bottom:1px solid #f3f4f6">
        <div style="font-weight:800;font-size:14px;color:#111827">Visitas del día</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;font-weight:700">PERRITO</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;font-weight:700">DUEÑO</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;font-weight:700">HORARIO</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;font-weight:700">DURACIÓN</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;font-weight:700">COBRO</th>
          </tr>
        </thead>
        <tbody>${sessionRows}</tbody>
      </table>
    </div>

    ${(expiringPkgs.length > 0 || expiredPkgs.length > 0) ? `
    <!-- Package alerts -->
    <div style="background:white;border-radius:12px;overflow:hidden;margin-bottom:20px;border:1px solid #e5e7eb">
      <div style="padding:14px 16px;border-bottom:1px solid #f3f4f6">
        <div style="font-weight:800;font-size:14px;color:#111827">📦 Alertas de paquetes</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>
          ${pkgExpiredRows}
          ${pkgExpiringRows}
        </tbody>
      </table>
    </div>` : ""}

    <!-- Footer -->
    <div style="text-align:center;padding:16px 0;color:#9ca3af;font-size:11px">
      Paw Park · Reporte generado automáticamente a las 8:00 PM
    </div>
  </div>
</body>
</html>`;

    // Send via Resend
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Paw Park <onboarding@resend.dev>",
        to: REPORT_EMAILS,
        subject: `🐾 Paw Park — Reporte ${today.toLocaleDateString("es-MX",{day:"numeric",month:"short"})} · ${totalVisits} visitas · ${fmtMXN(totalRevenue)}`,
        html,
      }),
    });

    const sendData = await sendRes.json();

    if (!sendRes.ok) {
      console.error("Resend error:", sendData);
      return res.status(500).json({ error: sendData });
    }

    return res.status(200).json({ ok: true, visits: totalVisits, revenue: totalRevenue, emailId: sendData.id });

  } catch (err) {
    console.error("Report error:", err);
    return res.status(500).json({ error: err.message });
  }
}

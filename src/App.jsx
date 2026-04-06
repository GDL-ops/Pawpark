import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase.js";
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs } from "firebase/firestore";




// ---- Responsive helper ------------------------------------------------------

// ---- Constants ---------------------------------------------------------------
const VACCINES = [
  { id:"giardia",                 label:"Giardia",                 icon:"🦠", months:6  },
  { id:"bordetella",              label:"Bordetella",              icon:"💨", months:6  },
  { id:"quintuple",               label:"Quintuple",               icon:"💉", months:12 },
  { id:"desparasitacion_interna", label:"Desparasitacion Interna", icon:"🔬", months:3  },
  { id:"desparasitacion_externa", label:"Desparasitacion Externa", icon:"🐛", months:3  },
  { id:"rabia",                   label:"Rabia",                   icon:"⚡", months:12 },
];
const BREEDS = ["Labrador","Golden Retriever","Pastor Aleman","Bulldog","Chihuahua","Poodle","Beagle","Boxer","Schnauzer","Husky Siberiano","Border Collie","Dalmatian","Shih Tzu","Maltes","Yorkshire","Rottweiler","Doberman","Cocker Spaniel","Dachshund","Pitbull","Mestizo","Otro"];
const STAFF = ["Ruben","Jesus","Arturo","Karen","Alonso","Vero","Jasael","Gerardo"];
const BRESULT = {
  pending:    { label:"Pendiente",             icon:"⏳", color:"#9CA3AF", bg:"#F9FAFB", border:"#E5E7EB" },
  apt:        { label:"Apto - Guarderia",      icon:"✅", color:"#22C55E", bg:"#F0FDF4", border:"#86EFAC" },
  training:   { label:"Adiestramiento",        icon:"🎓", color:"#8B5CF6", bg:"#F5F3FF", border:"#C4B5FD" },
  observation:{ label:"Day Pass Personalizado",        icon:"👁", color:"#AACC71", bg:"#E8F0DC", border:"#AACC71" },
};
const BCRITERIA = [
  { id:"sociabilidad", label:"Sociabilidad con otros perros" },
  { id:"agresividad",  label:"Ausencia de agresividad"       },
  { id:"obediencia",   label:"Obediencia basica"             },
  { id:"estres",       label:"Manejo del estres"             },
  { id:"juego",        label:"Juego apropiado"               },
];
const SCORE_META = { 3:{label:"Excelente",color:"#22C55E"}, 2:{label:"Bien",color:"#84CC16"}, 1:{label:"Regular",color:"#AACC71"}, 0:{label:"Deficiente",color:"#EF4444"} };
const VST = {
  expired:{ label:"Vencida",      color:"#EF4444", bg:"#FEF2F2" },
  soon:   { label:"Por vencer",   color:"#AACC71", bg:"#E8F0DC" },
  ok:     { label:"Al dia",       color:"#22C55E", bg:"#F0FDF4" },
  none:   { label:"Sin registro", color:"#9CA3AF", bg:"#F9FAFB" },
};
const SUPV = { bajo:{label:"BAJO",color:"#22C55E",bg:"#F0FDF4"}, medio:{label:"MEDIO",color:"#AACC71",bg:"#E8F0DC"}, alto:{label:"ALTO",color:"#EF4444",bg:"#FEF2F2"} };
const HOME_PANELS = [{id:"dashboard",label:"Panel General",icon:"📊"},{id:"hotel",label:"Hotel",icon:"🏨"},{id:"conducta",label:"Conducta",icon:"🎓"},{id:"grooming",label:"Grooming",icon:"✂"},{id:"guarderia",label:"Guarderia",icon:"🐾"}];
const STAFF_EDITABLE = new Set(["alimentacion","cuidador","grooming","hotel","seguimiento"]);
const DEFAULT_ADMIN = { id:"admin", name:"Admin", pin:"1234", isAdmin:true, homePanel:"dashboard", color:"#AACC71" };
const DEFAULT_DAYCARE = { id:"daycare", name:"DAYCARE", pin:"5678", isAdmin:false, isDaycare:true, homePanel:"daycare", color:"#C1712C" };
const AREAS = ["Guarderia","Hotel","Grooming","Adiestramiento","Day Pass Personalizado"];

// ---- Helpers ----------------------------------------------------------------
const mkId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const ddiff = ds => !ds ? null : Math.floor((new Date(ds) - new Date()) / 864e5);
const gvs = vac => { if (!vac?.expiry) return "none"; const d = ddiff(vac.expiry); return d < 0 ? "expired" : d <= 30 ? "soon" : "ok"; };
function ovs(dog) { const ss = VACCINES.map(v => gvs(dog.vaccinations?.[v.id])); if (ss.includes("expired")) return "expired"; if (ss.includes("none")) return "none"; if (ss.includes("soon")) return "soon"; return "ok"; }
const pmiss = dog => { const m = []; if (!dog.responsivas?.guarderia?.name) m.push("Responsiva Guarderia"); if (!dog.responsivas?.hotel?.name) m.push("Responsiva Hotel"); return m; };
const defVac = () => Object.fromEntries(VACCINES.map(v => [v.id, { applied:"", expiry:"" }]));
const defDog = () => ({
  id:mkId(), photoColor:"#AACC71",
  name:"", breed:"", sex:"", age:"", weight:"", color:"", sterilized:"", lastCelo:"", birthdate:"",
  owner:"", phone:"", authorizedPeople:"", emergencyVet:"", emergencyVetPhone:"",
  allergies:"", medicalConditions:"", medications:"", dosage:"",
  foodProduct:"", foodMeasure:"", morningTime:"", morningAmount:"", afternoonTime:"", afternoonAmount:"", eveningTime:"", eveningAmount:"",
  extraFoodNotes:"", treatsAllowed:"", tutorTreats:"",
  relationWithPeople:"", fearsPhobias:"", handlingInstructions:"", vetEmergencyAuth:"",
  vaccinations:defVac(),
  care:{ result:"pending", date:"", evaluator:"", trainer:"", notes:"", scores:Object.fromEntries(BCRITERIA.map(c=>[c.id,""])), behaviorAtEntry:"", dogInteraction:"", staffInteraction:"", foodHabits:"", playBehavior:"", supervisionLevel:"", restBehavior:"" },
  grooming:{ lastDate:"", stylist:"", lastService:"", bathReactions:"", dryingReactions:"", cutReactions:"", nailReactions:"", earsReactions:"", notes:"" },
  responsivas:{ guarderia:null, hotel:null },
  areas:[],
  hotelStays:[],
  incidents:{ healthObservations:"", futureRecommendations:"" },
  package: null,
  daycareHistory: [],
});

function buildWAMsg(dog) {
  const expired = VACCINES.filter(v => gvs(dog.vaccinations?.[v.id]) === "expired");
  const soon = VACCINES.filter(v => gvs(dog.vaccinations?.[v.id]) === "soon");
  let msg = "Hola " + (dog.owner||"") + ", te contactamos de *Paw Park* sobre *" + (dog.name||"tu perrito") + "*.\n\n";
  if (expired.length) msg += "*Vacunas vencidas:*\n" + expired.map(v => "- " + v.label).join("\n") + "\n\n";
  if (soon.length) msg += "*Por vencer:*\n" + soon.map(v => { const d = ddiff(dog.vaccinations[v.id].expiry); return "- " + v.label + " (en " + d + " dias)"; }).join("\n") + "\n\n";
  msg += "Por favor actualiza las vacunas antes de la proxima visita. Gracias!";
  return msg;
}
function openWA(phone, msg) {
  const clean = (phone||"").replace(/\D/g,"");
  const num = clean.startsWith("52") ? clean : "52" + clean;
  window.open("https://wa.me/" + num + "?text=" + encodeURIComponent(msg), "_blank");
}

// ---- Package Constants ------------------------------------------------------
const PKG_VISITS = [4, 8, 12, 16];
const PKG_HOURS  = [4, 6, 8, 10, 12];
const PKG_PRICES = {
  4:  { 4: 452,  6: 552,  8: 752,  10: 825,  12: 1008 },
  8:  { 4: 910,  6: 1104, 8: 1394, 10: 1650, 12: 2016 },
  12: { 4: 1354, 6: 1608, 8: 2026, 10: 2400, 12: 2933 },
  16: { 4: 1805, 6: 2112, 8: 2660, 10: 3150, 12: 3850 },
};

function getPkgPrice(visits, hours) {
  return PKG_PRICES[visits]?.[hours] || 0;
}

function pkgDaysLeft(pkg) {
  if (!pkg?.startDate) return null;
  const end = new Date(pkg.startDate);
  end.setDate(end.getDate() + 31);
  const diff = Math.ceil((end - new Date()) / 864e5);
  return diff;
}

function pkgStatus(pkg) {
  if (!pkg?.active) return "none";
  const days = pkgDaysLeft(pkg);
  if (days < 0) return "expired";
  if (days <= 5) return "expiring";
  if (pkg.remainingVisits <= 0) return "used";
  return "active";
}

// ---- Daycare Constants ------------------------------------------------------
const DAYCARE_RANGES = [
  { maxHrs: 4,  label: "4 hrs",  price: 125 },
  { maxHrs: 6,  label: "6 hrs",  price: 150 },
  { maxHrs: 8,  label: "8 hrs",  price: 190 },
  { maxHrs: 10, label: "10 hrs", price: 225 },
  { maxHrs: 12, label: "12 hrs", price: 275 },
];

function getDaycareRange(elapsedMs) {
  const hrs = elapsedMs / 3600000;
  for (const r of DAYCARE_RANGES) {
    if (hrs <= r.maxHrs) return r;
  }
  return DAYCARE_RANGES[DAYCARE_RANGES.length - 1];
}

function getElapsed(session) {
  if (!session) return 0;
  const start = session.checkIn;
  const pauseMs = (session.pauses || []).reduce((acc, p) => {
    const s = p.start || 0;
    const e = p.end || Date.now();
    return acc + (e - s);
  }, 0);
  const end = session.checkOut || Date.now();
  return Math.max(0, end - start - pauseMs);
}

function fmtElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
}


// ---- Age & Birthday helpers -------------------------------------------------
function calcAge(birthdate) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (isNaN(b)) return null;
  const today = new Date();
  let years = today.getFullYear() - b.getFullYear();
  const months = today.getMonth() - b.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < b.getDate())) years--;
  if (years <= 0) {
    let m = (today.getFullYear() - b.getFullYear()) * 12 + (today.getMonth() - b.getMonth());
    if (today.getDate() < b.getDate()) m--;
    if (m <= 0) return "Recien nacido";
    return m === 1 ? "1 mes" : m + " meses";
  }
  return years === 1 ? "1 año" : years + " años";
}

function ageFromText(ageStr) {
  // Convert "2 años" or "2" to a birthdate string
  if (!ageStr) return "";
  const num = parseInt(ageStr);
  if (isNaN(num)) return "";
  const d = new Date();
  d.setFullYear(d.getFullYear() - num);
  return d.toISOString().slice(0, 10);
}

function upcomingBirthdays(dogs, days=31) {
  const today = new Date();
  const result = [];
  for (const dog of dogs) {
    if (!dog.birthdate) continue;
    const b = new Date(dog.birthdate);
    if (isNaN(b)) continue;
    // Next birthday this year
    const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const diff = Math.floor((next - today) / 864e5);
    if (diff <= days) {
      const age = today.getFullYear() - b.getFullYear() + (next.getFullYear() > today.getFullYear() ? 1 : 0);
      result.push({ dog, diff, next, age });
    }
  }
  return result.sort((a, b) => a.diff - b.diff);
}



// ---- Style helpers ----------------------------------------------------------
function getT(dark) {
  return {
    bg:    dark ? "#0D1510" : "#F2EEDD",
    surf:  dark ? "#112018" : "#FFFFFF",
    surf2: dark ? "#1A2E22" : "#EBE8DE",
    bord:  dark ? "#1E3D2A" : "#C8C4B4",
    text:  dark ? "#F2EEDD" : "#111827",
    text2: dark ? "#7AAB8A" : "#4A5568",
    text3: dark ? "#3D6B4F" : "#8A8578",
    acc:   "#AACC71",
    accD:  "#143B31",
    accBg: dark ? "#0D2018" : "#E4EDD6",
    red:   "#EF4444",
    green: "#AACC71",
    head:  dark ? "linear-gradient(135deg,#0D1510,#143B31)" : "linear-gradient(135deg,#35201E,#143B31)",
  };
}

// ---- Atoms ------------------------------------------------------------------
function VacBadge({ status, sm }) {
  const m = VST[status];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:m.bg, color:m.color, border:"1px solid " + m.color + "35", borderRadius:99, padding:sm?"1px 8px":"3px 10px", fontSize:sm?10:11, fontWeight:700, whiteSpace:"nowrap" }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:m.color, display:"inline-block" }} />
      {m.label}
    </span>
  );
}

function BehBadge({ result, sm }) {
  const m = BRESULT[result] || BRESULT.pending;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:m.bg, color:m.color, border:"1px solid " + m.border, borderRadius:99, padding:sm?"1px 8px":"3px 10px", fontSize:sm?10:11, fontWeight:700, whiteSpace:"nowrap" }}>
      {m.icon} {m.label}
    </span>
  );
}

function DogAvatar({ dog, size=44 }) {
  const c = dog.photoColor || "#AACC71";
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:"linear-gradient(135deg," + c + "," + c + "99)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:800, fontSize:size*0.34, flexShrink:0, boxShadow:"0 2px 8px " + c + "50" }}>
      {dog.name?.slice(0,2).toUpperCase() || "🐕"}
    </div>
  );
}

function Lbl({ children, dark }) {
  const t = getT(dark);
  return <label style={{ fontSize:11, fontWeight:700, color:t.text3, letterSpacing:"0.06em", display:"block", marginBottom:5 }}>{children}</label>;
}

function SecTitle({ children, dark }) {
  const t = getT(dark);
  return (
    <div style={{ fontSize:10, fontWeight:800, color:t.text3, letterSpacing:"0.1em", margin:"10px 0 12px", display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:1, background:t.bord }} />{children}<div style={{ flex:1, height:1, background:t.bord }} />
    </div>
  );
}

function IRow({ label, value, dark }) {
  const t = getT(dark);
  if (!value && value !== 0) return null;
  return (
    <div>
      <div style={{ fontSize:9, fontWeight:800, color:t.text3, letterSpacing:"0.1em", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:13, color:t.text, lineHeight:1.6, background:t.surf2, borderRadius:10, padding:"7px 11px", border:"1px solid " + t.bord }}>{value}</div>
    </div>
  );
}

function IGrid({ children, cols=2 }) { return <div style={{ display:"grid", gridTemplateColumns:"repeat(" + cols + ",1fr)", gap:10 }}>{children}</div>; }

function ROBanner({ dark }) {
  const t = getT(dark);
  return <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10, background:t.surf2, border:"1px solid " + t.bord, marginBottom:8 }}><span>🔒</span><span style={{ fontSize:12, color:t.text2, fontWeight:600 }}>Solo el administrador puede editar esta seccion</span></div>;
}

function inp(dark, disabled) {
  const t = getT(dark);
  return disabled
    ? { width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid "+t.bord, fontSize:13, background:t.surf2, outline:"none", color:t.text3, boxSizing:"border-box", cursor:"not-allowed" }
    : { width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid "+t.bord, fontSize:13, background:t.surf, outline:"none", color:t.text, boxSizing:"border-box" };
}

function Field({ label, value, onChange, placeholder, type="text", dark, disabled }) {
  return <div><Lbl dark={dark}>{label}</Lbl><input type={type} value={value||""} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} disabled={disabled||!onChange} style={inp(dark, disabled||!onChange)} /></div>;
}
function TA({ label, value, onChange, placeholder, rows=3, dark, disabled }) {
  return <div><Lbl dark={dark}>{label}</Lbl><textarea value={value||""} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled||!onChange} style={{ ...inp(dark, disabled||!onChange), resize:"vertical", fontFamily:"inherit", lineHeight:1.55 }} /></div>;
}
function Sel({ label, options, value, onChange, dark, disabled }) {
  return <div><Lbl dark={dark}>{label}</Lbl><select value={value||""} onChange={e=>onChange&&onChange(e.target.value)} disabled={disabled||!onChange} style={{ ...inp(dark, disabled||!onChange), cursor:disabled?"not-allowed":"pointer" }}><option value="">Seleccionar...</option>{options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}</select></div>;
}
function Radio({ label, value, onChange, options, dark, disabled }) {
  const t = getT(dark);
  return (
    <div>
      <Lbl dark={dark}>{label}</Lbl>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {options.map(o => (
          <button key={o.value} onClick={() => onChange && !disabled && onChange(o.value)} style={{ padding:"7px 16px", borderRadius:10, border:"1.5px solid " + (value===o.value ? t.acc : t.bord), background:value===o.value ? t.accBg : t.surf, color:value===o.value ? t.accD : t.text2, fontWeight:700, fontSize:12.5, cursor:disabled?"default":"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:13, height:13, borderRadius:"50%", border:"2px solid " + (value===o.value ? t.acc : t.bord), background:value===o.value ? t.acc : "transparent", display:"inline-block", flexShrink:0 }} />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onChange, dark }) {
  const t = getT(dark);
  return (
    <div style={{ display:"flex", gap:3, background:t.surf2, borderRadius:12, padding:4, overflowX:"auto", flexWrap:"wrap" }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)} style={{ flexShrink:0, padding:"8px 13px", borderRadius:10, border:"none", whiteSpace:"nowrap", background:active===tab.id?t.surf:"transparent", color:active===tab.id?t.text:t.text3, fontWeight:700, fontSize:12, cursor:"pointer", boxShadow:active===tab.id?"0 1px 6px #0000001A":"none", transition:"all 0.15s" }}>
          {tab.label}
          {tab.badge ? <span style={{ background:t.red, color:"white", borderRadius:99, padding:"0 5px", fontSize:9, fontWeight:800, marginLeft:3 }}>{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Card({ children, style={}, onClick, dark }) {
  const t = getT(dark);
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:t.surf, borderRadius:18, border:"1.5px solid " + t.bord, padding:"18px 20px", boxShadow:hov&&onClick?"0 8px 24px #00000018":"0 2px 8px #0000000A", transition:"all 0.2s", cursor:onClick?"pointer":"default", transform:hov&&onClick?"translateY(-2px)":"translateY(0)", ...style }}>
      {children}
    </div>
  );
}

// ---- PDF Upload --------------------------------------------------------------
function PdfUpload({ label, value, onChange, dark }) {
  const t = getT(dark);
  const ref = useRef();
  const hf = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 4*1024*1024) { alert("Max 4MB"); return; }
    const r = new FileReader();
    r.onload = ev => onChange({ name:f.name, data:ev.target.result, date:new Date().toLocaleDateString("es-MX") });
    r.readAsDataURL(f);
  };
  return (
    <div style={{ border:"2px dashed " + (value?.name ? "#22C55E" : t.bord), borderRadius:14, padding:"18px", background:value?.name ? (dark?"#0A2D14":"#F0FDF4") : t.surf2, cursor:"pointer" }} onClick={() => !value?.name && ref.current.click()}>
      <input ref={ref} type="file" accept=".pdf" style={{ display:"none" }} onChange={hf} />
      {value?.name ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:24 }}>📄</span>
            <div><div style={{ fontWeight:700, fontSize:13, color:"#22C55E" }}>{value.name}</div><div style={{ fontSize:11, color:t.text3 }}>{value.date}</div></div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {value.data && <a href={value.data} download={value.name} onClick={e=>e.stopPropagation()} style={{ padding:"5px 11px", borderRadius:7, background:"#DCFCE7", color:"#15803D", fontSize:11, fontWeight:700, textDecoration:"none", border:"1px solid #86EFAC" }}>Descargar</a>}
            <button onClick={e=>{e.stopPropagation();onChange(null);}} style={{ padding:"5px 11px", borderRadius:7, background:"#FEF2F2", color:"#EF4444", fontSize:11, fontWeight:700, border:"1px solid #FECACA", cursor:"pointer" }}>Quitar</button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign:"center" }}><div style={{ fontSize:26, marginBottom:5 }}>📤</div><div style={{ fontWeight:700, fontSize:13, color:t.text3 }}>{label}</div><div style={{ fontSize:11, color:t.text3, opacity:.6 }}>PDF max. 4MB</div></div>
      )}
    </div>
  );
}


function DatePicker({ value, onChange, label, dark }) {
  const t = getT(dark);
  return (
    <div>
      <Lbl dark={dark}>{label}</Lbl>
      <input type="date" value={value||""} onChange={e=>onChange(e.target.value)}
        style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid "+t.bord, fontSize:13, background:t.surf, outline:"none", color:value?t.text:t.text3, boxSizing:"border-box", fontFamily:"inherit", cursor:"pointer" }} />
    </div>
  );
}

// ---- VacRow -----------------------------------------------------------------
function VacRow({ vac, label, icon, onChange, dark }) {
  const t = getT(dark);
  const s = gvs(vac); const m = VST[s]; const diff = vac?.expiry ? ddiff(vac.expiry) : null; const ro = !onChange;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 150px 120px", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:11, background:m.bg, border:"1px solid " + m.color + "25" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:16 }}>{icon}</span><span style={{ fontWeight:600, fontSize:13, color:t.text }}>{label}</span></div>
      {ro ? (<><span style={{ fontSize:12, color:t.text2 }}>{vac?.applied||"—"}</span><span style={{ fontSize:12, color:t.text2 }}>{vac?.expiry||"—"}</span></>) : (
        <>
          <div><label style={{ display:"block", fontSize:10, color:t.text3, marginBottom:2 }}>APLICACION</label><input type="date" value={vac?.applied||""} onChange={e=>onChange("applied",e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:8, border:"1px solid " + t.acc, fontSize:12, background:t.surf, outline:"none", color:t.text }} /></div>
          <div><label style={{ display:"block", fontSize:10, color:t.text3, marginBottom:2 }}>VENCIMIENTO</label><input type="date" value={vac?.expiry||""} onChange={e=>onChange("expiry",e.target.value)} style={{ width:"100%", padding:"6px 8px", borderRadius:8, border:"1px solid " + t.acc, fontSize:12, background:t.surf, outline:"none", color:t.text }} /></div>
        </>
      )}
      <div style={{ textAlign:"right" }}>
        <VacBadge status={s} />
        {diff !== null && s !== "ok" && <div style={{ fontSize:10, color:m.color, marginTop:3, fontWeight:600 }}>{diff < 0 ? "Hace " + Math.abs(diff) + "d" : "En " + diff + "d"}</div>}
      </div>
    </div>
  );
}

// ---- Hotel helpers ----------------------------------------------------------
function buildSum(dog) {
  const L = [];
  const meals = [{key:"morning",e:"Manana"},{key:"afternoon",e:"Tarde"},{key:"evening",e:"Noche"}];
  if (dog.foodProduct) L.push({ icon:"🍽", label:"Alimento", text:dog.foodProduct + (dog.foodMeasure ? " - " + dog.foodMeasure : "") });
  const ml = meals.filter(m => dog[m.key+"Time"] || dog[m.key+"Amount"]).map(m => m.e + ": " + [dog[m.key+"Time"], dog[m.key+"Amount"]].filter(Boolean).join(" - "));
  if (ml.length) L.push({ icon:"🕐", label:"Horarios", text:ml.join("  |  ") });
  const tr = dog.treatsAllowed==="si" ? "Si" : dog.treatsAllowed==="no" ? "No" : dog.treatsAllowed==="tutor" ? "Solo del tutor" + (dog.tutorTreats ? ": " + dog.tutorTreats : "") : null;
  if (tr) L.push({ icon:"🦴", label:"Premios", text:tr });
  if (dog.extraFoodNotes) L.push({ icon:"📝", label:"Notas alim.", text:dog.extraFoodNotes });
  if (dog.allergies) L.push({ icon:"⚠", label:"Alergias", text:dog.allergies, alert:true });
  if (dog.medicalConditions) L.push({ icon:"🏥", label:"Condiciones medicas", text:dog.medicalConditions, alert:true });
  if (dog.medications) L.push({ icon:"💊", label:"Medicamentos", text:dog.medications + (dog.dosage ? " - " + dog.dosage : ""), alert:true });
  if (dog.fearsPhobias) L.push({ icon:"😰", label:"Miedos", text:dog.fearsPhobias, warn:true });
  if (dog.handlingInstructions) L.push({ icon:"🎯", label:"Manejo especial", text:dog.handlingInstructions, warn:true });
  if (dog.care?.supervisionLevel) L.push({ icon:"👁", label:"Supervision", text:SUPV[dog.care.supervisionLevel]?.label, sv:dog.care.supervisionLevel });
  if (dog.vetEmergencyAuth) L.push({ icon:"🚑", label:"Auth. emergencia", text:dog.vetEmergencyAuth === "Si" ? "Si" : "No" });
  if (dog.emergencyVet) L.push({ icon:"📞", label:"Vet. emergencia", text:dog.emergencyVet + (dog.emergencyVetPhone ? " - " + dog.emergencyVetPhone : "") });
  return L;
}

function IncForm({ onAdd, onCancel, currentUser, dark }) {
  const t = getT(dark);
  const [inc, setInc] = useState({ date:new Date().toISOString().slice(0,10), description:"", reportedBy:currentUser?.name||"", actionsTaken:"" });
  const s = k => v => setInc(i => ({...i, [k]:v}));
  return (
    <div style={{ padding:16, borderRadius:12, background:t.accBg, border:"1.5px solid " + t.acc + "40", display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ fontWeight:700, fontSize:13, color:t.accD }}>Reportar incidente</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field dark={dark} label="FECHA" value={inc.date} onChange={s("date")} type="date" />
        <Sel dark={dark} label="REPORTADO POR" options={STAFF} value={inc.reportedBy} onChange={s("reportedBy")} />
      </div>
      <TA dark={dark} label="DESCRIPCION" value={inc.description} onChange={s("description")} placeholder="Que ocurrio..." rows={3} />
      <TA dark={dark} label="ACCIONES TOMADAS" value={inc.actionsTaken} onChange={s("actionsTaken")} rows={2} />
      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
        <button onClick={onCancel} style={{ padding:"7px 16px", borderRadius:9, border:"1.5px solid " + t.bord, background:t.surf, color:t.text2, fontWeight:600, cursor:"pointer", fontSize:12 }}>Cancelar</button>
        <button onClick={() => { if (inc.description.trim()) onAdd({...inc, id:mkId()}); }} style={{ padding:"7px 16px", borderRadius:9, border:"none", background:"#EF4444", color:"white", fontWeight:700, cursor:"pointer", fontSize:12 }}>Guardar</button>
      </div>
    </div>
  );
}

function StayCard({ stay, dog, onDelete, onChange, currentUser, readOnly, dark }) {
  const t = getT(dark);
  const [showInc, setShowInc] = useState(false);
  const sum = buildSum(dog);
  const alerts = sum.filter(l => l.alert || l.warn || l.sv === "alto");
  const info = sum.filter(l => !l.alert && !l.warn && l.sv !== "alto");
  const sv = dog.care?.supervisionLevel ? SUPV[dog.care.supervisionLevel] : null;
  const addInc = inc => onChange({...stay, incidents:[...(stay.incidents||[]), inc]});
  const delInc = id => onChange({...stay, incidents:(stay.incidents||[]).filter(i => i.id !== id)});
  return (
    <div style={{ borderRadius:18, border:"1.5px solid " + t.bord, overflow:"hidden", boxShadow:"0 2px 12px #0000000A" }}>
      <div style={{ background:"linear-gradient(135deg,#35201E,#143B31)", padding:"13px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:20 }}>🏨</span>
          <div>
            <div style={{ color:"white", fontWeight:800, fontSize:15 }}>{dog.name}</div>
            <div style={{ color:"#AACC71", fontSize:12 }}>{stay.checkIn && stay.checkOut ? stay.checkIn + " al " + stay.checkOut : stay.checkIn || stay.checkOut || "Fechas pendientes"}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {sv && <span style={{ background:sv.bg, color:sv.color, borderRadius:99, padding:"2px 10px", fontSize:11, fontWeight:800 }}>{"👁 Sup. " + sv.label}</span>}
          {!readOnly && onDelete && <button onClick={onDelete} style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>X</button>}
        </div>
      </div>
      <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14, background:t.surf }}>
        {alerts.length > 0 && (
          <div style={{ background:dark?"#2D0A0A":"#FFF5F5", border:"1.5px solid #FECACA", borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#DC2626", letterSpacing:"0.07em", marginBottom:8 }}>⚠ ALERTAS IMPORTANTES</div>
            {alerts.map((l,i) => <div key={i} style={{ display:"flex", gap:8, marginBottom:5 }}><span style={{ fontSize:13 }}>{l.icon}</span><div><span style={{ fontSize:11, fontWeight:800, color:t.text2, marginRight:5 }}>{l.label}:</span><span style={{ fontSize:12, color:t.text }}>{l.text}</span></div></div>)}
          </div>
        )}
        {info.length > 0 && (
          <div style={{ background:t.accBg, border:"1px solid " + t.acc + "30", borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:800, color:t.accD, letterSpacing:"0.07em", marginBottom:8 }}>INDICACIONES</div>
            {info.map((l,i) => <div key={i} style={{ display:"flex", gap:8, marginBottom:5 }}><span style={{ fontSize:13 }}>{l.icon}</span><div><span style={{ fontSize:11, fontWeight:800, color:t.text2, marginRight:5 }}>{l.label}:</span><span style={{ fontSize:12, color:t.text }}>{l.text}</span></div></div>)}
          </div>
        )}
        {!readOnly && <div><Lbl dark={dark}>NOTAS DE ESTA ESTANCIA</Lbl><textarea value={stay.notes||""} onChange={e=>onChange({...stay,notes:e.target.value})} rows={2} placeholder="Observaciones..." style={{ ...inp(dark,false), resize:"vertical", fontFamily:"inherit" }} /></div>}
        {readOnly && stay.notes && <IRow dark={dark} label="NOTAS" value={stay.notes} />}
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#DC2626" }}>INCIDENTES ({(stay.incidents||[]).length})</div>
            {!readOnly && !showInc && <button onClick={() => setShowInc(true)} style={{ padding:"5px 12px", borderRadius:8, border:"1.5px solid #FECACA", background:"#FFF5F5", color:"#DC2626", fontWeight:700, fontSize:11, cursor:"pointer" }}>+ Reportar</button>}
          </div>
          {showInc && <IncForm dark={dark} currentUser={currentUser} onAdd={inc=>{addInc(inc);setShowInc(false);}} onCancel={()=>setShowInc(false)} />}
          {(stay.incidents||[]).map(inc => (
            <div key={inc.id} style={{ padding:"10px 13px", borderRadius:10, background:dark?"#2D0A0A":"#FFF5F5", border:"1.5px solid #FECACA", marginTop:8 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}><span>🚨</span><span style={{ fontWeight:700, fontSize:13, color:"#DC2626" }}>{inc.date||"Sin fecha"}</span></div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  {inc.reportedBy && <span style={{ background:"#FEE2E2", color:"#DC2626", borderRadius:99, padding:"1px 9px", fontSize:11, fontWeight:700 }}>{inc.reportedBy}</span>}
                  {!readOnly && <button onClick={()=>delInc(inc.id)} style={{ background:"none", border:"none", color:"#EF4444", cursor:"pointer", fontSize:14, padding:0 }}>X</button>}
                </div>
              </div>
              {inc.description && <div style={{ fontSize:12, color:dark?"#FCA5A5":"#7F1D1D", lineHeight:1.5 }}>{inc.description}</div>}
              {inc.actionsTaken && <div style={{ fontSize:12, color:t.text3, marginTop:3 }}>Acciones: {inc.actionsTaken}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- PIN PAD ----------------------------------------------------------------
function PinPad({ onSuccess, users }) {
  const [pin, setPin] = useState(""); const [err, setErr] = useState(""); const [shake, setShake] = useState(false);
  const press = d => {
    if (pin.length >= 4) return;
    const next = pin + d; setPin(next); setErr("");
    if (next.length === 4) setTimeout(() => {
      const found = users.find(u => u.pin === next);
      if (found) { onSuccess(found); } else { setShake(true); setErr("PIN incorrecto"); setTimeout(() => { setPin(""); setShake(false); }, 700); }
    }, 180);
  };
  const KEYS = ["1","2","3","4","5","6","7","8","9","","0","X"];
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(145deg,#0D0F0A,#143B31)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:300, textAlign:"center" }}>
        <div style={{ marginBottom:28 }}>
          <div style={{ margin:"0 auto 16px", width:180 }}>
            <svg viewBox="0 0 792 612" style={{ width:"100%", filter:"drop-shadow(0 4px 16px rgba(170,204,113,0.3))" }}>
              <g>
                <path fill="#AACC71" d="M107.96,258.59H73.75v110.77h23.91v-50.65h14.95c5.81,0,11.29-2.16,15.11-5.98c4.15-4.32,5.81-10.8,5.81-23.58c0-10.63-1-15.94-3.65-20.09C125.4,262.24,117.76,258.59,107.96,258.59z M107.96,295.96c-1.49,1.33-3.82,2.33-5.48,2.33h-4.82v-19.26h4.48c5.81,0,7.81,2.49,7.81,9.63C109.95,292.97,109.45,294.63,107.96,295.96z"/>
                <path fill="#AACC71" d="M151.13,258.59l-15.61,110.77h23.08l2.16-15.78h12.79l1.33,15.78h23.58l-15.45-110.77H151.13z M162.59,332.66l1-11.29c0.5-6.48,1-12.79,1.66-19.26c0.17-2.32,0.67-9.13,1.16-16.77l0.66-9.8l3.49,46l0.83,11.13H162.59z"/>
                <path fill="#AACC71" d="M265.88,291.14c-0.66,6.48-1.16,12.12-1.49,16.94l-1.16,14.95c0,0.66-0.17,2.82-0.5,6.14l-0.33-3.65c-0.16-1.33-0.33-4.15-0.66-8.3c-1.16-15.28-1.33-18.43-2.16-25.91l-3.49-32.72h-20.76l-3.82,34.05c-0.67,5.65-2.16,22.42-3.16,36.54l-0.5-5.15c0-1.66-0.33-4.48-0.5-8.64c-0.83-12.79-1-13.62-1.83-22.75l-3.32-34.05h-23.42l11.96,110.77h26.74l4.82-37.2c1.33-10.46,1.99-17.1,2.99-33.05c0.33,2.99,0.5,6.15,0.83,9.3c0.16,2.49,0.5,5.48,0.66,8.64c0.66,7.31,1.33,14.95,1.66,15.61l4.81,36.7H280l12.12-110.77h-22.75L265.88,291.14z"/>
                <path fill="#AACC71" d="M468.38,258.59h-34.21v110.77h23.91v-50.65h14.95c5.81,0,11.29-2.16,15.11-5.98c4.15-4.32,5.81-10.8,5.81-23.58c0-10.63-1-15.94-3.65-20.09C485.82,262.24,478.18,258.59,468.38,258.59z M468.38,295.96c-1.49,1.33-3.82,2.33-5.48,2.33h-4.82v-19.26h4.48c5.81,0,7.81,2.49,7.81,9.63C470.38,292.97,469.88,294.63,468.38,295.96z"/>
                <path fill="#AACC71" d="M511.56,258.59l-15.61,110.77h23.08l2.16-15.78h12.79l1.33,15.78h23.58l-15.45-110.77H511.56z M523.02,332.66l1-11.29c0.5-6.48,1-12.79,1.66-19.26c0.17-2.32,0.67-9.13,1.16-16.77l0.66-9.8l3.49,46l0.83,11.13H523.02z"/>
                <path fill="#AACC71" d="M625.31,286.82c0-19.93-7.64-28.23-25.74-28.23h-34.05v110.77h23.75v-50.98c0.83-0.17,1.66-0.17,1.99-0.17c6.31,0,8.3,2.66,8.3,11.46v39.69h23.75v-40.19c0.17-11.13-2.49-16.28-9.3-17.77C622.32,309.41,625.31,303.1,625.31,286.82z M594.09,298.45h-4.82v-19.43h5.15c5.65,0,8.14,2.99,8.14,10.29C602.56,295.46,599.91,298.45,594.09,298.45z"/>
                <path fill="#AACC71" d="M682.27,306.25l12.95-47.66h-23.58l-5.32,18.1c-1,2.99-1.83,6.15-2.82,9.3c-0.5,1.66-1.5,5.48-2.66,9.96c-0.5,1.83-1,3.65-1.33,5.48l0.16-42.85H636.1v110.77h23.58l-0.16-59.12l1.16,4.82c2.82,12.12,3.32,14.78,3.99,17.1l10.13,37.2h24.58L682.27,306.25z"/>
                <path fill="rgba(170,204,113,0.6)" d="M304.49,362.53c0.02-2.57,1-4.86,2.3-6.97c1.12-1.81,1.25-2-0.28-3.63c-2.77-2.95-3.61-6.48-2.49-10.44c0.89-3.15,2.56-5.86,4.78-8.2c0.84-0.89,1.06-1.47,0.06-2.32c-0.54-0.46-0.99-1.05-1.4-1.63c-2.41-3.45-2.92-6.99-0.56-10.73c1.6-2.54,3.49-4.75,6.13-6.28c1.87-1.09,1.85-1.13,1.39-3.19c-0.28-1.26-0.3-2.53-0.2-3.81c0.13-1.68,0.03-1.8-1.69-1.45c-2.06,0.41-3.97,0.09-5.77-0.94c-3.36-1.91-4.37-5.07-2.79-8.59c1-2.22,2.49-4.08,4.16-5.82c1.61-1.68,1.61-1.68-0.07-3.15c-1.34-1.17-2.5-2.45-3.28-4.08c-1.2-2.48-1.22-4.97,0.1-7.37c2.74-5.02,6.96-8.03,12.64-8.88c1.61-0.24,3.18,0.14,4.68,0.75c0.36,0.15,0.71,0.38,1.01,0.64c1.1,0.94,1.41,2.34,0.8,3.44c-0.58,1.06-1.75,1.59-3.11,1.08c-1.58-0.59-3.05-0.77-4.64-0.11c-2.04,0.84-3.8,2.03-5.13,3.81c-2.36,3.17-0.62,7.08,3.36,7.53c0.71,0.08,1.44,0,2.15-0.01c0.64-0.01,1.28-0.07,1.91-0.01c1.21,0.12,2.1,0.76,2.54,1.91c0.45,1.19,0.02,2.19-0.81,3.06c-0.85,0.89-1.98,1.33-3.05,1.86c-3,1.49-5.5,3.55-7.26,6.43c-0.4,0.66-1.06,1.36-0.44,2.18c0.63,0.84,1.58,0.7,2.43,0.42c2.05-0.67,4.04-1.52,5.96-2.51c0.64-0.33,1.28-0.67,1.93-0.96c1.21-0.53,2.36-0.45,3.33,0.5c0.97,0.96,1.05,2.14,0.54,3.33c-0.44,1.02-1,2-1.55,2.97c-0.76,1.32-1.52,2.65-1.91,4.12c-0.75,2.79,1.03,4.79,3.9,4.43c1.49-0.19,2.67-0.95,3.69-2.04c1.67-1.78,2.76-3.9,3.75-6.09c0.57-1.26,1.52-2.09,2.96-2.04c1.39,0.04,2.41,0.75,3.05,1.99c0.15,0.28,0.27,0.58,0.41,0.87c0.22,0.43,0.42,0.86,0.68,1.26c2.69,4.14,8.95,4.04,11.5-0.18c1.24-2.06,0.63-4.95-1.43-6.38c-0.98-0.68-2.08-1.2-3.1-1.81c-1.24-0.74-2.19-1.72-1.92-3.29c0.26-1.55,1.46-2.26,2.87-2.52c1.9-0.35,3.79-0.69,5.44-1.74c1.41-0.89,3.02-1.77,2.85-3.79c-0.18-2.08-2.02-2.49-3.55-3.09c-0.73-0.29-1.55-0.35-2.33-0.54c-0.77-0.19-1.58-0.32-2.3-0.64c-1.55-0.69-2.26-2.1-1.87-3.47c0.4-1.39,1.71-2.26,3.35-2.11c0.87,0.08,1.73,0.31,2.59,0.47c2.05,0.37,3.99,0.08,5.77-1c2.1-1.27,2.22-2.69,0.16-4c-2.36-1.5-4.85-2.77-7.29-4.15c-0.62-0.35-1.29-0.66-1.84-1.1c-0.95-0.75-1.39-1.74-0.97-2.97c0.39-1.15,1.47-1.85,2.82-1.8c0.98,0.04,1.88,0.39,2.74,0.82c2.87,1.42,5.68,2.96,8.32,4.76c4.68,3.19,4.91,8.67,0.6,12.35c-1.66,1.42-1.66,1.42-0.91,3.49c1.5,4.14,0.27,7.8-3.56,10.71c-0.82,0.62-2.12,0.88-2.41,1.85c-0.31,1.02,0.94,1.72,1.33,2.68c1.96,4.85,1.52,8.98-2.43,12.68c-4.39,4.1-9.73,4.82-14.99,1.9c-0.9-0.5-1.74-1.14-2.56-1.76c-0.66-0.5-1.15-0.41-1.6,0.25c-0.04,0.07-0.1,0.13-0.14,0.19c-3.3,4.84-7.81,6.89-13.64,5.87c-1.09-0.19-2.06,0.19-2.99,0.66c-2.12,1.07-3.81,2.61-5.01,4.67c-1.37,2.34-1.16,4.13,0.76,6.04c0.69,0.69,1.5,1.22,2.4,1.55c3.23,1.2,4.22,4.43,0.34,6.81c-2.33,1.43-4.04,3.34-5.28,5.73c-0.49,0.94-0.79,1.92-0.95,2.95c-0.41,2.67,1.16,4.72,3.86,5.04c0.71,0.08,1.44,0.03,2.15,0.1c2.04,0.19,3.36,1.21,3.5,2.67c0.14,1.41-0.71,2.65-2.7,3.18c-3.1,0.82-4.53,3.1-5.55,5.79c-0.67,1.78-0.32,2.58,1.31,3.59c1.37,0.84,2.82,1.46,4.39,1.88c1.86,0.51,2.64,1.55,2.45,3c-0.19,1.4-1.47,2.67-3.06,2.48c-4.27-0.52-7.96-2.28-10.51-5.91C304.64,364.83,304.47,363.68,304.49,362.53z"/>
              </g>
            </svg>
          </div>
          <div style={{ color:"#F2EEDD", fontSize:11, letterSpacing:"0.25em", fontWeight:600, marginTop:4, opacity:0.7 }}>EXPEDIENTE CANINO DIGITAL</div>
        </div>
        <div style={{ background:"rgba(20,59,49,0.6)", borderRadius:22, padding:"28px 24px", border:"1px solid rgba(170,204,113,0.2)", backdropFilter:"blur(10px)" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", letterSpacing:"0.15em", fontWeight:600, marginBottom:20 }}>INGRESA TU PIN</div>
          <div style={{ display:"flex", justifyContent:"center", gap:14, marginBottom:20, animation:shake?"shake 0.4s":"none" }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width:14, height:14, borderRadius:"50%", background:i<pin.length?"#AACC71":"rgba(255,255,255,0.15)", transition:"all 0.15s", transform:i<pin.length?"scale(1.2)":"scale(1)" }} />)}
          </div>
          {err && <div style={{ fontSize:12, color:"#EF4444", fontWeight:700, marginBottom:12 }}>{err}</div>}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {KEYS.map((k,i) => (
              <button key={i}
                onClick={() => k === "X" ? setPin(p => { setErr(""); return p.slice(0,-1); }) : (k ? press(k) : null)}
                disabled={!k}
                style={{ height:58, borderRadius:13, border:"1px solid rgba(255,255,255,0.1)", fontSize:k==="X"?18:22, fontWeight:700, cursor:k?"pointer":"default", background:k?"rgba(255,255,255,0.08)":"transparent", color:k?"white":"transparent", transition:"all 0.12s" }}
              >{k}</button>
            ))}
          </div>
          <div style={{ marginTop:18, fontSize:11, color:"rgba(255,255,255,0.25)" }}>Contacta al admin si olvidaste tu PIN</div>
        </div>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

// ---- User Manager -----------------------------------------------------------
function UserMgr({ users, onSave, onClose, dark }) {
  const t = getT(dark);
  const [list, setList] = useState(users.map(u => ({...u})));
  const [editing, setEditing] = useState(null);
  const [p1, setP1] = useState(""); const [p2, setP2] = useState(""); const [pe, setPe] = useState("");
  const COLORS = ["#AACC71","#EF4444","#8B5CF6","#10B981","#3B82F6","#EC4899","#F97316","#6B7280"];
  const saveU = () => {
    if (p1) { if (p1.length!==4||!/^\d{4}$/.test(p1)) { setPe("PIN debe ser 4 digitos"); return; } if (p1!==p2) { setPe("PINs no coinciden"); return; } const dup=list.find(u=>u.id!==editing.id&&u.pin===p1); if(dup){setPe("PIN ya usado por "+dup.name);return;} editing.pin=p1; }
    setList(l => l.map(u => u.id===editing.id ? editing : u)); setEditing(null);
  };
  const missing = STAFF.filter(n => !list.find(u => u.name===n));
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:t.surf, borderRadius:22, width:"100%", maxWidth:540, maxHeight:"88vh", overflow:"auto", padding:26, border:"1px solid " + t.bord }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
          <h2 style={{ margin:0, fontSize:18, color:t.text }}>Usuarios</h2>
          <button onClick={onClose} style={{ background:t.surf2, border:"none", borderRadius:8, padding:"5px 12px", cursor:"pointer", fontWeight:700, color:t.text2 }}>Cerrar</button>
        </div>
        {missing.length > 0 && (
          <div style={{ marginBottom:14, padding:"10px 13px", borderRadius:11, background:t.accBg, border:"1px solid " + t.acc + "30" }}>
            <div style={{ fontSize:11, fontWeight:800, color:t.accD, marginBottom:7 }}>AGREGAR DEL EQUIPO</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {missing.map(n => <button key={n} onClick={() => setList(l => [...l, {id:mkId(),name:n,pin:"",isAdmin:false,homePanel:"dashboard",color:"#6B7280"}])} style={{ padding:"4px 11px", borderRadius:7, border:"1.5px solid " + t.acc + "40", background:t.surf, color:t.acc, fontWeight:700, fontSize:12, cursor:"pointer" }}>+ {n}</button>)}
            </div>
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {list.map(u => (
            <div key={u.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 13px", borderRadius:11, border:"1.5px solid " + t.bord, background:t.surf2 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:u.color||"#9CA3AF", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:800, fontSize:13, flexShrink:0 }}>{u.name.slice(0,2).toUpperCase()}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13, color:t.text }}>{u.name} {u.isAdmin && <span style={{ background:t.accBg, color:t.acc, borderRadius:99, padding:"1px 7px", fontSize:10, fontWeight:800 }}>ADMIN</span>}</div>
                <div style={{ fontSize:11, color:t.text3, marginTop:1 }}>PIN: {u.pin?"••••":"sin asignar"} | Panel: {HOME_PANELS.find(p=>p.id===u.homePanel)?.label||"—"}</div>
              </div>
              <button onClick={() => {setEditing({...u});setP1("");setP2("");setPe("");}} style={{ padding:"5px 12px", borderRadius:8, border:"1.5px solid " + t.acc + "40", background:t.surf, color:t.acc, fontWeight:700, fontSize:12, cursor:"pointer" }}>Editar</button>
              {!u.isAdmin && <button onClick={() => setList(l=>l.filter(x=>x.id!==u.id))} style={{ padding:"5px 10px", borderRadius:8, border:"1.5px solid #FECACA", background:"#FEF2F2", color:"#EF4444", fontWeight:700, fontSize:12, cursor:"pointer" }}>X</button>}
            </div>
          ))}
        </div>
        {editing && (
          <div style={{ marginTop:18, padding:16, borderRadius:14, border:"2px solid " + t.acc + "40", background:t.accBg }}>
            <div style={{ fontWeight:800, fontSize:13, color:t.text, marginBottom:12 }}>Editando: {editing.name}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11, marginBottom:11 }}>
              <div><Lbl dark={dark}>PANEL DE INICIO</Lbl><select value={editing.homePanel} onChange={e=>setEditing(ed=>({...ed,homePanel:e.target.value}))} style={{ ...inp(dark,false), cursor:"pointer" }}>{HOME_PANELS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
              <div><Lbl dark={dark}>COLOR</Lbl><div style={{ display:"flex", gap:6, marginTop:4 }}>{COLORS.map(c=><div key={c} onClick={()=>setEditing(ed=>({...ed,color:c}))} style={{ width:24, height:24, borderRadius:"50%", background:c, cursor:"pointer", border:editing.color===c?"3px solid white":"3px solid transparent", boxSizing:"border-box" }} />)}</div></div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11 }}>
              <div><Lbl dark={dark}>NUEVO PIN</Lbl><input type="password" inputMode="numeric" maxLength={4} value={p1} onChange={e=>setP1(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••" style={inp(dark,false)} /></div>
              <div><Lbl dark={dark}>CONFIRMAR PIN</Lbl><input type="password" inputMode="numeric" maxLength={4} value={p2} onChange={e=>setP2(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••" style={inp(dark,false)} /></div>
            </div>
            {pe && <div style={{ fontSize:12, color:"#EF4444", fontWeight:700, marginTop:7 }}>{pe}</div>}
            <div style={{ fontSize:11, color:t.text3, marginTop:5 }}>{editing.pin?"Deja vacio para no cambiar.":"Sin PIN asignado aun."}</div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
              <button onClick={()=>setEditing(null)} style={{ padding:"7px 15px", borderRadius:9, border:"1.5px solid " + t.bord, background:t.surf, color:t.text2, fontWeight:600, cursor:"pointer", fontSize:12 }}>Cancelar</button>
              <button onClick={saveU} style={{ padding:"7px 18px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#143B31,#AACC71)", color:"white", fontWeight:700, cursor:"pointer", fontSize:12 }}>Guardar</button>
            </div>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:18 }}>
          <button onClick={() => onSave(list)} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#143B31,#AACC71)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13 }}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

// ---- Form Tab Sections ------------------------------------------------------

// ---- New Package Form -------------------------------------------------------
function NewPackageForm({ dark, dog, onSave }) {
  const t = getT(dark);
  const [visits, setVisits] = useState(dog.package?.visits || 4);
  const [hours, setHours]   = useState(dog.package?.hoursPerVisit || 4);
  const price = getPkgPrice(visits, hours);
  const today = new Date().toISOString().slice(0,10);

  const save = () => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 31);
    onSave({
      active: true,
      visits,
      hoursPerVisit: hours,
      price,
      startDate: start.toISOString().slice(0,10),
      endDate: end.toISOString().slice(0,10),
      remainingVisits: visits,
      usedVisits: 0,
    });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div>
        <Lbl dark={dark}>VISITAS AL MES</Lbl>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {PKG_VISITS.map(v => (
            <button key={v} onClick={() => setVisits(v)} style={{ padding:"8px 18px", borderRadius:10, border:"2px solid "+(visits===v?t.acc:t.bord), background:visits===v?t.accBg:t.surf, color:visits===v?t.accD:t.text2, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {v}x <span style={{ fontSize:10, fontWeight:600, opacity:0.7 }}>({v===4?"1/sem":v===8?"2/sem":v===12?"3/sem":"4/sem"})</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Lbl dark={dark}>HORAS POR VISITA</Lbl>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {PKG_HOURS.map(h => (
            <button key={h} onClick={() => setHours(h)} style={{ padding:"8px 18px", borderRadius:10, border:"2px solid "+(hours===h?t.acc:t.bord), background:hours===h?t.accBg:t.surf, color:hours===h?t.accD:t.text2, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {h}h
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding:"12px 16px", borderRadius:12, background:t.accBg, border:"1px solid "+t.acc+"40", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:11, color:t.accD, fontWeight:700 }}>PRECIO DEL PAQUETE</div>
          <div style={{ fontSize:22, fontWeight:900, color:t.accD }}>${price.toLocaleString()} <span style={{ fontSize:12, fontWeight:600, opacity:0.7 }}>/ mes</span></div>
        </div>
        <div style={{ fontSize:11, color:t.text2, textAlign:"right" }}>
          <div>{visits} visitas · {hours}h c/u</div>
          <div>Vigencia: 31 días</div>
        </div>
      </div>
      <button onClick={save} style={{ padding:"11px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#35201E,#143B31)", color:"white", fontWeight:700, fontSize:14, cursor:"pointer" }}>
        ✅ Activar paquete
      </button>
    </div>
  );
}


// ---- Quick Package Activation from Daycare Panel ---------------------------
function PkgQuickActivate({ dark, session, dogs }) {
  const t = getT(dark);
  const [open, setOpen] = useState(false);
  const [visits, setVisits] = useState(4);
  const [hours, setHours] = useState(4);
  const price = getPkgPrice(visits, hours);

  const activate = async () => {
    const dog = dogs.find(d => d.id === session.dogId);
    if (!dog) return;
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 31);
    const pkg = {
      active: true, visits, hoursPerVisit: hours, price,
      startDate: start.toISOString().slice(0,10),
      endDate: end.toISOString().slice(0,10),
      remainingVisits: visits - 1, // already using 1 visit today
      usedVisits: 1,
    };
    await setDoc(doc(db, "dogs", dog.id), { ...dog, package: pkg });
    // Update session to reflect package
    await setDoc(doc(db, "daycare_sessions", session.id), { ...session, hasPackage: true, packageHours: hours });
    setOpen(false);
  };

  if (open) return (
    <div style={{ marginTop:8, padding:"12px", borderRadius:12, background:t.accBg, border:"1px solid "+t.acc+"40" }}>
      <div style={{ fontWeight:800, fontSize:12, color:t.accD, marginBottom:10 }}>ACTIVAR PAQUETE</div>
      <div style={{ marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:700, color:t.text3, marginBottom:5 }}>VISITAS AL MES</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {PKG_VISITS.map(v => (
            <button key={v} onClick={() => setVisits(v)} style={{ padding:"5px 12px", borderRadius:8, border:"1.5px solid "+(visits===v?t.acc:t.bord), background:visits===v?t.accBg:"transparent", color:visits===v?t.accD:t.text2, fontWeight:700, fontSize:12, cursor:"pointer" }}>{v}x</button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:10, fontWeight:700, color:t.text3, marginBottom:5 }}>HORAS POR VISITA</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {PKG_HOURS.map(h => (
            <button key={h} onClick={() => setHours(h)} style={{ padding:"5px 12px", borderRadius:8, border:"1.5px solid "+(hours===h?t.acc:t.bord), background:hours===h?t.accBg:"transparent", color:hours===h?t.accD:t.text2, fontWeight:700, fontSize:12, cursor:"pointer" }}>{h}h</button>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontWeight:900, fontSize:16, color:t.accD }}>${price.toLocaleString()}</div>
        <div style={{ fontSize:11, color:t.text3 }}>{visits} visitas · {hours}h c/u · 31 días</div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={() => setOpen(false)} style={{ flex:1, padding:"8px", borderRadius:9, border:"1px solid "+t.bord, background:"transparent", color:t.text2, fontWeight:700, fontSize:12, cursor:"pointer" }}>Cancelar</button>
        <button onClick={activate} style={{ flex:2, padding:"8px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#C1712C,#F8D061)", color:"white", fontWeight:700, fontSize:12, cursor:"pointer" }}>★ Activar paquete</button>
      </div>
    </div>
  );

  return (
    <button onClick={() => setOpen(true)} style={{ width:"100%", marginTop:6, padding:"7px", borderRadius:9, border:"1.5px dashed "+t.bord, background:"transparent", color:t.text3, fontWeight:600, fontSize:12, cursor:"pointer" }}>
      + Activar paquete
    </button>
  );
}

const FORM_TABS = [{id:"perrito",label:"🐾 Perrito"},{id:"tutor",label:"👤 Tutor"},{id:"salud",label:"🏥 Salud"},{id:"alimentacion",label:"🍽 Aliment."},{id:"comportamiento",label:"🧠 Comport."},{id:"vacunas",label:"💉 Vacunas"},{id:"cuidador",label:"📋 Cuidador"},{id:"grooming",label:"✂ Grooming"},{id:"responsivas",label:"📄 Responsivas"},{id:"hotel",label:"🏨 Hotel"},{id:"seguimiento",label:"🚨 Seguimiento"},{id:"paquete",label:"📦 Paquete"}];

function DogForm({ initial, onSave, onCancel, isAdmin, currentUser, dark }) {
  const t = getT(dark);
  const [dog, setDog] = useState(initial ? {...defDog(),...initial} : defDog());
  const [tab, setTab] = useState(isAdmin ? "perrito" : "alimentacion");
  const set = (k,v) => setDog(d => ({...d, [k]:v}));
  const setVac = (vid,f,val) => setDog(d => ({...d, vaccinations:{...d.vaccinations, [vid]:{...d.vaccinations[vid],[f]:val}}}));
  const miss = pmiss(dog);
  const ro = id => !isAdmin && !STAFF_EDITABLE.has(id);
  const COLORS = ["#AACC71","#EF4444","#8B5CF6","#10B981","#3B82F6","#EC4899","#F97316","#6B7280"];
  const tabs = FORM_TABS.map(tb => tb.id==="responsivas" && isAdmin && miss.length>0 ? {...tb, badge:miss.length} : tb);
  const meals = [{key:"morning",label:"MANANA"},{key:"afternoon",label:"TARDE"},{key:"evening",label:"NOCHE"}];
  const stays = dog.hotelStays || [];
  const [showNS, setShowNS] = useState(false);
  const [ns, setNs] = useState({checkIn:"",checkOut:""});
  const c = dog.care || {};
  const sc = k => v => set("care", {...c, [k]:v});
  const g = dog.grooming || {};
  const sg = k => v => set("grooming", {...g, [k]:v});
  const resp = dog.responsivas || {};
  return (
    <div style={{ background:t.surf, borderRadius:20, padding:26, display:"flex", flexDirection:"column", gap:18, border:"1px solid " + t.bord }}>
      <div style={{ display:"flex", alignItems:"center", gap:13 }}>
        <DogAvatar dog={dog} size={50} />
        <div>
          <h2 style={{ margin:0, fontSize:19, color:t.text }}>{initial ? "Editar expediente" : "Nuevo expediente"}</h2>
          {dog.name && <div style={{ fontSize:13, color:t.text2, marginTop:2 }}>{dog.name}{dog.breed ? " - " + dog.breed : ""}</div>}
          {miss.length > 0 && isAdmin && <div style={{ fontSize:11, color:t.acc, marginTop:2 }}>Faltan: {miss.join(" - ")}</div>}
        </div>
      </div>
      <TabBar tabs={tabs} active={tab} onChange={setTab} dark={dark} />
      <div style={{ minHeight:340 }}>
        {tab === "perrito" && (
          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            {ro("perrito") && <ROBanner dark={dark} />}
            {!ro("perrito") && <div><Lbl dark={dark}>COLOR DE AVATAR</Lbl><div style={{ display:"flex", gap:8 }}>{COLORS.map(c2 => <div key={c2} onClick={() => set("photoColor",c2)} style={{ width:26,height:26,borderRadius:"50%",background:c2,cursor:"pointer",border:dog.photoColor===c2?"3px solid white":"3px solid transparent",boxSizing:"border-box" }} />)}</div></div>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field dark={dark} label="NOMBRE" value={dog.name} onChange={ro("perrito")?null:v=>set("name",v)} placeholder="Max" />
              <Sel dark={dark} label="RAZA" options={BREEDS} value={dog.breed} onChange={ro("perrito")?null:v=>set("breed",v)} disabled={ro("perrito")} />
              <Radio dark={dark} label="SEXO" value={dog.sex} onChange={ro("perrito")?null:v=>set("sex",v)} options={[{value:"Macho",label:"Macho"},{value:"Hembra",label:"Hembra"}]} disabled={ro("perrito")} />
              <div>
                <Lbl dark={dark}>EDAD</Lbl>
                <div style={{ padding:"10px 12px", borderRadius:10, border:"1.5px solid "+t.bord, fontSize:13, background:t.surf2, color:dog.birthdate?t.text:t.text3, boxSizing:"border-box" }}>
                  {dog.birthdate ? (calcAge(dog.birthdate)||"—") + " (calculado)" : "Se calcula con la fecha de nacimiento"}
                </div>
              </div>
              <Field dark={dark} label="PESO" value={dog.weight} onChange={ro("perrito")?null:v=>set("weight",v)} placeholder="12 kg" />
              <Field dark={dark} label="COLOR / SENAS" value={dog.color} onChange={ro("perrito")?null:v=>set("color",v)} placeholder="Dorado" />
            </div>
            <div style={{ gridColumn:"1 / -1" }}>
              {ro("perrito")
                ? <Field dark={dark} label="FECHA DE NACIMIENTO" value={dog.birthdate} disabled />
                : <DatePicker dark={dark} label="FECHA DE NACIMIENTO" value={dog.birthdate} onChange={v=>set("birthdate",v)} />
              }
            </div>
            <Radio dark={dark} label="ESTERILIZADO?" value={dog.sterilized} onChange={ro("perrito")?null:v=>set("sterilized",v)} options={[{value:"Si",label:"Si"},{value:"No",label:"No"}]} disabled={ro("perrito")} />
            {dog.sex==="Hembra" && dog.sterilized==="No" && <Field dark={dark} label="ULTIMO CELO" value={dog.lastCelo} onChange={ro("perrito")?null:v=>set("lastCelo",v)} type="date" />}
            <div>
              <Lbl dark={dark}>AREAS / SERVICIOS ASIGNADOS</Lbl>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {AREAS.map(a => {
                  const active = (dog.areas||[]).includes(a);
                  const AREA_COLORS = { Guarderia:"#22C55E", Hotel:"#3B82F6", Grooming:"#EC4899", Adiestramiento:"#8B5CF6", "Day Pass Personalizado":"#C1712C" };
                  const ac = AREA_COLORS[a] || "#6B7280";
                  return (
                    <button key={a} onClick={() => { if (ro("perrito")) return; const cur = dog.areas||[]; set("areas", active ? cur.filter(x=>x!==a) : [...cur, a]); }}
                      style={{ padding:"8px 18px", borderRadius:99, border:"2px solid " + (active ? ac : t.bord), background:active ? ac + "20" : t.surf, color:active ? ac : t.text2, fontWeight:700, fontSize:13, cursor:ro("perrito")?"default":"pointer", transition:"all 0.15s", display:"flex", alignItems:"center", gap:6 }}>
                      {active && <span style={{ width:8, height:8, borderRadius:"50%", background:ac, display:"inline-block" }} />}
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {tab === "tutor" && (
          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            {ro("tutor") && <ROBanner dark={dark} />}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field dark={dark} label="NOMBRE" value={dog.owner} onChange={ro("tutor")?null:v=>set("owner",v)} placeholder="Carlos Garcia" />
              <Field dark={dark} label="TELEFONO" value={dog.phone} onChange={ro("tutor")?null:v=>set("phone",v)} type="tel" />
            </div>
            <TA dark={dark} label="PERSONAS AUTORIZADAS PARA RECOGER" value={dog.authorizedPeople} onChange={ro("tutor")?null:v=>set("authorizedPeople",v)} rows={3} />
            <SecTitle dark={dark}>VETERINARIO DE EMERGENCIAS</SecTitle>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field dark={dark} label="NOMBRE VET." value={dog.emergencyVet} onChange={ro("tutor")?null:v=>set("emergencyVet",v)} placeholder="Dra. Lopez" />
              <Field dark={dark} label="TELEFONO VET." value={dog.emergencyVetPhone} onChange={ro("tutor")?null:v=>set("emergencyVetPhone",v)} type="tel" />
            </div>
          </div>
        )}
        {tab === "salud" && (
          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            {ro("salud") && <ROBanner dark={dark} />}
            <TA dark={dark} label="ALERGIAS O SENSIBILIDADES" value={dog.allergies} onChange={ro("salud")?null:v=>set("allergies",v)} placeholder="e.g. Alergia al pollo..." />
            <TA dark={dark} label="CONDICIONES MEDICAS" value={dog.medicalConditions} onChange={ro("salud")?null:v=>set("medicalConditions",v)} />
            <TA dark={dark} label="MEDICAMENTOS ACTUALES" value={dog.medications} onChange={ro("salud")?null:v=>set("medications",v)} placeholder="e.g. Fenobarbital..." />
            <div>
              <Lbl dark={dark}>DOSIS Y FRECUENCIA</Lbl>
              {!dog.medications?.trim() && <p style={{ fontSize:11, color:t.text3, margin:"0 0 5px", fontStyle:"italic" }}>Completa medicamentos para habilitar.</p>}
              <textarea value={dog.dosage||""} onChange={e=>set("dosage",e.target.value)} rows={2} disabled={ro("salud")||!dog.medications?.trim()} style={{ ...inp(dark, ro("salud")||!dog.medications?.trim()), resize:"vertical", fontFamily:"inherit" }} placeholder="e.g. 30mg cada 12hrs..." />
            </div>
          </div>
        )}
        {tab === "alimentacion" && (
          <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field dark={dark} label="PRODUCTO / MARCA" value={dog.foodProduct} onChange={v=>set("foodProduct",v)} placeholder="Royal Canin Medium" />
              <Field dark={dark} label="MEDIDA DE PORCION" value={dog.foodMeasure} onChange={v=>set("foodMeasure",v)} placeholder="1 taza, 120g" />
            </div>
            <SecTitle dark={dark}>HORARIOS</SecTitle>
            {meals.map(m => (
              <div key={m.key} style={{ display:"grid", gridTemplateColumns:"auto 1fr 1fr", gap:12, alignItems:"center", padding:"11px 13px", borderRadius:11, background:t.accBg, border:"1px solid " + t.acc + "30" }}>
                <span style={{ fontSize:14, fontWeight:700, color:t.accD, width:55 }}>{m.label}</span>
                <Field dark={dark} label="HORA" value={dog[m.key+"Time"]} onChange={v=>set(m.key+"Time",v)} type="time" />
                <Field dark={dark} label="CANTIDAD" value={dog[m.key+"Amount"]} onChange={v=>set(m.key+"Amount",v)} placeholder="120g" />
              </div>
            ))}
            <TA dark={dark} label="NOTAS ADICIONALES" value={dog.extraFoodNotes} onChange={v=>set("extraFoodNotes",v)} placeholder="Restricciones, alimentos prohibidos..." rows={2} />
            <SecTitle dark={dark}>PREMIOS</SecTitle>
            <Radio dark={dark} label="PUEDE COMER PREMIOS?" value={dog.treatsAllowed} onChange={v=>set("treatsAllowed",v)} options={[{value:"si",label:"Si"},{value:"no",label:"No"},{value:"tutor",label:"Solo del tutor"}]} />
            {dog.treatsAllowed==="tutor" && <TA dark={dark} label="PREMIOS DEL TUTOR" value={dog.tutorTreats} onChange={v=>set("tutorTreats",v)} rows={2} />}
          </div>
        )}
        {tab === "comportamiento" && (
          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            {ro("comportamiento") && <ROBanner dark={dark} />}
            <TA dark={dark} label="COMO SE LLEVA CON LAS PERSONAS?" value={dog.relationWithPeople} onChange={ro("comportamiento")?null:v=>set("relationWithPeople",v)} rows={3} />
            <TA dark={dark} label="MIEDOS O FOBIAS" value={dog.fearsPhobias} onChange={ro("comportamiento")?null:v=>set("fearsPhobias",v)} rows={3} />
            <TA dark={dark} label="INSTRUCCIONES ESPECIALES DE MANEJO" value={dog.handlingInstructions} onChange={ro("comportamiento")?null:v=>set("handlingInstructions",v)} rows={4} />
            <Radio dark={dark} label="AUTORIZACION ATENCION VET. EMERGENCIA" value={dog.vetEmergencyAuth} onChange={ro("comportamiento")?null:v=>set("vetEmergencyAuth",v)} options={[{value:"Si",label:"Si, autorizo"},{value:"No",label:"No autorizo"}]} disabled={ro("comportamiento")} />
          </div>
        )}
        {tab === "vacunas" && (
          <div>
            {ro("vacunas") && <ROBanner dark={dark} />}
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {VACCINES.map(v => <VacRow key={v.id} dark={dark} vac={dog.vaccinations?.[v.id]} label={v.label} icon={v.icon} onChange={ro("vacunas")?null:(f,val)=>setVac(v.id,f,val)} />)}
            </div>
          </div>
        )}
        {tab === "cuidador" && (
          <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
            <SecTitle dark={dark}>PRUEBA DE CONDUCTA</SecTitle>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {Object.entries(BRESULT).map(([key,m]) => (
                <div key={key} onClick={() => set("care",{...c,result:key})} style={{ padding:"9px 7px", borderRadius:11, textAlign:"center", cursor:"pointer", border:"2px solid " + (c.result===key?m.border:t.bord), background:c.result===key?m.bg:t.surf, transition:"all 0.15s" }}>
                  <div style={{ fontSize:20, marginBottom:3 }}>{m.icon}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:c.result===key?m.color:t.text3, lineHeight:1.3 }}>{m.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field dark={dark} label="FECHA EVALUACION" value={c.date||""} onChange={sc("date")} type="date" />
              <Field dark={dark} label="EVALUADOR" value={c.evaluator||""} onChange={sc("evaluator")} placeholder="Nombre" />
            </div>
            <div>
              <Lbl dark={dark}>CRITERIOS DE EVALUACION</Lbl>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {BCRITERIA.map(cr => (
                  <div key={cr.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 13px", borderRadius:10, background:t.surf2, border:"1px solid " + t.bord }}>
                    <span style={{ fontSize:13, color:t.text, fontWeight:600 }}>{cr.label}</span>
                    <div style={{ display:"flex", gap:4 }}>
                      {Object.entries(SCORE_META).reverse().map(([s,sm]) => { const a = c.scores?.[cr.id]===Number(s); return <button key={s} onClick={()=>set("care",{...c,scores:{...c.scores,[cr.id]:Number(s)}})} style={{ padding:"3px 8px", borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer", border:"1.5px solid " + (a?sm.color:t.bord), background:a?sm.color+"20":t.surf, color:a?sm.color:t.text3 }}>{sm.label}</button>; })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {c.result==="training" && <Field dark={dark} label="ENTRENADOR ASIGNADO" value={c.trainer||""} onChange={sc("trainer")} placeholder="Nombre del entrenador" />}
            <SecTitle dark={dark}>NOTAS DEL CUIDADOR</SecTitle>
            <TA dark={dark} label="COMPORTAMIENTO AL INGRESAR" value={c.behaviorAtEntry||""} onChange={sc("behaviorAtEntry")} rows={2} />
            <TA dark={dark} label="INTERACCION CON OTROS PERROS" value={c.dogInteraction||""} onChange={sc("dogInteraction")} rows={2} />
            <TA dark={dark} label="INTERACCION CON EL PERSONAL" value={c.staffInteraction||""} onChange={sc("staffInteraction")} rows={2} />
            <TA dark={dark} label="HABITOS DE ALIMENTACION E HIDRATACION" value={c.foodHabits||""} onChange={sc("foodHabits")} rows={2} />
            <TA dark={dark} label="COMPORTAMIENTO DURANTE EL JUEGO" value={c.playBehavior||""} onChange={sc("playBehavior")} rows={2} />
            <div>
              <Lbl dark={dark}>NIVEL DE SUPERVISION REQUERIDO</Lbl>
              <div style={{ display:"flex", gap:8 }}>
                {Object.entries(SUPV).map(([key,s]) => <button key={key} onClick={() => set("care",{...c,supervisionLevel:key})} style={{ flex:1, padding:"9px 0", borderRadius:10, border:"2px solid " + (c.supervisionLevel===key?s.color:t.bord), background:c.supervisionLevel===key?s.bg:t.surf, color:c.supervisionLevel===key?s.color:t.text3, fontWeight:800, fontSize:13, cursor:"pointer" }}>{s.label}</button>)}
              </div>
            </div>
            <TA dark={dark} label="ACTITUD DURANTE EL DESCANSO" value={c.restBehavior||""} onChange={sc("restBehavior")} rows={2} />
            <TA dark={dark} label="OBSERVACIONES ADICIONALES" value={c.notes||""} onChange={sc("notes")} rows={2} />
          </div>
        )}
        {tab === "grooming" && (
          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
              <Field dark={dark} label="ULTIMO SERVICIO" value={g.lastDate||""} onChange={sg("lastDate")} type="date" />
              <Field dark={dark} label="ESTILISTA" value={g.stylist||""} onChange={sg("stylist")} placeholder="Nombre" />
              <Field dark={dark} label="TIPO DE SERVICIO" value={g.lastService||""} onChange={sg("lastService")} placeholder="Banho + corte" />
            </div>
            <TA dark={dark} label="DURANTE EL BANHO" value={g.bathReactions||""} onChange={sg("bathReactions")} rows={2} />
            <TA dark={dark} label="DURANTE EL SECADO" value={g.dryingReactions||""} onChange={sg("dryingReactions")} rows={2} />
            <TA dark={dark} label="CORTE / ARREGLO" value={g.cutReactions||""} onChange={sg("cutReactions")} rows={2} />
            <TA dark={dark} label="CORTE DE UNAS" value={g.nailReactions||""} onChange={sg("nailReactions")} rows={2} />
            <TA dark={dark} label="LIMPIEZA DE OIDOS" value={g.earsReactions||""} onChange={sg("earsReactions")} rows={2} />
            <TA dark={dark} label="NOTAS GENERALES" value={g.notes||""} onChange={sg("notes")} rows={2} />
          </div>
        )}
        {tab === "responsivas" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            {ro("responsivas") && <ROBanner dark={dark} />}
            {miss.length > 0 ? <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:11, background:t.accBg, border:"1.5px solid " + t.acc + "40" }}><span>⚠</span><div><div style={{ fontWeight:700, fontSize:13, color:t.accD }}>Perfil incompleto</div><div style={{ fontSize:12, color:t.text2 }}>Faltan: {miss.join(" - ")}</div></div></div> : <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:11, background:"#F0FDF4", border:"1.5px solid #86EFAC" }}><span>✅</span><div style={{ fontWeight:700, color:"#15803D" }}>Responsivas completas</div></div>}
            {[{key:"guarderia",label:"Responsiva de Guarderia"},{key:"hotel",label:"Responsiva de Hotel"}].map(({key,label}) => (
              <div key={key}><div style={{ fontWeight:800, fontSize:13, color:t.text, marginBottom:9 }}>{label}</div>
                {ro("responsivas") ? <div style={{ padding:"12px 15px", borderRadius:11, background:resp[key]?"#F0FDF4":"#FEF2F2", border:"1.5px solid " + (resp[key]?"#86EFAC":"#FECACA"), fontSize:13, color:resp[key]?"#22C55E":"#EF4444", fontWeight:600 }}>{resp[key] ? "✅ " + resp[key].name : "Sin cargar"}</div>
                  : <PdfUpload dark={dark} label={label} value={resp[key]} onChange={v=>set("responsivas",{...resp,[key]:v})} />}
              </div>
            ))}
          </div>
        )}
        {tab === "hotel" && (
          <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div><div style={{ fontWeight:800, fontSize:15, color:t.text }}>Historial de Hotel</div><div style={{ fontSize:12, color:t.text3, marginTop:1 }}>{stays.length} estancia{stays.length!==1?"s":""}</div></div>
              {!showNS && <button onClick={() => setShowNS(true)} style={{ padding:"8px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#143B31,#AACC71)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13 }}>+ Nueva estancia</button>}
            </div>
            {showNS && (
              <div style={{ background:t.accBg, border:"1.5px solid " + t.acc + "40", borderRadius:13, padding:"15px 17px", display:"flex", flexDirection:"column", gap:11 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11 }}>
                  <Field dark={dark} label="FECHA INGRESO" value={ns.checkIn} onChange={v=>setNs(s=>({...s,checkIn:v}))} type="date" />
                  <Field dark={dark} label="FECHA SALIDA" value={ns.checkOut} onChange={v=>setNs(s=>({...s,checkOut:v}))} type="date" />
                </div>
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <button onClick={()=>setShowNS(false)} style={{ padding:"7px 15px", borderRadius:9, border:"1.5px solid " + t.bord, background:t.surf, color:t.text2, fontWeight:600, cursor:"pointer", fontSize:12 }}>Cancelar</button>
                  <button onClick={() => { set("hotelStays",[...stays,{id:mkId(),checkIn:ns.checkIn,checkOut:ns.checkOut,notes:"",incidents:[]}]); setNs({checkIn:"",checkOut:""}); setShowNS(false); }} style={{ padding:"7px 16px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#143B31,#AACC71)", color:"white", fontWeight:700, cursor:"pointer", fontSize:12 }}>Crear</button>
                </div>
              </div>
            )}
            {stays.slice().reverse().map(stay => (
              <StayCard key={stay.id} dark={dark} stay={stay} dog={dog} currentUser={currentUser}
                onDelete={() => { if (confirm("Eliminar estancia?")) set("hotelStays", stays.filter(s=>s.id!==stay.id)); }}
                onChange={u => set("hotelStays", stays.map(s=>s.id===stay.id?u:s))} />
            ))}
          </div>
        )}
        
          {tab === "paquete" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* Current package status */}
              {dog.package?.active && (() => {
                const st = pkgStatus(dog.package);
                const days = pkgDaysLeft(dog.package);
                const statusColors = {
                  active:   { bg:"#E8F0DC", color:"#143B31", border:"#AACC71" },
                  expiring: { bg:"#FFFBEB", color:"#D97706", border:"#F59E0B" },
                  expired:  { bg:"#FEF2F2", color:"#EF4444", border:"#FECACA" },
                  used:     { bg:"#FEF2F2", color:"#EF4444", border:"#FECACA" },
                };
                const sc = statusColors[st] || statusColors.active;
                return (
                  <div style={{ padding:"14px 16px", borderRadius:14, background:sc.bg, border:"1.5px solid "+sc.border }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                      <div style={{ fontWeight:800, fontSize:14, color:sc.color }}>
                        {st==="active" ? "✅ Paquete activo" : st==="expiring" ? "⚠ Vence pronto" : st==="used" ? "⛔ Visitas agotadas" : "❌ Paquete vencido"}
                      </div>
                      {isAdmin && <button onClick={() => {if(confirm("¿Desactivar paquete?")) set("package",{...dog.package,active:false});}} style={{ background:"none", border:"none", color:"#EF4444", fontSize:12, cursor:"pointer", fontWeight:700 }}>Desactivar</button>}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      {[
                        ["Visitas/mes", dog.package.visits],
                        ["Hrs/visita", dog.package.hoursPerVisit+"h"],
                        ["Precio", "$"+getPkgPrice(dog.package.visits, dog.package.hoursPerVisit).toLocaleString()],
                        ["Usadas", dog.package.usedVisits||0],
                        ["Restantes", dog.package.remainingVisits],
                        ["Vence en", days < 0 ? "Vencido" : days+"d"],
                      ].map(([l,v]) => (
                        <div key={l} style={{ background:"rgba(255,255,255,0.5)", borderRadius:10, padding:"8px 10px" }}>
                          <div style={{ fontSize:9, fontWeight:800, color:sc.color, opacity:0.7, letterSpacing:"0.08em" }}>{l}</div>
                          <div style={{ fontSize:15, fontWeight:900, color:sc.color }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {dog.phone && (
                      <button onClick={() => {
                        const st2 = pkgStatus(dog.package);
                        const days2 = pkgDaysLeft(dog.package);
                        const rem = dog.package.remainingVisits;
                        let msg = "Hola " + (dog.owner||"") + "! Te contactamos de *Paw Park* 🐾\n\n";
                        msg += "*" + dog.name + "* tiene un paquete ";
                        if (st2 === "expiring") msg += "que *vence en " + days2 + " días*. ";
                        if (st2 === "expired") msg += "que *ya venció*. ";
                        if (st2 === "used") msg += "con *visitas agotadas*. ";
                        msg += "\n\nVisitas restantes: *" + rem + "*\n";
                        msg += "¿Te gustaría renovarlo? 😊";
                        openWA(dog.phone, msg);
                      }} style={{ marginTop:10, width:"100%", padding:"9px", borderRadius:10, border:"none", background:"#25D366", color:"white", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                        📱 Enviar recordatorio WhatsApp
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* New package form */}
              {(isAdmin || currentUser?.isDaycare) && (
                <div style={{ padding:"16px", borderRadius:14, border:"1.5px solid "+t.bord, background:t.surf2 }}>
                  <div style={{ fontWeight:800, fontSize:13, color:t.text, marginBottom:14 }}>
                    {dog.package?.active ? "Renovar paquete" : "Contratar paquete"}
                  </div>
                  <NewPackageForm dark={dark} dog={dog} onSave={pkg => set("package", pkg)} />
                </div>
              )}
            </div>
          )}

          {tab === "seguimiento" && (
          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            <TA dark={dark} label="OBSERVACIONES DE SALUD (PIEL, OJOS, HECES, ETC.)" value={dog.incidents?.healthObservations||""} onChange={v=>set("incidents",{...(dog.incidents||{}),healthObservations:v})} rows={3} />
            <TA dark={dark} label="RECOMENDACIONES PARA FUTURAS VISITAS" value={dog.incidents?.futureRecommendations||""} onChange={v=>set("incidents",{...(dog.incidents||{}),futureRecommendations:v})} rows={4} />
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"space-between", paddingTop:5, borderTop:"1px solid " + t.bord }}>
        <div style={{ display:"flex", gap:5, alignItems:"center" }}>{FORM_TABS.map(tb => <button key={tb.id} onClick={()=>setTab(tb.id)} title={tb.label} style={{ width:8, height:8, borderRadius:"50%", border:"none", background:tab===tb.id?t.acc:t.bord, cursor:"pointer", padding:0 }} />)}</div>
        <div style={{ display:"flex", gap:9 }}>
          <button onClick={onCancel} style={{ padding:"9px 22px", borderRadius:10, border:"1.5px solid " + t.bord, background:t.surf, color:t.text2, fontWeight:600, cursor:"pointer", fontSize:13 }}>Cancelar</button>
          <button onClick={() => onSave(dog)} style={{ padding:"9px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#143B31,#AACC71)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13, boxShadow:"0 4px 12px #143B3140" }}>Guardar expediente</button>
        </div>
      </div>
    </div>
  );
}

// ---- Detail View Component --------------------------------------------------
function DetailView({dog, dark, isAdmin, currentUser, t, onBack, onEdit, onDelete}) {
  const miss=pmiss(dog); const sv=dog.care?.supervisionLevel?SUPV[dog.care.supervisionLevel]:null;
  const stays=dog.hotelStays||[]; const totalInc=stays.reduce((n,s)=>n+(s.incidents||[]).length,0);
  const care=dog.care||{}; const g=dog.grooming||{}; const inc=dog.incidents||{}; const resp=dog.responsivas||{};
  const bm=BRESULT[care.result]||BRESULT.pending; const vs=ovs(dog);
  const yn=v=>v==="Si"?"Si":v==="No"?"No":v||null;
  const treats=v=>v==="si"?"Si":v==="no"?"No":v==="tutor"?"Solo del tutor":v||null;
  const meals=[{key:"morning",label:"Manana"},{key:"afternoon",label:"Tarde"},{key:"evening",label:"Noche"}];
  const [dTab,setDTab]=useState("perfil");
  const needsWA=["expired","soon"].includes(vs)&&dog.phone;
  const dtabs=[{id:"perfil",label:"Perfil"},{id:"salud",label:"Salud"},{id:"alimentacion",label:"Aliment."},{id:"comportamiento",label:"Comport."},{id:"vacunas",label:"Vacunas"},{id:"cuidador",label:"Cuidador"},{id:"grooming",label:"Grooming"},{id:"responsivas",label:"Responsivas",badge:isAdmin&&miss.length>0?miss.length:null},{id:"hotel",label:"Hotel",badge:totalInc>0?totalInc:null},{id:"seguimiento",label:"Seguimiento"},{id:"paquete",label:"📦 Paquete"}];
  return (
    <div>
      <button onClick={onBack} style={{ background:"none", border:"none", color:t.acc, fontWeight:700, cursor:"pointer", fontSize:13, marginBottom:13, padding:0 }}>Volver</button>
      <Card dark={dark}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:13 }}>
            <DogAvatar dog={dog} size={62} />
            <div>
              <h2 style={{ margin:0, fontSize:20, color:t.text }}>{dog.name}</h2>
              <div style={{ fontSize:12, color:t.text2, marginTop:2 }}>{dog.breed}{dog.sex?" - "+dog.sex:""}{dog.age?" - "+dog.age:""}{dog.weight?" - "+dog.weight:""}</div>
              <div style={{ fontSize:12, color:t.text2, marginTop:2 }}>{dog.owner}{dog.phone?" - "+dog.phone:""}</div>
              {(dog.emergencyVet||dog.emergencyVetPhone)&&<div style={{ fontSize:11, color:"#8B5CF6", marginTop:2 }}>{dog.emergencyVet}{dog.emergencyVetPhone?" - "+dog.emergencyVetPhone:""}</div>}
              <div style={{ display:"flex", gap:6, marginTop:7, flexWrap:"wrap" }}>
                <BehBadge result={care.result||"pending"} />
                {sv&&<span style={{ fontSize:10, fontWeight:700, color:sv.color, background:sv.bg, border:"1px solid "+sv.color+"30", borderRadius:99, padding:"2px 9px" }}>{"👁 Sup. "+sv.label}</span>}
                {isAdmin&&miss.length>0&&<span style={{ background:t.accBg, color:t.acc, borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:800, border:"1px solid "+t.acc+"30" }}>Responsivas pendientes</span>}
                {stays.length>0&&<span style={{ background:dark?"#1A2040":"#EFF6FF", color:"#3B82F6", borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700, border:"1px solid #BFDBFE" }}>{"🏨 "+stays.length+(totalInc>0?" - "+totalInc+" inc.":"")}</span>}
                {(dog.areas||[]).map(a=>{const AC={Guarderia:"#22C55E",Hotel:"#3B82F6",Grooming:"#EC4899",Adiestramiento:"#8B5CF6","Day Pass Personalizado":"#C1712C"};const ac=AC[a]||"#6B7280";return <span key={a} style={{ background:ac+"18", color:ac, border:"1px solid "+ac+"40", borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700 }}>{a}</span>;})}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap", justifyContent:"flex-end" }}>
            {needsWA&&<button onClick={()=>openWA(dog.phone,buildWAMsg(dog))} style={{ padding:"7px 14px", borderRadius:9, border:"none", background:"#25D366", color:"white", fontWeight:700, cursor:"pointer", fontSize:12 }}>WhatsApp</button>}
            <button onClick={()=>onEdit(dog)} style={{ padding:"7px 14px", borderRadius:9, border:"1.5px solid "+t.acc, background:"transparent", color:t.acc, fontWeight:700, cursor:"pointer", fontSize:12 }}>Editar</button>
            {isAdmin&&<button onClick={()=>onDelete(dog.id)} style={{ padding:"7px 14px", borderRadius:9, border:"1.5px solid #EF4444", background:"transparent", color:"#EF4444", fontWeight:700, cursor:"pointer", fontSize:12 }}>Eliminar</button>}
          </div>
        </div>
        <TabBar tabs={dtabs} active={dTab} onChange={setDTab} dark={dark} />
        <div style={{ marginTop:16 }}>
          {dTab==="perfil"&&<div style={{ display:"flex", flexDirection:"column", gap:10 }}><IGrid cols={3}><IRow dark={dark} label="NOMBRE" value={dog.name}/><IRow dark={dark} label="RAZA" value={dog.breed}/><IRow dark={dark} label="SEXO" value={dog.sex}/><IRow dark={dark} label="EDAD" value={dog.birthdate ? calcAge(dog.birthdate) : (dog.age||null)}/><IRow dark={dark} label="PESO" value={dog.weight}/><IRow dark={dark} label="COLOR" value={dog.color}/><IRow dark={dark} label="FECHA DE NACIMIENTO" value={dog.birthdate||null}/><IRow dark={dark} label="ESTERILIZADO" value={yn(dog.sterilized)}/>{dog.lastCelo&&<IRow dark={dark} label="ULTIMO CELO" value={dog.lastCelo}/>}</IGrid><IGrid cols={2}><IRow dark={dark} label="TUTOR" value={dog.owner}/><IRow dark={dark} label="TEL" value={dog.phone}/></IGrid>{dog.authorizedPeople&&<IRow dark={dark} label="PERSONAS AUTORIZADAS" value={dog.authorizedPeople}/>}<IGrid cols={2}><IRow dark={dark} label="VET. EMERGENCIAS" value={dog.emergencyVet}/><IRow dark={dark} label="TEL. VET." value={dog.emergencyVetPhone}/></IGrid></div>}
          {dTab==="salud"&&<div style={{ display:"flex",flexDirection:"column",gap:10 }}><IRow dark={dark} label="ALERGIAS" value={dog.allergies}/><IRow dark={dark} label="CONDICIONES MEDICAS" value={dog.medicalConditions}/><IRow dark={dark} label="MEDICAMENTOS" value={dog.medications}/><IRow dark={dark} label="DOSIS Y FRECUENCIA" value={dog.dosage}/></div>}
          {dTab==="alimentacion"&&<div style={{ display:"flex",flexDirection:"column",gap:10 }}><IGrid cols={2}><IRow dark={dark} label="PRODUCTO" value={dog.foodProduct}/><IRow dark={dark} label="MEDIDA" value={dog.foodMeasure}/></IGrid>{meals.filter(m=>dog[m.key+"Time"]||dog[m.key+"Amount"]).map(m=><div key={m.key} style={{ display:"flex",alignItems:"center",gap:9,padding:"8px 13px",borderRadius:10,background:t.accBg,border:"1px solid "+t.acc+"30" }}><span style={{ fontWeight:700,fontSize:12,color:t.accD,width:55 }}>{m.label}</span>{dog[m.key+"Time"]&&<span style={{ fontSize:12,color:t.text }}>{dog[m.key+"Time"]}</span>}{dog[m.key+"Amount"]&&<span style={{ fontSize:12,color:t.text,marginLeft:7 }}>{dog[m.key+"Amount"]}</span>}</div>)}<IRow dark={dark} label="NOTAS" value={dog.extraFoodNotes}/><IRow dark={dark} label="PREMIOS" value={treats(dog.treatsAllowed)}/>{dog.treatsAllowed==="tutor"&&<IRow dark={dark} label="PREMIOS DEL TUTOR" value={dog.tutorTreats}/>}</div>}
          {dTab==="comportamiento"&&<div style={{ display:"flex",flexDirection:"column",gap:10 }}><IRow dark={dark} label="CON LAS PERSONAS" value={dog.relationWithPeople}/><IRow dark={dark} label="MIEDOS" value={dog.fearsPhobias}/><IRow dark={dark} label="MANEJO ESPECIAL" value={dog.handlingInstructions}/><IRow dark={dark} label="AUTH. VET. EMERGENCIA" value={yn(dog.vetEmergencyAuth)}/></div>}
          {dTab==="vacunas"&&<div style={{ display:"flex",flexDirection:"column",gap:6 }}>{VACCINES.map(v=><VacRow key={v.id} dark={dark} vac={dog.vaccinations?.[v.id]} label={v.label} icon={v.icon}/>)}</div>}
          {dTab==="cuidador"&&<div style={{ display:"flex",flexDirection:"column",gap:11 }}><div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 17px",borderRadius:13,background:bm.bg,border:"1.5px solid "+bm.border }}><div style={{ display:"flex",alignItems:"center",gap:9 }}><span style={{ fontSize:26 }}>{bm.icon}</span><div><div style={{ fontWeight:800,fontSize:14,color:bm.color }}>{bm.label}</div>{care.date&&<div style={{ fontSize:11,color:"#9CA3AF",marginTop:1 }}>{care.date}{care.evaluator?" - "+care.evaluator:""}</div>}</div></div>{care.result==="training"&&care.trainer&&<div style={{ textAlign:"right" }}><div style={{ fontSize:9,color:"#9CA3AF",fontWeight:700 }}>ENTRENADOR</div><div style={{ fontWeight:700,color:"#8B5CF6" }}>{"🏅 "+care.trainer}</div></div>}</div>{BCRITERIA.some(cr=>care.scores?.[cr.id]!==""&&care.scores?.[cr.id]!==undefined)&&<IGrid cols={2}>{BCRITERIA.map(cr=>{const s=care.scores?.[cr.id];const sm=(s!==""&&s!==undefined)?SCORE_META[s]:null;return<div key={cr.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 11px",borderRadius:9,background:t.surf2,border:"1px solid "+t.bord }}><span style={{ fontSize:12,color:t.text2,fontWeight:600 }}>{cr.label}</span>{sm?<span style={{ fontSize:10,fontWeight:700,color:sm.color,background:sm.color+"18",borderRadius:5,padding:"1px 7px" }}>{sm.label}</span>:<span style={{ fontSize:10,color:t.text3 }}>—</span>}</div>;})}
          </IGrid>}{sv&&<div style={{ display:"inline-flex",alignItems:"center",gap:7,padding:"6px 13px",borderRadius:9,background:sv.bg,border:"1px solid "+sv.color+"30" }}><span style={{ fontWeight:800,fontSize:12,color:sv.color }}>{"👁 SUPERVISION: "+sv.label}</span></div>}<div style={{ display:"flex",flexDirection:"column",gap:8 }}>{[["AL INGRESAR",care.behaviorAtEntry],["CON OTROS PERROS",care.dogInteraction],["CON EL PERSONAL",care.staffInteraction],["ALIMENTACION E HIDRATACION",care.foodHabits],["DURANTE EL JUEGO",care.playBehavior],["DURANTE EL DESCANSO",care.restBehavior],["OBSERVACIONES",care.notes]].map(([l,v])=><IRow key={l} dark={dark} label={l} value={v}/>)}</div></div>}
          {dTab==="grooming"&&<div style={{ display:"flex",flexDirection:"column",gap:10 }}><IGrid cols={3}><IRow dark={dark} label="ULTIMO SERVICIO" value={g.lastDate}/><IRow dark={dark} label="ESTILISTA" value={g.stylist}/><IRow dark={dark} label="TIPO" value={g.lastService}/></IGrid>{[["BANHO",g.bathReactions],["SECADO",g.dryingReactions],["CORTE",g.cutReactions],["UNAS",g.nailReactions],["OIDOS",g.earsReactions],["NOTAS",g.notes]].map(([l,v])=><IRow key={l} dark={dark} label={l} value={v}/>)}</div>}
          {dTab==="responsivas"&&<div style={{ display:"flex",flexDirection:"column",gap:13 }}>{isAdmin&&miss.length>0&&<div style={{ display:"flex",alignItems:"center",gap:9,padding:"10px 13px",borderRadius:10,background:t.accBg,border:"1px solid "+t.acc+"30" }}><span>⚠</span><div style={{ fontWeight:700,fontSize:13,color:t.accD }}>{"Faltan: "+miss.join(" - ")}</div></div>}{[{key:"guarderia",label:"Responsiva Guarderia"},{key:"hotel",label:"Responsiva Hotel"}].map(({key,label})=><div key={key}><div style={{ fontWeight:800,fontSize:13,color:t.text,marginBottom:7 }}>{label}</div><div style={{ padding:"11px 14px",borderRadius:11,background:resp[key]?(dark?"#0A2D14":"#F0FDF4"):(dark?"#2D0A0A":"#FEF2F2"),border:"1.5px solid "+(resp[key]?"#86EFAC":"#FECACA"),fontSize:13,color:resp[key]?"#22C55E":"#EF4444",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"space-between" }}><span>{resp[key]?"✅ "+resp[key].name+" - "+resp[key].date:"Sin cargar"}</span>{resp[key]?.data&&<a href={resp[key].data} download={resp[key].name} style={{ padding:"4px 10px",borderRadius:7,background:"#DCFCE7",color:"#15803D",fontSize:11,fontWeight:700,textDecoration:"none",border:"1px solid #86EFAC" }}>Descargar</a>}</div></div>)}</div>}
          {dTab==="hotel"&&<div style={{ display:"flex",flexDirection:"column",gap:13 }}><div style={{ display:"flex",gap:13,padding:"11px 14px",borderRadius:11,background:t.accBg,border:"1px solid "+t.acc+"30" }}><div style={{ textAlign:"center" }}><div style={{ fontSize:18,fontWeight:900,color:t.acc,fontFamily:"Georgia,serif" }}>{stays.length}</div><div style={{ fontSize:9,color:t.text3,fontWeight:700 }}>ESTANCIAS</div></div><div style={{ width:1,background:t.bord }}/><div style={{ textAlign:"center" }}><div style={{ fontSize:18,fontWeight:900,color:"#EF4444",fontFamily:"Georgia,serif" }}>{totalInc}</div><div style={{ fontSize:9,color:t.text3,fontWeight:700 }}>INCIDENTES</div></div></div>{stays.length===0?<div style={{ textAlign:"center",padding:"22px 0",color:t.text3 }}><div style={{ fontSize:32 }}>🏨</div><div style={{ fontWeight:700,marginTop:7 }}>Sin estancias</div></div>:stays.slice().reverse().map(stay=><StayCard key={stay.id} dark={dark} stay={stay} dog={dog} currentUser={currentUser} readOnly onDelete={null} onChange={()=>{}}/>)}</div>}
          {dTab==="seguimiento"&&<div style={{ display:"flex",flexDirection:"column",gap:10 }}><IRow dark={dark} label="OBSERVACIONES DE SALUD" value={inc.healthObservations}/><IRow dark={dark} label="RECOMENDACIONES" value={inc.futureRecommendations}/></div>}
                  {dTab==="paquete"&&<div style={{ display:"flex",flexDirection:"column",gap:13 }}>{dog.package?.active ? <div style={{ padding:"14px 16px",borderRadius:14,background:["expired","used"].includes(pkgStatus(dog.package))?"#FEF2F2":pkgStatus(dog.package)==="expiring"?"#FFFBEB":"#E8F0DC",border:"1.5px solid "+(["expired","used"].includes(pkgStatus(dog.package))?"#FECACA":pkgStatus(dog.package)==="expiring"?"#F59E0B40":"#AACC71") }}><IRow dark={dark} label="VISITAS AL MES" value={dog.package.visits}/><IRow dark={dark} label="HORAS POR VISITA" value={dog.package.hoursPerVisit+"h"}/><IRow dark={dark} label="VISITAS RESTANTES" value={dog.package.remainingVisits+" de "+dog.package.visits}/><IRow dark={dark} label="VENCE" value={dog.package.endDate}/></div> : <div style={{ textAlign:"center",padding:"20px 0",color:t.text3 }}>Sin paquete activo</div>}</div>}
        </div>
      </Card>
    </div>
  );
}


// ---- Public Daycare Display -------------------------------------------------
function PublicDaycarePanel() {
  const [sessions, setSessions] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "daycare_sessions"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.status === "active" || s.status === "paused")
        .filter(s => {
          // Only show sessions from today
          const today = new Date().toDateString();
          return new Date(s.checkIn).toDateString() === today;
        })
        .sort((a, b) => a.checkIn - b.checkIn);
      setSessions(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(145deg,#0D1510,#143B31)", fontFamily:"'Nunito','Segoe UI',sans-serif", padding:"24px 20px" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:"50%", background:"linear-gradient(135deg,#AACC71,#143B31)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🐾</div>
          <div>
            <div style={{ color:"#F2EEDD", fontWeight:900, fontSize:20, letterSpacing:"-0.5px" }}>Paw Park</div>
            <div style={{ color:"#AACC71", fontSize:10, letterSpacing:"0.2em", fontWeight:700 }}>GUARDERÍA EN VIVO</div>
          </div>
        </div>
        <div style={{ color:"#AACC71", fontWeight:800, fontSize:18, fontFamily:"monospace" }}>
          {new Date().toLocaleTimeString("es-MX")}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div style={{ textAlign:"center", padding:"80px 0", color:"rgba(242,238,221,0.4)" }}>
          <div style={{ fontSize:60, marginBottom:16 }}>🐕</div>
          <div style={{ fontSize:18, fontWeight:700 }}>Sin perritos activos por ahora</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:16 }}>
          {sessions.map(s => {
            const elapsed = getElapsed(s);
            const range = getDaycareRange(elapsed);
            const isPaused = s.status === "paused";
            const isPackage = s.hasPackage;
            const hrs = elapsed / 3600000;
            const pct = Math.min(100, (hrs / range.maxHrs) * 100);
            return (
              <div key={s.id} style={{
                borderRadius: 20,
                background: isPaused ? "linear-gradient(145deg,#1A1A2E,#2D2D44)" : isPackage ? "linear-gradient(145deg,#2D1F00,#4A3500)" : "linear-gradient(145deg,#0D2018,#143B31)",
                border: "2px solid " + (isPackage ? "#C1712C" : isPaused ? "#555" : "#AACC71") + "60",
                padding: "20px 16px",
                position: "relative",
                overflow: "hidden"
              }}>
                {isPackage && <div style={{ position:"absolute", top:10, right:10, background:"linear-gradient(135deg,#C1712C,#F8D061)", borderRadius:99, padding:"2px 10px", fontSize:10, fontWeight:800, color:"white" }}>★ PAQUETE</div>}
                {isPaused && <div style={{ position:"absolute", top:10, right:10, background:"rgba(255,255,255,0.15)", borderRadius:99, padding:"2px 10px", fontSize:10, fontWeight:800, color:"#aaa" }}>PAUSA</div>}
                <div style={{ fontSize:15, fontWeight:800, color:"#F2EEDD", marginBottom:2 }}>{s.dogName}</div>
                <div style={{ fontSize:11, color:"rgba(242,238,221,0.5)", marginBottom:14 }}>{s.ownerName}</div>
                <div style={{ fontSize:42, fontWeight:900, color: isPaused ? "#888" : isPackage ? "#F8D061" : "#AACC71", fontFamily:"monospace", lineHeight:1, marginBottom:8 }}>
                  {fmtElapsed(elapsed)}
                </div>
                <div style={{ background:"rgba(255,255,255,0.08)", borderRadius:99, height:6, overflow:"hidden", marginBottom:8 }}>
                  <div style={{ height:"100%", borderRadius:99, background: isPackage ? "linear-gradient(90deg,#C1712C,#F8D061)" : "linear-gradient(90deg,#143B31,#AACC71)", width:pct+"%", transition:"width 1s linear" }} />
                </div>
                <div style={{ fontSize:12, color:"rgba(242,238,221,0.6)", fontWeight:600 }}>{range.label} · ${range.price}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ---- Daycare Panel (staff view) ---------------------------------------------
function DaycarePanel({ dark, currentUser, dogs }) {
  const t = getT(dark);
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState("active"); // active | done

  // Real-time sessions
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "daycare_sessions"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSessions(list);
    });
    return () => unsub();
  }, []);

  // Timer tick
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Autocomplete
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setSuggestions([]); return; }
    const q = query.toLowerCase();
    const matches = dogs.filter(d =>
      d.name?.toLowerCase().includes(q) || d.owner?.toLowerCase().includes(q)
    ).slice(0, 6);
    setSuggestions(matches);
  }, [query, dogs]);

  const todaySessions = sessions.filter(s => {
    const today = new Date().toDateString();
    return new Date(s.checkIn).toDateString() === today;
  });
  const active = todaySessions.filter(s => s.status === "active" || s.status === "paused").sort((a,b) => a.checkIn - b.checkIn);
  const done = todaySessions.filter(s => s.status === "done").sort((a,b) => b.checkOut - a.checkOut);

  const checkIn = async (dog) => {
    // Check if already active today
    const already = active.find(s => s.dogId === dog.id);
    if (already) { alert(dog.name + " ya está en guardería"); setQuery(""); setSuggestions([]); return; }
    const id = mkId();
    const hasPackage = !!(dog.package?.active && dog.package?.remainingVisits > 0);
    const packageHours = dog.package?.hoursPerVisit || 0;
    await setDoc(doc(db, "daycare_sessions", id), {
      id, dogId: dog.id, dogName: dog.name, ownerName: dog.owner || "",
      checkIn: Date.now(), checkOut: null,
      pauses: [], status: "active",
      hasPackage, packageHours,
      staffId: currentUser?.id || "", staffName: currentUser?.name || ""
    });
    // Decrement package visit if applicable
    if (hasPackage && dog.package?.remainingVisits > 0) {
      const updated = { ...dog, package: { ...dog.package, remainingVisits: dog.package.remainingVisits - 1, usedVisits: (dog.package.usedVisits || 0) + 1 } };
      await setDoc(doc(db, "dogs", dog.id), updated);
    }
    setQuery(""); setSuggestions([]);
  };

  const pauseSession = async (s) => {
    if (s.status === "paused") {
      // Resume
      const pauses = (s.pauses || []).map((p, i) =>
        i === s.pauses.length - 1 && !p.end ? { ...p, end: Date.now() } : p
      );
      await setDoc(doc(db, "daycare_sessions", s.id), { ...s, pauses, status: "active" });
    } else {
      // Pause
      const pauses = [...(s.pauses || []), { start: Date.now(), end: null }];
      await setDoc(doc(db, "daycare_sessions", s.id), { ...s, pauses, status: "paused" });
    }
  };

  const endSession = async (s) => {
    if (!confirm("¿Finalizar la visita de " + s.dogName + "?")) return;
    const checkOut = Date.now();
    const pauses = (s.pauses || []).map(p => p.end ? p : { ...p, end: checkOut });
    const elapsed = getElapsed({ ...s, checkOut, pauses });
    const range = getDaycareRange(elapsed);
    const updated = { ...s, checkOut, pauses, status: "done", totalMs: elapsed, rangeLabel: range.label, rangePrice: range.price };
    await setDoc(doc(db, "daycare_sessions", s.id), updated);
    // Save to dog history
    const dog = dogs.find(d => d.id === s.dogId);
    if (dog) {
      const visit = { id: s.id, checkIn: s.checkIn, checkOut, durationMs: elapsed, rangeLabel: range.label, rangePrice: range.price, hasPackage: s.hasPackage };
      const history = [...(dog.daycareHistory || []), visit];
      await setDoc(doc(db, "dogs", dog.id), { ...dog, daycareHistory: history });
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:t.bg, fontFamily:"'Nunito','Segoe UI',sans-serif" }}>
      {/* Header */}
      <header style={{ background:t.head, padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🐾</div>
          <div>
            <div style={{ color:"#F2EEDD", fontWeight:900, fontSize:16 }}>Guardería</div>
            <div style={{ color:"#AACC71", fontSize:9, letterSpacing:"0.15em", fontWeight:700 }}>EN VIVO</div>
          </div>
        </div>
        <div style={{ color:"#AACC71", fontWeight:800, fontSize:14, fontFamily:"monospace" }}>
          {new Date().toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})}
        </div>
      </header>

      <div style={{ padding:"18px 16px", maxWidth:900, margin:"0 auto" }}>
        {/* Search / Check-in */}
        <div style={{ marginBottom:20, position:"relative" }}>
          <div style={{ fontWeight:800, fontSize:13, color:t.text3, marginBottom:8, letterSpacing:"0.08em" }}>NUEVO INGRESO</div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Escribe nombre del perrito o del dueño..."
            style={{ width:"100%", padding:"13px 16px", borderRadius:14, border:"2px solid "+t.acc+"60", fontSize:15, background:t.surf, color:t.text, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
          />
          {suggestions.length > 0 && (
            <div style={{ position:"absolute", top:"100%", left:0, right:0, background:t.surf, border:"1.5px solid "+t.bord, borderRadius:14, overflow:"hidden", zIndex:200, boxShadow:"0 8px 24px #00000020", marginTop:4 }}>
              {suggestions.map(dog => {
                const hasPackage = !!(dog.package?.active && dog.package?.remainingVisits > 0);
                return (
                  <div key={dog.id} onClick={() => checkIn(dog)}
                    style={{ padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid "+t.bord, display:"flex", alignItems:"center", gap:12, transition:"background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = t.surf2}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <DogAvatar dog={dog} size={36} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:14, color:t.text }}>{dog.name}</div>
                      <div style={{ fontSize:12, color:t.text2 }}>{dog.owner}{dog.phone ? " · " + dog.phone : ""}</div>
                    </div>
                    {hasPackage
                      ? <span style={{ background:"linear-gradient(135deg,#C1712C,#F8D061)", color:"white", borderRadius:99, padding:"2px 10px", fontSize:10, fontWeight:800 }}>★ Paquete</span>
                      : <span style={{ background:t.surf2, color:t.text3, borderRadius:99, padding:"2px 10px", fontSize:10, fontWeight:600, border:"1px dashed "+t.bord }}>Sin paquete</span>
                    }
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {[{id:"active",label:"Activos ("+active.length+")"},{id:"done",label:"Finalizados hoy ("+done.length+")"}].map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{ padding:"8px 18px", borderRadius:10, border:"none", fontWeight:700, fontSize:13, cursor:"pointer", background:tab===tb.id?t.acc:t.surf2, color:tab===tb.id?t.accD:t.text2 }}>
              {tb.label}
            </button>
          ))}
        </div>

        {/* Active sessions */}
        {tab === "active" && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
            {active.length === 0 && (
              <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"40px 0", color:t.text3 }}>
                <div style={{ fontSize:40 }}>🐕</div>
                <div style={{ fontWeight:700, marginTop:8 }}>Sin perritos activos</div>
                <div style={{ fontSize:12, marginTop:4 }}>Usa la búsqueda de arriba para registrar un ingreso</div>
              </div>
            )}
            {active.map(s => {
              const elapsed = getElapsed(s);
              const range = getDaycareRange(elapsed);
              const isPaused = s.status === "paused";
              const isGold = s.hasPackage;
              const hrs = elapsed / 3600000;
              const pct = Math.min(100, (hrs / range.maxHrs) * 100);
              return (
                <div key={s.id} style={{ borderRadius:18, background:t.surf, border:"2px solid "+(isGold?"#C1712C":isPaused?t.bord:t.acc)+"50", overflow:"hidden" }}>
                  {/* Color bar */}
                  <div style={{ height:5, background: isGold ? "linear-gradient(90deg,#C1712C,#F8D061)" : isPaused ? "#555" : "linear-gradient(90deg,#143B31,#AACC71)", width:pct+"%", transition:"width 1s linear" }} />
                  <div style={{ padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                      <DogAvatar dog={{name:s.dogName, photoColor: isGold?"#C1712C":"#AACC71"}} size={40} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:800, fontSize:14, color:t.text, display:"flex", alignItems:"center", gap:6 }}>
                          {s.dogName}
                          {isGold && <span style={{ background:"linear-gradient(135deg,#C1712C,#F8D061)", color:"white", borderRadius:99, padding:"1px 8px", fontSize:9, fontWeight:800 }}>★ PKG</span>}
                        </div>
                        <div style={{ fontSize:11, color:t.text2 }}>{s.ownerName}</div>
                      </div>
                      {isPaused && <span style={{ background:t.surf2, color:t.text3, borderRadius:99, padding:"2px 8px", fontSize:9, fontWeight:800 }}>PAUSA</span>}
                    </div>
                    {/* Timer */}
                    <div style={{ fontFamily:"monospace", fontSize:34, fontWeight:900, color: isGold?"#C1712C":isPaused?"#888":t.acc, lineHeight:1, marginBottom:6 }}>
                      {fmtElapsed(elapsed)}
                    </div>
                    <div style={{ fontSize:12, color:t.text2, marginBottom:12 }}>
                      Rango: <strong>{range.label}</strong> · <strong style={{color:isGold?"#C1712C":t.acc}}>${range.price}</strong>
                      {isGold && <span style={{ color:"#C1712C", marginLeft:6, fontSize:11 }}>· Paquete activo</span>}
                    </div>
                    {/* Buttons */}
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={() => pauseSession(s)} style={{ flex:1, padding:"9px", borderRadius:10, border:"1.5px solid "+t.bord, background:t.surf2, color:t.text2, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                        {isPaused ? "▶ Reanudar" : "⏸ Pausar"}
                      </button>
                      <button onClick={() => endSession(s)} style={{ flex:1, padding:"9px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#35201E,#143B31)", color:"white", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                        ■ Finalizar
                      </button>
                    </div>
                    {!isGold && <PkgQuickActivate dark={dark} session={s} dogs={dogs} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Done sessions */}
        {tab === "done" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {done.length === 0 && <div style={{ textAlign:"center", padding:"30px 0", color:t.text3 }}>Sin finalizados hoy</div>}
            {done.map(s => {
              const elapsed = getElapsed(s);
              const range = getDaycareRange(elapsed);
              const checkInTime = new Date(s.checkIn).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
              const checkOutTime = new Date(s.checkOut).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
              return (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:14, background:t.surf, border:"1px solid "+t.bord }}>
                  <DogAvatar dog={{name:s.dogName, photoColor:"#888"}} size={36} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:t.text }}>{s.dogName} <span style={{ color:t.text3, fontSize:11 }}>· {s.ownerName}</span></div>
                    <div style={{ fontSize:11, color:t.text2 }}>{checkInTime} → {checkOutTime} · {fmtElapsed(elapsed)}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontWeight:800, color:s.hasPackage?"#C1712C":t.acc, fontSize:14 }}>${range.price}</div>
                    {s.hasPackage && <div style={{ fontSize:9, color:"#C1712C", fontWeight:700 }}>PAQUETE</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main App ---------------------------------------------------------------
export default function PawPark() {
  const [dark, setDark] = useState(false);
  const [users, setUsers] = useState([DEFAULT_ADMIN]);
  const [currentUser, setCurrentUser] = useState(null);
  const [dogs, setDogs] = useState([]);
  const [view, setView] = useState("dashboard");
  const [editDog, setEditDog] = useState(null);
  const [selDog, setSelDog] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showUM, setShowUM] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const t = getT(dark);

  // Firebase: real-time listeners
  useEffect(() => {
    // Load dark mode preference from localStorage (solo preferencia visual)
    try { const dm = localStorage.getItem("pp_dark"); if (dm) setDark(JSON.parse(dm)); } catch {}

    // Real-time listener for dogs
    const unsubDogs = onSnapshot(collection(db, "dogs"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDogs(list);
      if (!loaded) setLoaded(true);
    }, () => setLoaded(true));

    // Real-time listener for users
    const unsubUsers = onSnapshot(collection(db, "users"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length > 0) {
        setUsers(list);
        // Ensure DAYCARE user always exists
        if (!list.find(u => u.id === "daycare")) {
          setDoc(doc(db, "users", DEFAULT_DAYCARE.id), DEFAULT_DAYCARE).catch(()=>{});
        }
      } else {
        setDoc(doc(db, "users", DEFAULT_ADMIN.id), DEFAULT_ADMIN).catch(()=>{});
        setDoc(doc(db, "users", DEFAULT_DAYCARE.id), DEFAULT_DAYCARE).catch(()=>{});
      }
    });

    return () => { unsubDogs(); unsubUsers(); };
  }, []);

  const saveDogs = useCallback(async nd => {
    // saveDogs is now handled individually per dog via handleSave/handleDelete
    setDogs(nd);
  }, []);

  const saveUsers = async nu => {
    try {
      for (const u of nu) {
        await setDoc(doc(db, "users", u.id), u);
      }
      // Remove deleted users
      const snap = await getDocs(collection(db, "users"));
      for (const d of snap.docs) {
        if (!nu.find(u => u.id === d.id)) await deleteDoc(doc(db, "users", d.id));
      }
    } catch (e) { console.error("Error saving users:", e); }
    setShowUM(false);
  };

  const toggleDark = async () => {
    const nd = !dark; setDark(nd);
    try { localStorage.setItem("pp_dark", JSON.stringify(nd)); } catch {}
  };

  const login = u => { setCurrentUser(u); setView(u.homePanel || "dashboard"); };
  const logout = () => { setCurrentUser(null); setView("dashboard"); setSearch(""); setFilter("all"); setEditDog(null); setSelDog(null); };
  const isAdmin = currentUser?.isAdmin;

  const handleSave = async dog => {
    try { await setDoc(doc(db, "dogs", dog.id), dog); } catch (e) { console.error(e); }
    setView("list"); setEditDog(null);
  };
  const handleDelete = async id => {
    if (confirm("Eliminar este expediente?")) {
      try { await deleteDoc(doc(db, "dogs", id)); } catch (e) { console.error(e); }
      setView("list"); setSelDog(null);
    }
  };

  const vacAlerts = dogs.filter(d => ["expired","soon"].includes(ovs(d))).sort((a,b) => ovs(a)==="expired"?-1:1);
  const incompleteCount = isAdmin ? dogs.filter(d => pmiss(d).length>0).length : 0;

  const FILTERS = [{id:"all",label:"Todos"},{id:"expired",label:"Vencidas"},{id:"soon",label:"Por vencer"},{id:"ok",label:"Al dia"},{id:"training",label:"Adiest."},{id:"alto",label:"Sup. Alta"},{id:"incomplete",label:"Incompletos"}];
  const filtered = dogs.filter(d => {
    const q = search.toLowerCase();
    const mq = !q || [d.name,d.owner,d.breed].some(f=>f?.toLowerCase().includes(q));
    if (!mq) return false;
    if (filter==="all") return true;
    if (filter==="expired") return ovs(d)==="expired";
    if (filter==="soon") return ovs(d)==="soon";
    if (filter==="ok") return ovs(d)==="ok";
    if (filter==="training") return d.care?.result==="training";
    if (filter==="alto") return d.care?.supervisionLevel==="alto";
    if (filter==="incomplete") return pmiss(d).length>0;
    return true;
  });

  // Public display URL - no login needed
  if (typeof window !== "undefined" && (window.location.hash === "#pantalla" || window.location.search === "?pantalla")) {
    return <PublicDaycarePanel />;
  }

  if (!loaded) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:t.bg, color:t.acc, fontSize:18 }}>Cargando Paw Park...</div>;
  if (!currentUser) return <PinPad users={users.filter(u=>u.pin)} onSuccess={login} />;
  if (currentUser.isDaycare) return <DaycarePanel dark={dark} currentUser={currentUser} dogs={dogs} />;

  return (
    <div style={{ minHeight:"100vh", background:t.bg, fontFamily:"'Nunito','Segoe UI',sans-serif", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <header style={{ background:t.head, padding:"0 22px", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 4px 16px #143B3140", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 0" }}>
          <div style={{ height:36, display:"flex", alignItems:"center" }}>
            <svg viewBox="0 0 792 612" style={{ height:28, filter:"brightness(0) invert(1)" }}>
              <g>
                <path fill="white" d="M107.96,258.59H73.75v110.77h23.91v-50.65h14.95c5.81,0,11.29-2.16,15.11-5.98c4.15-4.32,5.81-10.8,5.81-23.58c0-10.63-1-15.94-3.65-20.09C125.4,262.24,117.76,258.59,107.96,258.59z M107.96,295.96c-1.49,1.33-3.82,2.33-5.48,2.33h-4.82v-19.26h4.48c5.81,0,7.81,2.49,7.81,9.63C109.95,292.97,109.45,294.63,107.96,295.96z"/>
                <path fill="white" d="M151.13,258.59l-15.61,110.77h23.08l2.16-15.78h12.79l1.33,15.78h23.58l-15.45-110.77H151.13z M162.59,332.66l1-11.29c0.5-6.48,1-12.79,1.66-19.26c0.17-2.32,0.67-9.13,1.16-16.77l0.66-9.8l3.49,46l0.83,11.13H162.59z"/>
                <path fill="white" d="M265.88,291.14c-0.66,6.48-1.16,12.12-1.49,16.94l-1.16,14.95c0,0.66-0.17,2.82-0.5,6.14l-0.33-3.65c-0.16-1.33-0.33-4.15-0.66-8.3c-1.16-15.28-1.33-18.43-2.16-25.91l-3.49-32.72h-20.76l-3.82,34.05c-0.67,5.65-2.16,22.42-3.16,36.54l-0.5-5.15c0-1.66-0.33-4.48-0.5-8.64c-0.83-12.79-1-13.62-1.83-22.75l-3.32-34.05h-23.42l11.96,110.77h26.74l4.82-37.2c1.33-10.46,1.99-17.1,2.99-33.05c0.33,2.99,0.5,6.15,0.83,9.3c0.16,2.49,0.5,5.48,0.66,8.64c0.66,7.31,1.33,14.95,1.66,15.61l4.81,36.7H280l12.12-110.77h-22.75L265.88,291.14z"/>
                <path fill="white" d="M468.38,258.59h-34.21v110.77h23.91v-50.65h14.95c5.81,0,11.29-2.16,15.11-5.98c4.15-4.32,5.81-10.8,5.81-23.58c0-10.63-1-15.94-3.65-20.09C485.82,262.24,478.18,258.59,468.38,258.59z M468.38,295.96c-1.49,1.33-3.82,2.33-5.48,2.33h-4.82v-19.26h4.48c5.81,0,7.81,2.49,7.81,9.63C470.38,292.97,469.88,294.63,468.38,295.96z"/>
                <path fill="white" d="M511.56,258.59l-15.61,110.77h23.08l2.16-15.78h12.79l1.33,15.78h23.58l-15.45-110.77H511.56z M523.02,332.66l1-11.29c0.5-6.48,1-12.79,1.66-19.26c0.17-2.32,0.67-9.13,1.16-16.77l0.66-9.8l3.49,46l0.83,11.13H523.02z"/>
                <path fill="white" d="M625.31,286.82c0-19.93-7.64-28.23-25.74-28.23h-34.05v110.77h23.75v-50.98c0.83-0.17,1.66-0.17,1.99-0.17c6.31,0,8.3,2.66,8.3,11.46v39.69h23.75v-40.19c0.17-11.13-2.49-16.28-9.3-17.77C622.32,309.41,625.31,303.1,625.31,286.82z M594.09,298.45h-4.82v-19.43h5.15c5.65,0,8.14,2.99,8.14,10.29C602.56,295.46,599.91,298.45,594.09,298.45z"/>
                <path fill="white" d="M682.27,306.25l12.95-47.66h-23.58l-5.32,18.1c-1,2.99-1.83,6.15-2.82,9.3c-0.5,1.66-1.5,5.48-2.66,9.96c-0.5,1.83-1,3.65-1.33,5.48l0.16-42.85H636.1v110.77h23.58l-0.16-59.12l1.16,4.82c2.82,12.12,3.32,14.78,3.99,17.1l10.13,37.2h24.58L682.27,306.25z"/>
              </g>
            </svg>
          </div>
        </div>
        <nav style={{ display:"flex", gap:3, alignItems:"center" }}>
          {[{id:"dashboard",label:"Panel"},{id:"list",label:"Expedientes"}].map(n => (
            <button key={n.id} onClick={() => {setView(n.id);setSearch("");setFilter("all");}} style={{ padding:"7px 14px", borderRadius:9, border:"none", cursor:"pointer", background:view===n.id?"rgba(255,255,255,0.2)":"transparent", color:view===n.id?"white":"#AACC71", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
              {n.label}
              {n.id==="dashboard" && (vacAlerts.length>0||incompleteCount>0) && <span style={{ background:"#EF4444", color:"white", borderRadius:99, padding:"1px 6px", fontSize:9, fontWeight:800 }}>{vacAlerts.length+incompleteCount}</span>}
            </button>
          ))}
          <button onClick={() => {setEditDog(null);setView("form");}} style={{ padding:"7px 14px", borderRadius:9, border:"1.5px solid rgba(255,255,255,0.35)", background:"rgba(255,255,255,0.1)", color:"white", fontWeight:700, fontSize:12, cursor:"pointer" }}>
            {isAdmin ? "+ Nuevo" : "Editar"}
          </button>
          <button onClick={toggleDark} style={{ width:32, height:32, borderRadius:9, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.1)", color:"white", fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{dark ? "S" : "L"}</button>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginLeft:4, padding:"5px 10px", borderRadius:10, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)" }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:currentUser.color||"#9CA3AF", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:800, fontSize:11 }}>{currentUser.name.slice(0,2).toUpperCase()}</div>
            <span style={{ color:"white", fontWeight:700, fontSize:12 }}>{currentUser.name}</span>
            {isAdmin && <button onClick={() => setShowUM(true)} style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:6, color:"white", fontSize:10, fontWeight:700, cursor:"pointer", padding:"2px 7px" }}>👥</button>}
            <button onClick={logout} style={{ background:"rgba(255,255,255,0.12)", border:"none", borderRadius:6, color:"#AACC71", fontSize:10, cursor:"pointer", padding:"2px 7px", fontWeight:700 }}>Salir</button>
          </div>
        </nav>
      </header>

      {showUM && <UserMgr dark={dark} users={users} onSave={saveUsers} onClose={() => setShowUM(false)} />}

      <main style={{ flex:1, padding:"20px 22px", maxWidth:1200, margin:"0 auto", width:"100%", boxSizing:"border-box" }}>

        {/* Dashboard */}
        {view === "dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderRadius:15, background:t.surf, border:"1.5px solid " + t.bord }}>
              <div style={{ display:"flex", alignItems:"center", gap:11 }}>
                <div style={{ width:42, height:42, borderRadius:"50%", background:currentUser.color||t.acc, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:800, fontSize:16, boxShadow:"0 3px 10px " + (currentUser.color||t.acc) + "50" }}>{currentUser.name.slice(0,2).toUpperCase()}</div>
                <div><div style={{ fontWeight:800, fontSize:15, color:t.text }}>Hola, {currentUser.name}!</div><div style={{ fontSize:12, color:t.text2 }}>Panel: {HOME_PANELS.find(p=>p.id===currentUser.homePanel)?.label}</div></div>
              </div>
              {vacAlerts.length > 0 && <div style={{ textAlign:"right" }}><div style={{ fontSize:11, color:t.text3, marginBottom:5 }}>{vacAlerts.length} perrito{vacAlerts.length>1?"s":""} requieren atencion</div><button onClick={() => setView("list")} style={{ padding:"6px 14px", borderRadius:9, border:"1.5px solid " + t.acc, background:"transparent", color:t.acc, fontWeight:700, fontSize:12, cursor:"pointer" }}>Ver todos</button></div>}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:11 }}>
              {[{icon:"🐕",v:dogs.length,label:"Expedientes",c:t.acc},{icon:"✅",v:dogs.filter(d=>ovs(d)==="ok").length,label:"Vacunas al dia",c:"#22C55E"},{icon:"⚠",v:dogs.filter(d=>ovs(d)==="soon").length,label:"Por vencer",c:"#AACC71"},{icon:"🚨",v:dogs.filter(d=>ovs(d)==="expired").length,label:"Vencidas",c:"#EF4444"},{icon:"🎓",v:dogs.filter(d=>d.care?.result==="apt").length,label:"Aptos guarderia",c:"#8B5CF6"}].map(s => (
                <Card key={s.label} dark={dark} style={{ border:"2px solid " + s.c + "20" }}>
                  <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
                  <div style={{ fontSize:26, fontWeight:900, color:s.c, lineHeight:1, fontFamily:"Georgia,serif" }}>{s.v}</div>
                  <div style={{ fontSize:11, color:t.text3, marginTop:3, fontWeight:600 }}>{s.label}</div>
                </Card>
              ))}
            </div>
            {isAdmin && incompleteCount > 0 && (
              <Card dark={dark} style={{ border:"2px solid " + t.acc + "30" }}>
                <div style={{ fontWeight:800, fontSize:14, color:t.text, marginBottom:13 }}>Responsivas pendientes</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:9 }}>
                  {dogs.filter(d=>pmiss(d).length>0).map(dog => (
                    <div key={dog.id} onClick={() => {setSelDog(dog);setView("detail");}} style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 13px", borderRadius:11, border:"1.5px solid " + t.acc + "30", background:t.accBg, cursor:"pointer" }}>
                      <DogAvatar dog={dog} size={32} /><div><div style={{ fontWeight:700, fontSize:12, color:t.text }}>{dog.name}</div><div style={{ fontSize:10, color:t.acc }}>Falta: {pmiss(dog).join(", ")}</div></div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Package alerts panel - admin only */}
            {isAdmin && (() => {
              const pkgDogs = dogs.filter(d => d.package?.active);
              const expiring = pkgDogs.filter(d => pkgStatus(d.package) === "expiring").sort((a,b) => pkgDaysLeft(a.package) - pkgDaysLeft(b.package));
              const expired  = pkgDogs.filter(d => ["expired","used"].includes(pkgStatus(d.package)));
              if (expiring.length === 0 && expired.length === 0) return null;
              return (
                <Card dark={dark} style={{ border:"2px solid #C1712C30" }}>
                  <div style={{ fontWeight:800, fontSize:14, color:t.text, marginBottom:14 }}>📦 Paquetes — atención requerida</div>
                  {expired.length > 0 && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#EF4444", marginBottom:8, letterSpacing:"0.06em" }}>VENCIDOS / AGOTADOS ({expired.length})</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {expired.map(dog => (
                          <div key={dog.id} onClick={() => {setSelDog(dog);setView("detail");}} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:11, background:"#FEF2F2", border:"1px solid #FECACA", cursor:"pointer" }}>
                            <DogAvatar dog={dog} size={32} />
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:700, fontSize:13, color:"#EF4444" }}>{dog.name}</div>
                              <div style={{ fontSize:11, color:"#9CA3AF" }}>{dog.owner}</div>
                            </div>
                            <div style={{ fontSize:11, fontWeight:700, color:"#EF4444" }}>{pkgStatus(dog.package)==="used"?"Visitas agotadas":"Vencido"}</div>
                            {dog.phone && <button onClick={e=>{e.stopPropagation();const msg="Hola "+dog.owner+"! El paquete de *"+dog.name+"* ha vencido/se agotó. ¿Te gustaría renovarlo? 🐾";openWA(dog.phone,msg);}} style={{ background:"#25D366", border:"none", borderRadius:8, padding:"4px 10px", color:"white", fontSize:11, fontWeight:700, cursor:"pointer" }}>WA</button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {expiring.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, color:"#D97706", marginBottom:8, letterSpacing:"0.06em" }}>POR VENCER ({expiring.length})</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {expiring.map(dog => (
                          <div key={dog.id} onClick={() => {setSelDog(dog);setView("detail");}} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:11, background:"#FFFBEB", border:"1px solid #F59E0B40", cursor:"pointer" }}>
                            <DogAvatar dog={dog} size={32} />
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:700, fontSize:13, color:"#D97706" }}>{dog.name}</div>
                              <div style={{ fontSize:11, color:"#9CA3AF" }}>{dog.owner}</div>
                            </div>
                            <div style={{ fontSize:11, fontWeight:700, color:"#D97706" }}>Vence en {pkgDaysLeft(dog.package)}d</div>
                            {dog.phone && <button onClick={e=>{e.stopPropagation();const msg="Hola "+dog.owner+"! El paquete de *"+dog.name+"* vence en "+pkgDaysLeft(dog.package)+" días. ¿Te gustaría renovarlo? 🐾";openWA(dog.phone,msg);}} style={{ background:"#25D366", border:"none", borderRadius:8, padding:"4px 10px", color:"white", fontSize:11, fontWeight:700, cursor:"pointer" }}>WA</button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })()}

            {/* Birthday panel */}
            {(() => {
              const bdays = upcomingBirthdays(dogs, 31);
              if (bdays.length === 0) return null;
              return (
                <Card dark={dark} style={{ border:"2px solid #F982C830" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ fontWeight:800, fontSize:14, color:t.text }}>🎂 Cumpleaños proximos</div>
                    <span style={{ background:"#F982C820", color:"#F982C8", borderRadius:99, padding:"2px 11px", fontSize:12, fontWeight:700, border:"1px solid #F982C840" }}>{bdays.length} este mes</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {bdays.map(({dog, diff, next, age}) => (
                      <div key={dog.id} onClick={() => {setSelDog(dog);setView("detail");}} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 13px", borderRadius:12, background:diff===0?"#F982C815":t.surf2, border:"1px solid "+(diff===0?"#F982C850":t.bord), cursor:"pointer", transition:"all 0.15s" }}
                        onMouseEnter={e=>e.currentTarget.style.transform="translateX(4px)"}
                        onMouseLeave={e=>e.currentTarget.style.transform="translateX(0)"}>
                        <DogAvatar dog={dog} size={38} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:t.text }}>{dog.name} <span style={{ fontSize:11, color:t.text3 }}>cumple {age} años</span></div>
                          <div style={{ fontSize:11, color:t.text2 }}>{dog.owner}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          {diff === 0
                            ? <span style={{ background:"#F982C8", color:"white", borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:800 }}>Hoy!</span>
                            : <span style={{ background:diff<=7?"#F982C820":t.surf2, color:diff<=7?"#F982C8":t.text3, borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:700, border:"1px solid "+(diff<=7?"#F982C840":t.bord) }}>En {diff} dia{diff!==1?"s":""}</span>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })()}
            <Card dark={dark}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontWeight:800, fontSize:14, color:t.text }}>Vacunas que necesitan atencion</div>
                {vacAlerts.length > 0 && <span style={{ background:t.accBg, color:t.acc, borderRadius:99, padding:"2px 11px", fontSize:12, fontWeight:700, border:"1px solid " + t.acc + "30" }}>{vacAlerts.length}</span>}
              </div>
              {vacAlerts.length === 0 ? (
                <div style={{ textAlign:"center", padding:"26px 0", color:t.text3 }}><div style={{ fontSize:36 }}>🎉</div><div style={{ fontWeight:700, fontSize:14, marginTop:7 }}>Todo en orden!</div></div>
              ) : vacAlerts.map(dog => {
                const cv = VACCINES.filter(v => ["expired","soon"].includes(gvs(dog.vaccinations?.[v.id])));
                const vs = ovs(dog); const vm = VST[vs];
                return (
                  <div key={dog.id} style={{ display:"flex", alignItems:"flex-start", gap:11, padding:"11px 13px", borderRadius:12, border:"1.5px solid " + vm.color + "25", background:vm.bg, marginBottom:8, cursor:"pointer", transition:"all 0.15s" }}
                    onClick={() => {setSelDog(dog);setView("detail");}}
                    onMouseEnter={e => e.currentTarget.style.transform="translateX(4px)"}
                    onMouseLeave={e => e.currentTarget.style.transform="translateX(0)"}>
                    <DogAvatar dog={dog} size={42} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}><span style={{ fontWeight:800, fontSize:14, color:"#111827" }}>{dog.name}</span><span style={{ fontSize:11, color:"#6B7280" }}>{dog.breed}</span><VacBadge status={vs} sm /></div>
                      <div style={{ fontSize:12, color:"#6B7280", marginBottom:5 }}>{dog.owner}{dog.phone ? " - " + dog.phone : ""}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
                        {cv.map(v => { const vst = gvs(dog.vaccinations?.[v.id]); const vm2 = VST[vst]; const diff = dog.vaccinations?.[v.id]?.expiry ? ddiff(dog.vaccinations[v.id].expiry) : null; return <span key={v.id} style={{ background:vm2.color+"18", color:vm2.color, border:"1px solid " + vm2.color + "40", borderRadius:6, padding:"2px 7px", fontSize:11, fontWeight:700 }}>{v.icon} {v.label}{diff!==null?(diff<0?" - hace "+Math.abs(diff)+"d":" - en "+diff+"d"):""}</span>; })}
                      </div>
                      {dog.phone && <button onClick={e=>{e.stopPropagation();openWA(dog.phone,buildWAMsg(dog));}} style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#25D366", color:"white", fontWeight:700, fontSize:11, cursor:"pointer" }}>WhatsApp</button>}
                    </div>
                  </div>
                );
              })}
            </Card>
            {dogs.length > 0 && (
              <Card dark={dark}>
                <div style={{ fontWeight:800, fontSize:14, color:t.text, marginBottom:13 }}>Estado de Conducta</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:9 }}>
                  {Object.entries(BRESULT).map(([key,m]) => { const count = dogs.filter(d=>(d.care?.result||"pending")===key).length; return <div key={key} style={{ padding:"13px 14px", borderRadius:13, background:m.bg, border:"1.5px solid " + m.border, display:"flex", alignItems:"center", gap:9 }}><span style={{ fontSize:20 }}>{m.icon}</span><div><div style={{ fontSize:18, fontWeight:900, color:m.color, fontFamily:"Georgia,serif" }}>{count}</div><div style={{ fontSize:11, color:m.color, fontWeight:600 }}>{m.label}</div></div></div>; })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* List */}
        {view === "list" && (
          <div>
            <div style={{ marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:11 }}>
                <h2 style={{ margin:0, fontSize:19, color:t.text }}>Expedientes <span style={{ fontSize:14, color:t.text3, fontWeight:400 }}>({filtered.length})</span></h2>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, tutor o raza..." style={{ padding:"8px 14px", borderRadius:11, border:"1.5px solid " + t.bord, fontSize:13, background:t.surf, outline:"none", width:260, color:t.text }} />
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {FILTERS.map(f => <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding:"5px 13px", borderRadius:99, border:"1.5px solid " + (filter===f.id?t.acc:t.bord), background:filter===f.id?t.accBg:t.surf, color:filter===f.id?t.accD:t.text2, fontWeight:700, fontSize:12, cursor:"pointer", transition:"all 0.12s" }}>{f.label}</button>)}
              </div>
            </div>
            {filtered.length === 0 ? (
              <Card dark={dark} style={{ textAlign:"center", padding:"46px 0" }}>
                <div style={{ fontSize:46 }}>🐕</div>
                <div style={{ fontWeight:700, fontSize:15, marginTop:9, color:t.text }}>{dogs.length===0 ? "Sin expedientes aun" : "Sin resultados"}</div>
                {dogs.length===0 && isAdmin && <button onClick={() => {setEditDog(null);setView("form");}} style={{ marginTop:13, padding:"9px 22px", borderRadius:11, border:"none", background:"linear-gradient(135deg,#143B31,#AACC71)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13 }}>Crear primer expediente</button>}
              </Card>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:13 }}>
                {filtered.map(dog => {
                  const vs = ovs(dog);
                  const expC = VACCINES.filter(v=>gvs(dog.vaccinations?.[v.id])==="expired").length;
                  const soonC = VACCINES.filter(v=>gvs(dog.vaccinations?.[v.id])==="soon").length;
                  const okC = VACCINES.filter(v=>gvs(dog.vaccinations?.[v.id])==="ok").length;
                  const sv = dog.care?.supervisionLevel ? SUPV[dog.care.supervisionLevel] : null;
                  const miss = isAdmin ? pmiss(dog) : [];
                  const totalInc = (dog.hotelStays||[]).reduce((n,s)=>n+(s.incidents||[]).length,0);
                  return (
                    <Card key={dog.id} dark={dark} onClick={() => {setSelDog(dog);setView("detail");}} style={{ border:"2px solid " + VST[vs].color + "25" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:9 }}>
                        <DogAvatar dog={dog} size={44} />
                        <div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:14, color:t.text }}>{dog.name}</div><div style={{ fontSize:11, color:t.text2 }}>{dog.breed}{dog.sex?" - "+dog.sex:""}{dog.age?" - "+dog.age:""}</div></div>
                        <div style={{ display:"flex", flexDirection:"column", gap:3, alignItems:"flex-end" }}>
                          <VacBadge status={vs} sm />
                          {miss.length > 0 && <span style={{ background:t.accBg, color:t.acc, borderRadius:99, padding:"1px 6px", fontSize:9, fontWeight:800, border:"1px solid " + t.acc + "30" }}>Inc.</span>}
                        </div>
                      </div>
                      <div style={{ fontSize:11, color:t.text2, marginBottom:7 }}>{dog.owner}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
                        {expC>0&&<span style={{ background:"#FEF2F2",color:"#EF4444",borderRadius:7,padding:"2px 7px",fontSize:10,fontWeight:700 }}>{"🚨 "+expC}</span>}
                        {soonC>0&&<span style={{ background:"#E8F0DC",color:"#AACC71",borderRadius:7,padding:"2px 7px",fontSize:10,fontWeight:700 }}>{"⚠ "+soonC}</span>}
                        {okC>0&&<span style={{ background:"#F0FDF4",color:"#22C55E",borderRadius:7,padding:"2px 7px",fontSize:10,fontWeight:700 }}>{"✅ "+okC}</span>}
                        {totalInc>0&&<span style={{ background:"#FEF2F2",color:"#DC2626",borderRadius:7,padding:"2px 7px",fontSize:10,fontWeight:700 }}>{"🚨 "+totalInc+" inc."}</span>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:"1px solid " + t.bord, paddingTop:7 }}>
                        <BehBadge result={dog.care?.result||"pending"} sm />
                        {sv && <span style={{ fontSize:10, fontWeight:700, color:sv.color, background:sv.bg, borderRadius:6, padding:"2px 7px" }}>{"👁 "+sv.label}</span>}
                      </div>
                      {dog.package?.active && pkgStatus(dog.package)==="active" && <div style={{ marginTop:5 }}><span style={{ background:"linear-gradient(135deg,#C1712C,#F8D061)", color:"white", borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:800 }}>★ Paquete activo</span></div>}
                {(dog.areas||[]).length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:7 }}>
                          {(dog.areas||[]).map(a => { const AC = { Guarderia:"#22C55E", Hotel:"#3B82F6", Grooming:"#EC4899", Adiestramiento:"#8B5CF6", "Day Pass Personalizado":"#C1712C" }; const ac = AC[a]||"#6B7280"; return <span key={a} style={{ background:ac+"18", color:ac, border:"1px solid "+ac+"40", borderRadius:99, padding:"1px 8px", fontSize:10, fontWeight:700 }}>{a}</span>; })}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Form */}
        {view === "form" && <DogForm dark={dark} initial={editDog} onSave={handleSave} onCancel={() => setView(editDog?"detail":"list")} isAdmin={isAdmin} currentUser={currentUser} />}

        {/* Detail */}
        {view === "detail" && selDog && <DetailView key={selDog.id} dog={dogs.find(d=>d.id===selDog.id)||selDog} dark={dark} isAdmin={isAdmin} currentUser={currentUser} t={t} onBack={()=>setView("list")} onEdit={d=>{setEditDog(d);setView("form");}} onDelete={handleDelete}/>}
        {false && selDog && (() => {
          const dog = dogs.find(d=>d.id===selDog.id) || selDog;
          const miss = pmiss(dog);
          const sv = dog.care?.supervisionLevel ? SUPV[dog.care.supervisionLevel] : null;
          const stays = dog.hotelStays || [];
          const totalInc = stays.reduce((n,s)=>n+(s.incidents||[]).length,0);
          const care = dog.care || {};
          const g = dog.grooming || {};
          const inc = dog.incidents || {};
          const resp = dog.responsivas || {};
          const bm = BRESULT[care.result] || BRESULT.pending;
          const vs = ovs(dog);
          const yn = v => v==="Si" ? "Si" : v==="No" ? "No" : v||null;
          const treats = v => v==="si" ? "Si" : v==="no" ? "No" : v==="tutor" ? "Solo del tutor" : v||null;
          const meals = [{key:"morning",label:"Manana"},{key:"afternoon",label:"Tarde"},{key:"evening",label:"Noche"}];
          const [dTab, setDTab] = useState("perfil");
          const needsWA = ["expired","soon"].includes(vs) && dog.phone;
          const dtabs = [{id:"perfil",label:"Perfil"},{id:"salud",label:"Salud"},{id:"alimentacion",label:"Aliment."},{id:"comportamiento",label:"Comport."},{id:"vacunas",label:"Vacunas"},{id:"cuidador",label:"Cuidador"},{id:"grooming",label:"Grooming"},{id:"responsivas",label:"Responsivas",badge:isAdmin&&miss.length>0?miss.length:null},{id:"hotel",label:"Hotel",badge:totalInc>0?totalInc:null},{id:"seguimiento",label:"Seguimiento"},{id:"paquete",label:"📦 Paquete"}];
          return (
            <div>
              <button onClick={() => setView("list")} style={{ background:"none", border:"none", color:t.acc, fontWeight:700, cursor:"pointer", fontSize:13, marginBottom:13, padding:0 }}>Volver</button>
              <Card dark={dark}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:18 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:13 }}>
                    <DogAvatar dog={dog} size={62} />
                    <div>
                      <h2 style={{ margin:0, fontSize:20, color:t.text }}>{dog.name}</h2>
                      <div style={{ fontSize:12, color:t.text2, marginTop:2 }}>{dog.breed}{dog.sex?" - "+dog.sex:""}{dog.age?" - "+dog.age:""}{dog.weight?" - "+dog.weight:""}</div>
                      <div style={{ fontSize:12, color:t.text2, marginTop:2 }}>{dog.owner}{dog.phone?" - "+dog.phone:""}</div>
                      {(dog.emergencyVet||dog.emergencyVetPhone) && <div style={{ fontSize:11, color:"#8B5CF6", marginTop:2 }}>{dog.emergencyVet}{dog.emergencyVetPhone?" - "+dog.emergencyVetPhone:""}</div>}
                      <div style={{ display:"flex", gap:6, marginTop:7, flexWrap:"wrap" }}>
                        <BehBadge result={care.result||"pending"} />
                        {sv && <span style={{ fontSize:10, fontWeight:700, color:sv.color, background:sv.bg, border:"1px solid " + sv.color + "30", borderRadius:99, padding:"2px 9px" }}>{"👁 Sup. "+sv.label}</span>}
                        {isAdmin && miss.length>0 && <span style={{ background:t.accBg, color:t.acc, borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:800, border:"1px solid " + t.acc + "30" }}>Responsivas pendientes</span>}
                        {stays.length>0 && <span style={{ background:dark?"#1A2040":"#EFF6FF", color:"#3B82F6", borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700, border:"1px solid #BFDBFE" }}>{"🏨 "+stays.length+(totalInc>0?" - "+totalInc+" inc.":"")}</span>}
                        {(dog.areas||[]).map(a => { const AC = { Guarderia:"#22C55E", Hotel:"#3B82F6", Grooming:"#EC4899", Adiestramiento:"#8B5CF6", "Day Pass Personalizado":"#C1712C" }; const ac = AC[a]||"#6B7280"; return <span key={a} style={{ background:ac+"18", color:ac, border:"1px solid "+ac+"40", borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700 }}>{a}</span>; })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap", justifyContent:"flex-end" }}>
                    {needsWA && <button onClick={() => openWA(dog.phone, buildWAMsg(dog))} style={{ padding:"7px 14px", borderRadius:9, border:"none", background:"#25D366", color:"white", fontWeight:700, cursor:"pointer", fontSize:12 }}>WhatsApp</button>}
                    <button onClick={() => {setEditDog(dog);setView("form");}} style={{ padding:"7px 14px", borderRadius:9, border:"1.5px solid " + t.acc, background:"transparent", color:t.acc, fontWeight:700, cursor:"pointer", fontSize:12 }}>Editar</button>
                    {isAdmin && <button onClick={() => handleDelete(dog.id)} style={{ padding:"7px 14px", borderRadius:9, border:"1.5px solid #EF4444", background:"transparent", color:"#EF4444", fontWeight:700, cursor:"pointer", fontSize:12 }}>Eliminar</button>}
                  </div>
                </div>
                <TabBar tabs={dtabs} active={dTab} onChange={setDTab} dark={dark} />
                <div style={{ marginTop:16 }}>
                  {dTab==="perfil" && <div style={{ display:"flex", flexDirection:"column", gap:10 }}><IGrid cols={3}><IRow dark={dark} label="NOMBRE" value={dog.name}/><IRow dark={dark} label="RAZA" value={dog.breed}/><IRow dark={dark} label="SEXO" value={dog.sex}/><IRow dark={dark} label="EDAD" value={dog.birthdate ? calcAge(dog.birthdate) : (dog.age||null)}/><IRow dark={dark} label="PESO" value={dog.weight}/><IRow dark={dark} label="COLOR" value={dog.color}/><IRow dark={dark} label="FECHA DE NACIMIENTO" value={dog.birthdate||null}/><IRow dark={dark} label="ESTERILIZADO" value={yn(dog.sterilized)}/>{dog.lastCelo&&<IRow dark={dark} label="ULTIMO CELO" value={dog.lastCelo}/>}</IGrid><IGrid cols={2}><IRow dark={dark} label="TUTOR" value={dog.owner}/><IRow dark={dark} label="TEL" value={dog.phone}/></IGrid>{dog.authorizedPeople&&<IRow dark={dark} label="PERSONAS AUTORIZADAS" value={dog.authorizedPeople}/>}<IGrid cols={2}><IRow dark={dark} label="VET. EMERGENCIAS" value={dog.emergencyVet}/><IRow dark={dark} label="TEL. VET." value={dog.emergencyVetPhone}/></IGrid></div>}
                  {dTab==="salud" && <div style={{ display:"flex",flexDirection:"column",gap:10 }}><IRow dark={dark} label="ALERGIAS" value={dog.allergies}/><IRow dark={dark} label="CONDICIONES MEDICAS" value={dog.medicalConditions}/><IRow dark={dark} label="MEDICAMENTOS" value={dog.medications}/><IRow dark={dark} label="DOSIS Y FRECUENCIA" value={dog.dosage}/></div>}
                  {dTab==="alimentacion" && <div style={{ display:"flex",flexDirection:"column",gap:10 }}><IGrid cols={2}><IRow dark={dark} label="PRODUCTO" value={dog.foodProduct}/><IRow dark={dark} label="MEDIDA" value={dog.foodMeasure}/></IGrid>{meals.filter(m=>dog[m.key+"Time"]||dog[m.key+"Amount"]).map(m=><div key={m.key} style={{ display:"flex",alignItems:"center",gap:9,padding:"8px 13px",borderRadius:10,background:t.accBg,border:"1px solid "+t.acc+"30" }}><span style={{ fontWeight:700,fontSize:12,color:t.accD,width:55 }}>{m.label}</span>{dog[m.key+"Time"]&&<span style={{ fontSize:12,color:t.text }}>{dog[m.key+"Time"]}</span>}{dog[m.key+"Amount"]&&<span style={{ fontSize:12,color:t.text,marginLeft:7 }}>{dog[m.key+"Amount"]}</span>}</div>)}<IRow dark={dark} label="NOTAS" value={dog.extraFoodNotes}/><IRow dark={dark} label="PREMIOS" value={treats(dog.treatsAllowed)}/>{dog.treatsAllowed==="tutor"&&<IRow dark={dark} label="PREMIOS DEL TUTOR" value={dog.tutorTreats}/>}</div>}
                  {dTab==="comportamiento" && <div style={{ display:"flex",flexDirection:"column",gap:10 }}><IRow dark={dark} label="CON LAS PERSONAS" value={dog.relationWithPeople}/><IRow dark={dark} label="MIEDOS" value={dog.fearsPhobias}/><IRow dark={dark} label="MANEJO ESPECIAL" value={dog.handlingInstructions}/><IRow dark={dark} label="AUTH. VET. EMERGENCIA" value={yn(dog.vetEmergencyAuth)}/></div>}
                  {dTab==="vacunas" && <div style={{ display:"flex",flexDirection:"column",gap:6 }}>{VACCINES.map(v=><VacRow key={v.id} dark={dark} vac={dog.vaccinations?.[v.id]} label={v.label} icon={v.icon}/>)}</div>}
                  {dTab==="cuidador" && <div style={{ display:"flex",flexDirection:"column",gap:11 }}>
                    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 17px",borderRadius:13,background:bm.bg,border:"1.5px solid "+bm.border }}>
                      <div style={{ display:"flex",alignItems:"center",gap:9 }}><span style={{ fontSize:26 }}>{bm.icon}</span><div><div style={{ fontWeight:800,fontSize:14,color:bm.color }}>{bm.label}</div>{care.date&&<div style={{ fontSize:11,color:"#9CA3AF",marginTop:1 }}>{care.date}{care.evaluator?" - "+care.evaluator:""}</div>}</div></div>
                      {care.result==="training"&&care.trainer&&<div style={{ textAlign:"right" }}><div style={{ fontSize:9,color:"#9CA3AF",fontWeight:700 }}>ENTRENADOR</div><div style={{ fontWeight:700,color:"#8B5CF6" }}>{"🏅 "+care.trainer}</div></div>}
                    </div>
                    {BCRITERIA.some(cr=>care.scores?.[cr.id]!==""&&care.scores?.[cr.id]!==undefined)&&<IGrid cols={2}>{BCRITERIA.map(cr=>{const s=care.scores?.[cr.id];const sm=(s!==""&&s!==undefined)?SCORE_META[s]:null;return<div key={cr.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 11px",borderRadius:9,background:t.surf2,border:"1px solid "+t.bord }}><span style={{ fontSize:12,color:t.text2,fontWeight:600 }}>{cr.label}</span>{sm?<span style={{ fontSize:10,fontWeight:700,color:sm.color,background:sm.color+"18",borderRadius:5,padding:"1px 7px" }}>{sm.label}</span>:<span style={{ fontSize:10,color:t.text3 }}>—</span>}</div>;})}</IGrid>}
                    {sv&&<div style={{ display:"inline-flex",alignItems:"center",gap:7,padding:"6px 13px",borderRadius:9,background:sv.bg,border:"1px solid "+sv.color+"30" }}><span style={{ fontWeight:800,fontSize:12,color:sv.color }}>{"👁 SUPERVISION: "+sv.label}</span></div>}
                    <div style={{ display:"flex",flexDirection:"column",gap:8 }}>{[["AL INGRESAR",care.behaviorAtEntry],["CON OTROS PERROS",care.dogInteraction],["CON EL PERSONAL",care.staffInteraction],["ALIMENTACION E HIDRATACION",care.foodHabits],["DURANTE EL JUEGO",care.playBehavior],["DURANTE EL DESCANSO",care.restBehavior],["OBSERVACIONES",care.notes]].map(([l,v])=><IRow key={l} dark={dark} label={l} value={v}/>)}</div>
                  </div>}
                  {dTab==="grooming" && <div style={{ display:"flex",flexDirection:"column",gap:10 }}><IGrid cols={3}><IRow dark={dark} label="ULTIMO SERVICIO" value={g.lastDate}/><IRow dark={dark} label="ESTILISTA" value={g.stylist}/><IRow dark={dark} label="TIPO" value={g.lastService}/></IGrid>{[["BANHO",g.bathReactions],["SECADO",g.dryingReactions],["CORTE",g.cutReactions],["UNAS",g.nailReactions],["OIDOS",g.earsReactions],["NOTAS",g.notes]].map(([l,v])=><IRow key={l} dark={dark} label={l} value={v}/>)}</div>}
                  {dTab==="responsivas" && <div style={{ display:"flex",flexDirection:"column",gap:13 }}>
                    {isAdmin&&miss.length>0&&<div style={{ display:"flex",alignItems:"center",gap:9,padding:"10px 13px",borderRadius:10,background:t.accBg,border:"1px solid "+t.acc+"30" }}><span>⚠</span><div style={{ fontWeight:700,fontSize:13,color:t.accD }}>{"Faltan: "+miss.join(" - ")}</div></div>}
                    {[{key:"guarderia",label:"Responsiva Guarderia"},{key:"hotel",label:"Responsiva Hotel"}].map(({key,label})=>(
                      <div key={key}><div style={{ fontWeight:800,fontSize:13,color:t.text,marginBottom:7 }}>{label}</div>
                        <div style={{ padding:"11px 14px",borderRadius:11,background:resp[key]?(dark?"#0A2D14":"#F0FDF4"):(dark?"#2D0A0A":"#FEF2F2"),border:"1.5px solid "+(resp[key]?"#86EFAC":"#FECACA"),fontSize:13,color:resp[key]?"#22C55E":"#EF4444",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                          <span>{resp[key] ? "✅ " + resp[key].name + " - " + resp[key].date : "Sin cargar"}</span>
                          {resp[key]?.data && <a href={resp[key].data} download={resp[key].name} style={{ padding:"4px 10px",borderRadius:7,background:"#DCFCE7",color:"#15803D",fontSize:11,fontWeight:700,textDecoration:"none",border:"1px solid #86EFAC" }}>Descargar</a>}
                        </div>
                      </div>
                    ))}
                  </div>}
                  {dTab==="hotel" && <div style={{ display:"flex",flexDirection:"column",gap:13 }}>
                    <div style={{ display:"flex",gap:13,padding:"11px 14px",borderRadius:11,background:t.accBg,border:"1px solid "+t.acc+"30" }}>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:18,fontWeight:900,color:t.acc,fontFamily:"Georgia,serif" }}>{stays.length}</div><div style={{ fontSize:9,color:t.text3,fontWeight:700 }}>ESTANCIAS</div></div>
                      <div style={{ width:1,background:t.bord }}/>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:18,fontWeight:900,color:"#EF4444",fontFamily:"Georgia,serif" }}>{totalInc}</div><div style={{ fontSize:9,color:t.text3,fontWeight:700 }}>INCIDENTES</div></div>
                    </div>
                    {stays.length===0 ? <div style={{ textAlign:"center",padding:"22px 0",color:t.text3 }}><div style={{ fontSize:32 }}>🏨</div><div style={{ fontWeight:700,marginTop:7 }}>Sin estancias</div></div> : stays.slice().reverse().map(stay=><StayCard key={stay.id} dark={dark} stay={stay} dog={dog} currentUser={currentUser} readOnly onDelete={null} onChange={()=>{}}/>)}
                  </div>}
                  {dTab==="seguimiento" && <div style={{ display:"flex",flexDirection:"column",gap:10 }}><IRow dark={dark} label="OBSERVACIONES DE SALUD" value={inc.healthObservations}/><IRow dark={dark} label="RECOMENDACIONES" value={inc.futureRecommendations}/></div>}
                </div>
              </Card>
            </div>
          );
        })()}
      </main>

      <footer style={{ textAlign:"center", padding:"11px 0", color:t.text3, fontSize:10, fontWeight:600, letterSpacing:"0.1em", borderTop:"1px solid " + t.bord }}>
        PAW PARK  |  {currentUser.name}  |  {new Date().toLocaleDateString("es-MX")}
      </footer>
    </div>
  );
}

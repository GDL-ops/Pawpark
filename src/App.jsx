import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase.js";
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs } from "firebase/firestore";



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
  observation:{ label:"En Observacion",        icon:"👁", color:"#F59E0B", bg:"#FFFBEB", border:"#FDE68A" },
};
const BCRITERIA = [
  { id:"sociabilidad", label:"Sociabilidad con otros perros" },
  { id:"agresividad",  label:"Ausencia de agresividad"       },
  { id:"obediencia",   label:"Obediencia basica"             },
  { id:"estres",       label:"Manejo del estres"             },
  { id:"juego",        label:"Juego apropiado"               },
];
const SCORE_META = { 3:{label:"Excelente",color:"#22C55E"}, 2:{label:"Bien",color:"#84CC16"}, 1:{label:"Regular",color:"#F59E0B"}, 0:{label:"Deficiente",color:"#EF4444"} };
const VST = {
  expired:{ label:"Vencida",      color:"#EF4444", bg:"#FEF2F2" },
  soon:   { label:"Por vencer",   color:"#F59E0B", bg:"#FFFBEB" },
  ok:     { label:"Al dia",       color:"#22C55E", bg:"#F0FDF4" },
  none:   { label:"Sin registro", color:"#9CA3AF", bg:"#F9FAFB" },
};
const SUPV = { bajo:{label:"BAJO",color:"#22C55E",bg:"#F0FDF4"}, medio:{label:"MEDIO",color:"#F59E0B",bg:"#FFFBEB"}, alto:{label:"ALTO",color:"#EF4444",bg:"#FEF2F2"} };
const HOME_PANELS = [{id:"dashboard",label:"Panel General",icon:"📊"},{id:"hotel",label:"Hotel",icon:"🏨"},{id:"conducta",label:"Conducta",icon:"🎓"},{id:"grooming",label:"Grooming",icon:"✂"},{id:"guarderia",label:"Guarderia",icon:"🐾"}];
const STAFF_EDITABLE = new Set(["alimentacion","cuidador","grooming","hotel","seguimiento"]);
const DEFAULT_ADMIN = { id:"admin", name:"Admin", pin:"1234", isAdmin:true, homePanel:"dashboard", color:"#F59E0B" };
const AREAS = ["Guarderia","Hotel","Grooming","Adiestramiento","Daycare"];

// ---- Helpers ----------------------------------------------------------------
const mkId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const ddiff = ds => !ds ? null : Math.floor((new Date(ds) - new Date()) / 864e5);
const gvs = vac => { if (!vac?.expiry) return "none"; const d = ddiff(vac.expiry); return d < 0 ? "expired" : d <= 30 ? "soon" : "ok"; };
function ovs(dog) { const ss = VACCINES.map(v => gvs(dog.vaccinations?.[v.id])); if (ss.includes("expired")) return "expired"; if (ss.includes("none")) return "none"; if (ss.includes("soon")) return "soon"; return "ok"; }
const pmiss = dog => { const m = []; if (!dog.responsivas?.guarderia?.name) m.push("Responsiva Guarderia"); if (!dog.responsivas?.hotel?.name) m.push("Responsiva Hotel"); return m; };
const defVac = () => Object.fromEntries(VACCINES.map(v => [v.id, { applied:"", expiry:"" }]));
const defDog = () => ({
  id:mkId(), photoColor:"#F59E0B",
  name:"", breed:"", sex:"", age:"", weight:"", color:"", sterilized:"", lastCelo:"",
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

// ---- Style helpers ----------------------------------------------------------
function useT(dark) {
  return {
    bg: dark ? "#0F1117" : "#F4F6FA",
    surf: dark ? "#1A1D27" : "#FFFFFF",
    surf2: dark ? "#22273A" : "#F0F2F7",
    bord: dark ? "#2E3350" : "#E2E6EF",
    text: dark ? "#F0F2FF" : "#111827",
    text2: dark ? "#8B91B0" : "#6B7280",
    text3: dark ? "#555E80" : "#9CA3AF",
    acc: "#F59E0B",
    accD: "#D97706",
    accBg: dark ? "#2D2200" : "#FFFBEB",
    red: "#EF4444",
    green: "#22C55E",
    head: dark ? "linear-gradient(135deg,#1A1D27,#2A2200)" : "linear-gradient(135deg,#7C3A1A,#D97706)",
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
  const c = dog.photoColor || "#F59E0B";
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:"linear-gradient(135deg," + c + "," + c + "99)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:800, fontSize:size*0.34, flexShrink:0, boxShadow:"0 2px 8px " + c + "50" }}>
      {dog.name?.slice(0,2).toUpperCase() || "🐕"}
    </div>
  );
}

function Lbl({ children, dark }) {
  const t = useT(dark);
  return <label style={{ fontSize:11, fontWeight:700, color:t.text3, letterSpacing:"0.06em", display:"block", marginBottom:5 }}>{children}</label>;
}

function SecTitle({ children, dark }) {
  const t = useT(dark);
  return (
    <div style={{ fontSize:10, fontWeight:800, color:t.text3, letterSpacing:"0.1em", margin:"10px 0 12px", display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:1, background:t.bord }} />{children}<div style={{ flex:1, height:1, background:t.bord }} />
    </div>
  );
}

function IRow({ label, value, dark }) {
  const t = useT(dark);
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
  const t = useT(dark);
  return <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10, background:t.surf2, border:"1px solid " + t.bord, marginBottom:8 }}><span>🔒</span><span style={{ fontSize:12, color:t.text2, fontWeight:600 }}>Solo el administrador puede editar esta seccion</span></div>;
}

function inp(dark, disabled) {
  const t = useT(dark);
  return disabled ? { width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid " + t.bord, fontSize:13, background:t.surf2, outline:"none", color:t.text3, boxSizing:"border-box", cursor:"not-allowed" }
    : { width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid " + t.bord, fontSize:13, background:t.surf, outline:"none", color:t.text, boxSizing:"border-box" };
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
  const t = useT(dark);
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
  const t = useT(dark);
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
  const t = useT(dark);
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
  const t = useT(dark);
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

// ---- VacRow -----------------------------------------------------------------
function VacRow({ vac, label, icon, onChange, dark }) {
  const t = useT(dark);
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
  const t = useT(dark);
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
  const t = useT(dark);
  const [showInc, setShowInc] = useState(false);
  const sum = buildSum(dog);
  const alerts = sum.filter(l => l.alert || l.warn || l.sv === "alto");
  const info = sum.filter(l => !l.alert && !l.warn && l.sv !== "alto");
  const sv = dog.care?.supervisionLevel ? SUPV[dog.care.supervisionLevel] : null;
  const addInc = inc => onChange({...stay, incidents:[...(stay.incidents||[]), inc]});
  const delInc = id => onChange({...stay, incidents:(stay.incidents||[]).filter(i => i.id !== id)});
  return (
    <div style={{ borderRadius:18, border:"1.5px solid " + t.bord, overflow:"hidden", boxShadow:"0 2px 12px #0000000A" }}>
      <div style={{ background:"linear-gradient(135deg,#7C3A1A,#D97706)", padding:"13px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:20 }}>🏨</span>
          <div>
            <div style={{ color:"white", fontWeight:800, fontSize:15 }}>{dog.name}</div>
            <div style={{ color:"#FDE68A", fontSize:12 }}>{stay.checkIn && stay.checkOut ? stay.checkIn + " al " + stay.checkOut : stay.checkIn || stay.checkOut || "Fechas pendientes"}</div>
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
    <div style={{ minHeight:"100vh", background:"linear-gradient(145deg,#0F1117,#1A1D27)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:300, textAlign:"center" }}>
        <div style={{ marginBottom:28 }}>
          <div style={{ width:68, height:68, borderRadius:"50%", background:"linear-gradient(135deg,#D97706,#F59E0B)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, margin:"0 auto 12px", boxShadow:"0 6px 24px #F59E0B50" }}>🐾</div>
          <div style={{ color:"white", fontFamily:"Georgia,serif", fontWeight:900, fontSize:24 }}>Paw Park</div>
          <div style={{ color:"#F59E0B", fontSize:10, letterSpacing:"0.2em", fontWeight:700, marginTop:3 }}>EXPEDIENTE CANINO</div>
        </div>
        <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:22, padding:"28px 24px", border:"1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", letterSpacing:"0.15em", fontWeight:600, marginBottom:20 }}>INGRESA TU PIN</div>
          <div style={{ display:"flex", justifyContent:"center", gap:14, marginBottom:20, animation:shake?"shake 0.4s":"none" }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width:14, height:14, borderRadius:"50%", background:i<pin.length?"#F59E0B":"rgba(255,255,255,0.15)", transition:"all 0.15s", transform:i<pin.length?"scale(1.2)":"scale(1)" }} />)}
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
  const t = useT(dark);
  const [list, setList] = useState(users.map(u => ({...u})));
  const [editing, setEditing] = useState(null);
  const [p1, setP1] = useState(""); const [p2, setP2] = useState(""); const [pe, setPe] = useState("");
  const COLORS = ["#F59E0B","#EF4444","#8B5CF6","#10B981","#3B82F6","#EC4899","#F97316","#6B7280"];
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
              <button onClick={saveU} style={{ padding:"7px 18px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#D97706,#F59E0B)", color:"white", fontWeight:700, cursor:"pointer", fontSize:12 }}>Guardar</button>
            </div>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:18 }}>
          <button onClick={() => onSave(list)} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#D97706,#F59E0B)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13 }}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

// ---- Form Tab Sections ------------------------------------------------------
const FORM_TABS = [{id:"perrito",label:"🐾 Perrito"},{id:"tutor",label:"👤 Tutor"},{id:"salud",label:"🏥 Salud"},{id:"alimentacion",label:"🍽 Aliment."},{id:"comportamiento",label:"🧠 Comport."},{id:"vacunas",label:"💉 Vacunas"},{id:"cuidador",label:"📋 Cuidador"},{id:"grooming",label:"✂ Grooming"},{id:"responsivas",label:"📄 Responsivas"},{id:"hotel",label:"🏨 Hotel"},{id:"seguimiento",label:"🚨 Seguimiento"}];

function DogForm({ initial, onSave, onCancel, isAdmin, currentUser, dark }) {
  const t = useT(dark);
  const [dog, setDog] = useState(initial ? {...defDog(),...initial} : defDog());
  const [tab, setTab] = useState(isAdmin ? "perrito" : "alimentacion");
  const set = (k,v) => setDog(d => ({...d, [k]:v}));
  const setVac = (vid,f,val) => setDog(d => ({...d, vaccinations:{...d.vaccinations, [vid]:{...d.vaccinations[vid],[f]:val}}}));
  const miss = pmiss(dog);
  const ro = id => !isAdmin && !STAFF_EDITABLE.has(id);
  const COLORS = ["#F59E0B","#EF4444","#8B5CF6","#10B981","#3B82F6","#EC4899","#F97316","#6B7280"];
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
              <Field dark={dark} label="EDAD" value={dog.age} onChange={ro("perrito")?null:v=>set("age",v)} placeholder="2 años" />
              <Field dark={dark} label="PESO" value={dog.weight} onChange={ro("perrito")?null:v=>set("weight",v)} placeholder="12 kg" />
              <Field dark={dark} label="COLOR / SENAS" value={dog.color} onChange={ro("perrito")?null:v=>set("color",v)} placeholder="Dorado" />
            </div>
            <Radio dark={dark} label="ESTERILIZADO?" value={dog.sterilized} onChange={ro("perrito")?null:v=>set("sterilized",v)} options={[{value:"Si",label:"Si"},{value:"No",label:"No"}]} disabled={ro("perrito")} />
            {dog.sex==="Hembra" && dog.sterilized==="No" && <Field dark={dark} label="ULTIMO CELO" value={dog.lastCelo} onChange={ro("perrito")?null:v=>set("lastCelo",v)} type="date" />}
            <div>
              <Lbl dark={dark}>AREAS / SERVICIOS ASIGNADOS</Lbl>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {AREAS.map(a => {
                  const active = (dog.areas||[]).includes(a);
                  const AREA_COLORS = { Guarderia:"#22C55E", Hotel:"#3B82F6", Grooming:"#EC4899", Adiestramiento:"#8B5CF6", Daycare:"#F59E0B" };
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
              {!showNS && <button onClick={() => setShowNS(true)} style={{ padding:"8px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#D97706,#F59E0B)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13 }}>+ Nueva estancia</button>}
            </div>
            {showNS && (
              <div style={{ background:t.accBg, border:"1.5px solid " + t.acc + "40", borderRadius:13, padding:"15px 17px", display:"flex", flexDirection:"column", gap:11 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11 }}>
                  <Field dark={dark} label="FECHA INGRESO" value={ns.checkIn} onChange={v=>setNs(s=>({...s,checkIn:v}))} type="date" />
                  <Field dark={dark} label="FECHA SALIDA" value={ns.checkOut} onChange={v=>setNs(s=>({...s,checkOut:v}))} type="date" />
                </div>
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <button onClick={()=>setShowNS(false)} style={{ padding:"7px 15px", borderRadius:9, border:"1.5px solid " + t.bord, background:t.surf, color:t.text2, fontWeight:600, cursor:"pointer", fontSize:12 }}>Cancelar</button>
                  <button onClick={() => { set("hotelStays",[...stays,{id:mkId(),checkIn:ns.checkIn,checkOut:ns.checkOut,notes:"",incidents:[]}]); setNs({checkIn:"",checkOut:""}); setShowNS(false); }} style={{ padding:"7px 16px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#D97706,#F59E0B)", color:"white", fontWeight:700, cursor:"pointer", fontSize:12 }}>Crear</button>
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
          <button onClick={() => onSave(dog)} style={{ padding:"9px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#D97706,#F59E0B)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13, boxShadow:"0 4px 12px #D9770640" }}>Guardar expediente</button>
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
  const dtabs=[{id:"perfil",label:"Perfil"},{id:"salud",label:"Salud"},{id:"alimentacion",label:"Aliment."},{id:"comportamiento",label:"Comport."},{id:"vacunas",label:"Vacunas"},{id:"cuidador",label:"Cuidador"},{id:"grooming",label:"Grooming"},{id:"responsivas",label:"Responsivas",badge:isAdmin&&miss.length>0?miss.length:null},{id:"hotel",label:"Hotel",badge:totalInc>0?totalInc:null},{id:"seguimiento",label:"Seguimiento"}];
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
                {(dog.areas||[]).map(a=>{const AC={Guarderia:"#22C55E",Hotel:"#3B82F6",Grooming:"#EC4899",Adiestramiento:"#8B5CF6",Daycare:"#F59E0B"};const ac=AC[a]||"#6B7280";return <span key={a} style={{ background:ac+"18", color:ac, border:"1px solid "+ac+"40", borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700 }}>{a}</span>;})}
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
          {dTab==="perfil"&&<div style={{ display:"flex", flexDirection:"column", gap:10 }}><IGrid cols={3}><IRow dark={dark} label="NOMBRE" value={dog.name}/><IRow dark={dark} label="RAZA" value={dog.breed}/><IRow dark={dark} label="SEXO" value={dog.sex}/><IRow dark={dark} label="EDAD" value={dog.age}/><IRow dark={dark} label="PESO" value={dog.weight}/><IRow dark={dark} label="COLOR" value={dog.color}/><IRow dark={dark} label="ESTERILIZADO" value={yn(dog.sterilized)}/>{dog.lastCelo&&<IRow dark={dark} label="ULTIMO CELO" value={dog.lastCelo}/>}</IGrid><IGrid cols={2}><IRow dark={dark} label="TUTOR" value={dog.owner}/><IRow dark={dark} label="TEL" value={dog.phone}/></IGrid>{dog.authorizedPeople&&<IRow dark={dark} label="PERSONAS AUTORIZADAS" value={dog.authorizedPeople}/>}<IGrid cols={2}><IRow dark={dark} label="VET. EMERGENCIAS" value={dog.emergencyVet}/><IRow dark={dark} label="TEL. VET." value={dog.emergencyVetPhone}/></IGrid></div>}
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
        </div>
      </Card>
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
  const t = useT(dark);

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
      } else {
        // Seed default admin on first run
        setDoc(doc(db, "users", DEFAULT_ADMIN.id), DEFAULT_ADMIN).catch(()=>{});
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

  if (!loaded) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:t.bg, color:t.acc, fontSize:18 }}>Cargando Paw Park...</div>;
  if (!currentUser) return <PinPad users={users.filter(u=>u.pin)} onSuccess={login} />;

  return (
    <div style={{ minHeight:"100vh", background:t.bg, fontFamily:"'Nunito','Segoe UI',sans-serif", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <header style={{ background:t.head, padding:"0 22px", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 4px 16px #D9770640", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 0" }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🐾</div>
          <div>
            <div style={{ color:"#FEF3C7", fontWeight:900, fontSize:19, letterSpacing:"-0.5px", lineHeight:1, fontFamily:"Georgia,serif" }}>Paw Park</div>
            <div style={{ color:"#FDE68A", fontSize:9, letterSpacing:"0.2em", fontWeight:600 }}>EXPEDIENTE CANINO DIGITAL</div>
          </div>
        </div>
        <nav style={{ display:"flex", gap:3, alignItems:"center" }}>
          {[{id:"dashboard",label:"Panel"},{id:"list",label:"Expedientes"}].map(n => (
            <button key={n.id} onClick={() => {setView(n.id);setSearch("");setFilter("all");}} style={{ padding:"7px 14px", borderRadius:9, border:"none", cursor:"pointer", background:view===n.id?"rgba(255,255,255,0.2)":"transparent", color:view===n.id?"white":"#FDE68A", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
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
            <button onClick={logout} style={{ background:"rgba(255,255,255,0.12)", border:"none", borderRadius:6, color:"#FDE68A", fontSize:10, cursor:"pointer", padding:"2px 7px", fontWeight:700 }}>Salir</button>
          </div>
        </nav>
      </header>

      {showUM && <UserMgr dark={dark} users={users} onSave={saveUsers} onClose={() => setShowUM(false)} />}

      <main style={{ flex:1, padding:"20px 22px", maxWidth:1120, margin:"0 auto", width:"100%", boxSizing:"border-box" }}>

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
              {[{icon:"🐕",v:dogs.length,label:"Expedientes",c:t.acc},{icon:"✅",v:dogs.filter(d=>ovs(d)==="ok").length,label:"Vacunas al dia",c:"#22C55E"},{icon:"⚠",v:dogs.filter(d=>ovs(d)==="soon").length,label:"Por vencer",c:"#F59E0B"},{icon:"🚨",v:dogs.filter(d=>ovs(d)==="expired").length,label:"Vencidas",c:"#EF4444"},{icon:"🎓",v:dogs.filter(d=>d.care?.result==="apt").length,label:"Aptos guarderia",c:"#8B5CF6"}].map(s => (
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
                {dogs.length===0 && isAdmin && <button onClick={() => {setEditDog(null);setView("form");}} style={{ marginTop:13, padding:"9px 22px", borderRadius:11, border:"none", background:"linear-gradient(135deg,#D97706,#F59E0B)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13 }}>Crear primer expediente</button>}
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
                        {soonC>0&&<span style={{ background:"#FFFBEB",color:"#F59E0B",borderRadius:7,padding:"2px 7px",fontSize:10,fontWeight:700 }}>{"⚠ "+soonC}</span>}
                        {okC>0&&<span style={{ background:"#F0FDF4",color:"#22C55E",borderRadius:7,padding:"2px 7px",fontSize:10,fontWeight:700 }}>{"✅ "+okC}</span>}
                        {totalInc>0&&<span style={{ background:"#FEF2F2",color:"#DC2626",borderRadius:7,padding:"2px 7px",fontSize:10,fontWeight:700 }}>{"🚨 "+totalInc+" inc."}</span>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:"1px solid " + t.bord, paddingTop:7 }}>
                        <BehBadge result={dog.care?.result||"pending"} sm />
                        {sv && <span style={{ fontSize:10, fontWeight:700, color:sv.color, background:sv.bg, borderRadius:6, padding:"2px 7px" }}>{"👁 "+sv.label}</span>}
                      </div>
                      {(dog.areas||[]).length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:7 }}>
                          {(dog.areas||[]).map(a => { const AC = { Guarderia:"#22C55E", Hotel:"#3B82F6", Grooming:"#EC4899", Adiestramiento:"#8B5CF6", Daycare:"#F59E0B" }; const ac = AC[a]||"#6B7280"; return <span key={a} style={{ background:ac+"18", color:ac, border:"1px solid "+ac+"40", borderRadius:99, padding:"1px 8px", fontSize:10, fontWeight:700 }}>{a}</span>; })}
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
          const dtabs = [{id:"perfil",label:"Perfil"},{id:"salud",label:"Salud"},{id:"alimentacion",label:"Aliment."},{id:"comportamiento",label:"Comport."},{id:"vacunas",label:"Vacunas"},{id:"cuidador",label:"Cuidador"},{id:"grooming",label:"Grooming"},{id:"responsivas",label:"Responsivas",badge:isAdmin&&miss.length>0?miss.length:null},{id:"hotel",label:"Hotel",badge:totalInc>0?totalInc:null},{id:"seguimiento",label:"Seguimiento"}];
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
                        {(dog.areas||[]).map(a => { const AC = { Guarderia:"#22C55E", Hotel:"#3B82F6", Grooming:"#EC4899", Adiestramiento:"#8B5CF6", Daycare:"#F59E0B" }; const ac = AC[a]||"#6B7280"; return <span key={a} style={{ background:ac+"18", color:ac, border:"1px solid "+ac+"40", borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700 }}>{a}</span>; })}
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
                  {dTab==="perfil" && <div style={{ display:"flex", flexDirection:"column", gap:10 }}><IGrid cols={3}><IRow dark={dark} label="NOMBRE" value={dog.name}/><IRow dark={dark} label="RAZA" value={dog.breed}/><IRow dark={dark} label="SEXO" value={dog.sex}/><IRow dark={dark} label="EDAD" value={dog.age}/><IRow dark={dark} label="PESO" value={dog.weight}/><IRow dark={dark} label="COLOR" value={dog.color}/><IRow dark={dark} label="ESTERILIZADO" value={yn(dog.sterilized)}/>{dog.lastCelo&&<IRow dark={dark} label="ULTIMO CELO" value={dog.lastCelo}/>}</IGrid><IGrid cols={2}><IRow dark={dark} label="TUTOR" value={dog.owner}/><IRow dark={dark} label="TEL" value={dog.phone}/></IGrid>{dog.authorizedPeople&&<IRow dark={dark} label="PERSONAS AUTORIZADAS" value={dog.authorizedPeople}/>}<IGrid cols={2}><IRow dark={dark} label="VET. EMERGENCIAS" value={dog.emergencyVet}/><IRow dark={dark} label="TEL. VET." value={dog.emergencyVetPhone}/></IGrid></div>}
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

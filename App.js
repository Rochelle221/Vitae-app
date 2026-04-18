import { useState, useEffect, useRef } from "react";

// ─── Helpers ─────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const todayStr = () => new Date().toISOString().split("T")[0];
const nowStr = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const fmtDate = d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
const fmtDateShort = d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
const minsToLabel = m => { if(!m||m<=0)return""; if(m<60)return`${m}m`; const h=Math.floor(m/60),r=m%60; return r?`${h}h ${r}m`:`${h}h`; };

// ─── Constants ───────────────────────────────────────────────
const LIST_COLORS=["#8B6F47","#2980b9","#27ae60","#8e44ad","#c0392b","#e67e22","#16a085","#d35400"];
const LIST_ICONS=["📋","🏥","💊","🛒","💼","🏠","🎯","📚","🍽️","✈️","💪","🧘"];

const LEAD_OPTIONS=[
  {label:"At the time",mins:0},{label:"5 min before",mins:5},{label:"15 min before",mins:15},
  {label:"30 min before",mins:30},{label:"1 hr before",mins:60},{label:"2 hrs before",mins:120},{label:"1 day before",mins:1440},
];

const defaultLists=[
  {id:"l1",name:"Daily Routines",icon:"🏠",color:"#8B6F47",items:[
    {id:"i1",text:"Take morning medication",done:false,time:"08:00",reminderSet:false},
    {id:"i2",text:"Drink 2L water",done:false,time:"",reminderSet:false},
    {id:"i3",text:"Evening walk",done:false,time:"18:00",reminderSet:false},
  ]},
  {id:"l2",name:"GP Appointments",icon:"🏥",color:"#c0392b",items:[
    {id:"i4",text:"Blood test results follow-up",done:false,date:"2026-04-25",apptTime:"10:30",notes:"Fasting required",reminderSet:false},
    {id:"i5",text:"Migraine review",done:false,date:"2026-05-03",apptTime:"14:00",notes:"Bring symptom log",reminderSet:false},
  ]},
  {id:"l3",name:"Dietitian",icon:"🍽️",color:"#27ae60",items:[
    {id:"i6",text:"Dairy elimination check-in",done:false,date:"2026-05-10",apptTime:"11:00",notes:"Food diary ready",reminderSet:false},
  ]},
  {id:"l4",name:"Groceries",icon:"🛒",color:"#2980b9",items:[
    {id:"i7",text:"Lactose-free milk",done:false,reminderSet:false},
    {id:"i8",text:"Magnesium supplements",done:false,reminderSet:false},
    {id:"i9",text:"Ginger tea",done:false,reminderSet:false},
  ]},
  {id:"l5",name:"Work",icon:"💼",color:"#8e44ad",items:[
    {id:"i10",text:"Submit monthly report",done:false,time:"17:00",reminderSet:false},
    {id:"i11",text:"Team meeting prep",done:false,time:"09:00",reminderSet:false},
  ]},
];

const defaultSymTypes=[
  {id:"migraine",label:"Migraine",icon:"⚡",color:"#c0392b"},
  {id:"dairy",label:"Dairy Reaction",icon:"🥛",color:"#e67e22"},
  {id:"fatigue",label:"Fatigue",icon:"😴",color:"#8e44ad"},
  {id:"nausea",label:"Nausea",icon:"🤢",color:"#27ae60"},
  {id:"anxiety",label:"Anxiety",icon:"💭",color:"#2980b9"},
  {id:"headache",label:"Headache",icon:"🤕",color:"#d35400"},
  {id:"jointpain",label:"Joint Pain",icon:"🦴",color:"#7f8c8d"},
  {id:"rash",label:"Skin Reaction",icon:"🔴",color:"#e74c3c"},
  {id:"breathing",label:"Breathing",icon:"🫁",color:"#1abc9c"},
  {id:"other",label:"Other",icon:"📝",color:"#95a5a6"},
];

const TRIGGER_OPTIONS=["Stress","Poor sleep","Dairy","Alcohol","Bright light","Loud noise","Skipped meal","Hormonal","Weather change","Exercise","Caffeine","Screen time","Dehydration","Strong smell","Travel","Medications"];
const SEVERITY=[1,2,3,4,5,6,7,8,9,10];

const defaultSymptoms=[];

// ─── localStorage persistence ─────────────────────────────────
function usePersisted(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

// ─── Shared style objects ─────────────────────────────────────
const SL={fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#9e8e7e",marginBottom:8,display:"block"};
const LAB={fontSize:11,color:"#9e8e7e",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",display:"block",marginBottom:5};

// ══════════════════════════════════════════════════════════════
// Reminder Modal — schedules a local notification via the
// Web Notifications API (works on iOS 16.4+ when added to
// home screen as PWA)
// ══════════════════════════════════════════════════════════════
function ReminderModal({item, listName, listColor, onClose, onSaved}) {
  const defaultDate = item.date || todayStr();
  const defaultTime = item.apptTime || item.time || nowStr();
  const [rDate,setRDate]=useState(defaultDate);
  const [rTime,setRTime]=useState(defaultTime);
  const [rLead,setRLead]=useState(item.date?60:0);
  const [rNote,setRNote]=useState(item.notes||"");
  const [status,setStatus]=useState("idle");
  const [errMsg,setErrMsg]=useState("");

  const scheduleNotification = async () => {
    if (!rDate || !rTime) { setErrMsg("Please choose a date and time."); setStatus("error"); return; }
    setStatus("saving");
    try {
      // Request notification permission
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notification permission was denied. On iPhone, go to Settings → Safari → Notifications and allow this site.");

      // Calculate when to fire
      const [y,mo,d] = rDate.split("-").map(Number);
      const [h,mi] = rTime.split(":").map(Number);
      const fireAt = new Date(y, mo-1, d, h, mi, 0).getTime() - rLead * 60000;
      const msUntil = fireAt - Date.now();

      if (msUntil < 0) throw new Error("That time is in the past — please choose a future date and time.");

      // Store reminder in localStorage so service worker can fire it
      const reminders = JSON.parse(localStorage.getItem("vitae_reminders") || "[]");
      const newReminder = {
        id: uid(),
        fireAt,
        title: "Vitae: " + item.text,
        body: [rNote, listName, rDate && fmtDate(rDate)].filter(Boolean).join(" · "),
        itemId: item.id,
      };
      reminders.push(newReminder);
      localStorage.setItem("vitae_reminders", JSON.stringify(reminders));

      // Schedule via setTimeout if app stays open, as a fallback
      if (msUntil < 86400000) { // within 24 hours
        setTimeout(() => {
          new Notification(newReminder.title, { body: newReminder.body, icon: "/icon-192.png" });
        }, msUntil);
      }

      await onSaved({ rDate, rTime, rLead, rNote, item });
      setStatus("done");
    } catch(e) { setErrMsg(e.message || "Could not schedule reminder."); setStatus("error"); }
  };

  const INP={fontFamily:"inherit",background:"white",border:"1.5px solid #e0d8d0",borderRadius:9,padding:"10px 13px",fontSize:14,color:"#1a1714",outline:"none",width:"100%"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(26,23,20,0.65)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div style={{background:"white",width:"100%",maxHeight:"92vh",borderRadius:"22px 22px 0 0",overflowY:"auto",padding:"10px 18px 44px",fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:40,height:4,background:"#e0d8d0",borderRadius:4,margin:"10px auto 18px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <div style={{width:42,height:42,borderRadius:12,background:listColor+"20",border:`2px solid ${listColor}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🔔</div>
          <div>
            <div style={{fontWeight:700,fontSize:17}}>Set reminder</div>
            <div style={{fontSize:13,color:"#9e8e7e",marginTop:1}}>{item.text}</div>
            <div style={{fontSize:11,color:listColor,marginTop:2,fontWeight:600}}>{listName}</div>
          </div>
        </div>

        {status==="done" ? (
          <div style={{textAlign:"center",padding:"24px 0"}}>
            <div style={{fontSize:52,marginBottom:14}}>✅</div>
            <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>Reminder scheduled!</div>
            <div style={{fontSize:14,color:"#9e8e7e",marginBottom:6}}>{fmtDate(rDate)} at {rTime}</div>
            <div style={{fontSize:13,color:"#9e8e7e",marginBottom:24}}>{rLead>0 ? LEAD_OPTIONS.find(l=>l.mins===rLead)?.label+" alert" : "Alert at the time"}</div>
            <button onClick={onClose} style={{background:"#8B6F47",color:"white",border:"none",borderRadius:11,padding:"13px 36px",fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Done</button>
          </div>
        ) : status==="error" ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:40,marginBottom:10}}>⚠️</div>
            <div style={{color:"#c0392b",fontSize:14,marginBottom:20,lineHeight:1.6,padding:"0 10px"}}>{errMsg}</div>
            <button onClick={()=>{setStatus("idle");setErrMsg("");}} style={{background:"#f0ebe1",border:"none",borderRadius:9,padding:"11px 28px",cursor:"pointer",fontFamily:"inherit",fontSize:14}}>Try again</button>
          </div>
        ) : (
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              <div><span style={LAB}>Date</span><input type="date" value={rDate} onChange={e=>setRDate(e.target.value)} style={INP}/></div>
              <div><span style={LAB}>Time</span><input type="time" value={rTime} onChange={e=>setRTime(e.target.value)} style={INP}/></div>
            </div>
            <div style={{marginBottom:18}}>
              <span style={LAB}>Alert me</span>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginTop:4}}>
                {LEAD_OPTIONS.map(o=>(
                  <button key={o.mins} onClick={()=>setRLead(o.mins)} style={{padding:"7px 13px",borderRadius:20,border:`1.5px solid ${rLead===o.mins?"#8B6F47":"#e0d8d0"}`,background:rLead===o.mins?"#8B6F47":"white",color:rLead===o.mins?"white":"#5a5048",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:rLead===o.mins?600:400,transition:"all 0.12s"}}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:18}}>
              <span style={LAB}>Note <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional)</span></span>
              <textarea value={rNote} onChange={e=>setRNote(e.target.value)} rows={2} placeholder="Any context for this reminder…" style={{...INP,resize:"vertical"}}/>
            </div>
            {rDate&&rTime&&(
              <div style={{background:"#f7f4ef",borderRadius:10,padding:"12px 14px",marginBottom:18,fontSize:13,color:"#5a5048",lineHeight:1.6}}>
                <strong style={{color:"#1a1714"}}>📅 {fmtDate(rDate)} at {rTime}</strong>
                {rLead>0&&<div style={{marginTop:2,color:"#9e8e7e"}}>🔔 Alert {LEAD_OPTIONS.find(l=>l.mins===rLead)?.label}</div>}
              </div>
            )}
            <button onClick={scheduleNotification} style={{width:"100%",background:"#8B6F47",color:"white",border:"none",borderRadius:11,padding:"14px",fontSize:15,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
              🔔 Set reminder
            </button>
            <p style={{fontSize:11,color:"#b0a898",textAlign:"center",marginTop:12,lineHeight:1.5}}>
              On iPhone: notifications work when Vitae is added to your Home Screen and you allow notifications when prompted.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main App
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [tab,setTab]=useState("lists");
  const [lists,setLists]=usePersisted("vitae_lists", defaultLists);
  const [symptoms,setSymptoms]=usePersisted("vitae_symptoms", defaultSymptoms);
  const [symTypes,setSymTypes]=usePersisted("vitae_symtypes", defaultSymTypes);
  const [activeList,setActiveList]=useState(null);
  const [activeSymId,setActiveSymId]=useState(null);
  const [showNewList,setShowNewList]=useState(false);
  const [showLogSym,setShowLogSym]=useState(false);
  const [showNewSymType,setShowNewSymType]=useState(false);
  const [showReport,setShowReport]=useState(false);
  const [reminderTarget,setReminderTarget]=useState(null);
  const [reportCopied,setReportCopied]=useState(false);

  const [nlName,setNlName]=useState(""); const [nlIcon,setNlIcon]=useState("📋"); const [nlColor,setNlColor]=useState(LIST_COLORS[0]);

  const blankSym={type:"migraine",severity:5,triggers:[],date:todayStr(),startTime:nowStr(),endTime:"",durationMins:0,notes:"",meds:"",location:"",aura:false};
  const [sym,setSym]=useState(blankSym);
  const [symTimerRunning,setSymTimerRunning]=useState(false);
  const [symTimerStart,setSymTimerStart]=useState(null);
  const [symTimerElapsed,setSymTimerElapsed]=useState(0);
  const timerRef=useRef(null);

  const [nstLabel,setNstLabel]=useState(""); const [nstIcon,setNstIcon]=useState("🔔"); const [nstColor,setNstColor]=useState(LIST_COLORS[3]);
  const [niText,setNiText]=useState(""); const [niTime,setNiTime]=useState(""); const [niDate,setNiDate]=useState(""); const [niApptTime,setNiApptTime]=useState(""); const [niNotes,setNiNotes]=useState(""); const [isAppt,setIsAppt]=useState(false);
  const [editingListId,setEditingListId]=useState(null); const [editingListName,setEditingListName]=useState("");

  useEffect(()=>{
    if(symTimerRunning){timerRef.current=setInterval(()=>setSymTimerElapsed(Math.floor((Date.now()-symTimerStart)/1000)),1000);}
    else{clearInterval(timerRef.current);}
    return()=>clearInterval(timerRef.current);
  },[symTimerRunning,symTimerStart]);

  const startTimer=()=>{setSymTimerStart(Date.now());setSymTimerRunning(true);setSymTimerElapsed(0);setSym(s=>({...s,startTime:nowStr(),date:todayStr()}));};
  const stopTimer=()=>{setSymTimerRunning(false);setSym(s=>({...s,endTime:nowStr(),durationMins:Math.floor(symTimerElapsed/60)}));};
  const timerLabel=()=>{const h=Math.floor(symTimerElapsed/3600),m=Math.floor((symTimerElapsed%3600)/60),s=symTimerElapsed%60;return[h?`${h}h`:"",m?`${m}m`:"",`${s}s`].filter(Boolean).join(" ");};

  const addList=()=>{if(!nlName.trim())return;setLists(l=>[...l,{id:uid(),name:nlName.trim(),icon:nlIcon,color:nlColor,items:[]}]);setNlName("");setNlIcon("📋");setNlColor(LIST_COLORS[0]);setShowNewList(false);};
  const deleteList=lid=>{setLists(l=>l.filter(x=>x.id!==lid));if(activeList?.id===lid)setActiveList(null);};
  const updateListName=lid=>{setLists(l=>l.map(x=>x.id===lid?{...x,name:editingListName}:x));if(activeList?.id===lid)setActiveList(al=>({...al,name:editingListName}));setEditingListId(null);};
  const currentList=activeList?lists.find(l=>l.id===activeList.id):null;

  const addItem=()=>{
    if(!niText.trim()||!currentList)return;
    const item={id:uid(),text:niText.trim(),done:false,time:niTime,reminderSet:false};
    if(isAppt){item.date=niDate;item.apptTime=niApptTime;item.notes=niNotes;}
    setLists(l=>l.map(x=>x.id===currentList.id?{...x,items:[...x.items,item]}:x));
    setNiText("");setNiTime("");setNiDate("");setNiApptTime("");setNiNotes("");setIsAppt(false);
  };
  const toggleItem=(lid,iid)=>setLists(l=>l.map(x=>x.id===lid?{...x,items:x.items.map(it=>it.id===iid?{...it,done:!it.done}:it)}:x));
  const deleteItem=(lid,iid)=>setLists(l=>l.map(x=>x.id===lid?{...x,items:x.items.filter(it=>it.id!==iid)}:x));
  const markReminderSet=(lid,iid)=>setLists(l=>l.map(x=>x.id===lid?{...x,items:x.items.map(it=>it.id===iid?{...it,reminderSet:true}:it)}:x));

  const calcDur=s=>{if(s.durationMins)return s.durationMins;if(s.startTime&&s.endTime){const[sh,sm]=s.startTime.split(":").map(Number),[eh,em]=s.endTime.split(":").map(Number);return Math.max(0,(eh*60+em)-(sh*60+sm));}return 0;};
  const logSymptom=()=>{setSymptoms(ss=>[{...sym,id:uid(),durationMins:calcDur(sym)},...ss]);setSym(blankSym);setSymTimerElapsed(0);setShowLogSym(false);};
  const deleteSymptom=id=>setSymptoms(ss=>ss.filter(s=>s.id!==id));
  const addSymType=()=>{if(!nstLabel.trim())return;setSymTypes(st=>[...st,{id:uid(),label:nstLabel.trim(),icon:nstIcon,color:nstColor}]);setNstLabel("");setNstIcon("🔔");setNstColor(LIST_COLORS[3]);setShowNewSymType(false);};
  const symInfo=type=>symTypes.find(st=>st.id===type)||{icon:"📝",label:type,color:"#95a5a6"};

  const migraines=symptoms.filter(s=>s.type==="migraine");
  const byType=symTypes.map(st=>({...st,count:symptoms.filter(s=>s.type===st.id).length})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
  const trigCounts=symptoms.flatMap(s=>s.triggers).reduce((a,t)=>{a[t]=(a[t]||0)+1;return a;},{});
  const topTrigs=Object.entries(trigCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const avgSev=migraines.length?(migraines.reduce((a,s)=>a+s.severity,0)/migraines.length).toFixed(1):"—";
  const migWithDur=migraines.filter(m=>m.durationMins>0);
  const avgDur=migWithDur.length?Math.round(migWithDur.reduce((a,m)=>a+m.durationMins,0)/migWithDur.length):0;

  const appts=lists.flatMap(l=>l.items.filter(i=>i.date).map(i=>({...i,listName:l.name,listColor:l.color,listIcon:l.icon,listId:l.id}))).sort((a,b)=>a.date.localeCompare(b.date));

  const report=`╔══════════════════════════════════════════╗
  VITAE HEALTH SUMMARY REPORT
  Generated: ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}
  Patient: [Your Name]
╚══════════════════════════════════════════╝

SYMPTOM OVERVIEW
${byType.map(bt=>`  ${bt.icon} ${bt.label}: ${bt.count} episode${bt.count>1?"s":""}`).join("\n")||"  None logged"}

MIGRAINES IN DETAIL (${migraines.length} episodes)
  Average severity : ${avgSev}/10
  Average duration : ${avgDur?minsToLabel(avgDur):"not recorded"}

${migraines.map(m=>`  DATE: ${fmtDate(m.date)}
  Time     : ${m.startTime}${m.endTime?" – "+m.endTime:""}
  Duration : ${m.durationMins?minsToLabel(m.durationMins):"not recorded"}
  Severity : ${m.severity}/10
  Aura     : ${m.aura?"Yes":"No"}
  Triggers : ${m.triggers.join(", ")||"none noted"}
  Medication: ${m.meds||"none taken"}
  Location : ${m.location||"—"}
  Notes    : ${m.notes||"—"}`).join("\n\n")||"  None recorded"}

ALL OTHER EPISODES
${symptoms.filter(s=>s.type!=="migraine").map(s=>{const t=symTypes.find(st=>st.id===s.type);return`  ${t?.icon||"📝"} ${t?.label||s.type} | ${fmtDate(s.date)}
  Severity: ${s.severity}/10 | Duration: ${s.durationMins?minsToLabel(s.durationMins):"not recorded"}
  Triggers: ${s.triggers.join(", ")||"none"} | Meds: ${s.meds||"none"}
  Notes: ${s.notes||"—"}`;}).join("\n\n")||"  None"}

TOP TRIGGERS
${topTrigs.map(([t,c])=>`  • ${t}: ${c}×`).join("\n")||"  None identified"}

UPCOMING APPOINTMENTS
${appts.filter(a=>!a.done).map(a=>`  • [${a.listName}] ${fmtDate(a.date)}${a.apptTime?" at "+a.apptTime:""}: ${a.text}${a.notes?"\n    Note: "+a.notes:""}`).join("\n")||"  None"}
`;
  const copyReport=()=>{navigator.clipboard.writeText(report);setReportCopied(true);setTimeout(()=>setReportCopied(false),2500);};

  const handleReminderSaved=({item,listId})=>{
    if(listId) markReminderSet(listId, item.id);
    setReminderTarget(null);
    return Promise.resolve();
  };

  const BellBtn=({item,listName,listColor,listId})=>(
    <button title={item.reminderSet?"Reminder set ✓":"Set reminder"} onClick={e=>{e.stopPropagation();setReminderTarget({item,listName,listColor,listId});}} style={{background:item.reminderSet?"#edfaed":"#faf8f4",border:`1.5px solid ${item.reminderSet?"#9ed89e":"#e0d8d0"}`,borderRadius:9,padding:"5px 9px",fontSize:14,cursor:"pointer",color:item.reminderSet?"#27ae60":"#9e8e7e",flexShrink:0,transition:"all 0.15s",display:"flex",alignItems:"center",gap:3}}>
      🔔{item.reminderSet&&<span style={{fontSize:10,fontWeight:700}}>✓</span>}
    </button>
  );

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",minHeight:"100vh",background:"#f7f4ef",color:"#1a1714"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        button{cursor:pointer;font-family:inherit;}
        input,textarea,select{font-family:inherit;background:white;border:1.5px solid #e0d8d0;border-radius:9px;padding:9px 12px;font-size:14px;color:#1a1714;outline:none;width:100%;}
        input:focus,textarea:focus{border-color:#8B6F47;box-shadow:0 0 0 3px rgba(139,111,71,0.1);}
        textarea{resize:vertical;}
        .card{background:white;border:1px solid #e8e0d4;border-radius:14px;padding:18px;margin-bottom:12px;}
        .ct{background:white;border:1px solid #e8e0d4;border-radius:14px;overflow:hidden;margin-bottom:12px;}
        .row{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #f0ebe1;}
        .row:last-child{border-bottom:none;}
        .chip{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;}
        .bp{background:#8B6F47;color:white;border:none;border-radius:9px;padding:10px 20px;font-size:14px;transition:opacity 0.15s;} .bp:hover{opacity:0.87;}
        .bg{background:transparent;color:#8B6F47;border:1.5px solid #ddd5c5;border-radius:9px;padding:8px 15px;font-size:13px;transition:background 0.15s;} .bg:hover{background:#f0ebe1;}
        .bd{background:#fef0f0;color:#c0392b;border:1.5px solid #f5c6c6;border-radius:8px;padding:7px 12px;font-size:12px;}
        .nb{flex:1;padding:10px 2px;border:none;background:transparent;font-size:10.5px;color:#9e8e7e;border-top:3px solid transparent;transition:all 0.15s;display:flex;flex-direction:column;align-items:center;gap:3px;}
        .nb.on{color:#8B6F47;border-top-color:#8B6F47;}
        .tc{display:inline-block;padding:5px 12px;border-radius:20px;border:1.5px solid #e8e0d4;font-size:13px;cursor:pointer;margin:3px;background:white;transition:all 0.12s;}
        .tc.on{background:#8B6F47;color:white;border-color:#8B6F47;}
        .sb{width:30px;height:30px;border-radius:7px;border:2px solid transparent;font-size:12px;font-weight:700;background:#f0ebe1;color:#9e8e7e;transition:all 0.1s;}
        .sb.on{background:#c0392b;color:white;border-color:#c0392b;}
        .is{width:37px;height:37px;border-radius:9px;border:2px solid #e8e0d4;font-size:17px;background:white;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.1s;}
        .is.on{border-color:#8B6F47;background:#f7f2eb;}
        .cs{width:27px;height:27px;border-radius:50%;border:3px solid transparent;transition:border 0.1s;} .cs.on{border-color:#1a1714;}
        .stb{flex:1;min-width:82px;padding:9px 5px;border-radius:11px;border:2px solid #e8e0d4;background:white;font-size:12px;text-align:center;cursor:pointer;font-family:inherit;transition:all 0.15s;}
        .lc{padding:16px;border-radius:14px;border:1.5px solid;background:white;margin-bottom:10px;cursor:pointer;transition:box-shadow 0.15s;} .lc:hover{box-shadow:0 4px 16px rgba(0,0,0,0.08);}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}} .page{animation:fadeIn 0.2s ease;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}} .pulse{animation:pulse 1.5s infinite;}
        .tr{font-size:40px;font-weight:700;color:#c0392b;letter-spacing:-1px;font-variant-numeric:tabular-nums;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#ddd5c5;border-radius:4px;}
      `}</style>

      {/* Header */}
      <div style={{background:"white",borderBottom:"1px solid #e8e0d4",padding:"13px 18px",position:"sticky",top:0,zIndex:20}}>
        <div style={{maxWidth:520,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:"-0.03em"}}>Vitae <span style={{color:"#8B6F47"}}>✦</span></div>
            <div style={{fontSize:11.5,color:"#9e8e7e"}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
          </div>
          <div style={{display:"flex",gap:7}}>
            {tab==="health"&&<button className="bg" style={{fontSize:12,padding:"7px 11px"}} onClick={()=>setShowLogSym(true)}>+ Log symptom</button>}
            {tab==="lists"&&<button className="bg" style={{fontSize:12,padding:"7px 11px"}} onClick={()=>{setShowNewList(true);setActiveList(null);}}>+ New list</button>}
            <button onClick={()=>setShowReport(true)} style={{background:"#f7f4ef",border:"1.5px solid #e8e0d4",borderRadius:9,padding:"7px 11px",fontSize:12,color:"#8B6F47",fontFamily:"inherit"}}>📋 Report</button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:520,margin:"0 auto",padding:"18px 15px 90px"}} className="page" key={tab+(activeList?.id||"")+(showLogSym?"L":"")}>

        {/* LISTS OVERVIEW */}
        {tab==="lists"&&!activeList&&(
          <div>
            <span style={SL}>Your lists</span>
            {showNewList&&(
              <div className="card" style={{background:"#faf8f4",border:"1.5px solid #ddd5c5",marginBottom:16}}>
                <span style={SL}>New list</span>
                <input value={nlName} onChange={e=>setNlName(e.target.value)} placeholder="List name…" style={{marginBottom:10}}/>
                <span style={SL}>Icon</span>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,margin:"6px 0 14px"}}>{LIST_ICONS.map(ic=><button key={ic} className={`is${nlIcon===ic?" on":""}`} onClick={()=>setNlIcon(ic)}>{ic}</button>)}</div>
                <span style={SL}>Colour</span>
                <div style={{display:"flex",gap:8,margin:"6px 0 14px",flexWrap:"wrap"}}>{LIST_COLORS.map(c=><button key={c} className={`cs${nlColor===c?" on":""}`} style={{background:c}} onClick={()=>setNlColor(c)}/>)}</div>
                <div style={{display:"flex",gap:8}}><button className="bp" onClick={addList} style={{flex:1}}>Create list</button><button className="bg" onClick={()=>setShowNewList(false)}>Cancel</button></div>
              </div>
            )}
            {lists.map(l=>{
              const done=l.items.filter(i=>i.done).length;
              const bells=l.items.filter(i=>i.reminderSet).length;
              const upcoming=l.items.filter(i=>i.date&&!i.done);
              return(
                <div key={l.id} className="lc" style={{borderColor:l.color+"44"}} onClick={()=>setActiveList(l)}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:40,height:40,borderRadius:10,background:l.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,border:`1.5px solid ${l.color}33`}}>{l.icon}</div>
                      <div>
                        <div style={{fontWeight:700,fontSize:15}}>{l.name}</div>
                        <div style={{fontSize:12,color:"#9e8e7e"}}>{l.items.length} item{l.items.length!==1?"s":""}{l.items.length>0?` · ${done} done`:""}{bells>0?` · 🔔 ${bells}`:""}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      {upcoming.length>0&&<span className="chip" style={{background:l.color+"18",color:l.color}}>📅 {upcoming.length}</span>}
                      <span style={{color:"#c8bfb4",fontSize:18}}>›</span>
                    </div>
                  </div>
                  {l.items.length>0&&<div style={{marginTop:10,height:5,background:"#f0ebe1",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${done/l.items.length*100}%`,background:l.color,borderRadius:4,transition:"width 0.4s"}}/></div>}
                </div>
              );
            })}
            {lists.length===0&&<div style={{textAlign:"center",color:"#9e8e7e",padding:40}}>No lists yet</div>}
          </div>
        )}

        {/* SINGLE LIST */}
        {tab==="lists"&&activeList&&currentList&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:16}}>
              <button onClick={()=>setActiveList(null)} style={{background:"none",border:"none",color:"#8B6F47",fontSize:20,padding:"0 3px"}}>‹</button>
              <div style={{width:33,height:33,borderRadius:9,background:currentList.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,border:`1.5px solid ${currentList.color}33`,flexShrink:0}}>{currentList.icon}</div>
              {editingListId===currentList.id
                ?<input value={editingListName} onChange={e=>setEditingListName(e.target.value)} onBlur={()=>updateListName(currentList.id)} onKeyDown={e=>e.key==="Enter"&&updateListName(currentList.id)} autoFocus style={{flex:1,fontWeight:700,fontSize:15,border:"none",borderBottom:"2px solid #8B6F47",borderRadius:0,padding:"2px 0",background:"transparent"}}/>
                :<div style={{flex:1,fontWeight:700,fontSize:15,cursor:"text"}} onDoubleClick={()=>{setEditingListId(currentList.id);setEditingListName(currentList.name);}}>{currentList.name}</div>
              }
              <button className="bd" onClick={()=>deleteList(currentList.id)}>Delete</button>
            </div>
            {currentList.items.length>0&&(
              <div className="ct" style={{marginBottom:14}}>
                {currentList.items.map(it=>(
                  <div key={it.id} className="row" style={{background:it.done?"#fafaf8":"white",flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                      <div onClick={()=>toggleItem(currentList.id,it.id)} style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${it.done?currentList.color:"#ddd5c5"}`,background:it.done?currentList.color:"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",transition:"all 0.15s"}}>
                        {it.done&&<span style={{color:"white",fontSize:11}}>✓</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,textDecoration:it.done?"line-through":"none",color:it.done?"#9e8e7e":"#1a1714",wordBreak:"break-word"}}>{it.text}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:it.time||it.date?3:0}}>
                          {it.time&&<span style={{fontSize:11.5,color:"#9e8e7e"}}>🕐 {it.time}</span>}
                          {it.date&&<span className="chip" style={{background:currentList.color+"18",color:currentList.color,fontSize:11}}>📅 {fmtDateShort(it.date)}{it.apptTime?" "+it.apptTime:""}</span>}
                          {it.reminderSet&&<span className="chip" style={{background:"#edfaed",color:"#27ae60",fontSize:11}}>🔔 Reminder set</span>}
                        </div>
                        {it.notes&&<div style={{fontSize:12,color:"#9e8e7e",fontStyle:"italic",marginTop:2}}>{it.notes}</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <BellBtn item={it} listName={currentList.name} listColor={currentList.color} listId={currentList.id}/>
                      <button onClick={()=>deleteItem(currentList.id,it.id)} style={{background:"none",border:"none",color:"#d0c8be",fontSize:18}}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="card" style={{background:"#faf8f4"}}>
              <span style={SL}>Add item</span>
              <input value={niText} onChange={e=>setNiText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Item text…" style={{marginBottom:8}}/>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <div style={{flex:1}}><label style={{fontSize:11,color:"#9e8e7e"}}>Time reminder</label><input type="time" value={niTime} onChange={e=>setNiTime(e.target.value)} style={{marginTop:4}}/></div>
                <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
                  <label style={{display:"flex",alignItems:"center",gap:7,fontSize:13,cursor:"pointer",marginBottom:6}}>
                    <input type="checkbox" checked={isAppt} onChange={e=>setIsAppt(e.target.checked)} style={{width:"auto",accentColor:"#8B6F47"}}/>Appointment?
                  </label>
                </div>
              </div>
              {isAppt&&(
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
                  <div style={{display:"flex",gap:8}}>
                    <div style={{flex:1}}><label style={{fontSize:11,color:"#9e8e7e"}}>Date</label><input type="date" value={niDate} onChange={e=>setNiDate(e.target.value)} style={{marginTop:4}}/></div>
                    <div style={{flex:1}}><label style={{fontSize:11,color:"#9e8e7e"}}>Appt time</label><input type="time" value={niApptTime} onChange={e=>setNiApptTime(e.target.value)} style={{marginTop:4}}/></div>
                  </div>
                  <input value={niNotes} onChange={e=>setNiNotes(e.target.value)} placeholder="Prep notes…"/>
                </div>
              )}
              <button className="bp" onClick={addItem} style={{width:"100%",marginTop:4}}>Add to list</button>
            </div>
          </div>
        )}

        {/* HEALTH */}
        {tab==="health"&&!showLogSym&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}>
              <span style={SL}>Health log</span>
              <button className="bg" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>setShowNewSymType(true)}>+ Symptom type</button>
            </div>
            <div className="card">
              <span style={SL}>Tracked symptoms</span>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>{symTypes.map(st=><span key={st.id} className="chip" style={{background:st.color+"18",color:st.color,border:`1px solid ${st.color}33`,fontSize:13}}>{st.icon} {st.label} <span style={{opacity:0.5,marginLeft:2}}>{symptoms.filter(s=>s.type===st.id).length}</span></span>)}</div>
            </div>
            {showNewSymType&&(
              <div className="card" style={{background:"#faf8f4",border:"1.5px solid #ddd5c5"}}>
                <span style={SL}>New symptom type</span>
                <input value={nstLabel} onChange={e=>setNstLabel(e.target.value)} placeholder="Name…" style={{marginBottom:8}}/>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
                  <div><span style={LAB}>Icon</span><input value={nstIcon} onChange={e=>setNstIcon(e.target.value)} style={{width:54,textAlign:"center",fontSize:22,padding:6}} maxLength={2}/></div>
                  <div><span style={LAB}>Colour</span><div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>{LIST_COLORS.map(c=><button key={c} className={`cs${nstColor===c?" on":""}`} style={{background:c}} onClick={()=>setNstColor(c)}/>)}</div></div>
                </div>
                <div style={{display:"flex",gap:8}}><button className="bp" onClick={addSymType} style={{flex:1}}>Add type</button><button className="bg" onClick={()=>setShowNewSymType(false)}>Cancel</button></div>
              </div>
            )}
            <span style={SL}>Episodes ({symptoms.length})</span>
            {symptoms.map(s=>{
              const si=symInfo(s.type); const isOpen=activeSymId===s.id;
              return(
                <div key={s.id} style={{background:"white",border:`1.5px solid ${si.color}33`,borderLeft:`4px solid ${si.color}`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 13px",cursor:"pointer"}} onClick={()=>setActiveSymId(isOpen?null:s.id)}>
                    <span style={{fontSize:18}}>{si.icon}</span>
                    <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{si.label}</div><div style={{fontSize:12,color:"#9e8e7e"}}>{fmtDate(s.date)}{s.startTime?` · ${s.startTime}${s.endTime?" – "+s.endTime:""}`:""}</div></div>
                    <span className="chip" style={{background:si.color+"18",color:si.color,fontSize:12}}>{s.severity}/10</span>
                    {s.durationMins>0&&<span className="chip" style={{background:"#f0ebe1",color:"#8B6F47",fontSize:11}}>⏱ {minsToLabel(s.durationMins)}</span>}
                    <span style={{color:"#c8bfb4",fontSize:16,transform:isOpen?"rotate(90deg)":"none",transition:"transform 0.2s"}}>›</span>
                  </div>
                  {isOpen&&(
                    <div style={{padding:"0 13px 13px",borderTop:"1px solid #f0ebe1"}}>
                      {s.triggers.length>0&&<div style={{marginTop:9}}><span style={{fontSize:12,color:"#9e8e7e"}}>Triggers: </span>{s.triggers.map(t=><span key={t} className="chip" style={{background:"#f0ebe1",color:"#7a6040",fontSize:12,marginRight:4}}>{t}</span>)}</div>}
                      {s.aura&&<div style={{marginTop:8,fontSize:13,color:"#c0392b"}}>⚠ Aura present</div>}
                      {s.meds&&<div style={{marginTop:8,fontSize:13}}>💊 {s.meds}</div>}
                      {s.notes&&<div style={{marginTop:8,fontSize:13,fontStyle:"italic",color:"#5a5048"}}>{s.notes}</div>}
                      {s.location&&<div style={{marginTop:6,fontSize:12,color:"#9e8e7e"}}>📍 {s.location}</div>}
                      <button className="bd" onClick={()=>deleteSymptom(s.id)} style={{marginTop:12}}>Delete entry</button>
                    </div>
                  )}
                </div>
              );
            })}
            {symptoms.length===0&&<div style={{textAlign:"center",color:"#9e8e7e",padding:40,fontSize:14}}>No symptoms logged yet — tap "+ Log symptom" above</div>}
          </div>
        )}

        {/* LOG SYMPTOM */}
        {tab==="health"&&showLogSym&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:16}}>
              <button onClick={()=>{setShowLogSym(false);setSymTimerRunning(false);setSym(blankSym);setSymTimerElapsed(0);}} style={{background:"none",border:"none",color:"#8B6F47",fontSize:20}}>‹</button>
              <h2 style={{fontSize:17,fontWeight:700}}>Log a symptom</h2>
            </div>
            <div className="card"><span style={SL}>Symptom type</span><div style={{display:"flex",flexWrap:"wrap",gap:7,marginTop:4}}>{symTypes.map(st=><button key={st.id} className="stb" style={{color:sym.type===st.id?"white":st.color,borderColor:sym.type===st.id?st.color:"#e8e0d4",background:sym.type===st.id?st.color:"white"}} onClick={()=>setSym(s=>({...s,type:st.id}))}><div style={{fontSize:18,marginBottom:2}}>{st.icon}</div><div style={{fontSize:11}}>{st.label}</div></button>)}</div></div>
            <div className="card" style={{textAlign:"center",background:symTimerRunning?"#fff5f5":"white",border:symTimerRunning?"1.5px solid #f5c6c6":"1.5px solid #e8e0d4"}}>
              <span style={SL}>Duration</span>
              {symTimerRunning?(
                <><div className="tr pulse">{timerLabel()}</div><div style={{fontSize:12,color:"#9e8e7e",marginTop:4}}>Started {sym.startTime}</div><button className="bp" onClick={stopTimer} style={{marginTop:12,background:"#c0392b",width:"100%"}}>Stop timer</button></>
              ):(
                <>{sym.durationMins>0?<div style={{fontSize:26,fontWeight:700,color:"#8B6F47",margin:"6px 0"}}>{minsToLabel(sym.durationMins)}</div>:<div style={{fontSize:13,color:"#9e8e7e",margin:"6px 0"}}>Use live timer or enter times</div>}
                <button className="bp" onClick={startTimer} style={{width:"100%",marginBottom:10}}>▶ Start live timer</button>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,textAlign:"left"}}><label style={{fontSize:11,color:"#9e8e7e"}}>Start</label><input type="time" value={sym.startTime} onChange={e=>setSym(s=>({...s,startTime:e.target.value}))} style={{marginTop:4}}/></div>
                  <div style={{flex:1,textAlign:"left"}}><label style={{fontSize:11,color:"#9e8e7e"}}>End</label><input type="time" value={sym.endTime} onChange={e=>setSym(s=>({...s,endTime:e.target.value,durationMins:0}))} style={{marginTop:4}}/></div>
                </div></>
              )}
            </div>
            <div className="card"><span style={SL}>Severity</span><div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:4}}>{SEVERITY.map(n=><button key={n} className={`sb${sym.severity===n?" on":""}`} onClick={()=>setSym(s=>({...s,severity:n}))}>{n}</button>)}</div><div style={{marginTop:7,fontSize:12,color:"#9e8e7e"}}>{sym.severity<=3?"Mild":sym.severity<=6?"Moderate":"Severe — significant impact"}</div></div>
            <div className="card"><span style={SL}>Triggers</span><div style={{marginTop:4}}>{TRIGGER_OPTIONS.map(t=><button key={t} className={`tc${sym.triggers.includes(t)?" on":""}`} onClick={()=>setSym(s=>({...s,triggers:s.triggers.includes(t)?s.triggers.filter(x=>x!==t):[...s.triggers,t]}))}>{t}</button>)}</div></div>
            <div className="card">
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div><span style={LAB}>Date</span><input type="date" value={sym.date} onChange={e=>setSym(s=>({...s,date:e.target.value}))}/></div>
                {sym.type==="migraine"&&<label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}><input type="checkbox" checked={sym.aura} onChange={e=>setSym(s=>({...s,aura:e.target.checked}))} style={{width:"auto",accentColor:"#c0392b"}}/>Aura present</label>}
                <div><span style={LAB}>Medication taken</span><input value={sym.meds} onChange={e=>setSym(s=>({...s,meds:e.target.value}))} placeholder="e.g. Sumatriptan 50mg"/></div>
                <div><span style={LAB}>Location / context</span><input value={sym.location} onChange={e=>setSym(s=>({...s,location:e.target.value}))} placeholder="e.g. At work, travelling"/></div>
                <div><span style={LAB}>Notes</span><textarea value={sym.notes} onChange={e=>setSym(s=>({...s,notes:e.target.value}))} rows={3} placeholder="Describe symptoms, what helped…"/></div>
              </div>
            </div>
            <button className="bp" onClick={logSymptom} style={{width:"100%",padding:"13px",fontSize:15,borderRadius:11}}>Save to health record →</button>
          </div>
        )}

        {/* PATTERNS */}
        {tab==="patterns"&&(
          <div>
            <span style={SL}>Health patterns</span>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div className="card" style={{textAlign:"center",background:"#fff5f5",border:"1.5px solid #f5c6c6"}}><div style={{fontSize:28,fontWeight:700,color:"#c0392b"}}>{migraines.length}</div><div style={{fontSize:12,color:"#9e8e7e"}}>Migraines</div></div>
              <div className="card" style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#8B6F47"}}>{avgSev}</div><div style={{fontSize:12,color:"#9e8e7e"}}>Avg severity</div></div>
              <div className="card" style={{textAlign:"center",background:"#f7f4ff",border:"1.5px solid #d7c8f5"}}><div style={{fontSize:28,fontWeight:700,color:"#8e44ad"}}>{avgDur?minsToLabel(avgDur):"—"}</div><div style={{fontSize:12,color:"#9e8e7e"}}>Avg duration</div></div>
              <div className="card" style={{textAlign:"center",background:"#f0faf5",border:"1.5px solid #c0e8d0"}}><div style={{fontSize:28,fontWeight:700,color:"#27ae60"}}>{symptoms.length}</div><div style={{fontSize:12,color:"#9e8e7e"}}>Total episodes</div></div>
            </div>
            {byType.length>0&&<div className="card" style={{marginBottom:12}}><span style={SL}>By type</span>{byType.map(bt=><div key={bt.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}><span>{bt.icon} {bt.label}</span><span style={{color:"#9e8e7e"}}>{bt.count}</span></div><div style={{height:6,background:"#f0ebe1",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${(bt.count/(byType[0]?.count||1))*100}%`,background:bt.color,borderRadius:4,transition:"width 0.5s"}}/></div></div>)}</div>}
            {topTrigs.length>0&&<div className="card"><span style={SL}>Top triggers</span>{topTrigs.map(([t,c])=><div key={t} style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}><span>{t}</span><span style={{color:"#9e8e7e"}}>{c}×</span></div><div style={{height:6,background:"#f0ebe1",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${(c/topTrigs[0][1])*100}%`,background:"#8B6F47",borderRadius:4,transition:"width 0.5s"}}/></div></div>)}</div>}
            {migraines.length>0&&<div className="card"><span style={SL}>Migraine timeline</span>{migraines.map(m=><div key={m.id} style={{display:"flex",gap:10,marginBottom:12,paddingBottom:12,borderBottom:"1px solid #f0ebe1"}}><div style={{width:34,flexShrink:0,textAlign:"center"}}><div style={{fontSize:13,fontWeight:700,color:"#c0392b"}}>{new Date(m.date+"T12:00:00").getDate()}</div><div style={{fontSize:10,color:"#9e8e7e",textTransform:"uppercase"}}>{new Date(m.date+"T12:00:00").toLocaleString("en",{month:"short"})}</div></div><div style={{flex:1}}><div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:3}}><span className="chip" style={{background:"#fff0f0",color:"#c0392b",fontSize:11}}>{m.severity}/10</span>{m.durationMins>0&&<span className="chip" style={{background:"#f0ebe1",color:"#8B6F47",fontSize:11}}>⏱ {minsToLabel(m.durationMins)}</span>}{m.aura&&<span className="chip" style={{background:"#fff8e0",color:"#d35400",fontSize:11}}>⚠ Aura</span>}</div>{m.triggers.length>0&&<div style={{fontSize:12,color:"#9e8e7e"}}>{m.triggers.join(" · ")}</div>}{m.notes&&<div style={{fontSize:12,fontStyle:"italic",color:"#7a6040",marginTop:2}}>{m.notes}</div>}</div></div>)}</div>}
            {symptoms.length===0&&<div style={{textAlign:"center",color:"#9e8e7e",padding:40}}>Log some symptoms to see patterns</div>}
          </div>
        )}

        {/* CALENDAR */}
        {tab==="appts"&&(
          <div>
            <span style={SL}>All appointments</span>
            {appts.length===0&&<div style={{textAlign:"center",color:"#9e8e7e",padding:40}}>No appointments — add them via your lists</div>}
            {appts.map(a=>(
              <div key={a.id} className="card" style={{display:"flex",gap:12,borderLeft:`4px solid ${a.listColor}`,padding:"14px"}}>
                <div style={{width:42,flexShrink:0,background:a.listColor+"18",borderRadius:9,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8px 0"}}>
                  <div style={{fontSize:15,fontWeight:700,color:a.listColor}}>{new Date(a.date+"T12:00:00").getDate()}</div>
                  <div style={{fontSize:10,color:"#9e8e7e",textTransform:"uppercase"}}>{new Date(a.date+"T12:00:00").toLocaleString("en",{month:"short"})}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14}}>{a.text}</div>
                  <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
                    <span className="chip" style={{background:a.listColor+"18",color:a.listColor,fontSize:11}}>{a.listIcon} {a.listName}</span>
                    {a.apptTime&&<span style={{fontSize:12,color:"#9e8e7e"}}>🕐 {a.apptTime}</span>}
                    {a.reminderSet&&<span className="chip" style={{background:"#edfaed",color:"#27ae60",fontSize:11}}>🔔 Set</span>}
                  </div>
                  {a.notes&&<div style={{fontSize:12,fontStyle:"italic",color:"#9e8e7e",marginTop:3}}>{a.notes}</div>}
                </div>
                <BellBtn item={a} listName={a.listName} listColor={a.listColor} listId={a.listId}/>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* REMINDER MODAL */}
      {reminderTarget&&(
        <ReminderModal
          item={reminderTarget.item}
          listName={reminderTarget.listName}
          listColor={reminderTarget.listColor}
          onClose={()=>setReminderTarget(null)}
          onSaved={({item})=>handleReminderSaved({item,listId:reminderTarget.listId})}
        />
      )}

      {/* REPORT MODAL */}
      {showReport&&(
        <div style={{position:"fixed",inset:0,background:"rgba(26,23,20,0.55)",zIndex:100,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowReport(false)}>
          <div style={{background:"white",width:"100%",maxHeight:"86vh",borderRadius:"20px 20px 0 0",overflowY:"auto",padding:"20px 16px 30px",fontFamily:"inherit"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#e0d8d0",borderRadius:4,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:17}}>📋 Doctor Report</div>
              <button onClick={()=>setShowReport(false)} style={{background:"none",border:"none",fontSize:22,color:"#9e8e7e"}}>×</button>
            </div>
            <div style={{fontSize:12,color:"#9e8e7e",marginBottom:12}}>Copy and paste into your GP portal, email, or Notes app.</div>
            <pre style={{fontFamily:"'Courier New',monospace",fontSize:11,lineHeight:1.7,whiteSpace:"pre-wrap",background:"#faf8f4",border:"1px solid #e8e0d4",borderRadius:10,padding:14,color:"#1a1714",maxHeight:"55vh",overflow:"auto"}}>{report}</pre>
            <button className="bp" onClick={copyReport} style={{width:"100%",padding:"13px",fontSize:15,borderRadius:11,marginTop:14,background:reportCopied?"#27ae60":"#8B6F47"}}>{reportCopied?"✓ Copied!":"Copy report to clipboard"}</button>
          </div>
        </div>
      )}

      {/* Nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"white",borderTop:"1px solid #e8e0d4",display:"flex",zIndex:10,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {[{id:"lists",icon:"📋",label:"Lists"},{id:"health",icon:"⚡",label:"Health"},{id:"patterns",icon:"📊",label:"Patterns"},{id:"appts",icon:"📅",label:"Calendar"}].map(n=>(
          <button key={n.id} className={`nb${tab===n.id?" on":""}`} onClick={()=>{setTab(n.id);setActiveList(null);setShowLogSym(false);}}>
            <span style={{fontSize:20}}>{n.icon}</span><span>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

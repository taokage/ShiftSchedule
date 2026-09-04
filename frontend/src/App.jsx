import { useEffect, useMemo, useState } from "react";
import "./App.css";
import "./InitialWork.css";
const API=import.meta.env.VITE_API_BASE_URL||"/api";
const choices=[{value:"unavailable",label:"×（勤務不可）"},{value:"avoid",label:"△（休み希望）"},{value:"available",label:"○（勤務可能）"},{value:"mandatory",label:"必ず勤務"},{value:"want",label:"勤務したい"},{value:"research",label:"研究日希望"},{value:"regular_outside",label:"通常外勤日"},{value:"saidaiji",label:"西大寺勤務"},{value:"kibi",label:"吉備勤務"},{value:"yakushiji",label:"薬師寺勤務"},{value:"clinical_clerkship",label:"クリクラ"}];
const pad=n=>String(n).padStart(2,"0");
const datesFor=start=>{const base=new Date(`${start}T00:00:00`);return Array.from({length:31},(_,i)=>{const x=new Date(base);x.setDate(base.getDate()+i);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`})};
const addDays=(raw,n)=>{const x=new Date(`${raw}T00:00:00`);x.setDate(x.getDate()+n);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`};
const fmt=raw=>{const x=new Date(`${raw}T00:00:00`);return `${x.getFullYear()}/${x.getMonth()+1}/${x.getDate()}(${"日月火水木金土"[x.getDay()]})`};
const cycles=Array.from({length:14},(_,i)=>{const start=addDays("2026-08-16",i*28);return{start,end:addDays(start,27),dates:datesFor(addDays(start,-2))}});
const emptyStaff=i=>({no:i,name:"",leader_level:0,ew1_candidate:false,iw1_priority:0,target_day:0,target_night:0});
function fresh(){const cycle=cycles[0];return{start:cycle.dates[0],cycleStart:cycle.start,dates:cycle.dates,staff:Array.from({length:30},(_,i)=>emptyStaff(i)),staffEnabled:Array(30).fill(false),requests:Array.from({length:30},()=>Array.from({length:31},()=>["available","available"])),remarks:Array.from({length:30},()=>Array.from({length:31},()=>["",""])),coverage:Array.from({length:31},()=>[{minimum:2,leaders:1,ew1:0,iw1:0},{minimum:1,leaders:1,ew1:0,iw1:0}]),night_pair_ng:[]}}
function normalize(saved){const base=fresh(),source=saved||{};return{...base,...source,cycleStart:source.cycleStart||cycles[0].start,dates:source.cycleStart?(cycles.find(c=>c.start===source.cycleStart)?.dates||base.dates):base.dates,staff:Array.from({length:30},(_,i)=>source.staff?.[i]||emptyStaff(i)),staffEnabled:Array.from({length:30},(_,i)=>source.staffEnabled?.[i]||false),requests:Array.from({length:30},(_,s)=>Array.from({length:31},(_,d)=>source.requests?.[s]?.[d]||["available","available"])),remarks:Array.from({length:30},(_,s)=>Array.from({length:31},(_,d)=>source.remarks?.[s]?.[d]||["",""]))}}
export default function App(){
 const [step,setStep]=useState("initial"),[data,setData]=useState(()=>{try{return normalize(JSON.parse(localStorage.getItem("shift-draft")))}catch{return fresh()}}),[api,setApi]=useState("確認中"),[note,setNote]=useState(""),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[holidays,setHolidays]=useState({}),[holidayStatus,setHolidayStatus]=useState("祝日を確認中");
 useEffect(()=>{fetch(`${API}/health`).then(r=>setApi(r.ok?"接続済み":"未接続")).catch(()=>setApi("未接続"))},[]);useEffect(()=>localStorage.setItem("shift-draft",JSON.stringify(data)),[data]);
 const weekdays=useMemo(()=>data.dates.map(x=>"日月火水木金土"[new Date(`${x}T00:00:00`).getDay()]),[data.dates]);
 useEffect(()=>{const years=[...new Set(data.dates.map(x=>x.slice(0,4)))];Promise.all(years.map(y=>fetch(`https://holidays-jp.github.io/api/v1/${y}/date.json`).then(r=>{if(!r.ok)throw Error();return r.json()}))).then(list=>{setHolidays(Object.assign({},...list));setHolidayStatus("祝日API 接続済み")}).catch(()=>{setHolidays({});setHolidayStatus("祝日API 未接続（暦のみ判定）")})},[data.dates]);
 const staff=(i,k,v)=>setData(d=>({...d,staff:d.staff.map((s,n)=>n===i?{...s,[k]:v}:s)}));
 const setCycle=start=>{const c=cycles.find(x=>x.start===start);setData(d=>({...d,cycleStart:start,start:c.dates[0],dates:c.dates}))};
 const setInitial=(staffIndex,day,shift,key,value)=>setData(d=>({...d,[key]:d[key].map((staffRows,s)=>s===staffIndex?staffRows.map((row,n)=>n===day?row.map((cell,h)=>h===shift?value:cell):row):staffRows)}));
 const toggleStaff=index=>setData(d=>({...d,staffEnabled:d.staffEnabled.map((v,i)=>i===index?!v:v)}));
 const coverage=(day,shift,key,value)=>setData(d=>({...d,coverage:d.coverage.map((r,i)=>i===day?r.map((x,j)=>j===shift?{...x,[key]:Math.max(0,Number(value))}:x):r)}));
 const body=()=>({dates:data.dates,staff:data.staff,requests:data.requests.slice(0,data.staff.length),coverage:data.coverage,night_pair_ng:data.night_pair_ng});
 const solve=async()=>{setBusy(true);setNote("OR-Toolsで勤務表を計算しています…");try{const r=await fetch(`${API}/schedule/solve`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body())}),b=await r.json();if(!r.ok)throw Error(b.detail||"計算できませんでした。");setResult(b);setStep("read");setNote("勤務表を作成しました。")}catch(e){setNote(e.message)}finally{setBusy(false)}};
 const download=async()=>{setBusy(true);try{const r=await fetch(`${API}/schedule/export`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body())});if(!r.ok)throw Error((await r.json()).detail);const a=document.createElement("a");a.href=URL.createObjectURL(await r.blob());a.download="read_work.xlsx";a.click();URL.revokeObjectURL(a.href)}catch(e){setNote(e.message)}finally{setBusy(false)}};
 return <div className="app-shell"><aside><div className="logo">S</div><div className="brand">勤務調整<span>医師シフト管理</span></div><nav>{[["initial","1","申請入力"],["adjust","2","管理者調整"],["read","3","勤務表確認"]].map(([id,n,label])=><button key={id} className={step===id?"active":""} onClick={()=>setStep(id)}><b>{n}</b><span>{label}</span></button>)}</nav><div className={`api ${api==="接続済み"?"ok":""}`}><i/>API {api}</div></aside><main><header><div><p>SHIFT SCHEDULE</p><h1>{step==="initial"?"勤務希望の申請":step==="adjust"?"管理者調整":"勤務表の確認"}</h1></div>{step!=="initial"&&<div className="period"><label>期間開始日（31日間）</label><input type="date" value={data.start||data.dates[0]} readOnly/></div>}</header>
 {step==="initial"&&<InitialWork data={data} weekdays={weekdays} holidays={holidays} holidayStatus={holidayStatus} setCycle={setCycle} updateStaff={staff} toggleStaff={toggleStaff} setInitial={setInitial}/>}
 {step==="adjust"&&<AdminAdjust data={data} weekdays={weekdays} holidays={holidays} holidayStatus={holidayStatus} updateStaff={staff} coverage={coverage} solve={solve} busy={busy}/>}
 {step==="read"&&<section><div className="toolbar"><div><strong>OR-Tools 計算結果</strong><span className="muted">日 / 夜 / 外1 / 内1 / ×</span></div><button className="secondary" onClick={()=>setStep("adjust")}>← 条件を調整</button><button className="primary" onClick={download} disabled={!result||busy}>Excelを出力 ↓</button></div>{result?<Results result={result} staff={data.staff} weekdays={weekdays}/>:<div className="empty"><b>まだ勤務表を作成していません</b><p>管理者調整で条件を確認し、勤務表を作成してください。</p><button className="primary" onClick={()=>setStep("adjust")}>管理者調整へ</button></div>}</section>}{note&&<div className="toast">{note}<button onClick={()=>setNote("")}>×</button></div>}</main></div>
}

function AdminAdjust({data,weekdays,holidays,holidayStatus,updateStaff,coverage,solve,busy}){
 const isHoliday=(date,day)=>day==="土"||day==="日"||["12-29","12-30","12-31","01-01","01-02","01-03"].includes(date.slice(5))||Boolean(holidays[date]);
 return <section className="initial-section admin-section">
  <div className="initial-toolbar admin-toolbar">
   <div>
    <label>勤務調整期間</label>
    <input value={`${fmt(data.dates[0])} - ${fmt(data.dates[30])}`} readOnly/>
    <small>申請入力と同じ31日間を管理者条件として編集します</small>
   </div>
   <span className="holiday-api">{holidayStatus}</span>
   <button className="primary" onClick={solve} disabled={busy}>{busy?"計算中…":"勤務表を作成 →"}</button>
  </div>

  <div className="initial-help">
   <b>管理者入力</b>
   <span>医師ごとの属性・目標勤務数と、日別の日勤／夜勤の必要人数・リーダー人数を設定します。</span>
  </div>

  <div className="admin-block">
   <div className="admin-block-title"><strong>医師情報・目標勤務数</strong><span>{data.staff.length}名</span></div>
   <div className="admin-sheet-scroll">
    <table className="admin-staff-sheet">
     <thead>
      <tr>
       <th className="row-label">項目</th>
       {data.staff.map((s,i)=><th key={i}><span className="staff-id">ID {i}</span>{s.name||`医師 ${i+1}`}</th>)}
      </tr>
     </thead>
     <tbody>
      <tr><th className="row-label">氏名</th>{data.staff.map((s,i)=><td key={i}><input aria-label={`勤務者${i}の氏名`} value={s.name} placeholder="医師名" onChange={e=>updateStaff(i,"name",e.target.value)}/></td>)}</tr>
      <tr><th className="row-label">リーダーLv</th>{data.staff.map((s,i)=><td key={i}><select value={s.leader_level} onChange={e=>updateStaff(i,"leader_level",Number(e.target.value))}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></td>)}</tr>
      <tr><th className="row-label">目標 日勤</th>{data.staff.map((s,i)=><td key={i}><input type="number" min="0" value={s.target_day} onChange={e=>updateStaff(i,"target_day",Number(e.target.value))}/></td>)}</tr>
      <tr><th className="row-label">目標 夜勤</th>{data.staff.map((s,i)=><td key={i}><input type="number" min="0" value={s.target_night} onChange={e=>updateStaff(i,"target_night",Number(e.target.value))}/></td>)}</tr>
     </tbody>
    </table>
   </div>
  </div>

  <div className="admin-block coverage-block">
   <div className="admin-block-title"><strong>日別の必要人数</strong><span>日勤・夜勤それぞれの必要人数とリーダー人数</span></div>
   <div className="sheet-scroll admin-coverage-scroll">
    <table className="input-sheet admin-coverage-sheet">
     <thead>
      <tr>
       <th className="sticky c0" rowSpan="2">day</th>
       <th className="sticky c1" rowSpan="2">日付</th>
       <th className="sticky c2" rowSpan="2">曜日</th>
       <th className="sticky c3" rowSpan="2">平日<br/>休日</th>
       <th colSpan="2" className="coverage-group">日勤</th>
       <th colSpan="2" className="coverage-group night">夜勤</th>
      </tr>
      <tr>
       <th className="coverage-head">必要人数</th>
       <th className="coverage-head">リーダー</th>
       <th className="coverage-head">必要人数</th>
       <th className="coverage-head">リーダー</th>
      </tr>
     </thead>
     <tbody>{data.dates.map((date,d)=>{
      const holiday=isHoliday(date,weekdays[d]);
      return <tr className={`${holiday?"holiday":"weekday"} ${d<2||d===30?"buffer-day":"application-day"}`} key={date}>
       <th className="sticky c0">{d}</th>
       <th className="sticky c1">{date.replaceAll("-","/")}</th>
       <th className="sticky c2">{weekdays[d]}</th>
       <th className="sticky c3"><span>{holiday?"休日":"平日"}</span>{holidays[date]&&<small>{holidays[date]}</small>}</th>
       <td><input type="number" min="0" value={data.coverage[d][0].minimum} onChange={e=>coverage(d,0,"minimum",e.target.value)}/></td>
       <td><input type="number" min="0" value={data.coverage[d][0].leaders} onChange={e=>coverage(d,0,"leaders",e.target.value)}/></td>
       <td><input type="number" min="0" value={data.coverage[d][1].minimum} onChange={e=>coverage(d,1,"minimum",e.target.value)}/></td>
       <td><input type="number" min="0" value={data.coverage[d][1].leaders} onChange={e=>coverage(d,1,"leaders",e.target.value)}/></td>
      </tr>
     })}</tbody>
    </table>
   </div>
  </div>

  <footer className="sheet-footer">
   <span><i className="buffer-key"/>申請期間外（前2日・後1日）</span>
   <span>表示期間 {fmt(data.dates[0])} - {fmt(data.dates[30])}</span>
  </footer>
 </section>
}

function InitialWork({data,weekdays,holidays,holidayStatus,setCycle,updateStaff,toggleStaff,setInitial}){const isHoliday=(date,day)=>day==="土"||day==="日"||date.slice(5)==="12-29"||date.slice(5)==="12-30"||date.slice(5)==="12-31"||date.slice(5)==="01-01"||date.slice(5)==="01-02"||date.slice(5)==="01-03"||Boolean(holidays[date]);return <section className="initial-section"><div className="initial-toolbar"><div><label>勤務申請期間</label><select value={data.cycleStart} onChange={e=>setCycle(e.target.value)}>{cycles.map(c=><option key={c.start} value={c.start}>{fmt(c.start)} - {fmt(c.end)}</option>)}</select><small>入力表には前2日・後1日を加えた31日間を表示</small></div><span className="holiday-api">{holidayStatus}</span><button className="secondary">下書き保存済み</button></div><div className="initial-help"><b>入力方法</b><span>医師名の上のチェックをONにすると、その医師の希望と備考を編集できます。</span></div><div className="sheet-scroll"><table className="input-sheet"><thead><tr><th className="sticky c0" rowSpan="3">day</th><th className="sticky c1" rowSpan="3">日付</th><th className="sticky c2" rowSpan="3">曜日</th><th className="sticky c3" rowSpan="3">平日<br/>休日</th>{data.staff.map((s,i)=><th colSpan="2" className={data.staffEnabled[i]?"doctor enabled":"doctor"} key={i}><label className="doctor-toggle"><input type="checkbox" checked={data.staffEnabled[i]} onChange={()=>toggleStaff(i)}/><span>{data.staffEnabled[i]?"入力可":"ロック"}</span></label></th>)}</tr><tr>{data.staff.map((s,i)=><th colSpan="2" className="doctor-name" key={i}><span className="staff-id">ID {i}</span><input aria-label={`勤務者${i}の氏名`} value={s.name} placeholder="医師名" disabled={!data.staffEnabled[i]} onChange={e=>updateStaff(i,"name",e.target.value)}/></th>)}</tr><tr>{data.staff.flatMap((_,i)=>[<th className="shift-head" key={`${i}-d`}>日勤</th>,<th className="shift-head" key={`${i}-n`}>夜勤</th>])}</tr></thead><tbody>{data.dates.map((date,d)=>{const holiday=isHoliday(date,weekdays[d]);return <tr className={`${holiday?"holiday":"weekday"} ${d<2||d===30?"buffer-day":"application-day"}`} key={date}><th className="sticky c0">{d}</th><th className="sticky c1">{date.replaceAll("-","/")}</th><th className="sticky c2">{weekdays[d]}</th><th className="sticky c3"><span>{holiday?"休日":"平日"}</span>{holidays[date]&&<small>{holidays[date]}</small>}</th>{data.staff.flatMap((s,i)=>[0,1].map(sh=><td className={!data.staffEnabled[i]?"locked":""} key={`${i}-${sh}`}><select aria-label={`${s.name||`勤務者${i}`} ${date} ${sh?"夜勤":"日勤"}の希望`} value={data.requests[i][d][sh]} disabled={!data.staffEnabled[i]} onChange={e=>setInitial(i,d,sh,"requests",e.target.value)}>{choices.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select><input aria-label={`${s.name||`勤務者${i}`} ${date} ${sh?"夜勤":"日勤"}の備考`} value={data.remarks[i][d][sh]} placeholder="備考" disabled={!data.staffEnabled[i]} onChange={e=>setInitial(i,d,sh,"remarks",e.target.value)}/></td>))}</tr>})}</tbody></table></div><footer className="sheet-footer"><span><i className="buffer-key"/>申請期間外（前2日・後1日）</span><span>表示期間 {fmt(data.dates[0])} - {fmt(data.dates[30])}</span></footer></section>}
function Results({result,staff,weekdays}){return <div className="result-wrap"><table><thead><tr><th>日付</th>{staff.map((s,i)=><th key={i}>{s.name}<small>日 / 夜</small></th>)}</tr></thead><tbody>{result.rows.map((r,d)=><tr key={d} className={weekdays[d]==="日"?"sun":weekdays[d]==="土"?"sat":""}><th>{Number(r.date.slice(8))}<small>{weekdays[d]}</small></th>{r.cells.map((cell,i)=><td key={i}><span>{cell[0]||"−"}</span><span>{cell[1]||"−"}</span></td>)}</tr>)}</tbody></table></div>}

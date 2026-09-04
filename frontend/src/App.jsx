import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./InitialWork.css";

const API = import.meta.env.VITE_API_BASE_URL || "/api";
const choices = [
  { value: "unavailable", label: "×" },
  { value: "avoid", label: "△" },
  { value: "available", label: "○" },
  { value: "mandatory", label: "勤務" },
  { value: "want", label: "勤務希望" },
  { value: "research", label: "研究日希望" },
  { value: "regular_outside", label: "通常外勤" },
  { value: "ew1", label: "西大寺勤務" },
  { value: "ew2", label: "薬師寺勤務" },
  { value: "ew3", label: "吉備勤務" },
  { value: "iw1", label: "クリクラ" },
];

const pad = (n) => String(n).padStart(2, "0");
const datesFor = (start) => {
  const base = new Date(`${start}T00:00:00`);
  return Array.from({ length: 31 }, (_, i) => {
    const x = new Date(base);
    x.setDate(base.getDate() + i);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  });
};
const addDays = (raw, n) => {
  const x = new Date(`${raw}T00:00:00`);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const fmt = (raw) => {
  const x = new Date(`${raw}T00:00:00`);
  return `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}(${"日月火水木金土"[x.getDay()]})`;
};
const cycles = Array.from({ length: 14 }, (_, i) => {
  const start = addDays("2026-08-16", i * 28);
  return { start, end: addDays(start, 27), dates: datesFor(addDays(start, -2)) };
});

const cloneMatrix = (matrix) => matrix.map((staffRows) => staffRows.map((row) => [...row]));

const blankRemarks = () =>
  Array.from({ length: 30 }, () =>
    Array.from({ length: 31 }, () => ["", ""])
  );

const initialRequestsForStaff = (staff) =>
  Array.from({ length: 30 }, (_, s) => {
    const hasName = Boolean((staff?.[s]?.name || "").trim());
    return Array.from({ length: 31 }, (_, d) => {
      if (!hasName) return ["unavailable", "unavailable"];
      return d === 0 || d === 1 || d === 30
        ? ["unavailable", "unavailable"]
        : ["available", "available"];
    });
  });

const emptyStaff = (i) => ({
  no: i,
  name: "",
  leader_level: 0,
  ew1_candidate: false,
  ew1_available: false,
  ew2_available: false,
  iw1_priority: 0,
  iw1_available: false,
  iw2_available: false,
  target_day: 0,
  target_night: 0,
});

function fresh() {
  const cycle = cycles[0];
  const staff = Array.from({ length: 30 }, (_, i) => emptyStaff(i));
  const requests = initialRequestsForStaff(staff);
  const remarks = blankRemarks();
  return {
    start: cycle.dates[0],
    cycleStart: cycle.start,
    dates: cycle.dates,
    staff,
    staffEnabled: Array(30).fill(false),
    staffIdentityLocked: false,
    requests,
    remarks,
    adminRequests: cloneMatrix(requests),
    adminRemarks: cloneMatrix(remarks),
    coverage: Array.from({ length: 31 }, () => [
      { minimum: 2, leaders: 1, ew1: 0, iw1: 0 },
      { minimum: 1, leaders: 1, ew1: 0, iw1: 0 },
    ]),
    night_pair_ng: [],
  };
}

function normalizeStaff(raw, index) {
  const base = emptyStaff(index);
  const source = raw || {};
  const ew1Available = source.ew1_available ?? source.ew1_candidate ?? false;
  const iw1Available = source.iw1_available ?? (Number(source.iw1_priority || 0) > 0);
  return {
    ...base,
    ...source,
    no: source.no ?? index,
    ew1_candidate: Boolean(ew1Available),
    ew1_available: Boolean(ew1Available),
    ew2_available: Boolean(source.ew2_available ?? false),
    iw1_available: Boolean(iw1Available),
    iw2_available: Boolean(source.iw2_available ?? false),
    iw1_priority: iw1Available ? Math.max(1, Number(source.iw1_priority || 1)) : 0,
  };
}

function normalize(saved, persistentStaff) {
  const base = fresh();
  const source = saved || {};
  const cycleStart = source.cycleStart || cycles[0].start;
  const dates = cycles.find((c) => c.start === cycleStart)?.dates || base.dates;

  // 医師情報はクールをまたいで引き継ぐ。
  const staffSource = persistentStaff?.length ? persistentStaff : source.staff;
  const staff = Array.from({ length: 30 }, (_, i) => normalizeStaff(staffSource?.[i], i));
  const initialRequests = initialRequestsForStaff(staff);

  // 同じクールのページ再読み込みでは入力済み申請を復元する。
  // 新しいデータがないセルだけ、勤務者名に応じた初期値を使う。
  const requests = Array.from({ length: 30 }, (_, s) =>
    Array.from({ length: 31 }, (_, d) => source.requests?.[s]?.[d] || initialRequests[s][d])
  );
  const remarks = Array.from({ length: 30 }, (_, s) =>
    Array.from({ length: 31 }, (_, d) => source.remarks?.[s]?.[d] || ["", ""])
  );

  const adminRequests = Array.from({ length: 30 }, (_, s) =>
    Array.from(
      { length: 31 },
      (_, d) => source.adminRequests?.[s]?.[d] || source.requests?.[s]?.[d] || initialRequests[s][d]
    )
  );
  const adminRemarks = Array.from({ length: 30 }, (_, s) =>
    Array.from(
      { length: 31 },
      (_, d) => source.adminRemarks?.[s]?.[d] || source.remarks?.[s]?.[d] || ["", ""]
    )
  );

  return {
    ...base,
    ...source,
    cycleStart,
    start: dates[0],
    dates,
    staff,
    // ページを再読み込みした場合は必ず全員を入力ロック状態に戻す。
    staffEnabled: Array(30).fill(false),
    staffIdentityLocked: Boolean(source.staffIdentityLocked),
    requests,
    remarks,
    adminRequests,
    adminRemarks,
  };
}

export default function App() {
  const [step, setStep] = useState("initial");
  const [data, setData] = useState(() => {
    try {
      const draft = JSON.parse(localStorage.getItem("shift-draft"));
      const persistentStaff = JSON.parse(localStorage.getItem("shift-admin-staff-v2"));
      return normalize(draft, persistentStaff);
    } catch {
      return fresh();
    }
  });
  const [api, setApi] = useState("確認中");
  const [note, setNote] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [holidays, setHolidays] = useState({});
  const [holidayStatus, setHolidayStatus] = useState("祝日を確認中");
  const requestExcelInputRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => setApi(r.ok ? "接続済み" : "未接続"))
      .catch(() => setApi("未接続"));
  }, []);

  useEffect(() => {
    localStorage.setItem("shift-draft", JSON.stringify(data));
  }, [data]);

  // 医師情報・目標勤務数・EW/IW可否はクールとは独立して永続化する。
  useEffect(() => {
    localStorage.setItem("shift-admin-staff-v2", JSON.stringify(data.staff));
  }, [data.staff]);

  const weekdays = useMemo(
    () => data.dates.map((x) => "日月火水木金土"[new Date(`${x}T00:00:00`).getDay()]),
    [data.dates]
  );

  useEffect(() => {
    const years = [...new Set(data.dates.map((x) => x.slice(0, 4)))];
    Promise.all(
      years.map((y) =>
        fetch(`https://holidays-jp.github.io/api/v1/${y}/date.json`).then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
      )
    )
      .then((list) => {
        setHolidays(Object.assign({}, ...list));
        setHolidayStatus("祝日API 接続済み");
      })
      .catch(() => {
        setHolidays({});
        setHolidayStatus("祝日API 未接続（暦のみ判定）");
      });
  }, [data.dates]);

  const updateStaff = (i, key, value) =>
    setData((d) => ({
      ...d,
      staff: d.staff.map((s, n) => {
        if (n !== i) return s;
        if (key === "ew1_available") {
          return { ...s, ew1_available: value, ew1_candidate: value };
        }
        if (key === "iw1_available") {
          return {
            ...s,
            iw1_available: value,
            iw1_priority: value ? Math.max(1, Number(s.iw1_priority || 1)) : 0,
          };
        }
        if (key === "iw1_priority") {
          const priority = Number(value);
          return { ...s, iw1_priority: priority, iw1_available: priority > 0 };
        }
        return { ...s, [key]: value };
      }),
    }));

  const setCycle = (start) => {
    const c = cycles.find((x) => x.start === start);
    if (!c) return;

    setData((d) => {
      // クール変更時は勤務者情報だけを引き継ぎ、日付ごとの勤務申請は新規初期化する。
      const requests = initialRequestsForStaff(d.staff);
      const remarks = blankRemarks();

      return {
        ...d,
        cycleStart: start,
        start: c.dates[0],
        dates: c.dates,
        staffEnabled: Array(30).fill(false),
        requests,
        remarks,
        adminRequests: cloneMatrix(requests),
        adminRemarks: cloneMatrix(remarks),
      };
    });
    setResult(null);
    setNote("クールを変更しました。勤務者情報は引き継ぎ、勤務申請は初期化しました。");
  };

  const setInitial = (staffIndex, day, shift, key, value) =>
    setData((d) => ({
      ...d,
      [key]: d[key].map((staffRows, s) =>
        s === staffIndex
          ? staffRows.map((row, n) =>
              n === day ? row.map((cell, h) => (h === shift ? value : cell)) : row
            )
          : staffRows
      ),
    }));

  const setAdminRequest = (staffIndex, day, shift, key, value) =>
    setData((d) => ({
      ...d,
      [key]: d[key].map((staffRows, s) =>
        s === staffIndex
          ? staffRows.map((row, n) =>
              n === day ? row.map((cell, h) => (h === shift ? value : cell)) : row
            )
          : staffRows
      ),
    }));

  const copyAllRequests = () => {
    setData((d) => ({
      ...d,
      adminRequests: cloneMatrix(d.requests),
      adminRemarks: cloneMatrix(d.remarks),
    }));
    setNote("勤務申請のデータを管理者調整へ全コピーしました。");
  };

  const copyStaffRequests = (staffIndex) => {
    setData((d) => ({
      ...d,
      adminRequests: d.adminRequests.map((rows, i) =>
        i === staffIndex ? rows.map((row, day) => [...d.requests[staffIndex][day]]) : rows
      ),
      adminRemarks: d.adminRemarks.map((rows, i) =>
        i === staffIndex ? rows.map((row, day) => [...d.remarks[staffIndex][day]]) : rows
      ),
    }));
    setNote(`${data.staff[staffIndex]?.name || `勤務者 ID ${staffIndex}`} の申請データをコピーしました。`);
  };

  const toggleStaff = (index) =>
    setData((d) => ({
      ...d,
      staffEnabled: d.staffEnabled.map((v, i) => (i === index ? !v : v)),
    }));

  const coverage = (day, shift, key, value) =>
    setData((d) => ({
      ...d,
      coverage: d.coverage.map((r, i) =>
        i === day
          ? r.map((x, j) => (j === shift ? { ...x, [key]: Math.max(0, Number(value)) } : x))
          : r
      ),
    }));

  // Solverには管理者調整後の申請を渡す。
  const body = () => ({
    dates: data.dates,
    staff: data.staff.map((s) => ({
      ...s,
      ew1_candidate: Boolean(s.ew1_available),
      iw1_priority: s.iw1_available ? Math.max(1, Number(s.iw1_priority || 1)) : 0,
    })),
    requests: data.adminRequests,
    coverage: data.coverage,
    night_pair_ng: data.night_pair_ng,
  });

  const solve = async () => {
    setBusy(true);
    setNote("OR-Toolsで勤務表を計算しています…");
    try {
      const r = await fetch(`${API}/schedule/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body()),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.detail || "計算できませんでした。");
      setResult(b);
      setStep("read");
      setNote("勤務表を作成しました。");
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/schedule/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body()),
      });
      if (!r.ok) throw Error((await r.json()).detail);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = "read_work.xlsx";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  };


  const requestHolidayLabels = () =>
    data.dates.map((date, d) => {
      const day = weekdays[d];
      const closed =
        day === "土" ||
        day === "日" ||
        ["12-29", "12-30", "12-31", "01-01", "01-02", "01-03"].includes(date.slice(5)) ||
        Boolean(holidays[date]);
      return closed ? "休日" : "平日";
    });

  const downloadRequestExcel = async () => {
    setBusy(true);
    setNote("勤務希望Excelを作成しています…");
    try {
      const r = await fetch(`${API}/requests/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dates: data.dates,
          staff: data.staff,
          requests: data.requests,
          remarks: data.remarks,
          holiday_labels: requestHolidayLabels(),
        }),
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        throw Error(detail.detail || "勤務希望Excelを作成できませんでした。");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `勤務希望_${data.dates[2] || data.dates[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setNote("勤務希望Excelをダウンロードしました。");
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadRequestExcel = async (file) => {
    if (!file) return;
    setBusy(true);
    setNote("勤務希望Excelを読み込んでいます…");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(`${API}/requests/import`, { method: "POST", body: form });
      const payload = await r.json();
      if (!r.ok) throw Error(payload.detail || "勤務希望Excelを読み込めませんでした。");

      setData((d) => {
        const importedStaff = Array.from({ length: 30 }, (_, i) => ({
          ...d.staff[i],
          name: payload.staff_names?.[i] ?? d.staff[i].name,
        }));
        const matchedCycle = cycles.find((c) => c.dates[0] === payload.dates?.[0]);
        return {
          ...d,
          dates: payload.dates,
          start: payload.dates[0],
          cycleStart: matchedCycle?.start || d.cycleStart,
          staff: importedStaff,
          requests: payload.requests,
          remarks: payload.remarks,
          staffEnabled: Array(30).fill(false),
          staffIdentityLocked: true,
        };
      });
      setResult(null);
      setNote("Excelの勤務希望を反映しました。勤務者名・IDは変更ロック中です。");
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
      if (requestExcelInputRef.current) requestExcelInputRef.current.value = "";
    }
  };

  return (
    <div className="app-shell">
      <aside>
        <div className="logo">S</div>
        <div className="brand">
          勤務調整<span>医師シフト管理</span>
        </div>
        <nav>
          {[
            ["initial", "1", "申請入力"],
            ["adjust", "2", "管理者調整"],
            ["read", "3", "勤務表確認"],
          ].map(([id, n, label]) => (
            <button key={id} className={step === id ? "active" : ""} onClick={() => setStep(id)}>
              <b>{n}</b>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className={`api ${api === "接続済み" ? "ok" : ""}`}>
          <i />
          API {api}
        </div>
      </aside>

      <main>
        <header>
          <div>
            <p>SHIFT SCHEDULE</p>
            <h1>
              {step === "initial"
                ? "勤務希望の申請"
                : step === "adjust"
                  ? "管理者調整"
                  : "勤務表の確認"}
            </h1>
          </div>
          {step !== "initial" && (
            <div className="period">
              <label>期間開始日（31日間）</label>
              <input type="date" value={data.start || data.dates[0]} readOnly />
            </div>
          )}
        </header>

        {step === "initial" && (
          <InitialWork
            data={data}
            weekdays={weekdays}
            holidays={holidays}
            holidayStatus={holidayStatus}
            setCycle={setCycle}
            updateStaff={updateStaff}
            toggleStaff={toggleStaff}
            setInitial={setInitial}
            busy={busy}
            requestExcelInputRef={requestExcelInputRef}
            downloadRequestExcel={downloadRequestExcel}
            uploadRequestExcel={uploadRequestExcel}
          />
        )}

        {step === "adjust" && (
          <AdminAdjust
            data={data}
            weekdays={weekdays}
            holidays={holidays}
            holidayStatus={holidayStatus}
            updateStaff={updateStaff}
            coverage={coverage}
            solve={solve}
            busy={busy}
            copyAllRequests={copyAllRequests}
            copyStaffRequests={copyStaffRequests}
            setAdminRequest={setAdminRequest}
          />
        )}

        {step === "read" && (
          <section>
            <div className="toolbar">
              <div>
                <strong>OR-Tools 計算結果</strong>
                <span className="muted">日 / 夜 / 外1 / 内1 / ×</span>
              </div>
              <button className="secondary" onClick={() => setStep("adjust")}>
                ← 条件を調整
              </button>
              <button className="primary" onClick={download} disabled={!result || busy}>
                Excelを出力 ↓
              </button>
            </div>
            {result ? (
              <Results result={result} staff={data.staff} weekdays={weekdays} />
            ) : (
              <div className="empty">
                <b>まだ勤務表を作成していません</b>
                <p>管理者調整で条件を確認し、勤務表を作成してください。</p>
                <button className="primary" onClick={() => setStep("adjust")}>
                  管理者調整へ
                </button>
              </div>
            )}
          </section>
        )}

        {note && (
          <div className="toast">
            {note}
            <button onClick={() => setNote("")}>×</button>
          </div>
        )}
      </main>
    </div>
  );
}

function AvailabilityCheckbox({ checked, onChange, label }) {
  return (
    <label className="admin-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{checked ? "可" : "不可"}</span>
      <small>{label}</small>
    </label>
  );
}

function AdminAdjust({
  data,
  weekdays,
  holidays,
  holidayStatus,
  updateStaff,
  coverage,
  solve,
  busy,
  copyAllRequests,
  copyStaffRequests,
  setAdminRequest,
}) {
  const isHoliday = (date, day) =>
    day === "土" ||
    day === "日" ||
    ["12-29", "12-30", "12-31", "01-01", "01-02", "01-03"].includes(date.slice(5)) ||
    Boolean(holidays[date]);

  return (
    <section className="initial-section admin-section">
      <div className="initial-toolbar admin-toolbar">
        <div>
          <label>勤務調整期間</label>
          <input value={`${fmt(data.dates[0])} - ${fmt(data.dates[30])}`} readOnly />
          <small>医師情報・目標勤務数・EW/IW可否は全クール共通で引き継がれます</small>
        </div>
        <span className="holiday-api">{holidayStatus}</span>
        <button className="primary" onClick={solve} disabled={busy}>
          {busy ? "計算中…" : "勤務表を作成 →"}
        </button>
      </div>

      <div className="initial-help">
        <b>管理者入力</b>
        <span>
          医師属性と必要人数を設定し、下段で勤務申請をコピーしたうえで管理者が内容を修正できます。
        </span>
      </div>

      <div className="admin-block">
        <div className="admin-block-title">
          <strong>管理者調整（医師情報・目標勤務数）</strong>
          <span>{data.staff.length}名・全クール共通</span>
        </div>

        <div className="admin-sheet-scroll">
          <table className="admin-staff-sheet">
            <thead>
              <tr>
                <th className="row-label">項目</th>
                {data.staff.map((s, i) => (
                  <th key={i}>
                    <span className="staff-id">ID {i}</span>
                    {s.name || `医師 ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="row-label">氏名</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <input
                      aria-label={`勤務者${i}の氏名`}
                      value={s.name}
                      placeholder="医師名"
                      onChange={(e) => updateStaff(i, "name", e.target.value)}
                    />
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">リーダーLv</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <select
                      value={s.leader_level}
                      onChange={(e) => updateStaff(i, "leader_level", Number(e.target.value))}
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                    </select>
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">EW1の可否</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <AvailabilityCheckbox
                      checked={Boolean(s.ew1_available)}
                      onChange={(v) => updateStaff(i, "ew1_available", v)}
                      label="西大寺"
                    />
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">EW2の可否</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <AvailabilityCheckbox
                      checked={Boolean(s.ew2_available)}
                      onChange={(v) => updateStaff(i, "ew2_available", v)}
                      label="薬師寺"
                    />
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">IW1の可否</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <AvailabilityCheckbox
                      checked={Boolean(s.iw1_available)}
                      onChange={(v) => updateStaff(i, "iw1_available", v)}
                      label="クリクラ"
                    />
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">IW1優先度</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <select
                      value={s.iw1_available ? s.iw1_priority : 0}
                      disabled={!s.iw1_available}
                      onChange={(e) => updateStaff(i, "iw1_priority", Number(e.target.value))}
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">IW2の可否</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <AvailabilityCheckbox
                      checked={Boolean(s.iw2_available)}
                      onChange={(v) => updateStaff(i, "iw2_available", v)}
                      label="未設定"
                    />
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">目標 日勤</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <input
                      type="number"
                      min="0"
                      value={s.target_day}
                      onChange={(e) => updateStaff(i, "target_day", Number(e.target.value))}
                    />
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">目標 夜勤</th>
                {data.staff.map((s, i) => (
                  <td key={i}>
                    <input
                      type="number"
                      min="0"
                      value={s.target_night}
                      onChange={(e) => updateStaff(i, "target_night", Number(e.target.value))}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="admin-definitions">
          <div>
            <strong>EWとは、追加の外勤</strong>
            <span>EW1とは西大寺勤務</span>
            <span>EW2とは薬師寺勤務</span>
          </div>
          <div>
            <strong>IWとは、院内の別業務</strong>
            <span>IW1とはクリクラ</span>
            <span>IW2とは未設定</span>
          </div>
        </div>
      </div>

      <div className="admin-block coverage-block">
        <div className="admin-block-title">
          <strong>日別の必要人数</strong>
          <span>日勤・夜勤それぞれの必要人数とリーダー人数</span>
        </div>
        <div className="sheet-scroll admin-coverage-scroll">
          <table className="input-sheet admin-coverage-sheet">
            <thead>
              <tr>
                <th className="sticky c0" rowSpan="2">day</th>
                <th className="sticky c1" rowSpan="2">日付</th>
                <th className="sticky c2" rowSpan="2">曜日</th>
                <th className="sticky c3" rowSpan="2">平日<br />休日</th>
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
            <tbody>
              {data.dates.map((date, d) => {
                const holiday = isHoliday(date, weekdays[d]);
                return (
                  <tr
                    className={`${holiday ? "holiday" : "weekday"} ${
                      d < 2 || d === 30 ? "buffer-day" : "application-day"
                    }`}
                    key={date}
                  >
                    <th className="sticky c0">{d}</th>
                    <th className="sticky c1">{date.replaceAll("-", "/")}</th>
                    <th className="sticky c2">{weekdays[d]}</th>
                    <th className="sticky c3">
                      <span>{holiday ? "休日" : "平日"}</span>
                      {holidays[date] && <small>{holidays[date]}</small>}
                    </th>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={data.coverage[d][0].minimum}
                        onChange={(e) => coverage(d, 0, "minimum", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={data.coverage[d][0].leaders}
                        onChange={(e) => coverage(d, 0, "leaders", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={data.coverage[d][1].minimum}
                        onChange={(e) => coverage(d, 1, "minimum", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={data.coverage[d][1].leaders}
                        onChange={(e) => coverage(d, 1, "leaders", e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-block admin-request-block">
        <div className="admin-block-title admin-request-title">
          <div>
            <strong>管理者用 勤務申請調整</strong>
            <span>勤務申請をコピー後、管理者が勤務希望・備考を変更できます</span>
          </div>
          <button className="primary copy-all-button" onClick={copyAllRequests}>
            勤務申請のデータを全コピー
          </button>
        </div>

        <AdminRequestSheet
          data={data}
          weekdays={weekdays}
          holidays={holidays}
          copyStaffRequests={copyStaffRequests}
          setAdminRequest={setAdminRequest}
        />
      </div>

      <footer className="sheet-footer">
        <span><i className="buffer-key" />申請期間外（前2日・後1日）</span>
        <span>表示期間 {fmt(data.dates[0])} - {fmt(data.dates[30])}</span>
      </footer>
    </section>
  );
}

function AdminRequestSheet({
  data,
  weekdays,
  holidays,
  copyStaffRequests,
  setAdminRequest,
}) {
  const isHoliday = (date, day) =>
    day === "土" ||
    day === "日" ||
    ["12-29", "12-30", "12-31", "01-01", "01-02", "01-03"].includes(date.slice(5)) ||
    Boolean(holidays[date]);

  return (
    <div className="sheet-scroll admin-request-scroll">
      <table className="input-sheet admin-request-sheet">
        <thead>
          <tr className="admin-copy-row">
            <th className="sticky c0" rowSpan="4">day</th>
            <th className="sticky c1" rowSpan="4">日付</th>
            <th className="sticky c2" rowSpan="4">曜日</th>
            <th className="sticky c3" rowSpan="4">平日<br />休日</th>
            {data.staff.map((s, i) => (
              <th colSpan="2" className="doctor admin-copy-cell" key={i}>
                <button className="copy-staff-button" onClick={() => copyStaffRequests(i)}>
                  この勤務者をコピー
                </button>
              </th>
            ))}
          </tr>
          <tr>
            {data.staff.map((s, i) => (
              <th colSpan="2" className="doctor" key={i}>
                <span className="staff-id">勤務者 ID {i}</span>
              </th>
            ))}
          </tr>
          <tr>
            {data.staff.map((s, i) => (
              <th colSpan="2" className="doctor-name" key={i}>
                {s.name || `医師 ${i + 1}`}
              </th>
            ))}
          </tr>
          <tr>
            {data.staff.flatMap((_, i) => [
              <th className="shift-head" key={`${i}-d`}>日勤</th>,
              <th className="shift-head" key={`${i}-n`}>夜勤</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {data.dates.map((date, d) => {
            const holiday = isHoliday(date, weekdays[d]);
            return (
              <tr
                className={`${holiday ? "holiday" : "weekday"} ${
                  d < 2 || d === 30 ? "buffer-day" : "application-day"
                }`}
                key={date}
              >
                <th className="sticky c0">{d}</th>
                <th className="sticky c1">{date.replaceAll("-", "/")}</th>
                <th className="sticky c2">{weekdays[d]}</th>
                <th className="sticky c3">
                  <span>{holiday ? "休日" : "平日"}</span>
                  {holidays[date] && <small>{holidays[date]}</small>}
                </th>
                {data.staff.flatMap((s, i) =>
                  [0, 1].map((sh) => (
                    <td key={`${i}-${sh}`} className="admin-editable-cell">
                      <select
                        aria-label={`管理者 ${s.name || `勤務者${i}`} ${date} ${sh ? "夜勤" : "日勤"}の希望`}
                        value={data.adminRequests[i][d][sh]}
                        onChange={(e) =>
                          setAdminRequest(i, d, sh, "adminRequests", e.target.value)
                        }
                      >
                        {choices.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`管理者 ${s.name || `勤務者${i}`} ${date} ${sh ? "夜勤" : "日勤"}の備考`}
                        value={data.adminRemarks[i][d][sh]}
                        placeholder="管理者備考"
                        onChange={(e) =>
                          setAdminRequest(i, d, sh, "adminRemarks", e.target.value)
                        }
                      />
                    </td>
                  ))
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InitialWork({
  data,
  weekdays,
  holidays,
  holidayStatus,
  setCycle,
  updateStaff,
  toggleStaff,
  setInitial,
  busy,
  requestExcelInputRef,
  downloadRequestExcel,
  uploadRequestExcel,
}) {
  const isHoliday = (date, day) =>
    day === "土" ||
    day === "日" ||
    date.slice(5) === "12-29" ||
    date.slice(5) === "12-30" ||
    date.slice(5) === "12-31" ||
    date.slice(5) === "01-01" ||
    date.slice(5) === "01-02" ||
    date.slice(5) === "01-03" ||
    Boolean(holidays[date]);

  return (
    <section className="initial-section">
      <div className="initial-toolbar">
        <div>
          <label>勤務申請期間</label>
          <select value={data.cycleStart} onChange={(e) => setCycle(e.target.value)}>
            {cycles.map((c) => (
              <option key={c.start} value={c.start}>
                {fmt(c.start)} - {fmt(c.end)}
              </option>
            ))}
          </select>
          <small>入力表には前2日・後1日を加えた31日間を表示</small>
        </div>
        <span className="holiday-api">{holidayStatus}</span>
        <div className="request-excel-actions">
          <button className="secondary" onClick={downloadRequestExcel} disabled={busy}>
            勤務希望Excelをダウンロード ↓
          </button>
          <button
            className="secondary"
            onClick={() => requestExcelInputRef.current?.click()}
            disabled={busy}
          >
            Excelをアップロード ↑
          </button>
          <input
            ref={requestExcelInputRef}
            type="file"
            accept=".xlsx,.xlsm"
            hidden
            onChange={(e) => uploadRequestExcel(e.target.files?.[0])}
          />
          <button className="secondary">下書き保存済み</button>
        </div>
      </div>

      <div className="initial-help">
        <b>入力方法</b>
        <span>医師名の上のチェックをONにすると、その医師の希望と備考を編集できます。</span>
        {data.staffIdentityLocked && (
          <span className="identity-lock-note">🔒 Excel反映後のため勤務者名・IDは変更ロック中です。</span>
        )}
      </div>

      <div className="sheet-scroll">
        <table className="input-sheet">
          <thead>
            <tr>
              <th className="sticky c0" rowSpan="3">day</th>
              <th className="sticky c1" rowSpan="3">日付</th>
              <th className="sticky c2" rowSpan="3">曜日</th>
              <th className="sticky c3" rowSpan="3">平日<br />休日</th>
              {data.staff.map((s, i) => (
                <th
                  colSpan="2"
                  className={data.staffEnabled[i] ? "doctor enabled" : "doctor"}
                  key={i}
                >
                  <label className="doctor-toggle">
                    <input
                      type="checkbox"
                      checked={data.staffEnabled[i]}
                      onChange={() => toggleStaff(i)}
                    />
                    <span>{data.staffEnabled[i] ? "入力可" : "ロック"}</span>
                  </label>
                </th>
              ))}
            </tr>
            <tr>
              {data.staff.map((s, i) => (
                <th colSpan="2" className="doctor-name" key={i}>
                  <span className="staff-id">ID {i}</span>
                  <input
                    aria-label={`勤務者${i}の氏名`}
                    value={s.name}
                    placeholder="医師名"
                    disabled={!data.staffEnabled[i] || data.staffIdentityLocked}
                    title={data.staffIdentityLocked ? "Excel反映後のため勤務者名はロックされています" : ""}
                    onChange={(e) => updateStaff(i, "name", e.target.value)}
                  />
                </th>
              ))}
            </tr>
            <tr>
              {data.staff.flatMap((_, i) => [
                <th className="shift-head" key={`${i}-d`}>日勤</th>,
                <th className="shift-head" key={`${i}-n`}>夜勤</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {data.dates.map((date, d) => {
              const holiday = isHoliday(date, weekdays[d]);
              return (
                <tr
                  className={`${holiday ? "holiday" : "weekday"} ${
                    d < 2 || d === 30 ? "buffer-day" : "application-day"
                  }`}
                  key={date}
                >
                  <th className="sticky c0">{d}</th>
                  <th className="sticky c1">{date.replaceAll("-", "/")}</th>
                  <th className="sticky c2">{weekdays[d]}</th>
                  <th className="sticky c3">
                    <span>{holiday ? "休日" : "平日"}</span>
                    {holidays[date] && <small>{holidays[date]}</small>}
                  </th>
                  {data.staff.flatMap((s, i) =>
                    [0, 1].map((sh) => (
                      <td className={!data.staffEnabled[i] ? "locked" : ""} key={`${i}-${sh}`}>
                        <select
                          aria-label={`${s.name || `勤務者${i}`} ${date} ${sh ? "夜勤" : "日勤"}の希望`}
                          value={data.requests[i][d][sh]}
                          disabled={!data.staffEnabled[i]}
                          onChange={(e) =>
                            setInitial(i, d, sh, "requests", e.target.value)
                          }
                        >
                          {choices.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`${s.name || `勤務者${i}`} ${date} ${sh ? "夜勤" : "日勤"}の備考`}
                          value={data.remarks[i][d][sh]}
                          placeholder="備考"
                          disabled={!data.staffEnabled[i]}
                          onChange={(e) =>
                            setInitial(i, d, sh, "remarks", e.target.value)
                          }
                        />
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="sheet-footer">
        <span><i className="buffer-key" />申請期間外（前2日・後1日）</span>
        <span>表示期間 {fmt(data.dates[0])} - {fmt(data.dates[30])}</span>
      </footer>
    </section>
  );
}

function Results({ result, staff, weekdays }) {
  return (
    <div className="result-wrap">
      <table>
        <thead>
          <tr>
            <th>日付</th>
            {staff.map((s, i) => (
              <th key={i}>
                {s.name}
                <small>日 / 夜</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, d) => (
            <tr
              key={d}
              className={weekdays[d] === "日" ? "sun" : weekdays[d] === "土" ? "sat" : ""}
            >
              <th>
                {Number(r.date.slice(8))}
                <small>{weekdays[d]}</small>
              </th>
              {r.cells.map((cell, i) => (
                <td key={i}>
                  <span>{cell[0] || "−"}</span>
                  <span>{cell[1] || "−"}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

const draftKeyForCycle = (cycleStart) => `shift-draft-${cycleStart}`;
const CURRENT_CYCLE_KEY = "shift-current-cycle-v1";

const cloneMatrix = (matrix) => matrix.map((staffRows) => staffRows.map((row) => [...row]));

const blankRemarks = () =>
  Array.from({ length: 30 }, () =>
    Array.from({ length: 31 }, () => ["", ""])
  );

const blankRequests = () =>
  Array.from({ length: 30 }, () =>
    Array.from({ length: 31 }, () => ["unavailable", "unavailable"])
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
  emergency_count: 0,
  leader_level: 0,
  ew1_candidate: false,
  ew1_available: false,
  ew2_available: false,
  ew3_available: false,
  iw1_available: 0,
  iw2_available: false,
  target_day: 0,
  target_night: 0,
});

function fresh() {
  const cycle = cycles[0];
  const staff = Array.from({ length: 30 }, (_, i) => emptyStaff(i));
  const requests = blankRequests();
  const remarks = blankRemarks();
  return {
    start: cycle.dates[0],
    cycleStart: cycle.start,
    dates: cycle.dates,
    staff,
    requestStaffNames: Array(30).fill(""),
    staffEnabled: Array(30).fill(false),
    staffIdentityLocked: false,
    requests,
    remarks,
    adminRequests: cloneMatrix(requests),
    adminRemarks: cloneMatrix(remarks),
    coverage: Array.from({ length: 31 }, () => [
      { minimum: 3, leaders: 1, ew1: 0, ew2: 0, ew3: 0, iw1: 0, iw2: 0 },
      { minimum: 2, leaders: 1, ew1: 0, ew2: 0, ew3: 0, iw1: 0, iw2: 0 },
    ]),
    night_pair_ng: [],
    status: "editing",
    completedAt: null,
  };
}

function normalizeStaff(raw, index) {
  const base = emptyStaff(index);
  const source = raw || {};
  const ew1Available = source.ew1_available ?? source.ew1_candidate ?? false;
  // 旧版のiw1_priorityは移行時のみ読み取り、新しい保存データからは除外する。
  const iw1Value = source.iw1_available ?? source.iw1_priority ?? 0;
  const { iw1_priority: _legacyIw1Priority, ...cleanSource } = source;
  return {
    ...base,
    ...cleanSource,
    no: source.no ?? index,
    emergency_count: Number(source.emergency_count ?? 0) ? 1 : 0,
    ew1_candidate: Boolean(ew1Available),
    ew1_available: Number(ew1Available) ? 1 : 0,
    ew2_available: Number(source.ew2_available ?? 0) ? 1 : 0,
    ew3_available: Number(source.ew3_available ?? 0) ? 1 : 0,
    iw1_available: Math.min(3, Math.max(0, Number(iw1Value || 0))),
    iw2_available: Number(source.iw2_available ?? 0) ? 1 : 0,
  };
}

function normalize(saved, persistentStaff) {
  const base = fresh();
  const source = saved || {};
  const cycleStart = source.cycleStart || cycles[0].start;
  const dates = cycles.find((c) => c.start === cycleStart)?.dates || base.dates;

  // 医師情報もクール単位で保存する。旧版の共通医師情報は移行時の初期値としてのみ利用する。
  const staffSource = source.staff?.length ? source.staff : persistentStaff;
  const staff = Array.from({ length: 30 }, (_, i) => normalizeStaff(staffSource?.[i], i));
  const requestStaffNames = Array.from({ length: 30 }, (_, i) =>
    String(source.requestStaffNames?.[i] ?? "")
  );
  const defaultRequests = blankRequests();

  // 勤務申請画面は管理者の医師名とは別データとして保持する。
  // 未初期化の状態では勤務者名は空白、勤務申請は全て×、備考は空白。
  const requests = Array.from({ length: 30 }, (_, s) =>
    Array.from({ length: 31 }, (_, d) => source.requests?.[s]?.[d] || defaultRequests[s][d])
  );
  const remarks = Array.from({ length: 30 }, (_, s) =>
    Array.from({ length: 31 }, (_, d) => source.remarks?.[s]?.[d] || ["", ""])
  );

  const adminRequests = Array.from({ length: 30 }, (_, s) =>
    Array.from(
      { length: 31 },
      (_, d) => source.adminRequests?.[s]?.[d] || source.requests?.[s]?.[d] || defaultRequests[s][d]
    )
  );
  const adminRemarks = Array.from({ length: 30 }, (_, s) =>
    Array.from(
      { length: 31 },
      (_, d) => source.adminRemarks?.[s]?.[d] || source.remarks?.[s]?.[d] || ["", ""]
    )
  );

  const coverage = Array.from({ length: 31 }, (_, d) =>
    Array.from({ length: 2 }, (_, sh) => {
      const defaults = sh === 0
        ? { minimum: 3, leaders: 1, ew1: 0, ew2: 0, ew3: 0, iw1: 0, iw2: 0 }
        : { minimum: 2, leaders: 1, ew1: 0, ew2: 0, ew3: 0, iw1: 0, iw2: 0 };
      return { ...defaults, ...(source.coverage?.[d]?.[sh] || {}) };
    })
  );

  return {
    ...base,
    ...source,
    cycleStart,
    start: dates[0],
    dates,
    staff,
    requestStaffNames,
    // ページを再読み込みした場合は必ず全員を入力ロック状態に戻す。
    staffEnabled: Array(30).fill(false),
    staffIdentityLocked: Boolean(source.staffIdentityLocked),
    requests,
    remarks,
    adminRequests,
    adminRemarks,
    coverage,
    status: source.status === "completed" ? "completed" : "editing",
    completedAt: source.completedAt || null,
  };
}

export default function App() {
  const [step, setStep] = useState("initial");
  const [data, setData] = useState(() => fresh());
  const [hydrated, setHydrated] = useState(false);
  const [api, setApi] = useState("確認中");
  const [note, setNote] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [holidays, setHolidays] = useState({});
  const [holidayStatus, setHolidayStatus] = useState("祝日を確認中");
  const [cycleStatuses, setCycleStatuses] = useState({});
  const requestExcelInputRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => setApi(r.ok ? "接続済み" : "未接続"))
      .catch(() => setApi("未接続"));
  }, []);

  // PostgreSQLから「最後に開いたクール」と、そのクール専用の勤務申請ドラフトを読み込む。
  // 医師情報は全クール共通の別キーから読み込む。
  useEffect(() => {
    let cancelled = false;

    const loadState = async (key) => {
      const response = await fetch(`${API}/state/${key}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${key} の読み込みに失敗しました`);
      const json = await response.json();
      return json.value;
    };

    const loadInitialState = async () => {
      const [persistentStaff, savedCurrentCycle, legacyDraft] = await Promise.all([
        loadState("shift-admin-staff-v2"),
        loadState(CURRENT_CYCLE_KEY),
        loadState("shift-draft"),
      ]);

      const requestedCycle =
        typeof savedCurrentCycle === "object" && savedCurrentCycle?.cycleStart
          ? savedCurrentCycle.cycleStart
          : legacyDraft?.cycleStart || cycles[0].start;
      const cycleStart = cycles.some((c) => c.start === requestedCycle)
        ? requestedCycle
        : cycles[0].start;

      let draft = await loadState(draftKeyForCycle(cycleStart));
      // 旧3コンテナ版の単一shift-draftがあれば、対応するクールの初回移行にだけ利用する。
      if (!draft && legacyDraft?.cycleStart === cycleStart) {
        draft = legacyDraft;
      }
      return { draft, persistentStaff, cycleStart };
    };

    loadInitialState()
      .then(({ draft, persistentStaff, cycleStart }) => {
        if (cancelled) return;
        const source = draft || { cycleStart };
        setData(normalize(source, persistentStaff));
        setHydrated(true);
      })
      .catch((error) => {
        console.error(error);
        if (cancelled) return;
        setData(fresh());
        setHydrated(true);
        setNote("DBから保存データを読み込めませんでした。新規状態で開始します。");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshCycleStatuses = async () => {
    const entries = await Promise.all(
      cycles.map(async (cycle) => {
        try {
          const response = await fetch(`${API}/state/${draftKeyForCycle(cycle.start)}`);
          if (response.status === 404) return [cycle.start, "none"];
          if (!response.ok) return [cycle.start, "none"];
          const json = await response.json();
          return [cycle.start, json.value?.status === "completed" ? "completed" : "editing"];
        } catch {
          return [cycle.start, "none"];
        }
      })
    );
    setCycleStatuses(Object.fromEntries(entries));
  };

  useEffect(() => {
    if (!hydrated) return;
    refreshCycleStatuses();
  }, [hydrated]);

  // 勤務申請ドラフトはクールごとに別キーでPostgreSQLへ保存する。
  // そのため、別クールへ移動して戻っても以前の入力内容を復元できる。
  useEffect(() => {
    if (!hydrated) return undefined;
    const timer = setTimeout(() => {
      setCycleStatuses((prev) => ({ ...prev, [data.cycleStart]: data.status === "completed" ? "completed" : "editing" }));
      Promise.all([
        fetch(`${API}/state/${draftKeyForCycle(data.cycleStart)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: data }),
        }),
        fetch(`${API}/state/${CURRENT_CYCLE_KEY}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: { cycleStart: data.cycleStart } }),
        }),
      ]).catch((error) =>
        console.error("クール別勤務申請ドラフトの保存に失敗しました", error)
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [data, hydrated]);

  // 医師情報も data.staff の一部として shift-draft-YYYY-MM-DD に保存される。

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
    setData((d) => d.status === "completed" ? d : ({
      ...d,
      staff: d.staff.map((s, n) => {
        if (n !== i) return s;
        if (key === "ew1_available") {
          const available = Number(value) ? 1 : 0;
          return { ...s, ew1_available: available, ew1_candidate: Boolean(available) };
        }
        if (key === "iw1_available") {
          const iw1 = Math.min(3, Math.max(0, Number(value)));
          return { ...s, iw1_available: iw1 };
        }
        return { ...s, [key]: value };
      }),
    }));

  const setCycle = async (start) => {
    const c = cycles.find((x) => x.start === start);
    if (!c || start === data.cycleStart) return;

    // 切替前のクールを即時保存してから、切替先クールを読み込む。
    // 500msの自動保存待ちをせず、直前の入力を確実に残す。
    setBusy(true);
    setNote("クールを切り替えています…");
    try {
      await fetch(`${API}/state/${draftKeyForCycle(data.cycleStart)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: data }),
      });

      const response = await fetch(`${API}/state/${draftKeyForCycle(start)}`);
      let targetDraft = null;
      if (response.ok) {
        targetDraft = (await response.json()).value;
      } else if (response.status !== 404) {
        throw new Error("切替先クールの保存データを読み込めませんでした。");
      }

      setData((current) =>
        normalize(targetDraft || { cycleStart: start }, current.staff)
      );
      setResult(null);
      setCycleStatuses((prev) => ({
        ...prev,
        [data.cycleStart]: data.status === "completed" ? "completed" : "editing",
        [start]: targetDraft ? (targetDraft.status === "completed" ? "completed" : "editing") : "none",
      }));
      setNote(
        targetDraft
          ? "保存済みの勤務申請を復元しました。"
          : "初めて開くクールです。勤務申請は未設定です。『初期化』を押すと管理画面の勤務者名を反映します。"
      );
    } catch (error) {
      console.error(error);
      setNote(error.message || "クールの切替に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const completeCycle = async () => {
    if (data.status === "completed") return;
    const completed = { ...data, status: "completed", completedAt: new Date().toISOString(), staffEnabled: Array(30).fill(false) };
    setData(completed);
    setCycleStatuses((prev) => ({ ...prev, [data.cycleStart]: "completed" }));
    try {
      await fetch(`${API}/state/${draftKeyForCycle(data.cycleStart)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: completed }),
      });
      setNote("この勤務申請期間を『済』にしました。編集はロックされています。");
    } catch {
      setNote("『済』の保存に失敗しました。");
    }
  };

  const reopenCycle = async () => {
    const reopened = { ...data, status: "editing", completedAt: null };
    setData(reopened);
    setCycleStatuses((prev) => ({ ...prev, [data.cycleStart]: "editing" }));
    try {
      await fetch(`${API}/state/${draftKeyForCycle(data.cycleStart)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: reopened }),
      });
      setNote("再編集を許可しました。このクールは再び編集できます。");
    } catch {
      setNote("再編集状態の保存に失敗しました。");
    }
  };

  const initializeRequestForm = () => {
    if (data.status === "completed") return;
    setData((d) => {
      const requestStaffNames = d.staff.map((s) => String(s.name || ""));
      const requestStaff = requestStaffNames.map((name, i) => ({ ...emptyStaff(i), name }));
      const requests = initialRequestsForStaff(requestStaff);
      const remarks = blankRemarks();

      return {
        ...d,
        requestStaffNames,
        staffEnabled: Array(30).fill(false),
        staffIdentityLocked: true,
        requests,
        remarks,
        adminRequests: cloneMatrix(requests),
        adminRemarks: cloneMatrix(remarks),
      };
    });
    setResult(null);
    setNote("管理画面の勤務者名を反映し、勤務申請を初期化しました。名前なしは全て×、名前ありは day 0・1・30 が×、それ以外は○です。");
  };

  const setInitial = (staffIndex, day, shift, key, value) =>
    setData((d) => d.status === "completed" ? d : ({
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
    setData((d) => d.status === "completed" ? d : ({
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
    if (data.status === "completed") return;
    setData((d) => ({
      ...d,
      adminRequests: cloneMatrix(d.requests),
      adminRemarks: cloneMatrix(d.remarks),
    }));
    setNote("勤務申請のデータを管理者調整へ全コピーしました。");
  };

  const copyStaffRequests = (staffIndex) => {
    if (data.status === "completed") return;
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
    setData((d) => d.status === "completed" ? d : ({
      ...d,
      staffEnabled: d.staffEnabled.map((v, i) => (i === index ? !v : v)),
    }));

  const coverage = (day, shift, key, value) =>
    setData((d) => d.status === "completed" ? d : ({
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
      ew1_candidate: Boolean(Number(s.ew1_available)),
      iw1_available: Math.min(3, Math.max(0, Number(s.iw1_available || 0))),
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
          staff: data.staff.map((s, i) => ({ ...s, name: data.requestStaffNames[i] || "" })),
          requests: data.requests,
          remarks: data.remarks,
          coverage: data.coverage,
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
    if (!file || data.status === "completed") return;
    setBusy(true);
    setNote("勤務希望Excelを読み込んでいます…");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(`${API}/requests/import`, { method: "POST", body: form });
      const payload = await r.json();
      if (!r.ok) throw Error(payload.detail || "勤務希望Excelを読み込めませんでした。");

      const matchedCycle = cycles.find((c) => c.dates[0] === payload.dates?.[0]);
      const targetCycleStart = matchedCycle?.start || data.cycleStart;

      // 別クールのExcelを読み込んだ場合は、そのクールの既存データをベースにする。
      let baseData = data;
      if (targetCycleStart !== data.cycleStart) {
        const stateResponse = await fetch(`${API}/state/${draftKeyForCycle(targetCycleStart)}`);
        if (stateResponse.ok) {
          baseData = normalize((await stateResponse.json()).value, data.staff);
        } else if (stateResponse.status === 404) {
          baseData = normalize({ cycleStart: targetCycleStart }, data.staff);
        } else {
          throw Error("アップロード先クールのDBデータを読み込めませんでした。");
        }
      }

      if (baseData.status === "completed") {
        throw Error("この勤務申請期間は『済』のため変更できません。管理画面で再編集を許可してください。");
      }

      const importedNames = Array.from({ length: 30 }, (_, i) =>
        String(payload.staff_names?.[i] ?? "")
      );
      const importedStaff = Array.from({ length: 30 }, (_, i) => {
        const imported = payload.staff?.[i] || { ...baseData.staff?.[i], name: importedNames[i] };
        return normalizeStaff(imported, i);
      });

      const nextData = {
        ...baseData,
        dates: payload.dates,
        start: payload.dates[0],
        cycleStart: targetCycleStart,
        staff: importedStaff,
        requestStaffNames: importedNames,
        requests: payload.requests,
        remarks: payload.remarks,
        coverage: payload.coverage?.length ? payload.coverage : baseData.coverage,
        staffEnabled: Array(30).fill(false),
        staffIdentityLocked: true,
      };

      // 画面反映と同時にクール別SQLデータを明示的に更新する。
      const saveResponse = await fetch(`${API}/state/${draftKeyForCycle(targetCycleStart)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: nextData }),
      });
      if (!saveResponse.ok) {
        throw Error("Excelの内容をSQLへ保存できませんでした。");
      }
      await fetch(`${API}/state/${CURRENT_CYCLE_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { cycleStart: targetCycleStart } }),
      });

      setData(nextData);
      setCycleStatuses((prev) => ({ ...prev, [targetCycleStart]: "editing" }));
      setResult(null);
      setNote("Excelの勤務希望・勤務数・EW/IW設定をSQLと管理画面へ反映しました。");
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
            cycleStatuses={cycleStatuses}
            completeCycle={completeCycle}
            reopenCycle={reopenCycle}
            updateStaff={updateStaff}
            toggleStaff={toggleStaff}
            setInitial={setInitial}
            initializeRequestForm={initializeRequestForm}
            setData={setData}
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
            reopenCycle={reopenCycle}
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
  reopenCycle,
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
    <section className={`initial-section admin-section ${data.status === "completed" ? "cycle-readonly" : ""}`}>
      <div className="initial-toolbar admin-toolbar">
        <div>
          <label>勤務調整期間</label>
          <input value={`${fmt(data.dates[0])} - ${fmt(data.dates[30])}`} readOnly />
          <small>医師情報・目標勤務数・EW/IW可否もこのクール専用として保存されます</small>
        </div>
        <span className="holiday-api">{holidayStatus}</span>
        {data.status === "completed" && (
          <button className="secondary allow-completed-action" onClick={reopenCycle} disabled={busy}>再編集を許可する</button>
        )}
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
          <span>{data.staff.length}名・クール別保存</span>
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
                  <td key={i} className={String(s.name || "").trim() ? "value-positive" : ""}>
                    <input
                      className={String(s.name || "").trim() ? "value-positive-control" : ""}
                      aria-label={`勤務者${i}の氏名`}
                      value={s.name}
                      placeholder="医師名"
                      onChange={(e) => updateStaff(i, "name", e.target.value)}
                    />
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">救急医師カウント</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.emergency_count ?? 0) >= 1 ? "value-positive" : ""}>
                    <select
                      value={Number(s.emergency_count ?? 0)}
                      onChange={(e) => updateStaff(i, "emergency_count", Number(e.target.value))}
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">リーダーLv</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.leader_level ?? 0) >= 1 ? "value-positive" : ""}>
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
                <th className="row-label">EW1（西大寺勤務）</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.ew1_available ?? 0) >= 1 ? "value-positive" : ""}>
                    <select
                      value={Number(s.ew1_available ?? 0)}
                      onChange={(e) => updateStaff(i, "ew1_available", Number(e.target.value))}
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">EW2（薬師寺勤務）</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.ew2_available ?? 0) >= 1 ? "value-positive" : ""}>
                    <select
                      value={Number(s.ew2_available ?? 0)}
                      onChange={(e) => updateStaff(i, "ew2_available", Number(e.target.value))}
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">EW3（吉備勤務）</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.ew3_available ?? 0) >= 1 ? "value-positive" : ""}>
                    <select
                      value={Number(s.ew3_available ?? 0)}
                      onChange={(e) => updateStaff(i, "ew3_available", Number(e.target.value))}
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">IW1（クリクラ）</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.iw1_available ?? 0) >= 1 ? "value-positive" : ""}>
                    <select
                      value={Number(s.iw1_available ?? 0)}
                      onChange={(e) => updateStaff(i, "iw1_available", Number(e.target.value))}
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
                <th className="row-label">IW2（未設定）</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.iw2_available ?? 0) >= 1 ? "value-positive" : ""}>
                    <select
                      value={Number(s.iw2_available ?? 0)}
                      onChange={(e) => updateStaff(i, "iw2_available", Number(e.target.value))}
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">目標 日勤</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.target_day ?? 0) >= 1 ? "value-positive" : ""}>
                    <select
                      value={s.target_day}
                      onChange={(e) => updateStaff(i, "target_day", Number(e.target.value))}
                    >
                      {Array.from({ length: 21 }, (_, v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                ))}
              </tr>

              <tr>
                <th className="row-label">目標 夜勤</th>
                {data.staff.map((s, i) => (
                  <td key={i} className={Number(s.target_night ?? 0) >= 1 ? "value-positive" : ""}>
                    <select
                      value={s.target_night}
                      onChange={(e) => updateStaff(i, "target_night", Number(e.target.value))}
                    >
                      {Array.from({ length: 11 }, (_, v) => <option key={v} value={v}>{v}</option>)}
                    </select>
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
            <span>EW3とは吉備勤務</span>
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
                {["最小勤務", "リーダー", "EW1", "EW2", "EW3", "IW1", "IW2"].map((label) => (
                  <th key={label} colSpan="2" className="coverage-group">{label}</th>
                ))}
              </tr>
              <tr>
                {["最小勤務", "リーダー", "EW1", "EW2", "EW3", "IW1", "IW2"].flatMap((label) => [
                  <th className="coverage-head" key={`${label}-day`}>日勤</th>,
                  <th className="coverage-head night" key={`${label}-night`}>夜勤</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {data.dates.map((date, d) => {
                const holiday = isHoliday(date, weekdays[d]);
                const day = data.coverage[d][0];
                const night = data.coverage[d][1];
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

                    <td className={Number(day.minimum ?? 0) >= 1 ? "value-positive" : ""}><select value={day.minimum} onChange={(e) => coverage(d, 0, "minimum", e.target.value)}>{Array.from({ length: 11 }, (_, v) => <option key={v} value={v}>{v}</option>)}</select></td>
                    <td className={Number(night.minimum ?? 0) >= 1 ? "value-positive" : ""}><select value={night.minimum} onChange={(e) => coverage(d, 1, "minimum", e.target.value)}>{Array.from({ length: 6 }, (_, v) => <option key={v} value={v}>{v}</option>)}</select></td>
                    <td className={Number(day.leaders ?? 0) >= 1 ? "value-positive" : ""}><select value={day.leaders} onChange={(e) => coverage(d, 0, "leaders", e.target.value)}>{Array.from({ length: 4 }, (_, v) => <option key={v} value={v}>{v}</option>)}</select></td>
                    <td className={Number(night.leaders ?? 0) >= 1 ? "value-positive" : ""}><select value={night.leaders} onChange={(e) => coverage(d, 1, "leaders", e.target.value)}>{Array.from({ length: 3 }, (_, v) => <option key={v} value={v}>{v}</option>)}</select></td>
                    {["ew1","ew2","ew3","iw1","iw2"].flatMap((key) => [
                      <td key={`${key}-day`} className={Number(day[key] ?? 0) >= 1 ? "value-positive" : ""}><select value={day[key] ?? 0} onChange={(e) => coverage(d, 0, key, e.target.value)}><option value="0">0</option><option value="1">1</option></select></td>,
                      <td key={`${key}-night`} className={Number(night[key] ?? 0) >= 1 ? "value-positive" : ""}><select value={night[key] ?? 0} onChange={(e) => coverage(d, 1, key, e.target.value)}><option value="0">0</option><option value="1">1</option></select></td>,
                    ])}
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
  cycleStatuses,
  completeCycle,
  reopenCycle,
  updateStaff,
  toggleStaff,
  setInitial,
  initializeRequestForm,
  setData,
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
    <section className={`initial-section ${data.status === "completed" ? "cycle-readonly" : ""}`}>
      <div className="initial-toolbar">
        <div>
          <label>勤務申請期間</label>
          <select value={data.cycleStart} onChange={(e) => setCycle(e.target.value)}>
            {cycles.map((c) => (
              <option key={c.start} value={c.start}>
                {fmt(c.start)} - {fmt(c.end)}{cycleStatuses[c.start] === "completed" ? "　済" : cycleStatuses[c.start] === "editing" ? "　○" : ""}
              </option>
            ))}
          </select>
          <small>入力表には前2日・後1日を加えた31日間を表示</small>
        </div>
        <span className="holiday-api">{holidayStatus}</span>
        <div className="request-excel-actions">
          <button className="primary" onClick={initializeRequestForm} disabled={busy || data.status === "completed"}>
            初期化
          </button>
          <button className="secondary" onClick={downloadRequestExcel} disabled={busy}>
            勤務希望Excelをダウンロード ↓
          </button>
          <button
            className="secondary"
            onClick={() => requestExcelInputRef.current?.click()}
            disabled={busy || data.status === "completed"}
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
          {data.status === "completed" ? (
            <button className="secondary allow-completed-action" onClick={reopenCycle} disabled={busy}>
              再編集を許可する
            </button>
          ) : (
            <button className="primary" onClick={completeCycle} disabled={busy}>
              済みにする
            </button>
          )}
        </div>
      </div>

      <div className="initial-help">
        <b>入力方法</b>
        <span>最初に「初期化」を押すと管理画面の勤務者名を反映します。医師名の上のチェックをONにすると、その医師の希望と備考を編集できます。</span>
        {data.status === "completed" && <span className="completed-note">✓ この勤務申請期間は「済」です。変更できません。</span>}
        {data.staffIdentityLocked && (
          <span className="identity-lock-note">🔒 勤務者名・IDは変更ロック中です。</span>
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
                    value={data.requestStaffNames[i]}
                    placeholder="医師名"
                    disabled={!data.staffEnabled[i] || data.staffIdentityLocked}
                    title={data.staffIdentityLocked ? "勤務者名はロックされています" : ""}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        requestStaffNames: d.requestStaffNames.map((name, n) =>
                          n === i ? e.target.value : name
                        ),
                      }))
                    }
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

import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./InitialWork.css";

const API = import.meta.env.VITE_API_BASE_URL || "/api";
const choices = [
  { value: "available", label: "○" },
  { value: "avoid", label: "△" },
  { value: "unavailable", label: "×" },
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

const weekdayLabels = ["月", "火", "水", "木", "金", "土", "日"];
const DEFAULT_COVERAGE_FORMAT = {
  weekday_day_staff: 3,
  weekday_night_staff: 2,
  weekday_day_leaders: 1,
  weekday_night_leaders: 1,
  holiday_day_staff: 3,
  holiday_night_staff: 2,
  holiday_day_leaders: 1,
  holiday_night_leaders: 1,
};

const fetchHolidayMapForDates = async (dates) => {
  const years = [...new Set(dates.map((x) => x.slice(0, 4)))];
  try {
    const list = await Promise.all(
      years.map((y) =>
        fetch(`https://holidays-jp.github.io/api/v1/${y}/date.json`).then((r) => {
          if (!r.ok) throw new Error("holiday api error");
          return r.json();
        })
      )
    );
    return Object.assign({}, ...list);
  } catch {
    return {};
  }
};

const applyCoverageFormatToDraft = (draft, format, holidayMap = {}) => {
  const next = { ...draft };
  const rows = draft.dates.map((date) => {
    const day = new Date(`${date}T00:00:00`).getDay();
    const isHoliday = day === 0 || day === 6 ||
      ["12-29", "12-30", "12-31", "01-01", "01-02", "01-03"].includes(date.slice(5)) ||
      Boolean(holidayMap[date]);
    return [
      { minimum: Number(format[isHoliday ? "holiday_day_staff" : "weekday_day_staff"]),
        leaders: Number(format[isHoliday ? "holiday_day_leaders" : "weekday_day_leaders"]),
        ew1: 0, ew2: 0, ew3: 0, iw1: 0, iw2: 0 },
      { minimum: Number(format[isHoliday ? "holiday_night_staff" : "weekday_night_staff"]),
        leaders: Number(format[isHoliday ? "holiday_night_leaders" : "weekday_night_leaders"]),
        ew1: 0, ew2: 0, ew3: 0, iw1: 0, iw2: 0 },
    ];
  });
  next.coverage = rows;
  next.finalCoverage = rows.map((shifts) => shifts.map((x) => ({ ...x })));
  return next;
};
const jsWeekdayToMondayIndex = (date) => (new Date(`${date}T00:00:00`).getDay() + 6) % 7;

const emptyProfile = (i) => ({
  id: null,
  staff_code: "",
  name: "",
  emergency_count: 0,
  leader_level: 0,
  ew1_available: 0,
  ew2_available: 0,
  ew3_available: 0,
  iw1_available: 0,
  iw2_available: 0,
  target_day: 0,
  target_night: 0,
  active: true,
  outside_work: [],
});


const normalizeProfileRows = (rows) => {
  const configured = (rows || []).filter(Boolean).slice(0, 30);
  return Array.from({ length: 30 }, (_, i) => configured[i] || emptyProfile(i));
};

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
  profile_id: null,
  staff_code: "",
  name: "",
  emergency_count: 0,
  leader_level: 0,
  ew1_available: 0,
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
    finalStaff: staff.map((x) => ({ ...x })),
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
    finalCoverage: Array.from({ length: 31 }, () => [
      { minimum: 3, leaders: 1, ew1: 0, ew2: 0, ew3: 0, iw1: 0, iw2: 0 },
      { minimum: 2, leaders: 1, ew1: 0, ew2: 0, ew3: 0, iw1: 0, iw2: 0 },
    ]),
    night_pair_ng: [],
    status: "editing",
    completedAt: null,
  };
}

function applyRequestStaffMappingToDraft(draft, profiles, mapping) {
  const next = {
    ...draft,
    staff: (draft.staff || []).map((s) => ({ ...s })),
    finalStaff: (draft.finalStaff || []).map((s) => ({ ...s })),
    requestStaffNames: [...(draft.requestStaffNames || Array(30).fill(""))],
    requests: (draft.requests || blankRequests()).map((rows) => rows.map((cell) => [...cell])),
    remarks: (draft.remarks || blankRemarks()).map((rows) => rows.map((cell) => [...cell])),
    adminRequests: (draft.adminRequests || blankRequests()).map((rows) => rows.map((cell) => [...cell])),
    adminRemarks: (draft.adminRemarks || blankRemarks()).map((rows) => rows.map((cell) => [...cell])),
  };

  for (let slot = 0; slot < 30; slot += 1) {
    const profileId = mapping?.[slot];
    if (profileId == null || profileId === "") continue;
    const profile = profiles.find((p) => Number(p.id) === Number(profileId));
    if (!profile || profile.active === false || !String(profile.name || "").trim()) continue;

    const snapshot = {
      ...emptyStaff(slot),
      no: slot,
      profile_id: profile.id,
      staff_code: profile.staff_code,
      name: profile.name,
      emergency_count: Number(profile.emergency_count || 0),
      leader_level: Number(profile.leader_level || 0),
      ew1_available: Number(profile.ew1_available || 0),
      ew2_available: Number(profile.ew2_available || 0),
      ew3_available: Number(profile.ew3_available || 0),
      iw1_available: Number(profile.iw1_available || 0),
      iw2_available: Number(profile.iw2_available || 0),
      target_day: Number(profile.target_day || 0),
      target_night: Number(profile.target_night || 0),
    };

    const rows = Array.from({ length: 31 }, (_, day) =>
      day === 0 || day === 1 || day === 30 ? ["unavailable", "unavailable"] : ["available", "available"]
    );
    const rem = Array.from({ length: 31 }, () => ["", ""]);
    const outsideDays = [];
    for (let day = 0; day < next.dates.length; day += 1) {
      const weekday = jsWeekdayToMondayIndex(next.dates[day]);
      const rules = (profile.outside_work || []).filter((rule) => Number(rule.weekday) === weekday);
      if (rules.length) outsideDays.push([day, rules[0]]);
    }
    outsideDays.forEach(([day]) => {
      if (day - 1 >= 0) rows[day - 1][1] = "unavailable";
      if (day + 1 < rows.length) rows[day + 1][0] = "unavailable";
    });
    outsideDays.forEach(([day, rule]) => {
      rows[day] = ["regular_outside", "regular_outside"];
      const hospital = String(rule.hospital_name || "");
      rem[day] = [hospital, hospital];
    });

    next.staff[slot] = snapshot;
    next.finalStaff[slot] = { ...snapshot };
    next.requestStaffNames[slot] = profile.name;
    next.requests[slot] = rows;
    next.remarks[slot] = rem;
    next.adminRequests[slot] = rows.map((x) => [...x]);
    next.adminRemarks[slot] = rem.map((x) => [...x]);
  }
  return next;
}

function applyNightPairMasterToDraft(draft, masterPairs) {
  const validCodes = new Set((draft.staff || []).map((s) => String(s.staff_code || "").trim()).filter(Boolean));
  const pairs = [];
  const seen = new Set();
  (masterPairs || []).forEach((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) return;
    const a = String(pair[0] || "").trim();
    const b = String(pair[1] || "").trim();
    if (!a || !b || a === b || !validCodes.has(a) || !validCodes.has(b)) return;
    const key = [a,b].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([a,b]);
  });
  return { ...draft, night_pair_ng: pairs };
}

function normalizeStaff(raw, index) {
  const base = emptyStaff(index);
  const source = raw || {};
  const ew1Available = source.ew1_available ?? source.ew1_candidate ?? 0;
  // 旧版の不要フィールドは読み取り時だけ吸収し、新保存データから除外する。
  const iw1Value = source.iw1_available ?? source.iw1_priority ?? 0;
  const { iw1_priority: _legacyIw1Priority, ew1_candidate: _legacyEw1Candidate, ...cleanSource } = source;
  return {
    ...base,
    ...cleanSource,
    no: source.no ?? index,
    emergency_count: Number(source.emergency_count ?? 0) ? 1 : 0,
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
  const finalStaffSource = source.finalStaff?.length ? source.finalStaff : staff;
  const finalStaff = Array.from({ length: 30 }, (_, i) => normalizeStaff(finalStaffSource?.[i], i));
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

  const finalCoverage = Array.from({ length: 31 }, (_, d) =>
    Array.from({ length: 2 }, (_, sh) => ({ ...(source.finalCoverage?.[d]?.[sh] || coverage[d][sh]) }))
  );

  return {
    ...base,
    ...source,
    cycleStart,
    start: dates[0],
    dates,
    staff,
    finalStaff,
    requestStaffNames,
    // ページを再読み込みした場合は必ず全員を入力ロック状態に戻す。
    staffEnabled: Array(30).fill(false),
    staffIdentityLocked: Boolean(source.staffIdentityLocked),
    requests,
    remarks,
    adminRequests,
    adminRemarks,
    coverage,
    finalCoverage,
    status: source.status === "completed" ? "completed" : "editing",
    completedAt: source.completedAt || null,
  };
}

export default function App() {
  const [step, setStep] = useState("initial");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [data, setData] = useState(() => fresh());
  const [hydrated, setHydrated] = useState(false);
  const [api, setApi] = useState("確認中");
  const [note, setNote] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [holidays, setHolidays] = useState({});
  const [holidayStatus, setHolidayStatus] = useState("祝日を確認中");
  const [cycleStatuses, setCycleStatuses] = useState({});
  const [staffProfiles, setStaffProfiles] = useState(() => Array.from({ length: 30 }, (_, i) => emptyProfile(i)));
  const [coverageFormat, setCoverageFormat] = useState(DEFAULT_COVERAGE_FORMAT);
  const [requestStaffMapping, setRequestStaffMapping] = useState(() => Array(30).fill(null));
  const [nightPairMaster, setNightPairMaster] = useState([]);
  const requestExcelInputRef = useRef(null);
  const reviewExcelInputRef = useRef(null);
  // クール削除直後に空データが自動保存され、再び「○」になるのを防ぐ。
  const skipNextCycleAutoSaveRef = useRef(false);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => setApi(r.ok ? "接続済み" : "未接続"))
      .catch(() => setApi("未接続"));
  }, []);

  useEffect(() => {
    fetch(`${API}/settings/coverage-format`)
      .then((r) => { if (!r.ok) throw new Error("必要人数フォーマットを読み込めませんでした"); return r.json(); })
      .then((json) => setCoverageFormat({ ...DEFAULT_COVERAGE_FORMAT, ...json }))
      .catch(() => setCoverageFormat(DEFAULT_COVERAGE_FORMAT));
  }, []);

  // 正規化SQLテーブルから勤務者マスタと最後に開いたクールを読み込む。
  useEffect(() => {
    let cancelled = false;

    const loadInitialState = async () => {
      const [profileResponse, currentResponse, coverageFormatResponse, requestStaffMappingResponse, nightPairMasterResponse] = await Promise.all([
        fetch(`${API}/staff-profiles`),
        fetch(`${API}/cycles/current`),
        fetch(`${API}/settings/coverage-format`),
        fetch(`${API}/settings/request-staff-mapping`),
        fetch(`${API}/settings/night-pair-ng-master`),
      ]);
      if (!profileResponse.ok) throw new Error("勤務者プロファイルを読み込めませんでした");
      const profileJson = await profileResponse.json();
      const currentJson = currentResponse.ok ? await currentResponse.json() : {};
      const loadedProfiles = profileJson.staff || [];
      const profiles = normalizeProfileRows(loadedProfiles);
      const requested = cycles.some((c) => c.start === currentJson.cycle_start)
        ? currentJson.cycle_start
        : cycles[0].start;
      const cycleResponse = await fetch(`${API}/cycles/${requested}`);
      let draft = null;
      if (cycleResponse.ok) draft = await cycleResponse.json();
      else if (cycleResponse.status !== 404) throw new Error("クールデータを読み込めませんでした");
      const savedCoverageFormat = coverageFormatResponse.ok
        ? { ...DEFAULT_COVERAGE_FORMAT, ...(await coverageFormatResponse.json()) }
        : DEFAULT_COVERAGE_FORMAT;
      const loadedMapping = requestStaffMappingResponse.ok
        ? (await requestStaffMappingResponse.json()).profile_ids || []
        : [];
      const mapping = Array.from({ length: 30 }, (_, i) => loadedMapping[i] ?? null);
      const masterPairs = nightPairMasterResponse.ok
        ? (await nightPairMasterResponse.json()).pairs || []
        : [];
      if (!draft) {
        const baseDraft = normalize({ cycleStart: requested }, null);
        const holidayMap = await fetchHolidayMapForDates(baseDraft.dates);
        const coverageDraft = applyCoverageFormatToDraft(baseDraft, savedCoverageFormat, holidayMap);
        const mappedDraft = applyRequestStaffMappingToDraft(coverageDraft, profiles, mapping);
        draft = applyNightPairMasterToDraft(mappedDraft, masterPairs);
      }
      return { profiles, draft, requested, mapping, masterPairs };
    };

    loadInitialState()
      .then(({ profiles, draft, requested, mapping, masterPairs }) => {
        if (cancelled) return;
        setStaffProfiles(profiles);
        setRequestStaffMapping(mapping);
        setNightPairMaster(masterPairs);
        setData(normalize(draft, null));
        setHydrated(true);
      })
      .catch((error) => {
        console.error(error);
        if (cancelled) return;
        setData(fresh());
        setHydrated(true);
        setNote("DBから保存データを読み込めませんでした。新規状態で開始します。");
      });

    return () => { cancelled = true; };
  }, []);

  const refreshCycleStatuses = async () => {
    try {
      const response = await fetch(`${API}/cycles/statuses`);
      if (!response.ok) return;
      const json = await response.json();
      const statuses = Object.fromEntries(cycles.map((c) => [c.start, json.statuses?.[c.start] || "none"]));
      setCycleStatuses(statuses);
    } catch {
      setCycleStatuses({});
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    refreshCycleStatuses();
  }, [hydrated]);

  // クールデータは複数の正規化テーブルへ保存する（DB内にJSON/JSONBは保存しない）。
  useEffect(() => {
    if (!hydrated) return undefined;
    if (skipNextCycleAutoSaveRef.current) {
      skipNextCycleAutoSaveRef.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      setCycleStatuses((prev) => ({ ...prev, [data.cycleStart]: data.status === "completed" ? "completed" : "editing" }));
      fetch(`${API}/cycles/${data.cycleStart}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).catch((error) => console.error("クールデータの保存に失敗しました", error));
    }, 1000);
    return () => clearTimeout(timer);
  }, [data, hydrated]);

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
          return { ...s, ew1_available: available };
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
    setBusy(true);
    setNote("クールを切り替えています…");
    try {
      // 削除済み（status=none）の空クールは、切替時に再作成しない。
      if (cycleStatuses[data.cycleStart] !== "none") {
        await fetch(`${API}/cycles/${data.cycleStart}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
        });
      }
      const response = await fetch(`${API}/cycles/${start}`);
      let targetDraft = null;
      if (response.ok) targetDraft = await response.json();
      else if (response.status !== 404) throw new Error("切替先クールを読み込めませんでした。");
      await fetch(`${API}/cycles/current`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle_start: start }),
      });
      let nextDraft;
      if (targetDraft) {
        nextDraft = normalize(targetDraft, null);
      } else {
        const baseDraft = normalize({ cycleStart: start }, null);
        const holidayMap = await fetchHolidayMapForDates(baseDraft.dates);
        const coverageDraft = applyCoverageFormatToDraft(baseDraft, coverageFormat, holidayMap);
        const mappedDraft = applyRequestStaffMappingToDraft(coverageDraft, staffProfiles, requestStaffMapping);
        nextDraft = applyNightPairMasterToDraft(mappedDraft, nightPairMaster);
      }
      setData(nextDraft);
      setResult(null);
      setNote(targetDraft ? "保存済みの勤務申請を復元しました。" : "新しい勤務申請期間を作成し、保存済みの勤務者対応・必要人数設定・夜勤ペアNGマスタを初期値として反映しました。");
      await refreshCycleStatuses();
    } catch (error) {
      console.error(error);
      setNote(error.message || "クールの切替に失敗しました。");
    } finally { setBusy(false); }
  };

  const completeCycle = async () => {
    if (data.status === "completed") return;
    const completed = { ...data, status: "completed", completedAt: new Date().toISOString(), staffEnabled: Array(30).fill(false) };
    setData(completed);
    setCycleStatuses((prev) => ({ ...prev, [data.cycleStart]: "completed" }));
    try {
      await fetch(`${API}/cycles/${data.cycleStart}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(completed),
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
      await fetch(`${API}/cycles/${data.cycleStart}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reopened),
      });
      setNote("再編集を許可しました。このクールは再び編集できます。");
    } catch {
      setNote("再編集状態の保存に失敗しました。");
    }
  };

  const deleteCurrentCycleData = async () => {
    if (cycleStatuses[data.cycleStart] !== "editing" || busy) return;
    const period = cycles.find((c) => c.start === data.cycleStart);
    const label = period ? `${fmt(period.start)} - ${fmt(period.end)}` : data.cycleStart;
    const confirmed = window.confirm(
      `${label} の保存データを削除します。\n\n` +
      "申請内容・最終決定版・必要人数・クール別勤務者プロファイル・夜勤ペアNGが削除されます。\n" +
      "勤務者プロファイルと一般外勤マスタは削除されません。\n\nこの操作を実行しますか？"
    );
    if (!confirmed) return;

    setBusy(true);
    setNote("このクールの保存データを削除しています…");
    try {
      const response = await fetch(`${API}/cycles/${data.cycleStart}`, { method: "DELETE" });
      if (!response.ok) throw new Error("クールデータを削除できませんでした。");

      skipNextCycleAutoSaveRef.current = true;
      const empty = normalize({ cycleStart: data.cycleStart }, null);
      setData(empty);
      setResult(null);
      setCycleStatuses((prev) => ({ ...prev, [data.cycleStart]: "none" }));
      setNote("この勤務申請期間の保存データを削除しました。必要な場合は「初期化」から再作成してください。");
    } catch (error) {
      console.error(error);
      setNote(error.message || "クールデータの削除に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const initializeRequestForm = () => {
    if (data.status === "completed") return;
    setData((d) => {
      const staff = Array.from({ length: 30 }, (_, i) => emptyStaff(i));
      const requests = blankRequests();
      const remarks = blankRemarks();
      return {
        ...d, staff, finalStaff: staff.map((x) => ({ ...x })), requestStaffNames: Array(30).fill(""), staffEnabled: Array(30).fill(false),
        staffIdentityLocked: false, requests, remarks,
        adminRequests: cloneMatrix(requests), adminRemarks: cloneMatrix(remarks),
      };
    });
    setResult(null);
    setNote("勤務申請を初期化しました。勤務者名のドロップダウンから勤務者を選択してください。");
  };

  const selectRequestStaff = (slot, profileId) => {
    if (data.status === "completed") return;
    const profile = staffProfiles.find((p) => Number(p.id) === Number(profileId));
    setData((d) => {
      if (!profile) {
        const requests = d.requests.map((rows, i) => i === slot ? blankRequests()[0] : rows);
        const remarks = d.remarks.map((rows, i) => i === slot ? blankRemarks()[0] : rows);
        return {
          ...d,
          staff: d.staff.map((s, i) => i === slot ? emptyStaff(slot) : s),
          requestStaffNames: d.requestStaffNames.map((name, i) => i === slot ? "" : name),
          requests, remarks,
          adminRequests: d.adminRequests.map((rows, i) => i === slot ? requests[slot].map((r) => [...r]) : rows),
          adminRemarks: d.adminRemarks.map((rows, i) => i === slot ? remarks[slot].map((r) => [...r]) : rows),
        };
      }

      const snapshot = {
        ...emptyStaff(slot),
        no: slot, profile_id: profile.id, staff_code: profile.staff_code, name: profile.name,
        emergency_count: Number(profile.emergency_count || 0), leader_level: Number(profile.leader_level || 0),
        ew1_available: Number(profile.ew1_available || 0), ew2_available: Number(profile.ew2_available || 0),
        ew3_available: Number(profile.ew3_available || 0), iw1_available: Number(profile.iw1_available || 0),
        iw2_available: Number(profile.iw2_available || 0), target_day: Number(profile.target_day || 0),
        target_night: Number(profile.target_night || 0),
      };
      const rows = Array.from({ length: 31 }, (_, day) =>
        day === 0 || day === 1 || day === 30 ? ["unavailable", "unavailable"] : ["available", "available"]
      );
      const rem = Array.from({ length: 31 }, () => ["", ""]);
      const outsideDays = [];
      for (let day = 0; day < d.dates.length; day += 1) {
        const weekday = jsWeekdayToMondayIndex(d.dates[day]);
        const rules = (profile.outside_work || []).filter((rule) => Number(rule.weekday) === weekday);
        if (rules.length) outsideDays.push([day, rules[0]]);
      }
      // 先に前日夜勤・翌日日勤を×にし、その後に外勤日自身を優先して通常外勤にする。
      outsideDays.forEach(([day]) => {
        if (day - 1 >= 0) rows[day - 1][1] = "unavailable";
        if (day + 1 < rows.length) rows[day + 1][0] = "unavailable";
      });
      outsideDays.forEach(([day, rule]) => {
        rows[day] = ["regular_outside", "regular_outside"];
        const hospital = String(rule.hospital_name || "");
        rem[day] = [hospital, hospital];
      });
      return {
        ...d,
        staff: d.staff.map((s, i) => i === slot ? snapshot : s),
        requestStaffNames: d.requestStaffNames.map((name, i) => i === slot ? profile.name : name),
        requests: d.requests.map((r, i) => i === slot ? rows : r),
        remarks: d.remarks.map((r, i) => i === slot ? rem : r),
        adminRequests: d.adminRequests.map((r, i) => i === slot ? rows.map((x) => [...x]) : r),
        adminRemarks: d.adminRemarks.map((r, i) => i === slot ? rem.map((x) => [...x]) : r),
      };
    });
    setNote(profile ? `${profile.name} の勤務者プロファイルと通常外勤を勤務申請へ反映しました。` : "勤務者の選択を解除しました。");
  };

  const updateProfile = (index, key, value) =>
    setStaffProfiles((rows) => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));

  const addOutsideRule = (index) =>
    setStaffProfiles((rows) => rows.map((row, i) => i === index
      ? { ...row, outside_work: [...(row.outside_work || []), { weekday: 0, hospital_name: "" }] }
      : row));

  const updateOutsideRule = (profileIndex, ruleIndex, key, value) =>
    setStaffProfiles((rows) => rows.map((row, i) => i === profileIndex
      ? { ...row, outside_work: (row.outside_work || []).map((rule, r) => r === ruleIndex ? { ...rule, [key]: value } : rule) }
      : row));

  const removeOutsideRule = (profileIndex, ruleIndex) =>
    setStaffProfiles((rows) => rows.map((row, i) => i === profileIndex
      ? { ...row, outside_work: (row.outside_work || []).filter((_, r) => r !== ruleIndex) }
      : row));

  const saveStaffProfiles = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${API}/staff-profiles`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staff: staffProfiles }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.detail || "勤務者プロファイルを保存できませんでした。");
      setStaffProfiles(normalizeProfileRows(json.staff));
      setNote("勤務者プロファイルと通常外勤をSQLへ保存しました。");
    } catch (error) { setNote(error.message); } finally { setBusy(false); }
  };

  const deleteStaffProfile = async (index) => {
    const profile = staffProfiles[index];
    if (!profile) return;
    const label = `${profile.staff_code || ""}${profile.name ? ` ${profile.name}` : ""}`.trim() || `No.${index + 1}`;
    if (!window.confirm(`${label} を本当に削除しますか？`)) return;

    // DB保存前の新規行なら画面から除くだけでよい。
    if (!profile.id) {
      setStaffProfiles((rows) => normalizeProfileRows(rows.filter((_, i) => i !== index)));
      setNote(`${label} を削除しました。`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API}/staff-profiles/${profile.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.detail || "勤務者プロファイルを削除できませんでした。");
      setStaffProfiles((rows) => normalizeProfileRows(rows.filter((row) => Number(row.id) !== Number(profile.id))));
      setRequestStaffMapping((rows) => rows.map((value) => Number(value) === Number(profile.id) ? null : value));
      setNote(`${label} を削除しました。`);
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(false);
    }
  };

  const updateRequestStaffMapping = (slot, profileId) =>
    setRequestStaffMapping((rows) => rows.map((value, i) => i === slot ? (profileId ? Number(profileId) : null) : value));

  const saveRequestStaffMapping = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${API}/settings/request-staff-mapping`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_ids: requestStaffMapping }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.detail || "申請入力IDと勤務者の対応を保存できませんでした。");
      setRequestStaffMapping(Array.from({ length: 30 }, (_, i) => json.profile_ids?.[i] ?? null));
      setNote("申請入力IDと勤務者の対応を保存しました。");
    } catch (error) { setNote(error.message); } finally { setBusy(false); }
  };

  const addNightPairMaster = () => {
    const available = staffProfiles.filter((p) => p.id != null && p.active !== false && String(p.name || "").trim());
    if (available.length < 2) { setNote("夜勤ペアNGマスタには勤務者が2名以上必要です。"); return; }
    setNightPairMaster((pairs) => [...pairs, [String(available[0].staff_code), String(available[1].staff_code)]]);
  };

  const updateNightPairMaster = (row, side, value) => {
    setNightPairMaster((pairs) => pairs.map((pair, i) =>
      i === row ? pair.map((v, j) => j === side ? String(value) : v) : pair
    ));
  };

  const removeNightPairMaster = (row) => {
    setNightPairMaster((pairs) => pairs.filter((_, i) => i !== row));
  };

  const saveNightPairMaster = async () => {
    const valid = [];
    const seen = new Set();
    for (const pair of nightPairMaster) {
      const a = String(pair?.[0] || "").trim();
      const b = String(pair?.[1] || "").trim();
      if (!a || !b || a === b) {
        setNote("夜勤ペアNGマスタでは同じ勤務者同士は登録できません。");
        return;
      }
      const key = [a, b].sort().join("|");
      if (seen.has(key)) { setNote("同じ夜勤ペアNGが重複しています。"); return; }
      seen.add(key);
      valid.push([a, b]);
    }
    setBusy(true);
    try {
      const response = await fetch(`${API}/settings/night-pair-ng-master`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairs: valid }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.detail || "夜勤ペアNGマスタを保存できませんでした。");
      setNightPairMaster(json.pairs || []);
      setNote("夜勤ペアNGマスタを保存しました。新しい勤務申請期間に反映されます。");
    } catch (error) { setNote(error.message); } finally { setBusy(false); }
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
      finalStaff: d.staff.map((x) => ({ ...x })),
      finalCoverage: d.coverage.map((day) => day.map((x) => ({ ...x }))),
    }));
    setNote("勤務申請のデータを勤務表確認へ全コピーしました。");
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
      finalStaff: d.finalStaff.map((st, i) => i === staffIndex ? { ...d.staff[staffIndex] } : st),
    }));
    setNote(`${data.staff[staffIndex]?.name || `勤務者 ID ${staffIndex}`} の申請データをコピーしました。`);
  };

  const toggleStaff = (index) =>
    setData((d) => d.status === "completed" ? d : ({
      ...d,
      staffEnabled: d.staffEnabled.map((v, i) => (i === index ? !v : v)),
    }));

  const addNightPairNg = () => {
    if (data.status === "completed") return;
    const named = data.staff.filter((x) => String(x.name || "").trim() && String(x.staff_code || "").trim());
    if (named.length < 2) { setNote("夜勤ペアNGを設定するには勤務者IDのある勤務者が2名以上必要です。"); return; }
    const a = String(named[0].staff_code);
    const b = String(named[1].staff_code);
    setData((d) => ({ ...d, night_pair_ng: [...(d.night_pair_ng || []), [a, b]] }));
  };

  const updateNightPairNg = (row, side, value) =>
    setData((d) => d.status === "completed" ? d : ({
      ...d,
      night_pair_ng: (d.night_pair_ng || []).map((pair, i) =>
        i === row ? pair.map((v, j) => j === side ? String(value) : v) : pair
      ),
    }));

  const removeNightPairNg = (row) =>
    setData((d) => d.status === "completed" ? d : ({
      ...d, night_pair_ng: (d.night_pair_ng || []).filter((_, i) => i !== row),
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
    staff: (data.finalStaff || data.staff).map((s) => ({
      ...s,
      iw1_available: Math.min(3, Math.max(0, Number(s.iw1_available || 0))),
    })),
    requests: data.adminRequests,
    coverage: data.finalCoverage || data.coverage,
    night_pair_ng: (data.night_pair_ng || []).map((pair) => {
      const a = (data.finalStaff || data.staff).findIndex((s) => String(s.staff_code || "") === String(pair[0] || ""));
      const b = (data.finalStaff || data.staff).findIndex((s) => String(s.staff_code || "") === String(pair[1] || ""));
      return [a, b];
    }).filter(([a,b]) => a >= 0 && b >= 0 && a !== b),
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

  const uploadRequestExcel = async (file, applyToAdmin = false) => {
    if (!file || data.status === "completed") return;
    setBusy(true);
    setNote("勤務希望Excelを読み込んでいます…");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("cycle_start", data.cycleStart);
      const r = await fetch(`${API}/requests/import`, { method: "POST", body: form });
      const payload = await r.json();
      if (!r.ok) throw Error(payload.detail || "勤務希望Excelを読み込めませんでした。");

      const importedDates = Array.isArray(payload.dates) ? payload.dates : [];
      const dateMatches = importedDates.length === data.dates.length &&
        importedDates.every((date, i) => date === data.dates[i]);
      if (!dateMatches) {
        throw Error(`Excelの日付が現在のクールと一致しません。現在: ${data.dates[0]} ～ ${data.dates[30]} / Excel: ${importedDates[0] || "不明"} ～ ${importedDates[30] || "不明"}`);
      }
      const targetCycleStart = data.cycleStart;
      const baseData = data;

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
        staff: applyToAdmin ? baseData.staff : importedStaff,
        finalStaff: applyToAdmin ? importedStaff : baseData.finalStaff,
        requestStaffNames: applyToAdmin ? baseData.requestStaffNames : importedNames,
        // 申請入力のExcelは本人申請を更新する。
        // 4 勤務表確認のExcelは本人申請を上書きせず、最終決定だけを更新する。
        requests: applyToAdmin ? baseData.requests : payload.requests,
        remarks: applyToAdmin ? baseData.remarks : payload.remarks,
        adminRequests: applyToAdmin ? cloneMatrix(payload.requests) : baseData.adminRequests,
        adminRemarks: applyToAdmin ? cloneMatrix(payload.remarks) : baseData.adminRemarks,
        coverage: applyToAdmin ? baseData.coverage : (payload.coverage?.length ? payload.coverage : baseData.coverage),
        finalCoverage: applyToAdmin ? (payload.coverage?.length ? payload.coverage : baseData.finalCoverage) : baseData.finalCoverage,
        staffEnabled: Array(30).fill(false),
        staffIdentityLocked: true,
      };

      // 画面反映と同時にクール別SQLデータを明示的に更新する。
      const saveResponse = await fetch(`${API}/cycles/${targetCycleStart}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextData),
      });
      if (!saveResponse.ok) {
        throw Error("Excelの内容をSQLへ保存できませんでした。");
      }
      await fetch(`${API}/cycles/current`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle_start: targetCycleStart }),
      });

      setData(nextData);
      setCycleStatuses((prev) => ({ ...prev, [targetCycleStart]: "editing" }));
      setResult(null);
      setNote(applyToAdmin ? "Excelを最終決定版へ反映しました。本人の勤務申請は変更していません。" : "Excelの勤務希望・必要人数・EW/IW設定をSQLへ反映しました。");
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
      if (requestExcelInputRef.current) requestExcelInputRef.current.value = "";
      if (reviewExcelInputRef.current) reviewExcelInputRef.current.value = "";
    }
  };

  const updateCoverageFormat = (key, value) =>
    setCoverageFormat((current) => ({ ...current, [key]: Number(value) }));

  const saveCoverageFormat = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${API}/settings/coverage-format`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coverageFormat),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.detail || "必要人数フォーマットを保存できませんでした。");
      const saved = { ...DEFAULT_COVERAGE_FORMAT, ...json };
      delete saved.saved;
      setCoverageFormat(saved);
      setNote("平日・休日の必要人数フォーマットを保存しました。次に新しい勤務申請期間を作成したときに初期値として反映されます。");
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <aside>
        <div className="logo">S</div>
        <div className="brand-wrap">
          <div className="brand">
            勤務調整<span>医師シフト管理</span>
          </div>
          <button
            type="button"
            className="settings-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="設定を開く"
            title="設定"
          >
            ⚙️
          </button>
        </div>
        <nav>
          {[
            ["initial", "1", "申請入力"],
            ["pairs", "2", "夜勤ペアNG"],
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
                : step === "pairs"
                  ? "夜勤ペアNG組み合わせ"
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
            deleteCurrentCycleData={deleteCurrentCycleData}
            updateStaff={updateStaff}
            toggleStaff={toggleStaff}
            setInitial={setInitial}
            initializeRequestForm={initializeRequestForm}
            selectRequestStaff={selectRequestStaff}
            staffProfiles={staffProfiles}
            setData={setData}
            busy={busy}
            requestExcelInputRef={requestExcelInputRef}
            downloadRequestExcel={downloadRequestExcel}
            uploadRequestExcel={uploadRequestExcel}
            coverage={coverage}
          />
        )}

        {step === "pairs" && (
          <NightPairScreen
            data={data}
            addNightPairNg={addNightPairNg}
            updateNightPairNg={updateNightPairNg}
            removeNightPairNg={removeNightPairNg}
            reopenCycle={reopenCycle}
          />
        )}

        {step === "read" && (
          <ReviewScreen
            data={data}
            weekdays={weekdays}
            holidays={holidays}
            coverage={coverage}
            updateStaff={updateStaff}
            copyAllRequests={copyAllRequests}
            copyStaffRequests={copyStaffRequests}
            setAdminRequest={setAdminRequest}
            solve={solve}
            result={result}
            download={download}
            busy={busy}
            reviewExcelInputRef={reviewExcelInputRef}
            uploadRequestExcel={uploadRequestExcel}
          />
        )}

        {settingsOpen && (
          <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="設定">
            <div className="settings-panel">
              <div className="settings-panel-header">
                <div>
                  <p>SETTINGS</p>
                  <h1>設定</h1>
                </div>
                <button type="button" className="secondary settings-close" onClick={() => setSettingsOpen(false)}>閉じる</button>
              </div>
              <ProfileScreen
                staffProfiles={staffProfiles}
                updateProfile={updateProfile}
                addOutsideRule={addOutsideRule}
                updateOutsideRule={updateOutsideRule}
                removeOutsideRule={removeOutsideRule}
                saveStaffProfiles={saveStaffProfiles}
                deleteStaffProfile={deleteStaffProfile}
                busy={busy}
                coverageFormat={coverageFormat}
                updateCoverageFormat={updateCoverageFormat}
                saveCoverageFormat={saveCoverageFormat}
                requestStaffMapping={requestStaffMapping}
                updateRequestStaffMapping={updateRequestStaffMapping}
                saveRequestStaffMapping={saveRequestStaffMapping}
                nightPairMaster={nightPairMaster}
                addNightPairMaster={addNightPairMaster}
                updateNightPairMaster={updateNightPairMaster}
                removeNightPairMaster={removeNightPairMaster}
                saveNightPairMaster={saveNightPairMaster}
              />
            </div>
          </div>
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

function ProfileScreen({
  staffProfiles,
  updateProfile,
  addOutsideRule,
  updateOutsideRule,
  removeOutsideRule,
  saveStaffProfiles,
  deleteStaffProfile,
  busy,
  coverageFormat,
  updateCoverageFormat,
  saveCoverageFormat,
  requestStaffMapping,
  updateRequestStaffMapping,
  saveRequestStaffMapping,
  nightPairMaster,
  addNightPairMaster,
  updateNightPairMaster,
  removeNightPairMaster,
  saveNightPairMaster,
}) {
  const selectableProfiles = staffProfiles.filter((p) => p.active !== false && String(p.name || "").trim());
  return (
    <section className="initial-section profile-section">
      <div className="initial-toolbar">
        <div>
          <label>勤務者プロファイル マスタ</label>
          <strong>全クール共通の勤務者情報</strong>
          <small>ID・氏名・救急医師カウント・リーダー・EW/IW・目標勤務数・通常外勤を登録します</small>
        </div>
        <button className="primary" onClick={saveStaffProfiles} disabled={busy}>プロファイルを保存</button>
      </div>
      <div className="admin-block character-master-block">
        <div className="admin-block-title">
          <div><strong>勤務者プロファイル マスタ</strong><span>勤務者IDと氏名は横スクロールしても固定表示されます</span></div>
        </div>
        <div className="character-master-scroll">
          <table className="character-master-table">
            <thead><tr>
              <th>No</th><th>勤務者ID</th><th>氏名</th><th>救急</th><th>Leader</th>
              <th>EW1</th><th>EW2</th><th>EW3</th><th>IW1</th><th>IW2</th><th>目標日</th><th>目標夜</th><th>通常外勤（曜日・病院名）</th><th>削除</th>
            </tr></thead>
            <tbody>
              {staffProfiles.map((p, i) => (
                <tr key={p.id || `new-${i}`}>
                  <th>{i + 1}</th>
                  <td><input value={p.staff_code || ""} onChange={(e) => updateProfile(i, "staff_code", e.target.value)} /></td>
                  <td><input value={p.name || ""} onChange={(e) => updateProfile(i, "name", e.target.value)} placeholder="氏名" /></td>
                  <td><select value={Number(p.emergency_count || 0)} onChange={(e) => updateProfile(i, "emergency_count", Number(e.target.value))}><option value="0">0</option><option value="1">1</option></select></td>
                  <td><select value={Number(p.leader_level || 0)} onChange={(e) => updateProfile(i, "leader_level", Number(e.target.value))}>{[0,1,2].map(v => <option key={v} value={v}>{v}</option>)}</select></td>
                  {[["ew1_available",1],["ew2_available",1],["ew3_available",1],["iw1_available",3],["iw2_available",1]].map(([key,max]) => (
                    <td key={key}><select value={Number(p[key] || 0)} onChange={(e) => updateProfile(i, key, Number(e.target.value))}>{Array.from({length:max+1},(_,v)=><option key={v} value={v}>{v}</option>)}</select></td>
                  ))}
                  <td><select value={Number(p.target_day || 0)} onChange={(e) => updateProfile(i, "target_day", Number(e.target.value))}>{Array.from({length:21},(_,v)=><option key={v} value={v}>{v}</option>)}</select></td>
                  <td><select value={Number(p.target_night || 0)} onChange={(e) => updateProfile(i, "target_night", Number(e.target.value))}>{Array.from({length:11},(_,v)=><option key={v} value={v}>{v}</option>)}</select></td>
                  <td className="outside-work-cell">
                    {(p.outside_work || []).map((rule, r) => (
                      <div className="outside-rule" key={`${p.id || i}-${r}`}>
                        <select value={Number(rule.weekday)} onChange={(e) => updateOutsideRule(i, r, "weekday", Number(e.target.value))}>
                          {weekdayLabels.map((label, w) => <option key={w} value={w}>{label}曜</option>)}
                        </select>
                        <input value={rule.hospital_name || ""} onChange={(e) => updateOutsideRule(i, r, "hospital_name", e.target.value)} placeholder="外勤病院名" />
                        <button type="button" className="mini-remove" onClick={() => removeOutsideRule(i, r)}>×</button>
                      </div>
                    ))}
                    <button type="button" className="mini-add" onClick={() => addOutsideRule(i)}>＋通常外勤</button>
                  </td>
                  <td className="profile-delete-cell">
                    <button type="button" className="danger-button profile-delete-button" onClick={() => deleteStaffProfile(i)} disabled={busy}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="admin-definitions">
        <div><strong>EWとは、追加の外勤</strong><span>EW1 西大寺勤務 / EW2 薬師寺勤務 / EW3 吉備勤務</span></div>
        <div><strong>IWとは、院内の別業務</strong><span>IW1 クリクラ / IW2 未設定</span></div>
      </div>

      <div className="admin-block request-staff-mapping-block">
        <div className="admin-block-title">
          <div>
            <strong>申請入力IDと勤務者</strong>
            <span>申請入力のID 0〜29に対応する勤務者プロファイルを設定します</span>
          </div>
          <button className="primary" onClick={saveRequestStaffMapping} disabled={busy}>保存</button>
        </div>
        <div className="request-staff-mapping-grid">
          {Array.from({ length: 30 }, (_, slot) => {
            const selected = selectableProfiles.find((p) => Number(p.id) === Number(requestStaffMapping?.[slot]));
            return (
              <label className="request-staff-mapping-row" key={slot}>
                <span className="request-slot-id">申請入力ID {slot}</span>
                <select value={requestStaffMapping?.[slot] ?? ""} onChange={(e) => updateRequestStaffMapping(slot, e.target.value)}>
                  <option value="">未設定</option>
                  {selectableProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.staff_code || "ID未設定"}　{p.name}</option>
                  ))}
                </select>
                <small>{selected ? `勤務者ID: ${selected.staff_code || "未設定"}` : "勤務者未設定"}</small>
              </label>
            );
          })}
        </div>
      </div>

      <div className="admin-block coverage-format-block">
        <div className="admin-block-title">
          <div>
            <strong>勤務必要人数フォーマット</strong>
            <span>平日・休日ごとの最小勤務者数と最小リーダー数を設定します</span>
          </div>
          <button className="primary" onClick={saveCoverageFormat} disabled={busy}>保存</button>
        </div>
        <div className="coverage-format-grid">
          {[
            ["平日", "weekday"],
            ["休日", "holiday"],
          ].map(([label, prefix]) => (
            <div className="coverage-format-card" key={prefix}>
              <h3>{label}</h3>
              <label>
                <span>最小日勤勤務者数</span>
                <select value={coverageFormat[`${prefix}_day_staff`]} onChange={(e) => updateCoverageFormat(`${prefix}_day_staff`, e.target.value)}>
                  {Array.from({ length: 11 }, (_, v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>
                <span>最小夜勤勤務者数</span>
                <select value={coverageFormat[`${prefix}_night_staff`]} onChange={(e) => updateCoverageFormat(`${prefix}_night_staff`, e.target.value)}>
                  {Array.from({ length: 6 }, (_, v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>
                <span>最小日勤リーダー数</span>
                <select value={coverageFormat[`${prefix}_day_leaders`]} onChange={(e) => updateCoverageFormat(`${prefix}_day_leaders`, e.target.value)}>
                  {Array.from({ length: 4 }, (_, v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>
                <span>最小夜勤リーダー数</span>
                <select value={coverageFormat[`${prefix}_night_leaders`]} onChange={(e) => updateCoverageFormat(`${prefix}_night_leaders`, e.target.value)}>
                  {Array.from({ length: 3 }, (_, v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-block night-pair-master-block">
        <div className="admin-block-title">
          <div>
            <strong>夜勤ペアNGマスタ</strong>
            <span>同じ夜勤に割り当てない勤務者の組み合わせを全クール共通で設定します</span>
          </div>
          <div className="settings-master-actions">
            <button className="secondary" onClick={addNightPairMaster} disabled={busy}>＋ NGペアを追加</button>
            <button className="primary" onClick={saveNightPairMaster} disabled={busy}>保存</button>
          </div>
        </div>
        <div className="pair-list settings-pair-list">
          {(nightPairMaster || []).length === 0 && <div className="empty compact-empty"><b>NGペアは未登録です</b></div>}
          {(nightPairMaster || []).map((pair, row) => (
            <div className="pair-row" key={row}>
              <span>NG {row + 1}</span>
              <select value={pair[0]} onChange={(e) => updateNightPairMaster(row, 0, e.target.value)}>
                {selectableProfiles.map((p) => <option key={p.id} value={p.staff_code}>{p.staff_code || "ID未設定"}　{p.name}</option>)}
              </select>
              <b>×</b>
              <select value={pair[1]} onChange={(e) => updateNightPairMaster(row, 1, e.target.value)}>
                {selectableProfiles.map((p) => <option key={p.id} value={p.staff_code}>{p.staff_code || "ID未設定"}　{p.name}</option>)}
              </select>
              <button className="secondary" onClick={() => removeNightPairMaster(row)} disabled={busy}>削除</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CycleStaffPanel({ data, updateStaff, readOnly = false, title = "クール別勤務者プロファイル", compactHalf = false }) {
  return (
    <div className="admin-block cycle-staff-block">
      <div className="admin-block-title"><strong>{title}</strong><span>勤務申請で選択した時点のSQL保存内容</span></div>
      <div className="admin-sheet-scroll compact-sheet-scroll">
        <table className={`admin-staff-sheet compact-staff-sheet${compactHalf ? " compact-staff-sheet-half" : ""}`}>
          <thead><tr><th className="row-label">項目</th>{data.staff.map((s,i)=><th key={i}><span className="staff-id">ID {s.staff_code || i}</span>{s.name || `医師 ${i+1}`}</th>)}</tr></thead>
          <tbody>
            {[
              ["氏名","name",null], ["救急医師カウント","emergency_count",1], ["リーダーLv","leader_level",2],
              ["EW1（西大寺）","ew1_available",1], ["EW2（薬師寺）","ew2_available",1], ["EW3（吉備）","ew3_available",1],
              ["IW1（クリクラ）","iw1_available",3], ["IW2","iw2_available",1], ["目標 日勤","target_day",20], ["目標 夜勤","target_night",10],
            ].map(([label,key,max]) => (
              <tr key={key}><th className="row-label">{label}</th>{data.staff.map((st,i)=><td key={i} className={key !== "name" && Number(st[key] || 0)>=1 ? "value-positive" : ""}>{key === "name" ? <input value={st.name || ""} readOnly={readOnly} onChange={(e)=>!readOnly&&updateStaff(i,key,e.target.value)} /> : <select value={Number(st[key] || 0)} disabled={readOnly} onChange={(e)=>updateStaff(i,key,Number(e.target.value))}>{Array.from({length:max+1},(_,v)=><option key={v} value={v}>{v}</option>)}</select>}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoveragePanel({ data, weekdays, holidays, coverage, readOnly = false, title = "日別の必要人数", fixedCellWidth = false }) {
  const isHoliday = (date, day) => day === "土" || day === "日" || ["12-29","12-30","12-31","01-01","01-02","01-03"].includes(date.slice(5)) || Boolean(holidays[date]);
  return (
    <div className="admin-block coverage-block">
      <div className="admin-block-title"><strong>{title}</strong><span>日勤・夜勤それぞれの必要人数・リーダー・EW/IW</span></div>
      <div className="sheet-scroll admin-coverage-scroll">
        <table className={`input-sheet admin-coverage-sheet${fixedCellWidth ? " application-coverage-fixed" : ""}`}>
          <thead><tr><th className="sticky c0" rowSpan="2">day</th><th className="sticky c1" rowSpan="2">日付</th><th className="sticky c2" rowSpan="2">曜</th><th className="sticky c3" rowSpan="2">区分</th>{["最小勤務","リーダー","EW1","EW2","EW3","IW1","IW2"].map(label=><th key={label} colSpan="2" className="coverage-group">{label}</th>)}</tr><tr>{["最小勤務","リーダー","EW1","EW2","EW3","IW1","IW2"].flatMap(label=>[<th className="coverage-head" key={`${label}-d`}>日</th>,<th className="coverage-head" key={`${label}-n`}>夜</th>])}</tr></thead>
          <tbody>{data.dates.map((date,d)=>{const holiday=isHoliday(date,weekdays[d]);const day=data.coverage[d][0], night=data.coverage[d][1]; const cell=(sh,key,max)=><td className={Number(data.coverage[d][sh][key]||0)>=1?"value-positive":""}><select disabled={readOnly} value={data.coverage[d][sh][key]??0} onChange={(e)=>coverage(d,sh,key,e.target.value)}>{Array.from({length:max+1},(_,v)=><option key={v} value={v}>{v}</option>)}</select></td>;return <tr className={`${holiday?"holiday":"weekday"} ${d<2||d===30?"buffer-day":"application-day"}`} key={date}><th className="sticky c0">{d}</th><th className="sticky c1">{date.slice(5).replace("-","/")}</th><th className="sticky c2">{weekdays[d]}</th><th className="sticky c3">{holiday?"休":"平"}</th>{cell(0,"minimum",10)}{cell(1,"minimum",5)}{cell(0,"leaders",3)}{cell(1,"leaders",2)}{["ew1","ew2","ew3","iw1","iw2"].flatMap(key=>[cell(0,key,1),cell(1,key,1)])}</tr>})}</tbody>
        </table>
      </div>
    </div>
  );
}

function NightPairScreen({ data, addNightPairNg, updateNightPairNg, removeNightPairNg, reopenCycle }) {
  const options = data.staff.filter((s)=>String(s.name||"").trim() && String(s.staff_code||"").trim());
  return (
    <section className={`initial-section ${data.status === "completed" ? "cycle-readonly" : ""}`}>
      <div className="initial-toolbar"><div><label>夜勤ペアのNG組み合わせ</label><strong>{fmt(data.dates[2])} - {fmt(data.dates[29])}</strong><small>同じ夜勤に割り当てたくない勤務者の組み合わせを登録します</small></div>{data.status === "completed" && <button className="secondary allow-completed-action" onClick={reopenCycle}>再編集を許可する</button>}<button className="primary" onClick={addNightPairNg} disabled={data.status === "completed"}>＋ NGペアを追加</button></div>
      <div className="pair-list">
        {(data.night_pair_ng || []).length === 0 && <div className="empty compact-empty"><b>NGペアは未登録です</b></div>}
        {(data.night_pair_ng || []).map((pair,row)=><div className="pair-row" key={row}><span>NG {row+1}</span><select value={pair[0]} onChange={(e)=>updateNightPairNg(row,0,e.target.value)}>{options.map((s)=><option key={s.staff_code} value={s.staff_code}>{s.staff_code}　{s.name}</option>)}</select><b>×</b><select value={pair[1]} onChange={(e)=>updateNightPairNg(row,1,e.target.value)}>{options.map((s)=><option key={s.staff_code} value={s.staff_code}>{s.staff_code}　{s.name}</option>)}</select><button className="secondary" onClick={()=>removeNightPairNg(row)}>削除</button></div>)}
      </div>
    </section>
  );
}

function ReviewScreen({ data, weekdays, holidays, coverage, updateStaff, copyAllRequests, copyStaffRequests, setAdminRequest, solve, result, download, busy, reviewExcelInputRef, uploadRequestExcel }) {
  return (
    <section className={`initial-section review-section ${data.status === "completed" ? "cycle-readonly" : ""}`}>
      <div className="initial-toolbar review-toolbar"><div><label>勤務表確認</label><strong>{fmt(data.dates[2])} - {fmt(data.dates[29])}</strong><small>勤務申請を最終調整してからOR-Toolsで勤務表を作成します</small></div><button className="secondary" onClick={()=>reviewExcelInputRef.current?.click()} disabled={busy || data.status === "completed"}>Excelをアップロード ↑</button><input ref={reviewExcelInputRef} type="file" accept=".xlsx,.xlsm" hidden onChange={(e)=>uploadRequestExcel(e.target.files?.[0], true)} /><button className="primary" onClick={solve} disabled={busy}>{busy?"計算中…":"勤務表を作成 →"}</button></div>
      <div className="admin-block admin-request-block"><div className="admin-block-title admin-request-title"><div><strong>管理者用 勤務申請調整</strong><span>勤務申請をコピー、またはExcelアップロード後に管理者が最終調整します</span></div><button className="primary copy-all-button" onClick={copyAllRequests}>勤務申請のデータを全コピー</button></div><AdminRequestSheet data={data} weekdays={weekdays} holidays={holidays} copyStaffRequests={copyStaffRequests} setAdminRequest={setAdminRequest} /></div>
      <CycleStaffPanel data={{ ...data, staff: data.finalStaff || data.staff }} updateStaff={updateStaff} readOnly={true} title="クール別勤務者プロファイル（最終確認）" />
      <CoveragePanel data={{ ...data, coverage: data.finalCoverage || data.coverage }} weekdays={weekdays} holidays={holidays} coverage={coverage} readOnly={true} title="日別の必要人数（最終確認）" />
      <div className="admin-block"><div className="admin-block-title"><strong>OR-Tools 計算結果</strong><span>日 / 夜 / 外1 / 内1 / ×</span><button className="primary" onClick={download} disabled={!result || busy}>Excelを出力 ↓</button></div>{result?<Results result={result} staff={data.finalStaff || data.staff} weekdays={weekdays}/>:<div className="empty compact-empty"><b>まだ勤務表を作成していません</b><p>上の内容を確認して「勤務表を作成」を押してください。</p></div>}</div>
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
  deleteCurrentCycleData,
  updateStaff,
  toggleStaff,
  setInitial,
  initializeRequestForm,
  selectRequestStaff,
  staffProfiles,
  setData,
  busy,
  requestExcelInputRef,
  downloadRequestExcel,
  uploadRequestExcel,
  coverage,
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
          {cycleStatuses[data.cycleStart] === "editing" && (
            <button className="danger-button" onClick={deleteCurrentCycleData} disabled={busy}>
              データを削除
            </button>
          )}
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
        <span>「初期化」後、勤務者プロファイルから勤務者を選択します。通常外勤・前日夜勤×・翌日日勤×・病院名備考は自動入力されます。チェックをONにすると希望と備考を手修正できます。</span>
        {data.status === "completed" && <span className="completed-note">✓ この勤務申請期間は「済」です。変更できません。</span>}
      </div>

      <div className="sheet-scroll">
        <table className="input-sheet">
          <colgroup>
            <col className="sheet-col-day" />
            <col className="sheet-col-date" />
            <col className="sheet-col-weekday" />
            <col className="sheet-col-holiday" />
            {data.staff.flatMap((_, i) => [
              <col className="sheet-col-shift" key={`${i}-day-col`} />,
              <col className="sheet-col-shift" key={`${i}-night-col`} />,
            ])}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky c0" rowSpan="4">day</th>
              <th className="sticky c1" rowSpan="4">日付</th>
              <th className="sticky c2" rowSpan="4">曜日</th>
              <th className="sticky c3" rowSpan="4">平日<br />休日</th>
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
            <tr className="sql-saved-row">
              {data.staff.map((s, i) => (
                <th colSpan="2" className="sql-saved-name" key={i}>
                  <small>SQL保存済み</small>
                  <strong>{s.name || "未保存"}</strong>
                </th>
              ))}
            </tr>
            <tr>
              {data.staff.map((s, i) => (
                <th colSpan="2" className="doctor-name" key={i}>
                  <span className="staff-id">選択: {s.staff_code || `ID ${i}`}</span>
                  <select
                    aria-label={`勤務者${i}の選択`}
                    value={data.staff[i]?.profile_id || ""}
                    disabled={data.status === "completed"}
                    onChange={(e) => selectRequestStaff(i, e.target.value)}
                  >
                    <option value="">勤務者を選択</option>
                    {staffProfiles.filter((p) => p.active !== false && String(p.name || "").trim()).map((p) => (
                      <option key={p.id} value={p.id}>{p.staff_code}　{p.name}</option>
                    ))}
                  </select>
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

      <CycleStaffPanel data={data} updateStaff={updateStaff} title="クール別勤務者プロファイル（勤務申請で選択した時点のコピー）" compactHalf={true} />
      <CoveragePanel data={data} weekdays={weekdays} holidays={holidays} coverage={coverage} title="日別の必要人数" fixedCellWidth={true} />

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

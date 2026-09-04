import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function App() {
  const inputRef = useRef(null);
  const [backendStatus, setBackendStatus] = useState("確認中");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(() => setBackendStatus("接続済み"))
      .catch(() => setBackendStatus("未接続"));
  }, []);

  const selectFile = (candidate) => {
    if (!candidate) return;
    if (!/\.(xlsx|xlsm)$/i.test(candidate.name)) {
      setMessage(".xlsx または .xlsm ファイルを選択してください。");
      setFile(null);
      return;
    }
    setFile(candidate);
    setMessage("");
    setPhase("idle");
  };

  const generate = async () => {
    if (!file) return;
    setPhase("working");
    setMessage("OR-Toolsで勤務条件を計算しています。最大30秒ほどかかります。");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${API_BASE}/schedule/generate`, { method: "POST", body: form });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const error = contentType.includes("application/json")
          ? await response.json().catch(() => ({}))
          : {};
        const fallback = response.status === 502 || response.status === 503
          ? "Backendに接続できません。DockerのBackendが起動しているか確認してください。"
          : `シフトを作成できませんでした（HTTP ${response.status}）。`;
        throw new Error(error.detail || fallback);
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "shift_schedule_result.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
      setPhase("done");
      setMessage("勤務表を作成し、Excelファイルをダウンロードしました。");
    } catch (error) {
      setPhase("error");
      setMessage(
        error instanceof TypeError
          ? "Backendに接続できません。Docker Composeを再起動してください。"
          : error.message
      );
    }
  };

  return (
    <main className="shell">
      <header>
        <div className="brand-mark">S</div>
        <div><p className="eyebrow">MEDICAL STAFF PLANNING</p><h1>医師勤務表ジェネレーター</h1></div>
        <span className={`status ${backendStatus === "接続済み" ? "online" : ""}`}><i />API {backendStatus}</span>
      </header>
      <section className="intro">
        <div><span className="step">01</span><p className="eyebrow">INPUT</p><h2>勤務条件ファイルを<br />アップロード</h2></div>
        <p className="lead">指定形式のExcelファイルを読み込み、勤務不可・希望・必要人数などの条件から最適なシフトを作成します。</p>
      </section>
      <section className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm" onChange={(event) => selectFile(event.target.files[0])} hidden />
        <div className="upload-icon">↥</div>
        {file ? <><h3>{file.name}</h3><p>{(file.size / 1024).toFixed(1)} KB — クリックして変更</p></> : <><h3>Excelファイルをここにドロップ</h3><p>またはクリックしてファイルを選択</p></>}
        <span className="format">XLSX / XLSM</span>
      </section>
      <div className="action-row">
        <div><strong>処理内容</strong><span>入力検証 → OR-Tools最適化 → Excel出力</span></div>
        <button onClick={generate} disabled={!file || phase === "working"}>{phase === "working" ? "計算中…" : "勤務表を作成"}<b>→</b></button>
      </div>
      {message && <p className={`notice ${phase}`}>{message}</p>}
      <footer>SHIFT SCHEDULE / OPTIMIZED WITH OR-TOOLS <span>入力ファイルはサーバーに保存されません</span></footer>
    </main>
  );
}

export default App;

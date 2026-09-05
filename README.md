# 医師勤務表ジェネレーター

Excelの勤務条件をアップロードし、OR-Toolsでシフトを作成して、結果をExcelでダウンロードするWebアプリです。

## 起動

Docker Desktopを起動してから、プロジェクト直下で次を実行します。

```bash
docker compose up --build
```

以前のイメージが残っている場合は、次のコマンドでコンテナを作り直します。

```bash
docker compose down
docker compose up --build --force-recreate
```

ブラウザで <http://localhost:5173> を開きます。API仕様は <http://localhost:8000/docs> で確認できます。

## 入力Excel

現在の計算ロジックは30名、31日、日勤・夜勤の2区分を前提としています。次のシート名が必要です。

- `unavailable_3d_shift0`, `unavailable_3d_shift1`
- `avoid_3d_shift0`, `avoid_3d_shift1`
- `mandatory_3d_shift0`, `mandatory_3d_shift1`
- `ew1_mandatory_3d_shift0`, `ew1_mandatory_3d_shift1`
- `iw1_mandatory_3d_shift0`, `iw1_mandatory_3d_shift1`
- `optimal_staff_2d_shift0`, `optimal_staff_2d_shift1`
- `min_work_count_2d_shift0`, `min_work_count_2d_shift1`
- `min_leader_count_2d_shift0`, `min_leader_count_2d_shift1`
- `ew1_count_2d_shift0`, `ew1_count_2d_shift1`
- `iw1_count_2d_shift0`, `iw1_count_2d_shift1`
- `day_week_2d`, `staffno_1d`, `staffname_1d`
- `leader_level_1d`, `is_ew1_candidate_1d`, `iw1_priority_1d`

`night_pair_ng` は任意です。

## 3コンテナ構成（frontend / backend / db）

この版では Docker Compose で次の3サービスを起動します。

- `frontend`: React + Vite (`http://localhost:5173`)
- `backend`: FastAPI + OR-Tools (`http://localhost:8000`)
- `db`: PostgreSQL 17（Docker内部ネットワークのみ）

### 起動

```bash
docker compose down
docker compose up --build -d
docker compose ps
```

### 動作確認

```bash
curl http://localhost:8000/health
```

正常時は `status: ok` と `database: ok` が返ります。

### DBの永続化

PostgreSQLのデータは named volume `shift_schedule_db_data` に保存されます。
通常の `docker compose down` やコンテナ再作成ではデータは消えません。

DBデータまで完全に削除したい場合のみ、次を実行します。

```bash
docker compose down -v
```

`-v` を付けると勤務データも削除されるため、通常は使用しないでください。

### 保存対象

現在は以下をPostgreSQLの `app_state` テーブルにJSONとして保存します。

- `shift-admin-staff-v2`: 管理者画面の勤務者情報、目標勤務数、EW/IW可否
- `shift-draft`: クール、勤務申請、備考、必要人数、管理者調整内容などの画面状態

frontendは直接DBへ接続せず、必ずFastAPI経由で読み書きします。

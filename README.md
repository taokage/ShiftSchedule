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

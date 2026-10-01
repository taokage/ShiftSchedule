# PostgreSQL 正規化テーブル版

この版では、勤務データの保存先を `app_state.value` の巨大JSONから通常のPostgreSQLテーブルへ変更した。
フロントエンドとFastAPI間の通信はHTTP/JSONだが、**PostgreSQLにはJSON/JSONB列として保存しない**。

## テーブル

- `staff_profiles`: 勤務者プロファイルマスタ。勤務者ID、氏名、救急医師カウント、リーダー、EW1-3、IW1-2、目標勤務数。
- `regular_outside_work`: 通常外勤。勤務者、曜日、病院名。
- `cycles`: クール。開始日、editing/completed、完了日時。
- `cycle_staff`: クールごとの勤務者プロファイルスナップショット。勤務申請で名前を選択した時点のcharacterをコピーする。
- `shift_requests`: 日付×勤務者×日勤/夜勤×申請/勤務者プロファイルの勤務希望と備考。
- `coverage`: 日付×日勤/夜勤の最小勤務人数、リーダー、EW1-3、IW1-2。
- `night_pair_ng`: 夜勤ペアNG。
- `app_settings`: 最後に開いたクールなど、単一文字列設定。

## 通常外勤の自動反映

勤務申請画面で勤務者プロファイルを選択すると、その勤務者の `regular_outside_work` を参照して自動設定する。

- 通常外勤当日: 日勤=通常外勤、夜勤=通常外勤
- 当日の備考: 日勤・夜勤とも病院名
- 前日: 夜勤=×
- 翌日: 日勤=×
- OR-Toolsでも通常外勤の日勤・夜勤は院内勤務不可として扱う

## 旧 app_state からの移行

起動時、新しい `cycles` が空で旧 `app_state` が存在する場合だけ、旧 `shift-draft-YYYY-MM-DD` を新テーブルへ自動移行する。
新しい画面の保存処理は `app_state` を使用しない。

移行確認後、旧テーブルが不要なら手動で削除できる。

```sql
DROP TABLE app_state;
```

ただし、必ず新テーブルとデータを確認してから実行すること。

## PyCharm / psql での確認例

```sql
SELECT * FROM staff_profiles ORDER BY staff_code;
```

```sql
SELECT
    sp.staff_code,
    sp.name,
    row.weekday,
    row.hospital_name
FROM staff_profiles sp
LEFT JOIN regular_outside_work row ON row.staff_profile_id = sp.id
ORDER BY sp.staff_code, row.weekday;
```

```sql
SELECT * FROM cycles ORDER BY start_date;
```

```sql
SELECT
    c.start_date,
    cs.slot_index,
    cs.staff_code,
    cs.name,
    cs.leader_level,
    cs.iw1_available
FROM cycle_staff cs
JOIN cycles c ON c.id = cs.cycle_id
WHERE c.start_date = '2026-09-13'
ORDER BY cs.slot_index;
```

```sql
SELECT
    c.start_date,
    sr.work_date,
    sr.slot_index,
    sr.shift,
    sr.stage,
    sr.request_type,
    sr.remark
FROM shift_requests sr
JOIN cycles c ON c.id = sr.cycle_id
WHERE c.start_date = '2026-09-13'
ORDER BY sr.work_date, sr.slot_index, sr.stage, sr.shift;
```

### 通常外勤だけ確認

```sql
SELECT
    c.start_date,
    sr.work_date,
    cs.name,
    sr.shift,
    sr.request_type,
    sr.remark
FROM shift_requests sr
JOIN cycles c ON c.id = sr.cycle_id
JOIN cycle_staff cs
  ON cs.cycle_id = sr.cycle_id
 AND cs.slot_index = sr.slot_index
WHERE c.start_date = '2026-09-13'
  AND sr.stage = 'request'
  AND sr.request_type = 'regular_outside'
ORDER BY sr.work_date, cs.name, sr.shift;
```

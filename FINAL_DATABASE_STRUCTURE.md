# ShiftSchedule 最終DB構成

`cycles` は1クールにつき1行の共通親テーブルです。申請時と最終確認時の値は別テーブルに保存します。

## マスタ
- `staff_profiles`: 勤務者プロファイル
- `regular_outside_work`: 通常外勤。`staff_code` -> `staff_profiles.staff_code`

## クール共通
- `cycles`: クール開始日、状態、完了日時
- `night_pair_ng`: 夜勤ペアNG

## 申請入力（request）
- `request_cycle_staff`: 申請時点のクール別勤務者プロファイル
- `request_coverage`: 申請時点の日別必要人数・リーダー・EW/IW
- `shift_requests`: 本人の勤務申請・備考

## 最終確認（final）
- `final_cycle_staff`: 最終確認時のクール別勤務者プロファイル
- `final_coverage`: 最終確認時の日別必要人数・リーダー・EW/IW
- `final_shift_decisions`: 管理者の最終勤務区分・備考

## 旧テーブル移行
既存DBに `cycle_staff` / `coverage` がある場合、初回起動時に request/final の双方へコピーします。旧テーブルは安全のため自動削除しません。

`shift_requests.stage='admin'` の旧データは `final_shift_decisions` へ移行します。

## 確認SQL
```sql
\dt
SELECT * FROM cycles ORDER BY start_date;
SELECT * FROM request_cycle_staff WHERE cycle_id = 1 ORDER BY slot_index;
SELECT * FROM final_cycle_staff WHERE cycle_id = 1 ORDER BY slot_index;
SELECT * FROM request_coverage WHERE cycle_id = 1 ORDER BY work_date, shift;
SELECT * FROM final_coverage WHERE cycle_id = 1 ORDER BY work_date, shift;
SELECT * FROM shift_requests WHERE cycle_id = 1 ORDER BY slot_index, work_date, shift;
SELECT * FROM final_shift_decisions WHERE cycle_id = 1 ORDER BY slot_index, work_date, shift;
```

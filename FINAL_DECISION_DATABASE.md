# 最終決定版のSQL保存

本人の勤務申請と管理者の最終決定は別テーブルで保存する。

- `shift_requests`: 本人が申請した元データ。`stage='request'` のみ新規保存する。
- `final_shift_decisions`: 4「勤務表確認」で調整・Excelアップロードした最終決定版。
- `cycle_staff`: そのクールの勤務者プロファイルのスナップショット。
- `coverage`: そのクールの日別必要人数・必要リーダー数・EW/IW設定。

4「勤務表確認」でExcelをアップロードしても `shift_requests` は上書きしない。
最終決定値は `final_shift_decisions` に保存する。

`regular_outside_work` は `staff_profiles.id` ではなく `staff_profiles.staff_code` を外部キーとして参照する。
既存DBは起動時に `staff_profile_id` から `staff_code` へ移行する。

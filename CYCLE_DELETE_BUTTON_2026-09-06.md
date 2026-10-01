# 申請期間データ削除ボタン

- 申請期間に「○」(editing) が付いている場合のみ「データを削除」を表示します。
- 確認ダイアログ後、`DELETE /cycles/{cycle_start}` を呼び出します。
- `cycles` 行を削除し、外部キー `ON DELETE CASCADE` により以下のクール依存データも削除します。
  - request_cycle_staff
  - request_coverage
  - shift_requests
  - final_cycle_staff
  - final_coverage
  - final_shift_decisions
  - night_pair_ng
- `staff_profiles` と `regular_outside_work` は削除しません。
- 削除直後の空データ自動保存を1回抑止し、申請期間の「○」が消えるようにしています。

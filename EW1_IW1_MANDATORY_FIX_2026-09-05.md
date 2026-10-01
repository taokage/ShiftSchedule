# EW1 / IW1 mandatory 修正

`backend/app.py` の `arrays_from_payload()` を修正し、画面・Excel・SQLから渡される `ew1` / `iw1` を solver の `ew1_mandatory_3d` / `iw1_mandatory_3d` に変換するようにしました。

- `state == "ew1"` → `ew1_mandatory[s,d,sh] = True`
- `state == "iw1"` → `iw1_mandatory[s,d,sh] = True`
- `unavailable` / `regular_outside` / `avoid` / `mandatory` の既存動作は維持

これにより、勤務申請または最終決定で EW1（西大寺勤務）・IW1（クリクラ）を選択した日時は、OR-Tools の専用勤務として固定されます。

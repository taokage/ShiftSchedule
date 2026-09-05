# Excel BM:BZ 管理者設定

勤務希望ExcelのBM列以降に、日別・日勤夜勤別の管理者設定を追加。

- BM:BN 最小勤務数（日勤 3-10 / 夜勤 2-5）
- BO:BP 最小リーダー数（日勤 1-3 / 夜勤 1-2）
- BQ:BR EW1（0/1）
- BS:BT EW2（0/1）
- BU:BV EW3（0/1）
- BW:BX IW1（0/1）
- BY:BZ IW2（0/1）

勤務者ごとの「適切なシフト数」は日勤 0-20、夜勤 0-10 のドロップダウン。
A:D の1-3行、66-73行は見出しを読みやすくするため結合。

Excelアップロード時は staff / requests / remarks / coverage を対象クールの
shift-draft-YYYY-MM-DD に即時保存し、管理者画面にも反映する。
EW2/EW3/IW2はDB・管理画面に保持するが、現行OR-Tools solverの直接制約はEW1/IW1のみ。

# クール別保存・○・済

- `shift-draft-YYYY-MM-DD` に勤務申請、備考、管理者調整、必要人数、勤務者基本情報をまとめて保存します。
- ドロップダウン表示:
  - 表示なし: DBにクールデータなし
  - `○`: DBにデータあり、編集中
  - `済`: `status=completed`、編集ロック
- 「済みにする」で `status=completed` と `completedAt` を保存します。
- 「再編集を許可する」で `status=editing` に戻します。
- `shift-current-cycle-v1` は最後に開いたクールを記憶するため残します。
- 旧 `shift-admin-staff-v2` は旧データ移行時の初期値として読みますが、新しい変更はクール別 `shift-draft-*` 内の `staff` に保存されます。

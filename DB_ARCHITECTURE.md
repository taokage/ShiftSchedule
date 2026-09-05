# DB構成

```text
Browser
  |
  v
frontend (React/Vite :5173)
  |
  | /api
  v
backend (FastAPI/OR-Tools :8000)
  |
  | DATABASE_URL
  v
db (PostgreSQL 17)
  |
  v
Docker named volume: shift_schedule_db_data
```

- frontend から PostgreSQL へ直接アクセスしません。
- DBはホスト側へポート公開していません。
- backendの `/health` はDB接続も確認します。
- Composeは `db healthy -> backend healthy -> frontend` の順で起動します。

# 豐原醫院藥劑科 LINE 資訊機器人

本專案讓 LINE 群組以明確指令保存及查詢交班、缺換藥與公告資訊。一般群組聊天不會保存，也不會觸發機器人回覆。

## 指令

| 指令 | 功能 |
| --- | --- |
| `/h 內容` | 新增交班資訊 |
| `/m 內容` | 新增缺換藥資訊 |
| `/n 內容` | 新增公告 |
| `/q` | 查詢所有資訊，依日期由新到舊排列 |
| `/q h` | 查詢最近 7 天交班資訊 |
| `/q m` | 查詢所有缺換藥資訊，依日期由新到舊排列 |
| `/q n` | 查詢所有公告，依日期由新到舊排列 |
| `/q 關鍵字` | 搜尋所有資訊，依日期由新到舊排列 |
| `/open` | 查詢所有未完成事項 |
| `/open 關鍵字` | 搜尋未完成事項 |
| `/done 編號` | 將事項標記為完成 |
| `/help` | 顯示使用說明 |

中文別名包括 `/交`、`/藥`、`/缺`、`/公`、`/查`、`/未完成`、`/完成` 與 `/說明`。

## 環境變數

複製 `.env.example` 為 `.env`，並設定：

- `CHANNEL_ACCESS_TOKEN`
- `CHANNEL_SECRET`
- `FIREBASE_CREDENTIALS`
- `FIREBASE_DATABASE_URL`
- `ALLOWED_GROUP_IDS`：選填，以逗號分隔允許使用的 LINE 群組 ID。

不要提交 `.env` 或 Firebase 服務帳戶憑證。

## 本機執行

本專案使用 Node.js 24。

```powershell
npm install
npm test
npm start
```

健康檢查網址為 `GET /health`，LINE Webhook 網址為 `POST /webhook`。

## 資料與隱私

- 各 LINE 群組、聊天室及一對一對話使用不同的資料範圍。
- LINE Webhook 重送使用相同事件鍵，避免建立重複紀錄。
- 使用者撤回訊息後，對應紀錄內容會清除並標記為撤回。
- Firebase 規則預設禁止用戶端直接讀寫；後端 Firebase Admin SDK 仍可存取。
- 未經院方核准，不應在機器人中輸入病人姓名、病歷號或其他可識別資訊。

## 舊版資料

舊版測試紀錄仍保留在 `pharmacy_records`，新版本不會刪除或覆寫。由於舊資料沒有 LINE 群組 ID，為避免不同聊天室的資料混在一起，新版查詢不會自動讀取舊紀錄。需要保留的資料應在確認所屬群組後另行遷移。

## 部署前檢查

1. 在 Vercel 設定全部必要環境變數。
2. 將 Firebase Realtime Database 規則設定為 `firebase-database.rules.json` 的內容。
3. 在 LINE Developers Console 啟用 Webhook 與群組聊天功能。
4. 先於測試群組完成新增、查詢、完成、撤回及重送測試。
5. 正式使用前設定 `ALLOWED_GROUP_IDS`，限制只有核准的工作群組可以操作。

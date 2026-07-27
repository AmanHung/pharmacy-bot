# LIFF 私人資訊中心設定

## 權限模型

- 使用者第一次開啟時，透過 LINE Login 授權，不需要建立額外帳號或密碼。
- 每次讀取資料、圖片或執行「已處理／刪除」時，後端都會向 LINE Messaging API 查驗該使用者目前是否仍是指定群組成員。
- 使用者離開或被移出群組後，後續請求會立即被拒絕。
- 圖片保存在 Firebase Realtime Database 的私有區域；資料庫規則全面拒絕前端直連，所有圖片只能透過已驗證的 LIFF API 取得。
- 已下載或已截圖的圖片無法遠端收回，這是所有網頁系統的共同限制。

## LINE Developers Console

1. 在現有 Messaging API channel 的同一個 Provider 下建立 LINE Login channel。
2. 建立 LIFF app，Endpoint URL 設為正式站網址加上 `/liff`。
3. App type 選擇 `Full`，Scopes 至少勾選 `openid` 與 `profile`。
4. 將 LIFF ID 與 LINE Login channel ID 填入 Vercel 環境變數。

LINE Login 與 Messaging API 必須位於同一個 Provider，兩邊取得的 LINE user ID 才能對應並完成群組成員驗證。

## Vercel 環境變數

```text
LIFF_ID=
LIFF_CHANNEL_ID=
LIFF_GROUP_ID=
```

`LIFF_GROUP_ID` 可留空並沿用 `DAILY_SUMMARY_GROUP_ID`。本次測試應指向「豐醫藥劑科緊急聯絡群」。

## 圖片紀錄方式

1. 先在群組傳送圖片。
2. 回覆該圖片，輸入包含分類關鍵字的文字，例如「公告：新版流程請參考圖片」。
3. 機器人會把文字紀錄與私人圖片副本關聯。
4. 在 LIFF 資訊中心查詢後，可按「查看原圖」。

只有功能上線後新傳送的圖片會保存私人副本；LINE 不允許機器人回溯下載過去的群組圖片。
單張圖片上限為 6 MB，以避免超過 Realtime Database 的單次寫入限制。

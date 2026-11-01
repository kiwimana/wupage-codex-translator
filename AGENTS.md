# 專案工作約定

此儲存庫是 WuPage 的 Firefox／Chrome 帳號翻譯公開版本；上游來源見 UPSTREAM.md。

- README 是繁體中文使用手冊；建置與驗證放在 docs/codex-development.md。
- UI 圖示沿用 src/shared/ui-icons.ts 與本地 Nieobie/game-icon-pack；不用 Unicode 字元或手繪圖形替代已有圖示。
- 不提交憑證、登入檔、瀏覽器設定檔、機器路徑設定或原生主機產生檔。安裝者自行執行安裝程式。
- 根 package.json、package-lock.json 及 public/manifest.json 使用相同版本。
- 發布前執行隱私檢查、相關測試、型別檢查與 Firefox／Chrome 帳號版建置。各瀏覽器 ZIP 必須小於 10,000,000 bytes，僅有一個根 manifest.json。
- Chrome 使用 native-chatgpt/chrome-extension.json 的公開金鑰固定開發版 ID；不重新產生識別碼，不發布私鑰。橋接 allowed_origins 只允許此擴充的精確來源。
- 原生主機只用 stdio 連接安裝者的本機 Codex、Gemini CLI 或 Claude Code，不加入遠端控制、作者端點或常駐 HTTP 服務。服務及模型由設定選擇，不切換成作者帳號或 API 金鑰。
- GitHub Release 工作流只使用儲存庫當次 GITHUB_TOKEN；此公開版不自動提交瀏覽器商店或同步上游網站。

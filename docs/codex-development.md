# Firefox Codex 公開版開發

需要 Node.js 22+、npm 與 Python 3。先 `npm ci`，再 `npm run build:firefox:codex`。原始碼、根套件及 Manifest 版本一致，公開版使用通用識別碼。

`npm run package:codex` 產生兩個 ZIP：Firefox 擴充 ZIP 以單一 `manifest.json` 為根；Windows 橋接 ZIP 只收錄固定的程式來源、結構定義及安裝說明，不包含產生的執行檔或機器設定。發布前檢查公開內容；擴充 ZIP 必須小於 10,000,000 bytes。

`npm run check:public` 檢查來源；`npm run typecheck`、`npm test` 及 `npm run test:native` 驗證型別、擴充與本機主機行為。原生主機測試使用模擬程序，不需 ChatGPT 登入，也不呼叫雲端模型。

實際 Firefox 測試使用獨立瀏覽器設定檔。可設定 `FIREFOX_BINARY`，執行 `scripts/test-popup-firefox.mjs`、`scripts/test-floating-firefox.mjs`、`scripts/test-shorts-layout-firefox.mjs` 與 `scripts/test-ui-refresh-firefox.mjs`。UI 檢查使用本機測試頁或模擬翻譯服務；`test-chatgpt-*`、`test-cc-firefox.mjs` 及 `test-youtube-control-firefox.mjs` 可能使用執行者自己的 ChatGPT 額度。

安裝程式解析執行者電腦上的 Node.js 與 Codex、編譯啟動器並註冊目前使用者的原生主機。`bridge.config.json` 與主機 JSON 只存於執行者本機；主機不開 HTTP 伺服器。其他開發說明見 [development.md](development.md)。

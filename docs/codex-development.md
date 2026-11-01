# Chrome／Firefox 帳號翻譯公開版開發

需要 Node.js 22+、npm 與 Python 3。先 `npm ci`，再執行 `npm run build:chrome:codex` 與 `npm run build:firefox:codex`。原始碼、根套件及 Manifest 版本一致，公開版使用固定識別碼。

`npm run package:codex` 產生 Chrome、Firefox、Windows 橋接與來源四個 ZIP。各擴充 ZIP 以單一 `manifest.json` 為根，必須小於 10,000,000 bytes；橋接 ZIP 只收錄來源、結構定義、Chrome 公開識別資料及安裝說明，不包含產生的執行檔或機器設定。

Chrome 模式是 `chrome-chatgpt`，輸出 `dist-chrome-chatgpt/`；保留 module service worker 與 offscreen，加入 nativeMessaging 及固定公開金鑰。Firefox 輸出 `dist-firefox-chatgpt/`，使用 Gecko 識別碼和背景 scripts；兩者共用繁體介面、帳號模型設定與紀錄政策。識別資料在 `native-chatgpt/chrome-extension.json`，Chrome ID 由公開金鑰 DER 的 SHA-256 前 16 bytes 映射為 a–p，測試會核對，不可重新產生識別碼。

`scripts/test-chrome-accounts.mjs` 使用 `CHROME_TEST_BROWSER` 指定的 Chrome for Testing／Chromium 執行檔及隔離設定檔，驗證三服務模型保存、實際工具列小視窗、懸浮球與 YouTube 按鈕。測試攔截本機工具呼叫，使用本機頁面與攔截回應，不連結或翻譯任何真實帳號。Windows `scripts/test-native-install.py` 僅產生臨時安裝檔，驗證兩種瀏覽器清單及原生封包，不寫登錄或讀登入檔。

`npm run check:public` 檢查來源；`npm run typecheck`、`npm test` 及 `npm run test:native` 驗證型別、擴充與本機主機行為。原生主機測試使用模擬程序，不需 ChatGPT 登入，也不呼叫雲端模型。

更新排程使用 `alarms`，預設每 6 小時只檢查固定 GitHub 穩定版；Chrome 自動安裝須使用者指定本機擴充資料夾並開啟選項。`tests/extension-update.test.ts` 驗證版本比較、來源限制、錯誤與未授權自動安裝；`native-chatgpt/extension-update.test.mjs` 驗證 SHA、識別碼、取消、原子替換與還原。Windows `scripts/test-native-update.py` 使用本機假下載資料，實際驗證解壓、防止 ZIP 跳脫及更新替換，不發網路請求、不讀取帳號或變更登錄。發布工作流先通過兩個 Windows 測試再發布。

`tests/video-youtube-control.test.ts` 與隔離 Chrome 測試涵蓋重複注入、控制列含按鈕的複製、多個影片共用播放器與切換影片；每個 YouTube 播放器只有一個按鈕管理者。

實際 Firefox 測試使用獨立瀏覽器設定檔。可設定 `FIREFOX_BINARY`，執行 `scripts/test-popup-firefox.mjs`、`scripts/test-floating-firefox.mjs`、`scripts/test-shorts-layout-firefox.mjs` 與 `scripts/test-ui-refresh-firefox.mjs`。UI 檢查使用本機測試頁或模擬翻譯服務；`test-chatgpt-*`、`test-cc-firefox.mjs` 及 `test-youtube-control-firefox.mjs` 可能使用執行者自己的 ChatGPT 額度。

安裝程式解析執行者電腦上的 Node.js 與 Codex／Gemini CLI／Claude Code、編譯啟動器並註冊目前使用者的原生主機。`bridge.config.json` 與主機 JSON 只存於本機；主機不開 HTTP 伺服器。`detect` 只檢查安裝檔；`connect` 必須從設定頁明確點擊才開啟登入，不自動驗證帳號。模型是經驗證的獨立參數；來源文字只經 stdin 傳送。其他開發說明見 [development.md](development.md)。

# 本機帳號橋接（Windows）

執行安裝者自己的 Codex、Gemini CLI 或 Claude Code，使用安裝者自己的帳號。下載包不包含登入檔、金鑰或機器設定，不操作桌面聊天視窗。

解壓縮到固定資料夾，安裝 Node.js 22+ 與至少一個所選工具，執行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

可用 `-CodexPath`、`-ClaudePath`、`-GeminiPath`、`-NodePath` 指定自己的完整路徑；Gemini 也支援官方 npm 套件的 JavaScript 入口。安裝程式在目前資料夾產生 `bridge.config.json`、`org.wupage.codex_bridge.json` 及啟動器，並登錄目前 Windows 使用者的原生主機。產生檔不得提交或轉給別人。安裝程式不安裝工具或登入帳號。

擴充識別碼為 `codex-translator@wupage.local`，主機名稱為 `org.wupage.codex_bridge`。名稱只用於 Firefox 本機原生訊息，不是網路位址。沒有常駐服務、遠端連線或對外開放的埠。

設定頁「偵測本機工具」只檢查安裝檔，不啟動工具、不讀取登入內容、不送出翻譯，也不宣稱帳號已驗證。使用者另按「連結帳號」才透過 `connect.ps1` 開啟官方登入：Codex 使用 `codex login`，Claude 使用 `claude auth login`，Gemini 選 `Login with Google`。桌面聊天程式的登入不一定共用。手動按「測試服務」才會送出短句驗證，並使用少量額度。

模型可選「自動」、預設名稱或自訂名稱，可用性依使用者帳號。Codex 使用 `--ephemeral`；Claude 使用 `--no-session-persistence` 並停用一般工具、MCP 與 hooks，只保留結構化翻譯輸出。Gemini 使用獨立暫存 home，以硬連結提供既有 OAuth 登入，無法建立時使用權限受限的暫存副本，並停用工具與擴充。完成、錯誤與取消後只清理自行建立的目錄；電源中斷或強制終止仍可能留下暫存。這些措施不代表服務端零留存。

修復時執行 `repair.cmd`。移除時在原資料夾執行 `uninstall.ps1`，只刪除與目前安裝路徑相符的橋接登錄。`-PrepareOnly` 僅建立本機安裝檔、不變更登錄，供測試使用。

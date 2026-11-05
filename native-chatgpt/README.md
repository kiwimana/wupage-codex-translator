# 本機帳號橋接（Windows）

執行安裝者自己的 Codex、Gemini CLI 或 Claude Code，使用安裝者自己的帳號。下載包不包含登入檔、金鑰或機器設定，不操作桌面聊天視窗。

翻譯以全新的臨時工作執行，不續接原有聊天室。Codex 與 Claude 停用此次本機對話保存；Gemini 則採暫存後清理，執行期間可能寫入紀錄，兩者不能混稱為完全不落地的官方無痕聊天室。主 README 的[本機聊天紀錄說明](../README.md#桌面帳號翻譯不保留一般本機聊天紀錄)列出各服務差異。

解壓縮到固定資料夾，安裝 Node.js 22+ 與至少一個所選工具，執行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

可用 `-CodexPath`、`-ClaudePath`、`-GeminiPath`、`-NodePath` 指定自己的完整路徑；Gemini 也支援官方 npm 套件的 JavaScript 入口。安裝程式在目前資料夾產生 `bridge.config.json`、`org.wupage.codex_bridge.json` 及啟動器，並登錄目前 Windows 使用者的原生主機。產生檔不得提交或轉給別人。安裝程式不安裝工具或登入帳號。

Chrome 安裝時使用 `install.ps1 -Browser Chrome`，Firefox 可用 `-Browser Firefox`；不指定時註冊兩者。Chrome 使用獨立產生的 `org.wupage.codex_bridge.chrome.json`，`allowed_origins` 僅允許 `chrome-extension://lfhpgjnpadlfkafdnbeepfpjhfbdjblb/`。Firefox 清單僅包含 `allowed_extensions`。兩種清單在目前使用者的各瀏覽器登錄位置註冊，支援 32／64 位元瀏覽器。

隨包的 `chrome-extension.json` 只有固定擴充識別碼與公開金鑰，不包含私鑰或帳號登入內容，不應刪除或重新產生。更新橋接時須一併保留此檔案。Chrome 的擴充以「載入未封裝項目」載入，並保留 Manifest 的 `key`。

擴充識別碼為 `codex-translator@wupage.local`，主機名稱為 `org.wupage.codex_bridge`。名稱只用於 Firefox 本機原生訊息，不是網路位址。沒有常駐服務、遠端連線或對外開放的埠。

設定頁「偵測本機工具」只檢查安裝檔，不啟動工具、不讀取登入內容、不送出翻譯，也不宣稱帳號已驗證。使用者另按「連結帳號」才透過 `connect.ps1` 開啟官方登入：Codex 使用 `codex login`，Claude 使用 `claude auth login`，Gemini 選 `Login with Google`。桌面聊天程式的登入不一定共用。手動按「測試服務」才會送出短句驗證，並使用少量額度。

模型可選「自動」、預設名稱或自訂名稱，可用性依使用者帳號。Codex 使用 `--ephemeral`；Claude 使用 `--no-session-persistence` 並停用一般工具、MCP 與 hooks，只保留結構化翻譯輸出。Gemini 使用獨立暫存 home，以硬連結提供既有 OAuth 登入，無法建立時使用權限受限的暫存副本，並停用工具與擴充。完成、錯誤與取消後只清理自行建立的目錄；電源中斷或強制終止仍可能留下暫存。這些措施不代表服務端零留存。

修復時執行 `repair.cmd`。移除時在原資料夾執行 `uninstall.ps1`，只刪除與目前安裝路徑相符的橋接登錄。`-PrepareOnly` 僅建立本機安裝檔、不變更登錄，供測試使用。

Codex 桌面版更新可能刪除舊的版本資料夾。橋接在每次偵測、翻譯與開啟登入時會檢查程式是否仍存在；原路徑失效時，只在本機 Codex 桌面版的安裝目錄尋找仍有執行檔的版本。不需因這類更新重新安裝擴充，也不會自動登入或送出翻譯。若更新尚未完成，等待 Codex 可正常開啟後再按「重試讀取」。仍存在的自訂程式路徑會繼續使用。

## Chrome 開發版更新

如需自動安裝 Chrome 擴充更新，執行 `install.ps1 -Browser Chrome -ChromeExtensionPath "D:\WuPage\chrome"`，指定目前 Chrome 載入、含根 `manifest.json` 的獨立擴充資料夾，再於擴充設定「擴充更新」開啟自動安裝。路徑只保存在本機的 `bridge.config.json`，不提交到 GitHub。重新執行安裝程式會保留先前指定的路徑。

`extension-update.mjs` 只接受來自本擴充 Chrome 識別碼的更新請求，下載固定 GitHub 儲存庫的穩定 Release，驗證 SHA-256、版本與公開金鑰。`extract-update.ps1` 拒絕路徑跳脫、重複檔名、符號連結與可執行主機檔案；在隔離目錄解壓後交換擴充資料夾，失敗時保留原檔或還原。若 Windows 阻止還原，原檔會保留在同層 `.wupage-update-*` 的 `previous` 資料夾，錯誤訊息會提示，不刪除唯一備份。

更新不啟動 Codex／Claude／Gemini，不讀取登入資料，不變更登錄或更新橋接本身。Firefox 臨時版只提供擴充內的版本檢查與下載提示，需要手動重新載入。

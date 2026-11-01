# 本機 Codex 橋接（Windows）

此橋接只執行安裝者自己電腦上的 Codex，使用該使用者自己的 ChatGPT 登入。下載包不包含登入檔、金鑰或機器設定。

解壓縮到固定資料夾，確認已安裝 Node.js 22+ 與已登入 ChatGPT 的 Codex，執行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

可用 `-CodexPath` 或 `-NodePath` 指定自己電腦上的完整執行檔路徑。安裝程式在目前資料夾產生 `bridge.config.json`、`org.wupage.codex_bridge.json` 及 `wupage-chatgpt-host.exe`，並登錄目前 Windows 使用者的 Firefox 原生主機。這三個產生檔不得提交或轉給其他使用者。

擴充識別碼為 `codex-translator@wupage.local`，主機名稱為 `org.wupage.codex_bridge`。名稱只用於 Firefox 本機原生訊息，不是網路位址。沒有常駐服務、遠端連線或對外開放的埠。

翻譯使用 `codex exec --ephemeral`，資料經標準輸入輸出傳遞，不另外建立譯文輸出檔。使用者自身的 Codex 登入資料及服務端資料政策仍依 Codex 設定與 OpenAI 規則處理。

修復時執行 `repair.cmd`。移除時在原資料夾執行 `uninstall.ps1`，只刪除與目前安裝路徑相符的橋接登錄。`-PrepareOnly` 僅建立本機安裝檔、不變更登錄，供測試使用。

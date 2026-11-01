# WuPage Codex 翻譯 · Firefox

繁體中文網頁雙語翻譯擴充套件。按下翻譯後，由**使用者自己電腦上的 Codex**，使用該使用者已登入的 ChatGPT 帳號處理，不需要填入 API 金鑰。

這是 [mr-wuliu/wupage](https://github.com/mr-wuliu/wupage) 的非官方衍生 **fork**，保留原作者的提交歷史。`codex-firefox` 是本改版分支，加入本機 Codex 橋接、繁體中文介面、紫色明暗主題與 YouTube AI 雙語字幕；`main` 保留上游版本供後續同步。不是 OpenAI 或原專案的官方產品。

![明暗介面](docs/ui-preview.png)

[下載擴充與橋接](https://github.com/kiwimana/wupage-codex-translator/releases/latest) · [問題回報](https://github.com/kiwimana/wupage-codex-translator/issues)

## 功能

- 網頁全文及段落翻譯，原文與譯文上下對照。
- 可拖曳的「譯」懸浮球，包含語言、服務與功能選單。
- YouTube CC 與齒輪之間的 AI 按鈕，依目前字幕與目標語言顯示雙語字幕；再按一次停止。
- Shorts 字幕工具列避開原生控制按鈕。
- 明暗主題、設定頁及 PDF 工作區。
- 預設手動啟動，停用永久本機譯文快取；翻譯使用 `codex exec --ephemeral`。

## 資料會送去哪裡？

```text
你的 Firefox → 你本機的原生橋接 → 你本機的 Codex → OpenAI
```

公開套件沒有作者的登入資料、API 金鑰、Cookie、Windows 使用者路徑、遠端桌面、代理伺服器或通道設定。原生橋接使用程序標準輸入輸出，不開設 HTTP 服務，也不會連回作者電腦。每次安裝都在安裝者電腦上產生自己的程式路徑設定及目前 Windows 使用者的登錄項目。

翻譯計入安裝者自己 ChatGPT／Codex 的可用額度。這是雲端翻譯；不保存本機對話／譯文不代表 OpenAI 服務端完全不保留資料。自行切換其他翻譯服務後，內容會傳至自行選取的服務。詳見[隱私說明](PRIVACY.md)。

## 安裝（Windows）

需要 Firefox 154+、Node.js 22+，以及自己電腦上已登入自己 ChatGPT 帳號的 Codex。參考[官方 CLI 文件](https://learn.chatgpt.com/docs/codex/cli)及[登入文件](https://learn.chatgpt.com/docs/auth)。

1. 從本儲存庫的 **Releases** 下載 Firefox 擴充 ZIP 與 Windows 橋接 ZIP，分別解壓縮到固定資料夾。
2. 在自己電腦確認 Codex 已使用 ChatGPT 登入。需要時執行 `codex login`；用 `codex login status` 檢查。本橋接不接受 API 金鑰登入。
3. 在橋接資料夾執行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
   ```

   從原始碼安裝時改用 `.\native-chatgpt\install.ps1`。找不到 Codex 時，可加上 `-CodexPath` 指定自己電腦上的 `codex.exe` 完整路徑；Node.js 亦可使用 `-NodePath` 指定。

4. Firefox 開啟 `about:debugging#/runtime/this-firefox`，選「載入暫用附加元件」，載入擴充 ZIP 解壓縮後的 `manifest.json`。
5. 重新整理網頁，選擇目標語言，按「翻譯全文」或頁面的「譯」。

發布包未經 Mozilla 簽章，暫用擴充在關閉 Firefox 後需要重新載入。目前附帶橋接安裝程式僅支援 Windows；macOS／Linux 需要另行實作原生主機註冊及啟動器。

## YouTube 雙語字幕

先選取英文或其他語言 CC，再按右下「AI」，或從擴充小視窗按「AI 翻譯 CC 字幕」。原文在上、譯文在下，目標語言採目前設定。再次按下停止；更換另一支影片不會自行開始。

影片須提供可讀的文字字幕，不會擷取音訊或辨識畫面內字幕。AI 準備字幕時可能暫停影片，譯文準備完成後繼續；原本已暫停的影片保持暫停。

## 修復與移除

- `No such native application`：重新執行橋接的 `repair.cmd` 或 `install.ps1`，完整退出並重開 Firefox，重新載入暫用擴充，再重新整理頁面。
- 移動橋接資料夾或更新 Codex 後找不到程式：重新執行安裝程式，依新本機位置產生設定。
- 移除：在原橋接資料夾執行 `uninstall.ps1`，再卸載暫用擴充。只移除對應橋接登錄，不刪除 Codex 登入或聊天。
- 不要複製別人的 `bridge.config.json`、產生的主機 JSON 或 Codex 登入檔；請在自己的電腦重新執行安裝程式。

## 從原始碼建置

```powershell
npm ci
npm run typecheck
npm test
npm run test:native
npm run build:firefox:codex
npm run package:codex
```

擴充輸出位於 `dist-firefox-chatgpt/`，發布 ZIP 位於 `artifacts/`。建置不需要 ChatGPT 或 GitHub 登入，也不需要 API 金鑰。詳見[公開版開發說明](docs/codex-development.md)。

## 來源與授權

原始專案與第三方資源來源見 [UPSTREAM.md](UPSTREAM.md)，保留原有第三方授權文件。本儲存庫未替原始專案宣告新的授權。[原版說明](docs/upstream-readme.md)保留為來源參考。

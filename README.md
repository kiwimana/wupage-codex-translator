# WuPage Codex 翻譯 · Firefox

繁體中文網頁雙語翻譯擴充套件。按下翻譯後，由**使用者自己電腦上的 Codex、Gemini CLI 或 Claude Code**，使用安裝者自己的登入帳號處理，不需要填入 API 金鑰。這些是官方本機命令列工具；不會自動操作桌面聊天視窗，也不會直接共用桌面聊天程式的登入。

這是 [mr-wuliu/wupage](https://github.com/mr-wuliu/wupage) 的非官方衍生 **fork**，保留原作者的提交歷史。`codex-firefox` 是本改版分支，加入本機 Codex 橋接、繁體中文介面、紫色明暗主題與 YouTube AI 雙語字幕；`main` 保留上游版本供後續同步。不是 OpenAI 或原專案的官方產品。

![明暗介面](docs/ui-preview.png)

[下載擴充與橋接](https://github.com/kiwimana/wupage-codex-translator/releases/latest) · [問題回報](https://github.com/kiwimana/wupage-codex-translator/issues)

## 桌面帳號翻譯：不保留一般本機聊天紀錄

**翻譯採用獨立的臨時工作，不續接原本的聊天室，也不把譯文保存為永久本機聊天紀錄。** 這裡所說的「沒有紀錄的聊天室」是由官方本機工具執行的臨時翻譯工作，不需要打開可見的聊天視窗；各服務的做法如下。

| 本機工具 | 本機對話紀錄的處理 | 實作範圍 |
| --- | --- | --- |
| Codex／ChatGPT 帳號 | 每批使用 `codex exec --ephemeral`，不保存此次工作階段的對話檔案。 | 使用官方臨時執行模式，不續接既有對話。 |
| Claude Code／Claude 帳號 | 每批使用 `--no-session-persistence`，不將此次對話保存到磁碟供日後續接。 | 停用本機對話保存，不續接既有對話。 |
| Gemini CLI／Google 帳號 | 每批使用全新的獨立暫存目錄；正常完成、錯誤或取消時清理此次目錄。 | 執行期間仍可能有暫存對話檔，不能稱為「從不寫入紀錄」或官方無痕聊天室。強制終止或斷電可能留下暫存。 |

Codex 與 Claude 的不保存模式，和 Gemini 的「暫存後清理」有差異；不將它們統稱為官方無痕聊天視窗。以上只說明本機翻譯工作，不承諾雲端服務零留存，也不刪除使用者原有聊天、設定或登入資料。擴充另停用永久本機譯文快取，避免長期累積翻譯內容。

官方說明：[Codex 臨時執行](https://developers.openai.com/codex/noninteractive/)、[Claude 對話保存參數](https://code.claude.com/docs/en/cli-reference)、[Gemini 工作階段管理](https://geminicli.com/docs/cli/session-management/)。實作細節見[本機橋接說明](native-chatgpt/README.md)與[隱私說明](PRIVACY.md)。

## 功能

- 網頁全文及段落翻譯，原文與譯文上下對照。
- 可拖曳的「譯」懸浮球，包含語言、服務與功能選單。
- YouTube CC 與齒輪之間的 AI 按鈕，依目前字幕與目標語言顯示雙語字幕；再按一次停止。
- Shorts 字幕工具列避開原生控制按鈕。
- 明暗主題、設定頁及 PDF 工作區。
- 三個帳號服務分別選模型，支援「自動」、預設模型及自訂模型名稱；小視窗可快速切換。
- 設定頁提供「偵測本機工具」及獨立的「連結帳號」按鈕，預設不偵測、不登入。找到工具不代表已登入。
- 預設手動啟動，停用永久本機譯文快取；Codex 與 Claude 停用此次對話保存，Gemini 使用獨立暫存並於完成、錯誤或取消後清理。

## 資料會送去哪裡？

```text
你的 Firefox → 你本機的原生橋接 → 你選的本機工具 → 該工具的雲端服務
```

公開套件沒有作者的登入資料、API 金鑰、Cookie、Windows 使用者路徑、遠端桌面、代理伺服器或通道設定。原生橋接使用程序標準輸入輸出，不開設 HTTP 服務，也不會連回作者電腦。每次安裝都在安裝者電腦上產生自己的程式路徑設定及目前 Windows 使用者的登錄項目。

翻譯計入安裝者自己所選帳號與模型的可用額度。這是雲端翻譯；本機紀錄清理不代表服務端零留存。指定模型不可用時顯示錯誤，不自動改用另一服務或作者帳號。詳見[隱私說明](PRIVACY.md)。

## 安裝（Windows）

需要 Firefox 154+、Node.js 22+，以及至少一個所選工具：Codex、Gemini CLI 或 Claude Code。帳號與可用模型依各工具的方案限制。

1. 從本儲存庫的 **Releases** 下載 Firefox 擴充 ZIP 與 Windows 橋接 ZIP，分別解壓縮到固定資料夾。
2. 安裝你要使用的官方工具：[Codex](https://developers.openai.com/codex/cli/)、[Gemini CLI](https://geminicli.com/docs/get-started/installation/) 或 [Claude Code](https://code.claude.com/docs/en/setup)。可以先不登入，完成安裝後再透過擴充的連結按鈕開啟登入。
3. 在橋接資料夾執行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
   ```

   從原始碼安裝時改用 `.\native-chatgpt\install.ps1`。可用 `-CodexPath`、`-ClaudePath`、`-GeminiPath` 指定自己的工具完整路徑；Gemini 也支援直接指定套件的 JavaScript 入口。Node.js 可用 `-NodePath` 指定。更新此版本時也要更新橋接來源並重跑安裝程式。

4. Firefox 開啟 `about:debugging#/runtime/this-firefox`，選「載入暫用附加元件」，載入擴充 ZIP 解壓縮後的 `manifest.json`。
5. 在小視窗選擇服務及模型；按「偵測／連結」前往設定。先按「偵測本機工具」，找到工具後再按「連結帳號」：Codex 使用 `codex login`；Claude 使用 `claude auth login`；Gemini 在互動視窗選 `Login with Google`。偵測與開啟登入視窗都不等於帳號已通過驗證；只有手動按「測試服務」才送出短句驗證，並使用少量額度。
6. 重新整理網頁，選擇目標語言，按「翻譯全文」或頁面的「譯」。未按翻譯、測試或連結時，不會主動啟動工具。

發布包未經 Mozilla 簽章，暫用擴充在關閉 Firefox 後需要重新載入。目前附帶橋接安裝程式僅支援 Windows；macOS／Linux 需要另行實作原生主機註冊及啟動器。

## YouTube 雙語字幕

先選取英文或其他語言 CC，再按右下「AI」，或從擴充小視窗按「AI 翻譯 CC 字幕」。原文在上、譯文在下，目標語言、帳號服務與模型採目前設定。字幕準備時顯示載入圓圈。再次按下停止；更換另一支影片不會自行開始。

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

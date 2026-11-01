v1.8.1 新增 Chrome 帳號翻譯版，同時保留 Firefox 版。Chrome 與 Firefox 共用繁體中文介面、懸浮球、Codex／Gemini CLI／Claude Code 模型選擇、手動偵測與連結，以及 YouTube AI CC 字幕載入提示。

修正 Windows UTF-8 終端環境可能造成橋接封包無效、連線失敗的問題；一般與隱藏啟動方式都已納入驗證。發布前也會先通過 Windows 安裝測試。

Chrome 下載 `chrome.zip` 與 `windows-bridge.zip`，分別解壓縮；在 `chrome://extensions` 開啟開發人員模式，選「載入未封裝項目」，再於橋接資料夾執行 `install.ps1 -Browser Chrome`。尚未發布 Chrome 線上應用程式商店。完整操作見 [Chrome 安裝說明](https://github.com/kiwimana/wupage-codex-translator#chrome-安裝windows)。

Chrome 使用固定公開金鑰維持擴充識別碼，橋接只允許本擴充的精確來源。公開包不含私鑰、登入資料或作者機器設定；只連到安裝者自己的本機工具。Windows 安裝程式支援 `-Browser Chrome`、`Firefox` 或 `Both`，分別註冊，解除安裝只移除本次安裝路徑相符的項目。

**翻譯使用獨立臨時工作，不保留一般本機聊天紀錄，也不續接原有聊天室。** Codex 使用 `--ephemeral`，Claude 使用 `--no-session-persistence`；Gemini 是獨立暫存後清理，執行期間可能寫入對話檔，強制終止可能留下暫存。這些做法不等於三者都有官方無痕聊天視窗，也不代表服務端零留存。詳見 [README 的紀錄處理說明](https://github.com/kiwimana/wupage-codex-translator#桌面帳號翻譯不保留一般本機聊天紀錄)。

新增手動「偵測本機工具」及「連結帳號」入口。開啟設定不偵測、不登入。偵測僅檢查本機檔案；另按連結才開啟官方工具登入視窗，介面不把已安裝或已開啟視窗誤當帳號驗證成功。這些工具與桌面聊天視窗不同，登入可能需要另外完成。

需一併更新橋接並重新執行安裝程式。舊版 Codex 設定自動保留；使用安裝者自己的帳號，不包含作者路徑或登入資料。Codex／Claude 停用此次本機對話保存，Gemini 使用獨立暫存並於結束後清理；不代表服務端零留存。

- 新版紫色明暗介面、可拖曳「譯」懸浮球與設定頁。
- 網頁上下雙語，以及 YouTube／Shorts AI CC 字幕操作。
- 手動啟動、停用永久本機譯文快取。
- 公開包不包含登入資料、金鑰或安裝後的機器設定；每位使用者需自行安裝橋接。

依瀏覽器選擇 **chrome.zip** 或 **firefox.zip**，搭配 **windows-bridge.zip**，依 README 安裝。來源 ZIP 可供自行建置。橋接安裝程式目前支援 Windows；Chrome 以開發人員模式載入，Firefox 包尚未經 Mozilla 簽章，暫用擴充在瀏覽器重開後須重新載入。

**雲端翻譯使用安裝者自身所選帳號與模型的額度。** 不保存本機對話不等於服務端零留存。來源與第三方資源歸屬見 UPSTREAM.md。

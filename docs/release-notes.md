v1.9.1 新增擴充更新功能，並修正 YouTube CC 字幕重複出現多個 AI 按鈕。

修正 Windows 8.3 縮短路徑被誤判為符號連結的相容性問題；仍拒絕實際符號連結及 junction。

- 小視窗底部顯示版本及新版提示；設定頁新增「擴充更新」。預設每 6 小時檢查 GitHub 穩定版，可關閉或立即檢查。
- Chrome 可透過新版 Windows 橋接安裝更新。第一次以 `install.ps1 -Browser Chrome -ChromeExtensionPath "D:\WuPage\chrome"` 指定目前載入的擴充資料夾，再於設定開啟自動安裝；預設不覆寫。更新核對 SHA-256、擴充識別碼與版本，失敗保留或還原原檔，保留瀏覽器翻譯與模型設定。
- Firefox 臨時載入版自動檢查並提示下載，需要到 about:debugging 手動重新載入；尚無 Mozilla 簽署版的自動安裝。
- YouTube 播放器的 AI 按鈕統一管理；切換影片、複製控制列、多個影片元素或重新注入時不再累積按鈕。

**舊版第一次仍需手動更新擴充與橋接。** 完整設定見 [自動更新說明](https://github.com/kiwimana/wupage-codex-translator#擴充自動更新)。

更新檢查不送出網頁內容、不登入 AI、不讀取憑證。翻譯仍使用安裝者自己的 Codex／Claude／Gemini 帳號與模型；Codex 與 Claude 停用此次本機對話保存，Gemini 使用隔離暫存並在完成、錯誤與取消後清理，不承諾服務端零留存。

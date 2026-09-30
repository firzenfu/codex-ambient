# Changelog

## 0.4.0 plugin — 2026-09-30

- Added a locally installable Codex plugin with a custom icon, bilingual description and five MCP tools: status, preview, preset apply, restore and language.
- Bundles Node.js and the v0.3.0 helper. Starts the helper when the plugin session loads, shares settings with the EXE and reconnects when another session exits.
- Added a PowerShell installer using Codex's native marketplace and plugin commands; no hooks, hook trust changes or application restarts.
- Uses the compatibility manifest format after verifying that this Codex build reads portable metadata but does not load the portable local MCP server.
- Verified native Codex discovery of all five tools, 20 unit/integration tests and packaged MCP apply/restore against an isolated browser fixture.
- Main-window backgrounds still require the existing local debugging launch mode. Local installation does not publish to the public plugin directory. The standalone EXE remains v0.3.0.

## 0.3.0 — 2026-09-29

- Added a Codex + Ambient desktop shortcut and silent one-click launch.
- Automatically restores saved backgrounds after launch, reconnects and page reloads without restarting existing playback.
- Saves selected media locally; Restore disables automatic reapplication.
- Reuses the running helper and stops orphan helpers after their launcher exits.
- Added persistence, recovery, authenticated resume and real CDP relay integration tests against an isolated browser fixture.

## 0.2.2 — 2026-09-29

- Added an English / Traditional Chinese selector with automatic preference persistence.
- Translated controls, preview copy, accessibility labels, status and error messages, and EXE tray menus.
- Changing language preserves the active background, selected media and video playback.
- Added authenticated language settings, failure recovery and bilingual responsive browser checks.
- Added upgrade guidance when an older Ambient service is still running.

## 0.2.1 — 2026-09-29

首次公開實驗版。

- Windows 單一 EXE，內附 Node.js，含系統匣操作與獨立預覽視窗。
- 極光、海洋、星空、本機影片／GIF／圖片背景。
- 即時預覽、透明強度、柔焦、速度、暫停及還原。
- 自訂分頁與 EXE 圖示。
- 修正選定視窗關閉後可能套用到另一個視窗的問題。
- 修正 EXE 查詢 Codex 狀態的等待時間不足。
- 驗證已儲存設定，損壞時回復預設值；保存採用暫存檔替換。
- 瀏覽器整合測試使用獨立服務，避免影響真實 Codex。

相容性仍屬實驗性質，請參閱 README。

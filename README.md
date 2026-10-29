# 景窗 · GPT 背景

景窗是一款非官方 Windows GPT 外观工具，可以在 GPT 主窗口内使用自己的图片或视频背景，并设置启动动画。

> 它只改变 GPT 客户端内部画面，不会修改 Windows 桌面壁纸，也不是桌宠。

## 功能

- 导入 PNG、JPG、WebP、MP4、WebM，素材保存在本机。
- 每张背景独立记住强度、模糊、填充方式和位置。
- 调节 GPT 菜单与输入框的不透明度。
- 视频背景静音循环、暂停、减少动态和定时轮播。
- 自选 MP4/WebM 启动动画，可跳过、重播和开关声音。
- 背景库与偏好在重新启动 GPT 后自动恢复。

## 一键安装

1. 从 [Releases](https://github.com/liuxi999/jingchuang-gpt-background/releases/latest) 下载 `jingchuang-0.3.0-win-x64.zip`。
2. 解压 ZIP，不要直接在压缩包内运行文件。
3. 双击 `Install.cmd`，等待出现安装结果。
4. 完全退出正在运行的 GPT，再从桌面的 **景窗 · GPT背景** 快捷方式打开。首次启动阅读提示后输入大写 `YES`。

默认安装到“文档/Codex/Jingchuang”。安装程序不会覆盖已有同名目录，也不会自动关闭 GPT。

支持 Windows x64 和系统自带的 Windows PowerShell 5.1。运行时会优先使用官方 GPT 客户端附带的 Node.js；通常不需要另装 Node.js、PowerShell 7 或运行 `npm install`。

## 使用

进入 GPT 后，点击右下角 **景窗 · 设置**，或按 `Ctrl+Alt+B`。

- **背景库**：批量导入、切换或删除本机素材。
- **启动动画**：选择视频，设置启用、声音、跳过和重播。
- **外观**：调整当前背景及 GPT 菜单、输入框的显示效果。

设置面板可点击外部、按 `Esc` 或点击关闭按钮收起。没有素材时使用默认渐变背景。视频背景默认静音循环，启动动画默认关闭。

## 隐私与风险

- 素材和设置仅保存在当前 GPT 客户端的本机 IndexedDB 中；景窗不读取聊天正文、不上传素材、没有遥测。
- 景窗会启动经过签名验证的官方客户端，并开放仅监听 `127.0.0.1` 的本机调试端口。同机其他程序理论上可能连接该端口，端口会持续到 GPT 完全退出。
- 授权绑定当前 Windows 账户、GPT 版本和景窗代码。任一项变化后需要重新输入 `YES`；普通换背景不需要重新授权。
- 景窗不修改 GPT 程序文件、系统执行策略、官方快捷方式或 Windows 桌面壁纸。GPT 更新后可能需要等待适配。

## 恢复与卸载

- 在设置里选择 **恢复默认背景**：保留素材，只切回渐变。
- 选择 **恢复 GPT 原外观**：移除当前外观层，但调试端口仍需完全退出 GPT 才会关闭。
- 运行安装目录中的 `Remove-Shortcut.cmd`：只删除景窗快捷方式。
- 删除安装目录不会清除 GPT IndexedDB 中的背景库。需要清空时，请先在背景库中删除素材和启动视频。

## 常见问题

**双击后提示 GPT 正在运行？**  
保存工作，完全退出 GPT（包括 Mini 和后台进程），再从景窗快捷方式启动。工具不会强制结束客户端。

**启动动画没有声音？**  
客户端可能阻止冷启动时自动播放声音。景窗会自动改为静音播放，避免整段动画被跳过。

**安装时提示缺少 Node.js？**  
先确认已安装官方 Windows GPT 客户端。也可以安装 Node.js 22.3+，或用 `JINGCHUANG_NODE` 指定 `node.exe`。

**如何确认下载完整？**  
在下载目录运行：

```powershell
Get-FileHash .\jingchuang-0.3.0-win-x64.zip -Algorithm SHA256
```

将结果与 Release 中的 `SHA256SUMS.txt` 对照。

开发、测试与发布说明见 [docs/DEVELOPMENT.md](https://github.com/liuxi999/jingchuang-gpt-background/blob/main/docs/DEVELOPMENT.md)。许可证与第三方来源见 [LICENSE](LICENSE) 和 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

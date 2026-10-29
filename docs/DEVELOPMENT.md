# 开发与发布

## 环境

- Windows x64
- Node.js 22.3+
- Windows PowerShell 5.1 或 PowerShell 7

项目没有第三方 npm 依赖，不需要运行 `npm install`。

## 常用命令

```powershell
npm test
npm run preview
node scripts/install.mjs --dry-run
npm run package
```

`npm run preview` 只启动回环地址上的模拟 GPT 页面，不连接真实客户端。`npm run package` 只生成 `dist/jingchuang-<版本>-win-x64.zip` 和 `dist/SHA256SUMS.txt`，发布暂存目录会自动清理。

安装脚本支持 `--destination=<绝对路径>`。默认安装路径是系统文档目录下的 `Codex/Jingchuang`；已有目录会被拒绝覆盖。

## 架构与数据

- `runtime/`：客户端验证、CDP 接入、媒体播放、背景库和设置界面。
- `scripts/`：安装、模拟预览和发布打包。
- `tests/`：Node 单元测试及模拟宿主的浏览器回归脚本。

背景素材、缩略图和偏好保存在 GPT 客户端自己的 IndexedDB 中。运行目录只保存授权绑定、当前接入会话和日志。发布白名单明确排除这些本机文件、媒体、截图和测试产物。

配置接口 `preferences(changes, {deferSave, targetId})` 支持延迟保存和指定背景；`flush()` 提交待保存状态。数据库继续使用 `schema: 1`，`appearanceById` 按素材 ID 保存显示配置。

## 验证

发布前必须完成：

1. `npm test` 全部通过。
2. 使用 Windows PowerShell 5.1 运行 `runtime/Bootstrap.ps1 -Action Probe`，确认能发现官方 GPT 附带的 Node.js。
3. 生成发布包，确认只有一个 Windows x64 ZIP，SHA-256 匹配且没有 `.stage-*` 残留。
4. 解压发布包，运行安装 dry-run，检查 `FILES.sha256.json` 和发布白名单。
5. 完全退出 GPT 后，从测试快捷方式进行真实冷启动验收；检查启动动画、背景切换、输入、菜单、滚动、明暗主题和设置面板关闭。

模拟输入框和菜单回归使用 `tests/surfaces.browser.mjs`；每背景独立设置回归使用 `tests/backgrounds.browser.mjs`。它们只操作模拟页面，不需要私人素材。

## 发布

版本号必须同时更新 `package.json` 和 `runtime/manifest.mjs`，并在 `CHANGELOG.md` 记录变化。GitHub Release 只附加安装 ZIP 和 `SHA256SUMS.txt`；源码由 GitHub 根据标签自动生成。

发布包不附带人物、影片、音乐、个人背景、授权记录、会话或日志。请保留 MIT 许可证及第三方声明。

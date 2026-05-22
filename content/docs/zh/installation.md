# 安装

你完全可以在浏览器中使用 Polymux——无需安装。原生应用和浏览器扩展会添加额外能力,例如驱动你自己的本地浏览器,而不是托管浏览器。

## Web 应用

位于 [polymux.com](https://polymux.com) 的 Web 应用始终是最新版本。任何现代 Chromium、Firefox 或 Safari 版本都可使用。无需安装;登录后,你的工作空间、会话和工作流即刻可用。

## 浏览器扩展

该扩展可让 Polymux 会话驱动 **你本地浏览器** 中的标签页,而不是服务器托管的 Chromium。在以下场景中很有用:

- 需要使用现有登录 Cookie 的网站。
- 访问托管浏览器无法到达的私有网络。
- 特定的浏览器配置文件、扩展列表或设备指纹。

要安装,请打开 [安装页面](/install-apps) 并选择你的浏览器。当扩展提示配对时,只需在任意标签页登录 Polymux——配对会自动完成,弹窗会显示 _Connected_。

扩展在连接期间完全被动:只有当 Polymux 会话处于 `?mode=extension` 时它才会执行操作。你随时可以从弹窗中撤销它。

## 桌面应用

适用于 macOS、Windows 和 Linux 的原生应用提供完整的 Polymux 体验,无需浏览器标签页。它们目前处于私有 Beta 阶段。请到 [安装页面](/install-apps) 注册,以便在适用于你平台的版本可用时收到通知。

桌面应用并非必需——本文档中的每个功能都可以在 Web 应用中使用。

## 移动应用

iOS 和 Android 应用在路线图中。目前,Web 应用响应式良好,可在移动浏览器中使用,但实时视口在桌面端流式传输效果最佳。

## 系统要求

| 平台 | 要求 |
| --- | --- |
| Web 应用 | 过去 24 个月内发布的任何浏览器 |
| 扩展 | Chrome、Edge、Brave,或任何 Chromium 119+ |
| 桌面 | macOS 13+、Windows 10+,或过去 3 年内的任何 Linux 发行版 |
| 网络 | WebRTC 和 WebSocket 出站访问端口 443 / 8080 |

如果你的网络阻止 WebRTC,实时视口将回退到较慢的轮询流。其他功能将继续正常运行。

## 后续步骤

- Polymux 新手?继续阅读 [快速入门](/documentation/quickstart)。
- 配置团队?阅读 [工作空间与成员](/documentation/workspaces)。
- 需要校验下载文件?查阅 [常见问题](/documentation/faq#verifying-downloads) 中的更新与校验。

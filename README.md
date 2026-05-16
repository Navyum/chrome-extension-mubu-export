# 幕布导出工具 - Chrome 插件

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ddlgkdckclmnfmolnadnjanbnkfepkmp?label=Chrome%20Web%20Store&color=4285F4)](https://chromewebstore.google.com/detail/ddlgkdckclmnfmolnadnjanbnkfepkmp)
[![GitHub](https://img.shields.io/github/stars/Navyum/chrome-extension-mubu-export?style=social)](https://github.com/Navyum/chrome-extension-mubu-export)
[![Website](https://img.shields.io/badge/Website-mubu.toolab.top-purple)](https://mubu.toolab.top)

一个专注于 [幕布 (mubu.com)](https://mubu.com) 的 Chrome 扩展，帮助你一键批量导出所有思维导图/大纲笔记。工具完全在本地运行：读取文档、转换为 Markdown / OPML / Freemind (.mm) / HTML / JSON，并按照原有文件夹层级保存到下载目录。

> ⚠️ 免责声明：本项目仅供学习与备份使用，请遵守幕布的服务条款，不要将抓取的数据用于任何商业或违规用途。

## ✨ 功能特性

### 🚀 核心能力
- **一键全量导出**：递归扫描所有文件夹，最多可处理数千份笔记
- **多格式输出**：Markdown、OPML（兼容 XMind / Logseq / Obsidian）、Freemind (.mm)、HTML、原始 JSON 定义
- **结构保留**：还原幕布的文件夹树，下载到本地仍然是层级化目录
- **节点还原**：将节点文本/备注/嵌套层级转成 Markdown 列表与引用

### 🎛️ 使用体验
- **实时进度**：弹窗展示进度条、剩余数量、日志
- **暂停恢复**：导出过程中随时暂停，并可继续执行
- **失败重试**：后台记录失败的文档，支持一键重试
- **状态持久化**：意外关闭浏览器也可恢复导出
- **性能面板**：设置页可查看文件树、最慢 TOP10、每个文件的耗时信息

### 🛡️ 安全可控
- **本地执行**：所有请求直接发往 `api2.mubu.com`，不经过第三方服务器
- **自动 Cookie**：保持登录幕布即可，扩展会自动读取浏览器 Cookie 中的 Jwt-Token
- **可配置下载目录**：允许自定义下载子文件夹，避免散落在默认 Download 根目录

## 📸 界面预览

| 弹窗 | 设置页 | 性能监控 |
| --- | --- | --- |
| ![popup](asserts/main.png) | ![settings](asserts/setting1.png) | ![perf](asserts/setting2.png) |

## 🛠️ 安装

### 方式一：拉取源码，开发者模式加载（推荐）
```bash
git clone https://github.com/Navyum/chrome-extension-mubu-export.git
cd chrome-extension-mubu-export
npm install
npm run build
```
1. 打开 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `dist/` 目录（无需混淆可直接选择仓库根目录）

### 方式二：自打包
1. `npm install && npm run build`
2. 将 `dist/` 目录打包为 zip
3. 在扩展管理页点击「加载已解压」或上传到 Chrome Web Store

## 🚀 快速开始

1. **登录幕布**  
   使用桌面 Chrome 打开 [https://mubu.com](https://mubu.com)，保持登录状态，并打开任意文档列表页。

2. **打开插件弹窗**  
   点击浏览器工具栏上的扩展图标，确认 UI 加载正常。

3. **保持登录状态**  
   - 确保在同一 Chrome 中访问并登录 [mubu.com](https://mubu.com)  
   - 扩展会自动读取 Cookie 中的 `Jwt-Token` 完成鉴权，无需手动配置

4. **获取文件信息**  
   回到弹窗，点击「🔍 获取文件信息」，稍等片刻即可看到文档数量与文件夹数量。

5. **选择导出格式并开始**  
   - Markdown：适合内容迁移到 Obsidian、Notion、飞书文档
   - OPML：适合导入 XMind、幕布、Workflowy
   - Freemind (.mm)：用于导入 Freemind / MindManager 等经典思维导图工具
   - HTML：生成可直接分享的图文备份页面
   - JSON：保留幕布原始结构，后续可自行二次解析  
   点击「🚀 开始导出」即可静待任务完成。

## 🔑 登录要求

扩展运行时会直接读取浏览器中 `https://mubu.com` 的 `Jwt-Token` Cookie：  
- 如果提示“未检测到 Jwt-Token”，请重新打开 [mubu.com](https://mubu.com) 登录后再尝试  
- 若长时间未操作导致登录过期，只需刷新幕布页面即可自动恢复  
- Cookie 仅保存在本地浏览器，不会被扩展上传或共享

## ⚙️ 设置与性能监控

| 功能 | 说明 |
| --- | --- |
| 📁 下载子文件夹 | 自定义下载相对路径，如 `MubuBackup/2025-11` |
| 自动鉴权 | 登录幕布后自动读取 Cookie，无需手动粘贴 token |
| 🌳 文件树 | 展示每个文件的导出状态、耗时、导出 URL、本地路径 |
| 🐌 最慢 TOP10 | 快速定位网络瓶颈或大文件 |
| 🔄 刷新按钮 | 即时同步后台最新状态，无需重新打开弹窗 |

## 🧠 导出格式说明

| 格式 | 场景 | 说明 |
| --- | --- | --- |
| `Markdown (.md)` | 迁移到 Notion / Obsidian / 飞书 | 使用无序列表表示节点，备注转为引用块 |
| `OPML (.opml)` | 导入 XMind / Logseq / Workflowy | 兼容大部分思维导图与大纲工具 |
| `Freemind (.mm)` | 导入 Freemind / MindManager | 经典 `.mm` 思维导图格式，保留折叠/备注信息 |
| `HTML (.html)` | 直接分享/打印 | 生成包含层级结构、备注与图片的静态页面 |
| `JSON (.json)` | 自定义处理或写脚本 | 直接保存幕布 definition 的原始结构 |

## 🏗️ 技术架构

- **Manifest V3** Service Worker 后台，负责调度导出流程
- **Chrome APIs**：`downloads`（保存文件）、`storage`（持久化状态）、`runtime`（消息通信）
- **Fetch + Cookie 鉴权**：读取浏览器 Cookie 并通过自定义请求头访问 `api2.mubu.com`
- **前端栈**：原生 JS + 现代化 UI，复用 shimo 版本的弹窗/设置页面

## 🤝 参与贡献

1. Fork & Clone 本仓库
2. 提交前运行 `npm run lint`（如有）
3. 提交 PR 时请注明变更内容、测试方式
4. 欢迎通过 Issue 反馈 bug / 提需求

## 📄 许可证

本项目默认以 MIT 协议发布，详情见仓库根目录。请勿用于违反幕布/第三方平台条款的用途。

## 🙏 致谢

- [chrome-extension-shimo-export](https://github.com/Navyum/chrome-extension-shimo-export) 提供的 UI/交互基础
- 幕布团队提供的优秀产品
- 所有提交 Issue / PR 的开发者

## 💖 赞助支持

如果这个工具帮到了你，欢迎请作者喝杯咖啡：

| 微信赞赏 | 支付宝 |
| :---: | :---: |
| <img src="asserts/sponsors.png" width="200" alt="微信赞赏码"> | <img src="asserts/alipay.png" width="200" alt="支付宝收款码"> |

你的支持是项目持续维护的动力！Star 本项目也是一种支持 ⭐

## 🔗 相关链接

- [官网 & 博客](https://mubu.toolab.top)
- [Chrome Web Store](https://chromewebstore.google.com/detail/ddlgkdckclmnfmolnadnjanbnkfepkmp)
- [使用教程](https://mubu.toolab.top/blog/)
- [问题反馈](https://github.com/Navyum/chrome-extension-mubu-export/issues)

---
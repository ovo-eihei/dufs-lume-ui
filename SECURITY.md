# 安全说明（Security Policy）

中文 · [English](#english)

## 报告一个漏洞

请用仓库的 **私密漏洞报告**：[Security → Report a vulnerability](https://github.com/ovo-xxx/dufs-lume-ui/security/advisories/new)。
非敏感的问题（文档、功能、普通缺陷）请开 [Issue](https://github.com/ovo-xxx/dufs-lume-ui/issues)。

请不要在公开的 Issue、PR 或讨论里贴出可利用的细节 —— 这类前端配了鉴权之后仍然要防的东西，公开描述等于给攻击者一份路线图。

**响应时限**：尽力在 7 天内回复第一封；确认存在后修复并随下一个版本发布，必要时先发一条 GHSA 公告。我们不承诺赏金，也没有赏金计划。

## 本项目的安全边界（读报告前先知道）

- **本项目不含任何鉴权**。谁能读、谁能写、谁能删，全部由 [Dufs](https://github.com/sigoden/dufs) 自身与它前面的反向代理（Caddy `forward_auth` 等）决定。把"未登录也能上传/删除"当成前端的漏洞报给我们，我们会转成文档说明而不是修复 —— 前端只是尽力根据探测结果隐藏入口，**它不是安全控制**。
- **`docker/` 的默认档没有鉴权**，且 `LUME_BIND` 默认可能落在 `0.0.0.0`。这是 README 与 `.env.example` 明确写着的取舍，用于本机自测；把它当漏洞之前请先看那两段。
- **HTML 预览的沙箱**：默认在 `iframe sandbox` 里渲染，`allow-scripts` 与 `allow-same-origin` **不同时给**（否则沙箱形同虚设）。用户可以二次确认后关闭沙箱 —— 关闭之后是**用户自己的选择**，其后果不在本项目漏洞范围内。
- **服务端扩展 API**：`scripts/lume-info-api.sh` 是唯一直接处理不可信输入并调用外部命令的部分（POSIX sh + `libvips`/`ImageMagick`）。它的路径判据与实测响应码见 [`docs/deployment-and-lume-api.md`](./docs/deployment-and-lume-api.md) §1(2) 与 §6。**绕过这些判据的路径穿越、命令注入、响应头注入是我们最关心的报告类型。**
- **缩略图缓存**写在数据根之外（`THUMB_CACHE_DIR`），键含 mtime 与 size；如果你能构造出让一个用户的请求读到另一个用户的缓存图，那是高危。

## 未在范围内

- 需要报告者已经持有管理员凭据、或已经能读写宿主文件系统才能成立的问题。
- 依赖上游（React、Vite、Dufs、Caddy）自身的漏洞，除非本仓库的代码把它变成了可利用路径 —— 那种情况请说明组合方式。
- 强度类问题：缺少 CSP/安全响应头（本项目的产物由别人的反代发出，头不在我们手里）、没有单元测试、没有第三方审计。这些在 [`docs/ai-development-notes.md`](./docs/ai-development-notes.md) 里已经如实声明。

## English

Report vulnerabilities privately via **Security → Report a vulnerability**. Non-sensitive issues go to the issue tracker, please don't post exploitable details in public.

Key boundaries: this project contains **no authentication** — who may read, write or delete is decided by Dufs and the reverse proxy in front of it. The frontend only *hides* controls based on a probe; it is not a security control. The `docker/` default profile ships without authentication on purpose (documented in README and `.env.example`). HTML previews run in an `iframe sandbox` that never grants `allow-scripts` and `allow-same-origin` together; disabling the sandbox is a user opt-in after a second confirmation.

`scripts/lume-info-api.sh` is the only component that handles untrusted input and calls external commands. Path traversal that defeats its checks, command injection, and response-header injection are the reports we care about most.

First response within 7 days, best effort. No bounty program.

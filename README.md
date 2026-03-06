# gh-proxy — Cloudflare Worker Git Proxy

> 用于解决本地设备和国内 VPS 上 `git clone` / `git pull` 访问 GitHub 失败的问题。

基于 Cloudflare Workers 实现的 **Git 专用**反向代理。只代理 Git Smart HTTP 协议流量，不支持也不允许浏览器访问，降低被滥用的风险。

---

## 原理

```
git clone/pull/push
       ↓
Cloudflare Worker（全球边缘节点）
       ↓
github.com / raw.githubusercontent.com / ...
```

Worker 部署在 Cloudflare 的全球边缘网络，请求就近路由后再转发至 GitHub，绕过国内直连时的丢包和超时问题。

---

## 支持的上游域名

| 域名 | 用途 |
|---|---|
| `github.com` | 默认，Git 仓库操作 |
| `api.github.com` | GitHub REST API |
| `raw.githubusercontent.com` | Raw 文件下载 |
| `codeload.github.com` | 归档/ZIP 下载 |
| `objects.githubusercontent.com` | LFS 对象、Release 附件 |

访问辅助域名时，使用 `/__host/<domain>/...` 路径前缀路由，Worker 会自动处理跨域重定向。

---

## 部署步骤

### 前提条件

- 注册 [Cloudflare](https://www.cloudflare.com/) 账号（免费套餐即可）
- 开通 **Workers & Pages** 服务

### 1. 创建 Worker

1. 登录 Cloudflare Dashboard，进入 **Workers & Pages**
2. 点击 **Create** → **Create Worker**
3. 为 Worker 取一个名称，例如 `gh-proxy`
4. 点击 **Deploy** 先创建，再点击 **Edit Code**

### 2. 粘贴代码

将 `worker.js` 的全部内容替换到编辑器中，点击 **Save and Deploy**。

### 3. 获取访问地址

部署成功后会分配一个域名：

```
https://gh-proxy.<your-subdomain>.workers.dev
```

如有自定义域名，可在 **Custom Domains** 中绑定。

---

## 使用方式

### 临时使用（单次克隆）

直接将 `github.com` 替换为你的 Worker 域名：

```bash
git clone https://gh-proxy.xxx.workers.dev/user/repo.git
```

### 全局配置（推荐）

通过 `url.insteadOf` 让所有 GitHub 请求自动走代理，无需修改每条命令：

```bash
git config --global url."https://gh-proxy.xxx.workers.dev/".insteadOf "https://github.com/"
```

取消配置：

```bash
git config --global --unset url."https://gh-proxy.xxx.workers.dev/".insteadOf
```

### 下载 Raw 文件

```bash
# 原始地址：https://raw.githubusercontent.com/user/repo/main/file.txt
curl https://gh-proxy.xxx.workers.dev/__host/raw.githubusercontent.com/user/repo/main/file.txt
```

---

## 安全设计

- **浏览器请求一律拦截**：检测 `sec-fetch-*` 请求头、常见浏览器 UA 及 `text/html` Accept 头，命中则返回 403
- **路径严格白名单**：仅允许 `/info/refs`、`/git-upload-pack`、`/git-receive-pack` 及 dumb-HTTP 对象路径
- **请求头过滤**：只转发白名单内的必要请求头（`authorization`、`user-agent` 等），不透传 Cookie
- **响应头清理**：自动删除上游返回的 `set-cookie`
- **重定向重写**：跳转地址自动改写回代理域名，防止客户端被导出到不允许的目标

---

## 注意事项

- Cloudflare Workers 免费套餐每天有 **10 万次**请求限额，个人使用完全够用
- 本项目仅做流量转发，不存储任何用户数据
- 仅供个人学习和研究使用，请勿违反 Cloudflare 服务条款或相关法律法规

---

## 致谢

感谢 Cloudflare 提供免费的全球边缘计算服务为互联网做出的巨大贡献。

---

## License

[MIT](LICENSE)

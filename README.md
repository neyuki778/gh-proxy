# GitHub Accelerator — Cloudflare Worker

利用 Cloudflare Workers 搭建的 **免费** GitHub 反向代理，帮助中国大陆用户流畅访问 GitHub。

---

## 原理

```
用户请求 → Cloudflare Worker（边缘节点） → github.com → 原路返回
```

Worker 部署在 Cloudflare 的全球边缘网络上，请求会就近路由，绕过直连 GitHub 时的网络拥堵，实现加速效果。

---

## 部署步骤

### 前提条件

- 注册 [Cloudflare](https://www.cloudflare.com/) 账号（免费套餐即可）
- 开通 **Workers & Pages** 服务

### 1. 创建 Worker

1. 登录 Cloudflare Dashboard，进入 **Workers & Pages**
2. 点击 **Create** → **Create Worker**
3. 为 Worker 取一个名称，例如 `github-proxy`
4. 点击 **Deploy** 先创建，再编辑代码

### 2. 粘贴代码

将 `worker.js` 中的全部内容替换到编辑器中，点击 **Save and Deploy**。

### 3. 获取访问地址

部署成功后，Cloudflare 会分配一个域名，格式如下：

```
https://XXX.<your-subdomain>.workers.dev
```

如有自定义域名，也可以在 **Custom Domains** 中绑定。

### 4. 使用方式

将原始 GitHub URL 中的 `https://github.com` 替换为你的 Worker 地址即可：

| 原始地址 | 加速地址 |
|---|---|
| `https://github.com/user/repo` | `https://xxx.workers.dev/user/repo` |
| `https://github.com/user/repo/releases` | `https://xxx.workers.dev/user/repo/releases` |

---

## 注意事项

- Cloudflare Workers **免费套餐**每天有 **10 万次**请求限额，个人使用完全够用
- 本项目仅做请求转发，不存储任何用户数据
- `Access-Control-Allow-Origin: *` 已设置，支持跨域请求（适用于 API 调用场景）


## ⚠️⚠️⚠️

仅用于个人学习和研究，请勿将此 Worker 用于任何违反 Cloudflare 服务条款或相关法律法规的用途

## 致谢

感谢Cloudflare为国际互联做出的贡献

---

## License

[MIT](LICENSE)

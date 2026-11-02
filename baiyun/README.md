# 白云天气 2.81 — Quantumult X 破解会员

## 〇、直接订阅（QX 重写订阅）

在 QX → 重写 → 引用 → 添加资源，填这个地址：

```
https://raw.githubusercontent.com/TO8E/carck/main/baiyun/WhiteCloud.rewrite.conf
```

规则里的脚本同样走 raw URL，订阅后 QX 会自动拉取脚本，不需要手动放文件。

订阅完还差一步：QX → 设置 → MitM → 主机名，加上：

```
api.revenuecat.com, api-production.8-lives-cat.io, api.rc-backup.com, untech.cc, *.untech.cc, *.sunlitt.app
```

然后打开「重写」和「MitM」开关，杀掉白云天气重开。

---

## 一、静态分析结论（这个包是怎么判断会员的）

解包 `白云天气_2.81.ipa` 后确认：

| 项 | 值 |
|---|---|
| Bundle ID | `com.wuxin.WhiteCloud` |
| 主二进制 | `Payload/WhiteCloud.app/WhiteCloud`（arm64，Swift + SwiftUI） |
| 内购/订阅 | RevenueCat SDK（`RevenueCat` 大量符号） |
| RevenueCat 域名 | `api.revenuecat.com`、`api-production.8-lives-cat.io`、`api.rc-backup.com` |
| 自有服务端 | `https://untech.cc/api/v2/*`（`bootstrap`、`users/user-settings`、`users/register-device`、`weather/long-range` 等） |
| 会员字段 | `membershipExpires`、`membership`、`didConfirmWithRevenueCat`、`isPremiumLocked`、`MembershipStateData` |
| 反调试/越狱检测 | 未发现（无 `jailbreak` / `frida` / `substrate` / `SecTrust` pinning 字符串） |

会员判定是**两条链路**：

1. **RevenueCat CustomerInfo**：`subscriber.entitlements.active` 里存在活跃 entitlement → 解锁。
2. **自有服务端**：`/api/v2/users/user-settings`（或 `register-device`）下发 `membershipExpires`，用于显示到期时间和兜底判断。

所以 QX 方案要同时打这两条：**伪造 RevenueCat 的 subscriber 响应** + **递归改写自有 API 里的会员字段**。

---

## 二、文件清单

| 文件 | 作用 |
|---|---|
| `baiyun/WhiteCloud.conf` | QX 的 `[mitm]` + `[rewrite_local]` 配置片段 |
| `baiyun/WhiteCloud.rewrite.conf` | 给 QX「重写订阅」用的远程规则（脚本走 raw URL） |
| `baiyun/WhiteCloud.js` | 单文件脚本，按 QX 阶段 + URL 自动分发，覆盖下面三件事 |

---

## 三、QX 配置步骤

### 1. 安装证书并开启 MITM

1. QX → 设置 → 证书 → 生成证书 → 安装描述文件。
2. iOS 设置 → 通用 → VPN与设备管理 → 安装描述文件。
3. iOS 设置 → 通用 → 关于本机 → 证书信任设置 → 打开 **Quantumult X** 的完全信任。
4. QX 首页 → 开启「重写」和「MitM」。

### 2. 放脚本

把 `baiyun/WhiteCloud.js` 复制到 QX 的脚本目录：

```
文件 App → 我的 iPhone → Quantumult X → Scripts/
```

（没有 `Scripts` 目录就手动建一个，文件名保持原样。）

### 3. 合并配置

打开 QX → 配置文件 → 编辑当前配置，把 `baiyun/WhiteCloud.conf` 里的内容合并进去（`[mitm]` 段合并 hostname，`[rewrite_local]` 段追加三行）：

```ini
[mitm]
hostname = api.revenuecat.com, api-production.8-lives-cat.io, api.rc-backup.com, untech.cc, *.untech.cc, *.sunlitt.app

[rewrite_local]
^https:\/\/(api\.revenuecat\.com|api-production\.8-lives-cat\.io|api\.rc-backup\.com)\/v1\/subscribers\/ url script-request-header WhiteCloud_rc_req.js
^https:\/\/(api\.revenuecat\.com|api-production\.8-lives-cat\.io|api\.rc-backup\.com)\/v1\/subscribers\/ url script-response-body WhiteCloud_rc.js
^https:\/\/([a-z0-9-]+\.)?(untech\.cc|sunlitt\.app)\/api\/v2\/ url script-response-body WhiteCloud_api.js
```

### 4. 清缓存重开

- 杀掉白云天气进程，重新打开。
- 如果之前登录过/有缓存：设置里退出登录，或直接删除 app 重装。
- QX 的「重写」开关必须是开着的，且配置里没有别的规则抢先命中。

---

## 四、验证是否生效

1. 打开 app → 我的/会员页，看是否显示已解锁、到期时间是否变成 2099。
2. QX → 日志，搜索 `revenuecat` / `untech`，确认请求被 rewrite 命中。
3. 如果会员页仍显示未开通，按下面排错。

---

## 五、排错（重点：entitlement key 不匹配）

RevenueCat 的 entitlement **key 是 app 代码里写死的**，脚本里铺了 13 个常见候选：

```
pro, premium, vip, plus, member, membership, whitecloud,
whitecloud_pro, pro_plus, lifetime, annual, unlimited, full
```

如果没命中，用抓包确认真实 key：

1. 临时把 `WhiteCloud_rc.js` 顶部加一行调试（QX 会弹通知）：

```js
$notify("WhiteCloud RC", "", Object.keys(JSON.parse($response.body).subscriber.entitlements).join(","));
```

2. 打开 app 触发一次订阅信息请求，看通知里原始 entitlements 有哪些 key。
3. 把真实 key 加到脚本的 `ENTITLEMENT_KEYS` 数组最前面。

同理，如果 app 走的是自有服务端判断，抓 `https://untech.cc/api/v2/users/user-settings` 的响应，看会员字段到底叫什么（比如可能是 `membershipExpires` 的嵌套对象），把字段名补进 `WhiteCloud_api.js` 的 `EXPIRE_KEYS` / `BOOL_KEYS`。

### 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| QX 日志没有命中 | MITM 证书没信任 / hostname 没加 | 重装证书，确认 `hostname` 含 `api.revenuecat.com` |
| 请求命中但 app 仍非会员 | entitlement key 不对 | 按上面抓包补 key |
| 第一次生效，重开失效 | RevenueCat 走了 ETag 304 / 本地缓存 | 确认 `script-request-header` 那条规则已挂上；清 app 数据 |
| app 提示网络错误 | 脚本返回了非法 JSON | QX 日志看脚本报错，`node --check` 校验语法 |
| 会员页显示但功能仍锁 | 功能走了自有 API 的另一个字段 | 抓对应接口响应，补字段名 |

---

## 六、脚本行为说明

`WhiteCloud.js` 一个文件挂三条 rewrite，靠**阶段**和 **URL** 自动分发：

| 阶段 | URL | 行为 |
|---|---|---|
| `script-request-header` | `/v1/subscribers/` | 删掉 `If-None-Match`，防止 RevenueCat 返回 304 |
| `script-response-body` | `/v1/subscribers/` | 返回伪造的永久 subscriber |
| `script-response-body` | `/api/v2/` | 递归改写自有服务端会员字段 |

RevenueCat 响应里：

- `subscriber.entitlements`：13 个候选 key，全部 `expires_date: null`（永久）。
- `subscriber.subscriptions`：8 个候选产品 ID，全部永久、`store: app_store`、`period_type: normal`。
- 清掉 `X-RevenueCat-ETag`、`X-RevenueCat-Signature`、`Content-Length` 等头。
- `original_app_user_id` 从 URL 里取，保持和请求一致。

自有 API 响应里递归遍历 JSON，命中以下字段就改：

- `membershipExpires` / `vip_expires_at` / `premium_expires` 等 → `4102444799000`（数字）或 `2099-12-31T23:59:59Z`（字符串）。
- `isMember` / `isVip` / `isPremium` / `isPro` / `hasMembership` 等布尔 → `true`。
- `membership` / `tier` 为 `free` / `basic` 等 → `lifetime`。

非 JSON 响应原样放行，不会破坏 bootstrap 的二进制/加密数据。

---

## 七、补充

- 这个包没有 SSL Pinning，QX 可以直接中间人；如果后续版本加了 pinning，需要额外用 Frida 的 `ssl_pinning_bypass` 脚本。
- QX 只对 `api.revenuecat.com` / `api-production.8-lives-cat.io` / `api.rc-backup.com` 三个域名做 MITM；如果 app 升级换了 RevenueCat 代理域名，把新域名补进 `hostname` 和 rewrite 正则即可。
- 自有 API 如果从 `bootstrap` 动态拿到别的域名（不是 `untech.cc`），把该域名补进 `hostname` 和第三行 rewrite 正则。

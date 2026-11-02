# 白云天气 2.81 二进制补丁（会员校验绕过）

## 为什么需要补丁

App 侧逻辑（vmaddr `0x100004cf4`，函数内 `0x100004e40–0x100004ec0`）：

```
entitlements["allaccess"]           -> x28
verification = entitlementInfos.verificationResult
cmp  w0, #0x2 ; b.eq  throw          ; .failed -> 抛 entitlementVerificationFailed
cbz  x28, nonMember                  ; 没有 allaccess -> 非会员
cmp  w0, #0x2 ; b.ne  continue
ldrb w0, [x20, #0x10] ; tbz w0, #0  ; bit0==0（notRequested / failed）-> 非会员
```

`VerificationResult` tag 映射（RC 侧 `0x1005562b0` 独立验证）：
`notRequested=0`、`verified=1`、`failed=2`、`verifiedOnDevice=3`。

所以 app 只接受 `verified` / `verifiedOnDevice`。MITM 无法伪造 RC 的 ECDSA 签名：
- 去掉 `x-signature` → `notRequested(0)` → 静默判非会员
- 保留旧签名 → `failed(2)` → 抛红字「RevenueCat 会员状态校验失败」

=> 网络层无解，必须改二进制。

## 补丁（3 条指令 / 12 字节）

| 文件偏移 | vmaddr | 原指令 | 新指令 | 新字节 |
|---|---|---|---|---|
| `0x4e68` | `0x100004e68` | `b.eq 0x100004e80` | `nop` | `1f 20 03 d5` |
| `0x4e7c` | `0x100004e7c` | `b.ne 0x100004eb8` | `b 0x100004eb8` | `0f 00 00 14` |
| `0x4ec0` | `0x100004ec0` | `tbz w0,#0,0x100004f20` | `nop` | `1f 20 03 d5` |

保留 `cbz x28`（权益必须存在），所以**补丁版仍然需要 Loon 插件提供 `entitlements.allaccess`**。

## 重新打包

```bash
./repack.sh            # 见脚本内说明：改字节 -> 清 _CodeSignature -> codesign -s - -> zip
```

安装：用 Sideloadly / AltStore 以自签证书重签安装。

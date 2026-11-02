/*
 * WhiteCloud 白云天气 2.81 — Quantumult X 单文件破解脚本
 *
 * 一个文件同时挂三条 rewrite，靠阶段和 URL 自动分发：
 *  1) script-request-header  /v1/subscribers/  → 删 If-None-Match，防 304
 *  2) script-response-body   /v1/subscribers/  → 伪造永久 RevenueCat entitlement
 *  3) script-response-body   /api/v2/          → 递归改写自有服务端会员字段
 *
 * 用法见同目录 WhiteCloud.rewrite.conf。
 */

(function () {
    var url = ($request && $request.url) || "";

    // 调试开关：true 时把命中的关键响应弹通知（每个 URL 只弹一次）。
    // 确认会员逻辑后改回 false。
    var DEBUG = true;
    function dbg(tag, msg) {
        if (!DEBUG) return;
        try {
            var key = "wc_dbg_" + tag;
            if ($persistentStore.read(key)) return;
            $persistentStore.write("1", key);
        } catch (e) {}
        try { $notify("WhiteCloud", tag, String(msg || "").slice(0, 300)); } catch (e) {}
    }

    // ============================================================
    // 阶段一：请求头（QX 的 script-request-header 阶段没有 $response）
    // ============================================================
    // 只认 /v1/subscribers/{id} 本身，不能误伤 /offerings、/attributes 等子路径
    var path = url.split("?")[0].split("#")[0];
    var isSubscriber = /\/v1\/subscribers\/[^\/]+\/?$/.test(path);

    if (typeof $response === "undefined") {
        if (!isSubscriber) {
            $done({});
            return;
        }
        var reqHeaders = {};
        if ($request && $request.headers) {
            for (var rk in $request.headers) {
                if (rk.toLowerCase() === "if-none-match") continue;
                reqHeaders[rk] = $request.headers[rk];
            }
        }
        $done({ headers: reqHeaders });
        return;
    }

    // ============================================================
    // 阶段二：RevenueCat subscriber 响应 → 伪造永久会员
    // ============================================================
    if (isSubscriber) {
        var uid = "$RCAnonymousID:whitecloud";
        var m = url.match(/\/v1\/subscribers\/([^\/?#]+)/);
        if (m && m[1]) {
            try { uid = decodeURIComponent(m[1]); } catch (e) { uid = m[1]; }
        }

        var origBody = ($response && $response.body) || "";
        dbg("RC " + uid, origBody.slice(0, 280));

        var now = new Date();
        function iso(d) {
            return d.toISOString().replace(/\.\d{3}Z$/, "Z");
        }
        var requestDate = iso(now);
        var purchaseDate = iso(new Date(now.getTime() - 86400000 * 400));

        // entitlement key 候选：独立开发者 90% 用其中之一
        var ENTITLEMENT_KEYS = [
            "pro",
            "premium",
            "vip",
            "plus",
            "member",
            "membership",
            "whitecloud",
            "whitecloud_pro",
            "pro_plus",
            "lifetime",
            "annual",
            "unlimited",
            "full"
        ];

        // 产品 ID 候选：只用于让 EntitlementInfo.productIdentifier 有值
        var PRODUCT_IDS = [
            "com.wuxin.WhiteCloud.pro.yearly",
            "com.wuxin.WhiteCloud.pro.monthly",
            "com.wuxin.WhiteCloud.pro.lifetime",
            "com.wuxin.WhiteCloud.yearly",
            "com.wuxin.WhiteCloud.monthly",
            "com.wuxin.WhiteCloud.lifetime",
            "com.wuxin.whitecloud.pro.yearly",
            "com.wuxin.whitecloud.yearly"
        ];

        var entitlements = {};
        for (var i = 0; i < ENTITLEMENT_KEYS.length; i++) {
            entitlements[ENTITLEMENT_KEYS[i]] = {
                expires_date: null,
                grace_period_expires_date: null,
                product_identifier: PRODUCT_IDS[0],
                purchase_date: purchaseDate,
                ownership_type: "PURCHASED"
            };
        }

        var subscriptions = {};
        for (var j = 0; j < PRODUCT_IDS.length; j++) {
            subscriptions[PRODUCT_IDS[j]] = {
                billing_issues_detected_at: null,
                expires_date: null,
                grace_period_expires_date: null,
                is_sandbox: false,
                original_purchase_date: purchaseDate,
                ownership_type: "PURCHASED",
                period_type: "normal",
                purchase_date: purchaseDate,
                refunded_at: null,
                store: "app_store",
                unsubscribe_detected_at: null
            };
        }

        var body = {
            request_date: requestDate,
            request_date_ms: now.getTime(),
            subscriber: {
                entitlements: entitlements,
                first_seen: purchaseDate,
                last_seen: requestDate,
                management_url: null,
                non_subscriptions: {},
                original_app_user_id: uid,
                original_application_version: "2.81",
                original_purchase_date: purchaseDate,
                other_purchases: {},
                subscriptions: subscriptions,
                subscriber_attributes: {}
            }
        };

        // 清掉会让 SDK 认为“响应被篡改/命中缓存”的头
        var resHeaders = {};
        if ($response && $response.headers) {
            for (var hk in $response.headers) {
                var lk = hk.toLowerCase();
                if (lk === "etag" || lk === "x-revenuecat-etag" ||
                    lk === "x-revenuecat-signature" || lk === "x-revenuecat-request-id" ||
                    lk === "content-length" || lk === "content-encoding") {
                    continue;
                }
                resHeaders[hk] = $response.headers[hk];
            }
        }
        resHeaders["Content-Type"] = "application/json";

        $done({
            status: 200,
            headers: resHeaders,
            body: JSON.stringify(body)
        });
        return;
    }

    // ============================================================
    // 阶段三：自有服务端会员接口 → 递归改会员字段
    // 只碰 user-settings / register-device，bootstrap 和天气大 JSON 不动，
    // 避免遍历大响应拖慢启动、也避免误伤 bootstrap 配置。
    // ============================================================
    if (/\/api\/v2\/(users\/user-settings|users\/register-device)/.test(url)) {
        var raw = $response.body;
        dbg("API " + url.split("?")[0].replace(/^https?:\/\/[^\/]+/, ""), (raw || "").slice(0, 280));
        if (!raw) {
            $done({});
            return;
        }

        var obj;
        try {
            obj = JSON.parse(raw);
        } catch (e) {
            // 不是 JSON（比如 bootstrap 的二进制/加密数据），原样放行
            $done({});
            return;
        }

        var FAR_MS = 4102444799000;          // 2099-12-31 23:59:59 UTC (ms)
        var FAR_ISO = "2099-12-31T23:59:59Z";

        var EXPIRE_KEYS = {
            membershipexpires: 1,
            membership_expires: 1,
            membershipexpireat: 1,
            membership_expire_at: 1,
            membershipexpiresat: 1,
            vip_expires: 1,
            vip_expires_at: 1,
            vip_expire_at: 1,
            premium_expires: 1,
            premium_expires_at: 1,
            premium_expire_at: 1,
            pro_expires: 1,
            pro_expires_at: 1,
            subscription_expires: 1,
            subscription_expires_at: 1,
            membership_end: 1,
            membership_end_at: 1
        };

        var BOOL_KEYS = {
            ismember: 1,
            isvip: 1,
            ispremium: 1,
            ispro: 1,
            hasmembership: 1,
            hassubscription: 1,
            issubscribed: 1,
            ispremiumuser: 1,
            isvipuser: 1,
            premium: 1,
            vip: 1
        };

        function walk(v) {
            if (Array.isArray(v)) {
                for (var n = 0; n < v.length; n++) walk(v[n]);
                return;
            }
            if (!v || typeof v !== "object") return;

            var keys = Object.keys(v);
            for (var p = 0; p < keys.length; p++) {
                var k = keys[p];
                var lk = k.toLowerCase();
                var val = v[k];

                if (EXPIRE_KEYS[lk]) {
                    if (typeof val === "number") {
                        v[k] = FAR_MS;
                    } else if (typeof val === "string") {
                        v[k] = FAR_ISO;
                    } else {
                        v[k] = FAR_MS;
                    }
                } else if (BOOL_KEYS[lk]) {
                    if (typeof val === "boolean") v[k] = true;
                    else if (typeof val === "number") v[k] = 1;
                } else if (lk === "membership") {
                    if (typeof val === "boolean") v[k] = true;
                    else if (typeof val === "string" && /^(free|none|basic|expired|inactive)$/i.test(val)) {
                        v[k] = "lifetime";
                    }
                } else if (lk === "tier" || lk === "membershiptier" || lk === "plantier") {
                    if (typeof val === "string" && /^(free|none|basic|default)$/i.test(val)) {
                        v[k] = "lifetime";
                    }
                }

                walk(v[k]);
            }
        }

        walk(obj);
        $done({ body: JSON.stringify(obj) });
        return;
    }

    // 其他 URL：不动
    $done({});
})();

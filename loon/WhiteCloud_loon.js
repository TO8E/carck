/*
 * WhiteCloud 白云天气 2.81 — Loon 插件脚本（单文件）
 *
 * 一个文件同时挂三条规则，靠阶段和 URL 自动分发：
 *  1) http-request   /v1/subscribers/{id}  → 删 If-None-Match，防 304
 *  2) http-response  /v1/subscribers/{id}  → 伪造永久 RevenueCat entitlement
 *  3) http-response  /api/v2/users/...     → 递归改写自有服务端会员字段
 *
 * 插件见同目录 WhiteCloud.plugin。
 */

(function () {
    var url = ($request && $request.url) || "";

    // 调试开关：true 时把命中的关键响应弹通知（每个 URL 只弹一次）。
    // 确认会员逻辑后改回 false。
    var DEBUG = true;

    function notify(title, subtitle, body) {
        try {
            if (typeof $notification !== "undefined" && $notification.post) {
                $notification.post(title, subtitle, body);
            } else if (typeof $notify !== "undefined") {
                $notify(title, subtitle, body);
            }
        } catch (e) {}
    }

    function dbg(tag, msg) {
        if (!DEBUG) return;
        try {
            var key = "wc_dbg_" + tag;
            if (typeof $persistentStore !== "undefined" && $persistentStore.read(key)) return;
            if (typeof $persistentStore !== "undefined") $persistentStore.write("1", key);
        } catch (e) {}
        notify("WhiteCloud", tag, String(msg || "").slice(0, 300));
    }

    // 只认 /v1/subscribers/{id} 本身，不能误伤 /offerings、/attributes 等子路径
    var path = url.split("?")[0].split("#")[0];
    var isSubscriber = /\/v1\/subscribers\/[^\/]+\/?$/.test(path);

    // ============================================================
    // 阶段一：请求头（http-request 阶段没有 $response）
    // ============================================================
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
        // 到期时间给一年后（自然值，避免 2099 这种一眼假的数）
        var expiryDate = iso(new Date(now.getTime() + 86400000 * 365));

        // entitlement key 候选
        // 真实 entitlement id 来自 /v1/product_entitlement_mapping：
        // wc_pro_1m / wc_pro_1y -> entitlements: ["allaccess"]
        var ENTITLEMENT_KEYS = [
            "allaccess"
        ];

        // 产品 ID 候选
        // 真实 product id 来自 offerings：$rc_annual -> wc_pro_1y，$rc_monthly -> wc_pro_1m
        var PRODUCT_IDS = [
            "wc_pro_1y",
            "wc_pro_1m"
        ];

        var entitlements = {};
        for (var i = 0; i < ENTITLEMENT_KEYS.length; i++) {
            entitlements[ENTITLEMENT_KEYS[i]] = {
                expires_date: expiryDate,
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
                expires_date: expiryDate,
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

        // 优先在「原始响应」上改：形状与真实响应完全一致，排除解码问题。
        var body = null;
        try {
            var real = JSON.parse(origBody);
            if (real && real.subscriber) body = real;
        } catch (e) {}

        if (!body) body = {
            request_date: requestDate,
            request_date_ms: now.getTime(),
            subscriber: {
                entitlements: entitlements,
                first_seen: purchaseDate,
                last_seen: requestDate,
                management_url: "https://apps.apple.com/account/subscriptions",
                non_subscriptions: {},
                original_app_user_id: uid,
                original_application_version: "2.81",
                original_purchase_date: purchaseDate,
                other_purchases: {},
                subscriptions: subscriptions,
                subscriber_attributes: {}
            }
        };

        // 无论走真实响应还是合成响应，都把会员权益塞进去
        if (!body.subscriber) body.subscriber = {};
        if (!body.subscriber.entitlements) body.subscriber.entitlements = {};
        if (!body.subscriber.subscriptions) body.subscriber.subscriptions = {};
        for (var ei = 0; ei < ENTITLEMENT_KEYS.length; ei++) {
            body.subscriber.entitlements[ENTITLEMENT_KEYS[ei]] = {
                expires_date: expiryDate,
                grace_period_expires_date: null,
                product_identifier: PRODUCT_IDS[0],
                purchase_date: purchaseDate,
                ownership_type: "PURCHASED"
            };
        }
        for (var si = 0; si < PRODUCT_IDS.length; si++) {
            body.subscriber.subscriptions[PRODUCT_IDS[si]] = {
                billing_issues_detected_at: null,
                expires_date: expiryDate,
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
        if (!body.subscriber.original_application_version) body.subscriber.original_application_version = "2.81";
        if (!body.subscriber.original_purchase_date) body.subscriber.original_purchase_date = purchaseDate;
        if (!body.subscriber.management_url) body.subscriber.management_url = "https://apps.apple.com/account/subscriptions";
        if (!body.request_date) body.request_date = requestDate;
        if (!body.request_date_ms) body.request_date_ms = now.getTime();

        // 关键：删掉 x-signature。
        // 原响应带 ECDSA 签名，body 被替换后签名必然对不上；
        // RevenueCat 在 enforced 模式下会抛 entitlementVerificationFailed 并丢弃 body。
        // 去掉签名头后 SDK 判定为 notRequested，直接采用 body。
        // 同时按小写去重 content-type（Loon/QX 会把同名头拼成 "a, a"），
        // 并删掉 etag / content-length / content-encoding 等与 body 相关的头。
        var DROP = {
            "x-signature": 1,
            "etag": 1,
            "x-revenuecat-etag": 1,
            "x-revenuecat-signature": 1,
            "x-revenuecat-request-time": 1,
            "content-length": 1,
            "content-encoding": 1,
            "content-type": 1
        };
        var resHeaders = {};
        if ($response && $response.headers) {
            for (var hk in $response.headers) {
                if (DROP[hk.toLowerCase()]) continue;
                resHeaders[hk] = $response.headers[hk];
            }
        }
        resHeaders["Content-Type"] = "application/json";

        // 自检：确认脚本版本与最终发出的头（有 x-signature 说明还是旧脚本）
        dbg("RC-OUT", "sig=" + ($response && $response.headers && $response.headers["x-signature"] ? "IN" : "OUT") +
            " hdr=" + JSON.stringify(Object.keys(resHeaders)).slice(0, 200));

        $done({
            headers: resHeaders,
            body: JSON.stringify(body)
        });
        return;
    }

    // ============================================================
    // 探针：bootstrap 里找会员相关字段（只通知，不改写）
    // ============================================================
    if (/\/api\/v2\/bootstrap/.test(url)) {
        var bootRaw = $response.body || "";
        var hits = [];
        try {
            var bootObj = JSON.parse(bootRaw);
            (function walkBoot(v, path, depth) {
                if (hits.length >= 8 || depth > 10) return;
                if (Array.isArray(v)) {
                    for (var bi = 0; bi < Math.min(v.length, 5); bi++) walkBoot(v[bi], path + "[" + bi + "]", depth + 1);
                    return;
                }
                if (!v || typeof v !== "object") return;
                for (var bk in v) {
                    var blk = bk.toLowerCase();
                    if (/member|vip|premium|subscri|entitle|expire|tier/.test(blk)) {
                        hits.push(path + "." + bk + "=" + JSON.stringify(v[bk]).slice(0, 60));
                    }
                    walkBoot(v[bk], path + "." + bk, depth + 1);
                }
            })(bootObj, "", 0);
            dbg("BOOT", hits.length ? hits.join(" | ") : "no member keys (json ok, len=" + bootRaw.length + ")");
        } catch (e) {
            dbg("BOOT", "non-json len=" + bootRaw.length + " head=" + bootRaw.slice(0, 80));
        }
        $done({});
        return;
    }

    // ============================================================
    // 阶段三：自有服务端会员接口 → 递归改会员字段
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
            $done({});
            return;
        }

        // 统一成「一年后」，避免 2099 这种一眼假的数值被 app 做范围校验
        var FAR_MS = Date.now() + 86400000 * 365;
        var FAR_ISO = new Date(FAR_MS).toISOString().replace(/\.\d{3}Z$/, "Z");

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

        // 服务端 user DTO 里只带 membershipExpires，没有布尔开关。
        // 若 app 读的是 isMember/membership 之类字段，缺失时会当成非会员，
        // 这里显式补齐（只在缺失时补，不覆盖已有值）。
        function isUserDTO(v) {
            if (!v || typeof v !== "object") return false;
            return ("membershipExpires" in v) || ("deviceToken" in v && "_id" in v);
        }
        function topUp(v, depth) {
            if (depth > 4 || !v || typeof v !== "object") return;
            if (isUserDTO(v)) {
                if (!("membership" in v)) v.membership = "lifetime";
                if (!("tier" in v)) v.tier = "lifetime";
                if (!("isMember" in v)) v.isMember = true;
                if (!("isVip" in v)) v.isVip = true;
                if (!("isPremium" in v)) v.isPremium = true;
            }
            for (var tk in v) topUp(v[tk], depth + 1);
        }
        topUp(obj, 0);
        $done({ body: JSON.stringify(obj) });
        return;
    }

    $done({});
})();

/*
 * WhiteCloud — 自有 API 会员字段递归改写
 * 命中: https://untech.cc/api/v2/*  (含 bootstrap / users/user-settings / register-device)
 *       https://www.sunlitt.app/api/v2/*
 *
 * app 的自有服务端会下发 membershipExpires（见二进制字符串），
 * 这里递归把任何层级里的会员到期时间推到 2099，并把布尔类会员开关置 true。
 * 其余字段原样保留，避免 Codable 解码失败。
 */

(function () {
    var body = $response.body;
    if (!body) {
        $done({});
        return;
    }

    var obj;
    try {
        obj = JSON.parse(body);
    } catch (e) {
        // 不是 JSON（比如 bootstrap 的加密/二进制），原样放行
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
            for (var i = 0; i < v.length; i++) walk(v[i]);
            return;
        }
        if (!v || typeof v !== "object") return;

        var keys = Object.keys(v);
        for (var n = 0; n < keys.length; n++) {
            var k = keys[n];
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
})();

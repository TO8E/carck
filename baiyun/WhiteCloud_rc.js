/*
 * WhiteCloud (白云天气) 2.81 — RevenueCat v1 subscribers 响应伪造
 * 命中: GET https://api.revenuecat.com/v1/subscribers/{app_user_id}
 *       GET https://api-production.8-lives-cat.io/v1/subscribers/{app_user_id}
 *
 * 思路: app 通过 RevenueCat CustomerInfo.entitlements.active 判断会员。
 *      直接构造一个 expires_date = null(永久) 的 subscriber 响应，
 *      entitlements 里铺满常见 key，命中任意一个就能过 isPremium 判断。
 */

var url = $request.url;

var uid = "$RCAnonymousID:whitecloud";
var m = url.match(/\/v1\/subscribers\/([^\/?#]+)/);
if (m && m[1]) {
    try { uid = decodeURIComponent(m[1]); } catch (e) { uid = m[1]; }
}

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

// 产品 ID 候选：只用于让 EntitlementInfo.productIdentifier 有值，
// app 若拿它去查 StoreKit 价格查不到也不影响会员判定。
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
var headers = {};
if ($response && $response.headers) {
    for (var k in $response.headers) {
        var lk = k.toLowerCase();
        if (lk === "etag" || lk === "x-revenuecat-etag" ||
            lk === "x-revenuecat-signature" || lk === "x-revenuecat-request-id" ||
            lk === "content-length" || lk === "content-encoding") {
            continue;
        }
        headers[k] = $response.headers[k];
    }
}
headers["Content-Type"] = "application/json";

$done({
    status: 200,
    headers: headers,
    body: JSON.stringify(body)
});

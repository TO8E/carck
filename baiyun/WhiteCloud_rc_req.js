/*
 * WhiteCloud — RevenueCat 请求头处理
 * 作用: 删掉 If-None-Match，防止 RevenueCat 返回 304 导致响应脚本拿不到 body。
 * 命中: GET https://api.revenuecat.com/v1/subscribers/{app_user_id}
 *       GET https://api-production.8-lives-cat.io/v1/subscribers/{app_user_id}
 */

var headers = {};
if ($request && $request.headers) {
    for (var k in $request.headers) {
        if (k.toLowerCase() === "if-none-match") continue;
        headers[k] = $request.headers[k];
    }
}

$done({ headers: headers });

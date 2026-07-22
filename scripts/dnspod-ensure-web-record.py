#!/usr/bin/env python3
"""DNSPod 记录管理：确保 web.dailecheng.xyz 的 A 记录指向指定 IP。"""
import hashlib, hmac, json, os, re, sys, time, urllib.request

def load_cred(path):
    sid = skey = None
    with open(path) as f:
        for line in f:
            m = re.match(r'SAVED_Tencent_SecretId=[\'"]?(.+?)[\'"]?\s*$', line)
            if m: sid = m.group(1)
            m = re.match(r'SAVED_Tencent_SecretKey=[\'"]?(.+?)[\'"]?\s*$', line)
            if m: skey = m.group(1)
    if not sid or not skey:
        sys.exit("缺少 Tencent 凭证")
    return sid, skey

def sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()

def call(sid, skey, action, payload):
    service, host, version = "dnspod", "dnspod.tencentcloudapi.com", "2021-03-23"
    ts = int(time.time())
    body = json.dumps(payload)
    canonical = f"POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:{host}\nx-tc-action:{action.lower()}\n\ncontent-type;host;x-tc-action\n{hashlib.sha256(body.encode()).hexdigest()}"
    scope = f"{time.strftime('%Y-%m-%d', time.gmtime(ts))}/{service}/tc3_request"
    sts = f"TC3-HMAC-SHA256\n{ts}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}"
    sig = hmac.new(sign(sign(sign(("TC3" + skey).encode(), scope.split('/')[0]), service), "tc3_request"), sts.encode(), hashlib.sha256).hexdigest()
    auth = f"TC3-HMAC-SHA256 Credential={sid}/{scope}, SignedHeaders=content-type;host;x-tc-action, Signature={sig}"
    req = urllib.request.Request(f"https://{host}/", data=body.encode(), headers={
        "Authorization": auth, "Content-Type": "application/json; charset=utf-8",
        "Host": host, "X-TC-Action": action, "X-TC-Timestamp": str(ts), "X-TC-Version": version})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

sid, skey = load_cred(os.path.expanduser("~/.acme.sh/account.conf"))
DOMAIN, SUB, IP = "dailecheng.xyz", "web", "124.221.177.197"

resp = call(sid, skey, "DescribeRecordList", {"Domain": DOMAIN, "Subdomain": SUB})
err = resp.get("Response", {}).get("Error")
if err:
    sys.exit(f"查询失败: {err.get('Code')} {err.get('Message')}")
records = resp["Response"].get("RecordList", [])
for rec in records:
    print(f"已有记录: {rec['Name']} {rec['Type']} {rec['Value']} (id={rec['RecordId']})")
if any(r["Type"] == "A" and r["Value"] == IP for r in records):
    print("A 记录已存在且正确，无需变更")
    sys.exit(0)

resp = call(sid, skey, "CreateRecord", {"Domain": DOMAIN, "SubDomain": SUB, "RecordType": "A", "RecordLine": "默认", "Value": IP, "TTL": 600})
err = resp.get("Response", {}).get("Error")
if err:
    sys.exit(f"创建失败: {err.get('Code')} {err.get('Message')}")
print(f"已创建: {SUB}.{DOMAIN} A -> {IP} (RecordId={resp['Response'].get('RecordId')})")

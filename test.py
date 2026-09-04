import urllib.request, json, time
url = 'https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app/auth/access_code.json'
payload = json.dumps({'code': 'test12345', 'note': 'Test note', 'updatedAt': int(time.time() * 1000), 'updatedBy': 'Tester', 'updatedTimeStr': '04/09/2026 19:52:00'}).encode('utf-8')
req = urllib.request.Request(url, data=payload, method='PUT', headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=4) as res:
        print('FIREBASE PUT SUCCESS:', res.read().decode())
except Exception as e:
    print('FIREBASE PUT ERROR:', e)

# Test GET
req_get = urllib.request.Request(url + '?t=' + str(int(time.time()*1000)))
try:
    with urllib.request.urlopen(req_get, timeout=4) as res:
        print('FIREBASE GET SUCCESS:', res.read().decode())
except Exception as e:
    print('FIREBASE GET ERROR:', e)

# Test Webhook
wh_url = 'https://ptb.discord.com/api/webhooks/1545410985198747738/M535wrLZA8Peczqn9boiW2q6P5D1T0CJT6L3Iv828nvKmr2Yik0_QsSMiaHWg7wX3YZF'
wh_payload = json.dumps({
    "username": "TPlus License Security",
    "embeds": [{
        "title": "🔐 TEST WEBHOOK",
        "description": "Test setcode webhook",
        "color": 0x22C55E
    }]
}).encode('utf-8')
wh_req = urllib.request.Request(wh_url, data=wh_payload, method='POST', headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(wh_req, timeout=4) as res:
        print('WEBHOOK POST SUCCESS (status):', res.status)
except Exception as e:
    print('WEBHOOK POST ERROR:', e)

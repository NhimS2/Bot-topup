import urllib.request, json, time
url = 'https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app/bot_status.json'
payload = json.dumps({'online': True, 'lastActive': int(time.time() * 1000)}).encode('utf-8')
req = urllib.request.Request(url, data=payload, method='PUT', headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=3) as res:
        print('SUCCESS:', res.read())
except Exception as e:
    print('ERROR:', e)

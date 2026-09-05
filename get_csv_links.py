import urllib.request, json
url = "https://dados.gov.br/api/3/action/package_search?q=agenda-de-autoridades"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        for pkg in data.get('result', {}).get('results', []):
            if pkg['name'] == 'agenda-de-autoridades':
                for res in pkg.get('resources', []):
                    if 'csv' in res.get('format', '').lower():
                        print(res['name'], res['url'])
except Exception as e:
    print("Error:", e)

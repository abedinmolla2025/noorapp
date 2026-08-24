from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

BASE = 'https://noorapp.in'
PATHS = ['/', '/about', '/contact', '/privacy-policy', '/terms', '/sources', '/sitemap', '/quran', '/hadith', '/dua', '/prayer-times', '/prayer-guide', '/qibla', '/tasbih', '/99-names', '/baby-names', '/calendar', '/quiz', '/stories', '/islamic-app', '/download']
for path in PATHS:
    url = urljoin(BASE, path)
    try:
        r = requests.get(url, timeout=25, allow_redirects=True)
        soup = BeautifulSoup(r.text, 'html.parser')
        title = soup.title.get_text(' ', strip=True) if soup.title else ''
        canonical = soup.find('link', rel='canonical')
        robots = soup.find('meta', attrs={'name': 'robots'})
        desc = soup.find('meta', attrs={'name': 'description'})
        links = [urljoin(r.url, a.get('href')) for a in soup.find_all('a', href=True)]
        local = [x for x in links if urlparse(x).netloc in ('noorapp.in', 'www.noorapp.in')]
        print(f'{path}\t{r.status_code}\t{len(r.content)}\t{title[:80]}\tcanonical={canonical.get("href", "") if canonical else "MISSING"}\trobots={robots.get("content", "") if robots else "default"}\tdesc={bool(desc and desc.get("content"))}\tlinks={len(local)}')
    except Exception as exc:
        print(f'{path}\tERROR\t{exc}')

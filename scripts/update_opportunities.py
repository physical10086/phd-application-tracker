#!/usr/bin/env python3
"""Daily opportunity discovery for the static PhD tracker.

Principles:
- Only store items backed by an accessible source URL.
- Missing fields are written as “来源未说明”; no guessing.
- Preserve user/application fields when an existing item is refreshed.
- Prefer official university/research pages; discovery can use Bing RSS or optional Serper.
"""
from __future__ import annotations
import os, re, json, time, hashlib, html as htmlmod
from datetime import date
from pathlib import Path
from urllib.parse import quote_plus, urlsplit, urlunsplit
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CONFIG = ROOT / "config"
UA = {"User-Agent": "Mozilla/5.0 (compatible; PhDOpportunityTracker/1.0; +personal-research-tracker)"}
TODAY = date.today().isoformat()


def load(path, default):
    try: return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception: return default

def canonical(url: str) -> str:
    try:
        u=urlsplit(url); return urlunsplit((u.scheme or "https",u.netloc.lower(),u.path.rstrip("/"),"",""))
    except Exception: return url

def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", htmlmod.unescape(s or "")).strip()

def search_bing_rss(query: str, limit=10):
    url = "https://www.bing.com/search?format=rss&q=" + quote_plus(query)
    try:
        r=requests.get(url,headers=UA,timeout=20); r.raise_for_status()
        soup=BeautifulSoup(r.text,"xml")
        return [{"title":clean_text(i.title.get_text() if i.title else ""),"url":clean_text(i.link.get_text() if i.link else ""),"snippet":clean_text(i.description.get_text(" ") if i.description else "")} for i in soup.find_all("item")[:limit]]
    except Exception as e:
        print("Bing search failed",query,e); return []

def search_serper(query: str, limit=10):
    key=os.getenv("SERPER_API_KEY")
    if not key: return []
    try:
        r=requests.post("https://google.serper.dev/search",headers={"X-API-KEY":key,"Content-Type":"application/json"},json={"q":query,"num":limit},timeout=20); r.raise_for_status()
        out=[]
        for x in r.json().get("organic",[])[:limit]: out.append({"title":x.get("title","") or "","url":x.get("link","") or "","snippet":x.get("snippet","") or ""})
        return out
    except Exception as e:
        print("Serper search failed",query,e); return []

def search(query: str, limit=10):
    got=search_serper(query,limit)
    return got if got else search_bing_rss(query,limit)

def fetch(url: str):
    try:
        r=requests.get(url,headers=UA,timeout=25,allow_redirects=True)
        if r.status_code in (404,410): return {"ok":False,"status":r.status_code,"url":r.url,"title":"","text":""}
        if r.status_code >= 400: return {"ok":None,"status":r.status_code,"url":r.url,"title":"","text":""}
        ctype=r.headers.get("content-type","")
        if "text/html" not in ctype and "application/xhtml" not in ctype: return {"ok":True,"status":r.status_code,"url":r.url,"title":"","text":""}
        soup=BeautifulSoup(r.text,"html.parser")
        for x in soup(["script","style","nav","footer","noscript"]): x.decompose()
        title=clean_text(soup.title.get_text(" ") if soup.title else "")
        text=clean_text(soup.get_text(" "))
        return {"ok":True,"status":r.status_code,"url":r.url,"title":title,"text":text}
    except Exception as e:
        print("Fetch failed",url,e); return {"ok":None,"status":0,"url":url,"title":"","text":""}

def extract_deadline(text: str) -> str:
    patterns=[
      r"(?:deadline|closing date|apply by|application deadline)[^\.\n]{0,60}?(20\d{2}[-/]\d{1,2}[-/]\d{1,2})",
      r"(?:deadline|closing date|apply by|application deadline)[^\.\n]{0,70}?(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})",
      r"(?:deadline|closing date|apply by|application deadline)[^\.\n]{0,70}?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2})"
    ]
    for p in patterns:
        m=re.search(p,text,re.I)
        if m:return clean_text(m.group(1))
    if re.search(r"until (?:the position is )?filled|rolling",text,re.I): return "滚动至招满"
    return "来源未说明"

def sentences(text: str):
    return [clean_text(x) for x in re.split(r"(?<=[.!?])\s+",text) if len(clean_text(x))>30]

def excerpt(text: str, keys, n=2):
    picked=[]
    for s in sentences(text):
        lo=s.lower()
        if any(k.lower() in lo for k in keys):
            picked.append(s[:500])
            if len(picked)>=n:break
    return " ".join(picked) if picked else "来源未说明"

def infer_location_from_source(text: str):
    known=[("Zurich","Switzerland"),("Zürich","Switzerland"),("Eindhoven","Netherlands"),("Stuttgart","Germany"),("Tübingen","Germany"),("Bonn","Germany"),("Durham","United Kingdom"),("Florence","Italy"),("Firenze","Italy"),("Innsbruck","Austria"),("Strasbourg","France"),("Glasgow","United Kingdom")]
    for city,country in known:
        if re.search(r"\b"+re.escape(city)+r"\b",text,re.I):return country,city
    return "来源未说明","来源未说明"

def score(text: str, profile: dict):
    lo=text.lower(); s=45
    for k in profile.get("keywords",[]):
        if k.lower() in lo:s+=3
    for k in ("rydberg","neutral atom","optical tweezer","quantum computing"):
        if k in lo:s+=5
    if any(x in lo for x in ("experimental","experiment","laser","optics","atomic physics","amo")):s+=5
    return max(50,min(99,round(s)))

def make_id(url,title):
    return "auto-"+hashlib.sha1((canonical(url)+"|"+title.lower()).encode()).hexdigest()[:12]

def candidate_from_page(url, result_title, profile):
    f=fetch(url)
    if f["ok"] is not True:return None,f
    text=f["text"]; lo=text.lower()
    phd_terms=("phd","doctoral","doctorate","studentship","predoc","praedoc")
    wanted=[k.lower() for k in profile.get("keywords",[])]
    hits=[k for k in wanted if k in lo]
    if not any(t in lo for t in phd_terms):return None,f
    if len(hits)<2 and not ("rydberg" in lo and "quantum" in lo):return None,f
    closed=bool(re.search(r"applications? (?:are )?closed|position (?:has been )?filled|vacancy (?:is )?closed|deadline has passed",lo))
    explicit=bool(re.search(r"phd position|doctoral position|phd studentship|doctoral candidate|phd candidate",lo))
    country,city=infer_location_from_source(text)
    title=result_title or f["title"] or "PhD opportunity"
    req=excerpt(text,["requirements","profile","qualification","candidate","should have","must have"],3)
    desc=excerpt(text,["rydberg","neutral atom","optical tweezer","quantum computing","quantum simulation"],3)
    directions=[]
    for k in profile.get("keywords",[]):
        if k.lower() in lo and k not in directions: directions.append(k)
    if not directions:directions=["来源未说明"]
    host=urlsplit(f["url"]).netloc.replace("www.","")
    item={
      "id":make_id(f["url"],title),"type":"明确岗位" if explicit else "课题组机会","title":title,
      "institution":"来源未说明","country":country,"city":city,"supervisor_lab":"来源未说明",
      "research_direction":directions[:6],"deadline":extract_deadline(text),"first_found":TODAY,
      "match_score":score(text,profile),"open_state":"已关闭" if closed else "开放" if re.search(r"open positions?|we are hiring|apply|applications",lo) else "来源未说明",
      "application_status":"感兴趣","status_note":"自动检索发现；提交前请打开原始来源复核。",
      "description":desc,"requirements":req,"source_url":f["url"],"source_name":host,
      "source_verified":True,"last_checked":TODAY,"fail_count":0
    }
    return item,f

def refresh_existing(items):
    verified=invalid=0
    for o in items:
        url=o.get("source_url")
        if not url:continue
        f=fetch(url)
        if f["ok"] is True:
            verified+=1;o["source_verified"]=True;o["last_checked"]=TODAY;o["fail_count"]=0
            lo=f["text"].lower()
            if re.search(r"applications? (?:are )?closed|position (?:has been )?filled|vacancy (?:is )?closed",lo):o["open_state"]="已关闭"
            d=extract_deadline(f["text"])
            if d!="来源未说明" and o.get("deadline") in (None,"","来源未说明"):o["deadline"]=d
        elif f["ok"] is False:
            invalid+=1;o["fail_count"]=int(o.get("fail_count",0))+1;o["last_checked"]=TODAY
            if o["fail_count"]>=2:o["source_verified"]=False;o["open_state"]="来源链接失效"
        time.sleep(.15)
    return verified,invalid

def main():
    profile=load(CONFIG/"search_profile.json",{})
    sources=load(CONFIG/"sources.json",{})
    items=load(DATA/"opportunities.json",[])
    verified,invalid=refresh_existing(items)
    existing_urls={canonical(x.get("source_url","")) for x in items}
    existing_titles={re.sub(r"\W+","",x.get("title","").lower())[:100] for x in items}
    key_query='("Rydberg" OR "neutral atom" OR "optical tweezer") (PhD OR doctoral) ("quantum computing" OR "quantum simulation" OR "quantum hardware")'
    queries=[key_query]
    priority=["ethz.ch","mpq.mpg.de","uni-stuttgart.de","uni-tuebingen.de","strath.ac.uk","durham.ac.uk","uibk.ac.at","uni-bonn.de","unistra.fr","unifi.it","euraxess.ec.europa.eu","academictransfer.com"]
    queries += [f'site:{d} {key_query}' for d in priority]
    results=[]
    for q in queries:
        results.extend(search(q,8));time.sleep(.25)
    new=[];seen=set()
    for r in results:
        u=canonical(r.get("url",""))
        if not u or u in seen or u in existing_urls:continue
        seen.add(u)
        item,f=candidate_from_page(r.get("url",""),r.get("title",""),profile)
        if not item:continue
        titlekey=re.sub(r"\W+","",item["title"].lower())[:100]
        if titlekey in existing_titles:continue
        new.append(item);existing_urls.add(canonical(item["source_url"]));existing_titles.add(titlekey)
        if len(new)>=20:break
        time.sleep(.2)
    items.extend(new)
    DATA.mkdir(exist_ok=True)
    (DATA/"opportunities.json").write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding="utf-8")
    (DATA/"opportunities.js").write_text("window.SEED_OPPORTUNITIES = "+json.dumps(items,ensure_ascii=False,indent=2)+";\n",encoding="utf-8")
    log=load(DATA/"search_log.json",[])
    log.append({"date":TODAY,"new_items":len(new),"verified_links":verified,"invalid_links":invalid,"note":f"自动检索 {len(queries)} 组查询；仅保存可访问且与关键词匹配的来源。缺失字段保留为‘来源未说明’。"})
    log=log[-120:]
    (DATA/"search_log.json").write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding="utf-8")
    (DATA/"search_log.js").write_text("window.SEARCH_LOG = "+json.dumps(log,ensure_ascii=False,indent=2)+";\n",encoding="utf-8")
    print(f"Done. refreshed={verified}, invalid={invalid}, new={len(new)}, total={len(items)}")

if __name__=="__main__":main()

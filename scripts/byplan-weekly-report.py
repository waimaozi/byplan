#!/usr/bin/env python3
"""Build a weekly byplan marketing report from Yandex APIs."""

import argparse
import csv
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

DIRECT_CAMPAIGN_ID = 714557796
METRIKA_COUNTER = 108522505
WEBMASTER_USER_ID = 2286558141
WEBMASTER_HOST = "https:byplan.ru:443"  # Webmaster host_id format (scheme:host:port), as returned by /user/{id}/hosts
GOALS = {"contact": 618037880, "partial": 618037945, "submit": 618038005, "button": 618038081}
JUNK_PATTERNS = [
    r"\b\d{1,2}[\s-]?\d{3}[а-я]?\b", r"\bп[\s-]?\d{2}", r"\b(ii|и)[\s-]?\d{2,3}",
    r"типов|серии|серия|хрущ|сталинк|брежнев|панельн",
    r"бесплат|онлайн|программ|скачать|приложени|конструктор|редактор|planner|5d|3d|3д",
    r"нейросет|\bии\b|\bai\b|gpt|по фото|генер", r"дом[а-я]*\b(?! в)|коттедж|дач[аи]|баня|гараж|участ",
    r"обои|штукатур|плитк|ламинат|краск|потол|ремонт", r"купить|продаж|аренд|снять|ипотек|вычет|жк\b|новостро",
    r"своими руками|самостоятельно|нарисовать|сделать|создать", r"\bмебел|диван|кроват|шкаф|кухн",
    r"курс|обучен|вакан|работа\b",
]
COMPILED_JUNK = [re.compile(pattern, re.I) for pattern in JUNK_PATTERNS]


def request(url, token, oauth=False, data=None, headers=None):
    request_headers = {"Authorization": f"{'OAuth' if oauth else 'Bearer'} {token}"}
    request_headers.update(headers or {})
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, dict(response.headers), response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read().decode("utf-8", "replace")


def get_json(url, token):
    status, _, text = request(url, token, oauth=True)
    if status != 200:
        raise RuntimeError(f"HTTP {status}: {text[:500]}")
    return json.loads(text)


def direct_report(token, date_from, date_to, report_type, fields, label):
    body = {"params": {"SelectionCriteria": {"DateFrom": date_from, "DateTo": date_to,
            "Filter": [{"Field": "CampaignId", "Operator": "IN", "Values": [str(DIRECT_CAMPAIGN_ID)]}]},
            "FieldNames": fields, "ReportName": f"byplan-{label}-{date_from}-{date_to}-{int(time.time())}",
            "ReportType": report_type, "DateRangeType": "CUSTOM_DATE", "Format": "TSV",
            "IncludeVAT": "YES", "IncludeDiscount": "NO"}}
    headers = {"Accept-Language": "ru", "Content-Type": "application/json",
               "returnMoneyInMicros": "false", "skipReportHeader": "true",
               "skipReportSummary": "true", "skipColumnHeader": "false"}
    for attempt in range(12):
        status, response_headers, text = request("https://api.direct.yandex.com/json/v5/reports", token,
                                                  data=body, headers=headers)
        if status == 200:
            return list(csv.DictReader(io.StringIO(text), delimiter="\t"))
        if status not in (201, 202):
            raise RuntimeError(f"HTTP {status}: {text[:500]}")
        if attempt < 11:
            time.sleep(int(response_headers.get("retryIn", 5)))
    raise RuntimeError("Отчёт не готов после 12 попыток")


def number(value):
    try:
        return float(str(value or 0).replace(",", "."))
    except ValueError:
        return 0.0


def fmt(value):
    return f"{number(value):.2f}"


def error_section(title, exc):
    return [f"## {title}", "", f"_error: {str(exc).replace(chr(10), ' ')}_", ""]


def campaign_section(token, date_from, date_to):
    title = "Яндекс Директ — итоги кампании"
    try:
        fields = ["Impressions", "Clicks", "Ctr", "Cost", "AvgCpc", "Conversions"]
        rows = direct_report(token, date_from, date_to, "CAMPAIGN_PERFORMANCE_REPORT", fields, "camp")
        totals = {field: sum(number(row.get(field)) for row in rows) for field in fields}
        totals["Ctr"] = 100 * totals["Clicks"] / totals["Impressions"] if totals["Impressions"] else 0
        totals["AvgCpc"] = totals["Cost"] / totals["Clicks"] if totals["Clicks"] else 0
        return [f"## {title}", "", "| Показы | Клики | CTR, % | Расход | Ср. CPC | Конверсии |",
                "|---:|---:|---:|---:|---:|---:|",
                f"| {totals['Impressions']:.0f} | {totals['Clicks']:.0f} | {totals['Ctr']:.2f} | {totals['Cost']:.2f} | {totals['AvgCpc']:.2f} | {totals['Conversions']:.0f} |", ""]
    except Exception as exc:
        return error_section(title, exc)


def negative_keywords(token):
    body = {"method": "get", "params": {"SelectionCriteria": {"Ids": [DIRECT_CAMPAIGN_ID]},
                                             "FieldNames": ["NegativeKeywords"]}}
    status, _, text = request("https://api.direct.yandex.com/json/v5/campaigns", token,
                              data=body, headers={"Accept-Language": "ru", "Content-Type": "application/json"})
    if status != 200:
        raise RuntimeError(f"HTTP {status}: {text[:500]}")
    campaign = json.loads(text).get("result", {}).get("Campaigns", [{}])[0]
    value = campaign.get("NegativeKeywords") or {}
    return {str(item).casefold() for item in value.get("Items", [])}


def matched_tokens(query):
    found = set()
    words = list(re.finditer(r"[^\s]+", query))
    for index, pattern in enumerate(COMPILED_JUNK):
        for match in pattern.finditer(query):
            if index == 0:
                found.add(match.group(0).strip().casefold())
            else:
                found.update(word.group(0).strip(".,;:!?()[]{}\"'«»").casefold()
                             for word in words if word.start() < match.end() and word.end() > match.start())
    return {item for item in found if item}


def queries_section(token, date_from, date_to):
    title = "Яндекс Директ — поисковые запросы"
    try:
        fields = ["Query", "Impressions", "Clicks", "Cost", "Conversions"]
        rows = direct_report(token, date_from, date_to, "SEARCH_QUERY_PERFORMANCE_REPORT", fields, "queries")
        rows.sort(key=lambda row: (number(row.get("Cost")), number(row.get("Clicks"))), reverse=True)
        lines = [f"## {title}", "", "### Топ-25 по расходу", "",
                 "| Запрос | Показы | Клики | Расход | Конверсии |", "|---|---:|---:|---:|---:|"]
        for row in rows[:25]:
            lines.append(f"| {row.get('Query', '').replace('|', '\\|')} | {fmt(row.get('Impressions'))} | {fmt(row.get('Clicks'))} | {fmt(row.get('Cost'))} | {fmt(row.get('Conversions'))} |")
        lines += ["", f"Итого: показы — {sum(number(r.get('Impressions')) for r in rows):.0f}; клики — {sum(number(r.get('Clicks')) for r in rows):.0f}; расход — {sum(number(r.get('Cost')) for r in rows):.2f}; конверсии — {sum(number(r.get('Conversions')) for r in rows):.0f}.", ""]
        junk = [(row, matched_tokens(row.get("Query", ""))) for row in rows]
        junk = [(row, tokens) for row, tokens in junk if tokens]
        lines += ["### Мусорные запросы", "", f"Итого: показы — {sum(number(r.get('Impressions')) for r, _ in junk):.0f}; клики — {sum(number(r.get('Clicks')) for r, _ in junk):.0f}; расход — {sum(number(r.get('Cost')) for r, _ in junk):.2f}.", "",
                  "| Запрос | Показы | Клики | Расход |", "|---|---:|---:|---:|"]
        for row, _ in junk[:30]:
            lines.append(f"| {row.get('Query', '').replace('|', '\\|')} | {fmt(row.get('Impressions'))} | {fmt(row.get('Clicks'))} | {fmt(row.get('Cost'))} |")
        existing = negative_keywords(token)
        costs = defaultdict(float)
        for row, tokens in junk:
            for item in tokens - existing:
                costs[item] += number(row.get("Cost"))
        lines += ["", "### Предлагаемые минус-фразы", ""]
        lines += [f"- {item} — {cost:.2f}" for item, cost in sorted(costs.items(), key=lambda pair: (-pair[1], pair[0]))]
        return lines + [""]
    except Exception as exc:
        return error_section(title, exc)


def webmaster_section(token, date_from, date_to):
    title = "Яндекс Вебмастер"
    try:
        base = f"https://api.webmaster.yandex.net/v4/user/{WEBMASTER_USER_ID}/hosts/{WEBMASTER_HOST}"
        summary = get_json(base + "/summary", token)
        diagnostics = get_json(base + "/diagnostics", token)
        search_urls = get_json(base + "/search-urls/in-search/samples?limit=100", token)
        events = get_json(base + "/search-urls/events/samples?limit=100", token)
        params = urllib.parse.urlencode([("order_by", "TOTAL_SHOWS"), ("query_indicator", "TOTAL_SHOWS"),
            ("query_indicator", "TOTAL_CLICKS"), ("query_indicator", "AVG_SHOW_POSITION"),
            ("date_from", date_from), ("date_to", date_to), ("limit", 20)])
        queries = get_json(base + "/search-queries/popular?" + params, token)
        quota = get_json(base + "/recrawl/quota", token)
        problems = [(name, item.get("severity")) for name, item in diagnostics.get("problems", {}).items() if item.get("state") == "PRESENT"]
        urls = [item.get("url", "") for item in search_urls.get("samples", []) if "/blog/" in item.get("url", "")]
        blog_events = [item for item in events.get("samples", []) if "/blog/" in item.get("url", "")]
        lines = [f"## {title}", "", f"Страниц в поиске: {summary.get('searchable_pages_count', 0)}; исключено: {summary.get('excluded_pages_count', 0)}; ИКС: {summary.get('sqi', 0)}.", "",
                 "### Диагностика", ""] + ([f"- {name} ({severity})" for name, severity in problems] or ["- нет"])
        lines += ["", f"### Страницы блога в поиске ({len(urls)})", ""] + [f"- {url}" for url in urls]
        lines += ["", "### События страниц блога", ""] + [f"- {item.get('url', '')}: {item.get('event', '')}; {item.get('excluded_url_status', '')}" for item in blog_events]
        lines += ["", "### Популярные запросы", "", "| Запрос | Показы | Клики | Ср. позиция |", "|---|---:|---:|---:|"]
        for item in queries.get("queries", []):
            indicators = item.get("indicators") or {}
            lines.append(f"| {str(item.get('query_text', '')).replace('|', '\\|')} | {number(indicators.get('TOTAL_SHOWS')):.0f} | {number(indicators.get('TOTAL_CLICKS')):.0f} | {number(indicators.get('AVG_SHOW_POSITION')):.2f} |")
        lines += ["", f"Квота на переобход: {json.dumps(quota, ensure_ascii=False)}", ""]
        return lines
    except Exception as exc:
        return error_section(title, exc)


def metrika_table(data, dimension_title, metrics):
    lines = [f"| {dimension_title} | " + " | ".join(metrics) + " |", "|---|" + "---:|" * len(metrics)]
    for row in data.get("data", []):
        name = ((row.get("dimensions") or [{}])[0].get("name") or "—").replace("|", "\\|")
        lines.append(f"| {name} | " + " | ".join(fmt(value) for value in row.get("metrics", [])) + " |")
    totals = (data.get("totals") or [])
    if totals:
        lines.append("| Итого | " + " | ".join(fmt(value) for value in totals) + " |")
    return lines


def metrika_section(token, date_from, date_to):
    title = "Яндекс Метрика"
    try:
        base = "https://api-metrika.yandex.net/stat/v1/data?"
        common = {"ids": METRIKA_COUNTER, "date1": date_from, "date2": date_to}
        blog_params = {**common, "metrics": "ym:pv:pageviews,ym:pv:users", "dimensions": "ym:pv:URLPath",
                       "filters": "ym:pv:URLPath=~'^/blog/'", "sort": "-ym:pv:pageviews", "limit": 20}
        blog = get_json(base + urllib.parse.urlencode(blog_params), token)
        metrics = "ym:s:visits," + ",".join(f"ym:s:goal{goal}reaches" for goal in GOALS.values())
        source_params = {**common, "metrics": metrics, "dimensions": "ym:s:lastTrafficSource",
                         "sort": "-ym:s:visits", "limit": 10}
        campaign_params = {**common, "metrics": metrics, "dimensions": "ym:s:lastDirectClickOrder",
                           "sort": "-ym:s:visits", "limit": 10}
        sources = get_json(base + urllib.parse.urlencode(source_params), token)
        campaigns = get_json(base + urllib.parse.urlencode(campaign_params), token)
        goal_names = ["Визиты", "Контакт", "Частично", "Отправка", "Кнопка"]
        lines = [f"## {title}", "", "### Страницы блога", ""]
        lines += metrika_table(blog, "Путь", ["Просмотры", "Пользователи"])
        lines += ["", "### Цели по источникам", ""] + metrika_table(sources, "Источник", goal_names)
        lines += ["", "### Цели по кампаниям Директа", ""] + metrika_table(campaigns, "Кампания", goal_names)
        return lines + [""]
    except Exception as exc:
        return error_section(title, exc)


def main():
    parser = argparse.ArgumentParser(description="Сформировать еженедельный отчёт byplan")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.days < 1:
        parser.error("--days должен быть больше нуля")
    today = date.today()
    date_from, date_to = str(today - timedelta(days=args.days)), str(today - timedelta(days=1))
    output = args.out or Path("reports") / f"byplan-weekly-{today}.md"
    lines = [f"# Еженедельный отчёт byplan — {today}", "", f"Период: {date_from} — {date_to}.", ""]
    if args.dry_run:
        for title in ("Яндекс Директ — итоги кампании", "Яндекс Директ — поисковые запросы", "Яндекс Вебмастер", "Яндекс Метрика"):
            lines += [f"## {title}", "", "_Сухой запуск: сетевые запросы пропущены._", ""]
    else:
        primary = Path("~/.config/byplan/ya_webmaster.token").expanduser()
        fallback = Path("~/.config/byplan/ya_metrika.token").expanduser()
        token_path = primary if primary.exists() else fallback
        token = token_path.read_text(encoding="utf-8").strip()
        lines += campaign_section(token, date_from, date_to)
        lines += queries_section(token, date_from, date_to)
        lines += webmaster_section(token, date_from, date_to)
        lines += metrika_section(token, date_from, date_to)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()

# byplan — Direct campaign check, 2026-09-23 (read-only)

Source: Direct API v5 reports (campaign 714557796 search, 714636735/36 RSY retargeting), Metrika goals via scripts/byplan-weekly-report.py --days 6.

## Search campaign 714557796 — per day

| Date | Imp | Clicks | Cost ₽ | CPC ₽ | Direct conv |
|---|---:|---:|---:|---:|---:|
| 09-18 | 219 | 7 | 244 | 35 | 0 |
| 09-19 | 2237 | 85 | 1779 | 21 | 3 |
| 09-20 | 1333 | 65 | 1013 | 16 | 2 |
| 09-21 | 1221 | 67 | 951 | 14 | 3 |
| 09-22 | 330 | 25 | 845 | 34 | 1 |
| 09-23 (partial) | 163 | 12 | 594 | 49 | 0 |

## Keyword vs autotargeting, 09-17..09-23

| Type | Imp | Clicks | Cost ₽ | CPC ₽ | Direct conv |
|---|---:|---:|---:|---:|---:|
| KEYWORD | 4683 | 212 | 3605 | 17 | 7 |
| AUTOTARGETING | 820 | 49 | 1820 | 37 | 2 |

- 4423 of 4683 keyword impressions came from ONE phrase, «планировочное решение квартиры», which Yandex synonym-matched to panel-series lookups (п44, II-49, 1-464…). The 49 series negatives applied 09-21 cut those: keyword imps 1050 → 250 → 40/day. That was junk, so the cut is correct.
- What remains is autotargeting: 09-23 = 10 clicks / 568 ₽ / 57 ₽ CPC / 0 conv, on queries like «магнитогорск ремонт квартир», «ремонт квартир город барнаул», «дизайнер помещений вологда», «рейтинг ремонтных компаний екатеринбург». Autotargeting bid = 300 ₽ (keyword id 205800401477), BidCeiling 120 ₽.
- Real leads (Metrika, 09-17..09-22): API campaign 1 contact / 1 partial / 1 submit (one person) from 223 visits; Яндекс Бизнес campaign 1 submit from 351 visits. Direct "conversions" ≈ contact_button clicks (goal 618038081), not leads.
- Honest exact-intent demand after negatives ≈ 40–50 keyword imps/day Russia-wide.

## Retargeting (RSY), 09-21..09-23
714636735 горячие: 157 imp / 3 clicks / 9 ₽. 714636736 посетители: 1240 imp / 12 clicks / 131 ₽. Metrika: 0 contact/partial/submit from either. Too early; leave.

## Proposal (not applied)
1. Suspend autotargeting on 714557796 (keyword 205800401477 → suspend). Saves ~500 ₽/day of 0-lead regional ремонт clicks.
2. Add campaign negatives ремонт / ремонта / ремонтных / ремонтные; drop the 2 phrases that conflict («планировка квартиры под ремонт», «проект планировки квартиры для ремонта» — 4 clicks / 116 ₽ / 0 conv).
3. Keep BidCeiling 120 ₽ (keyword CPC avg 17 ₽ is fine); keep 7000 ₽/wk, spend will drop by itself.
4. Volume question for Sen: exact-intent search is tiny; growth = broader phrases (планировка квартиры, дизайн квартиры) with the 61 % bounce trade-off, or content/SEO via blog.

Webmaster still flags NO_METRIKA_COUNTER_BINDING (Sen's UI item from 09-21).

## APPLIED 2026-09-23 (Sen: "go, suspend autotargeting and add the ремонт negatives")
- `keywords.suspend` on autotargeting 205800401477 → Direct error 8305 «Автотаргетинг не может быть остановлен» (search campaigns cannot switch it off).
- Fallback applied: autotargeting categories narrowed EXACT=YES, COMPETITOR NO (was YES), ALTERNATIVE/BROADER/ACCESSORY NO. Verified by read-back.
- Phrases deleted: 58085620619 «планировка квартиры под ремонт», 58085620622 «проект планировки квартиры для ремонта» → 25 keywords left, all ON.
- Negatives: 15 ремонт word forms sent; Direct stores lemmas → campaign negatives 151 → 155 (ремонт, ремонтный, ремонтник, отремонтировать). Verified.
- Campaign 714557796 State ON / Status ACCEPTED after changes.
- Watch 09-24..26: autotargeting spend (was ~500 ₽/day at 57 ₽ CPC) should fall; keyword traffic unchanged.

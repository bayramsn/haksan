"""Refresh only existing official source URLs into a separate review artifact."""
import importlib.util
import json
import time
import copy
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
module = importlib.util.spec_from_file_location('extract', ROOT / 'scripts/extract-haksanmakina-catalog.py')
extract = importlib.util.module_from_spec(module)
module.loader.exec_module(extract)

def correct_cached_sources(source, cache):
    """Narrow page-specific repairs; no network, original input or CNC mutation."""
    result = copy.deepcopy(source)
    changes = []
    row_ids = {'703', '767', '434', '442'}
    aliases = {'1095': 'Model: SD36-U', '773': 'SAD 250', '774': 'SAD 500', '775': 'SAD 1000'}
    text_values = {
        '987': [('Ölçüler (G x D x Y)', '200 x 400 x 140', 'mm'), ('Uygun ayna çapı', '200 - 315', 'mm')],
        '993': [('Ölçüler (G x D x Y)', '180 x 410 x 200', 'mm'), ('Uygun ayna çapı', '200 - 315', 'mm')],
        '1120': [('Ölçüler (G x D x Y)', '135 x 325 x 120', 'mm'), ('Uygun ayna çapı', '125 - 200', 'mm')],
        '1143': [('Ölçüler (G x D x Y)', '200 x 570 x 235', 'mm')],
        '1017': [('Ölçüler (G x D x Y)', '200 x 450 x 235', 'mm')],
        '1377': [('Taşıma kapasitesi', '2.5', 'ton'), ('Çatal uzunluğu', '1150', 'mm')],
        '875': [('Kaynak akımı', '180', 'A'), ('Soğutma tipi', 'Hava soğutmalı', ''), ('Şebeke gerilimi', '220', 'V'), ('Faz sayısı', '1', ''), ('Şebeke frekansı', '50-60', 'Hz')],
    }
    for card in result['products']:
        if card.get('group') == 'CNC':
            continue
        sid = str(card['sourceId'])
        before = copy.deepcopy(card)
        if sid in row_ids:
            page = extract.BeautifulSoup((cache / (sid + '.html')).read_text(), 'html.parser')
            technical = page.select_one('#tab-content-1')
            grids = [extract.table_grid(t) for t in technical.find_all('table')]
            rows = max(grids, key=len)
            values = [[extract.clean(c.get_text(' ', strip=True)) if c else '' for c in row] for row in rows]
            if sid == '703':
                headers = ['Model', 'Kapasite (7 bar)', 'Kapasite (10 bar)', 'Kapasite (13 bar)', 'Motor Gücü', 'Bağlantı Çapı', 'Tank Hacimi', 'Ebatlar (en x boy x yükseklik)', 'Ağırlık']
                units = ['', 'm³/dk', 'm³/dk', 'm³/dk', 'HP/kW', '', 'lt', 'mm', 'kg']
                data, start_column = values[4:], 1
            elif sid == '767':
                headers, units, data, start_column = values[0], [''] * len(values[0]), values[1:], 2
            else:
                headers, units, data, start_column = values[0], values[1], values[2:], 1
            configs = []
            for row in data:
                specs = []
                for col in range(start_column, len(headers)):
                    value = row[col] if col < len(row) else ''
                    if not value or value in {'--', '-'}:
                        continue
                    unit = units[col]
                    if sid == '767':
                        match = re.fullmatch(r'(.+?)\s+(mm|kg)', value)
                        if match:
                            value, unit = match.groups()
                    specs.append({'key': headers[col], 'value': value, 'unit': unit})
                configs.append({'sourceModelCode': row[0], 'specs': specs, 'sourceUrl': card['sourceUrl'], 'capturedOn': source.get('technicalRefreshedOn', '2026-10-14'), 'verificationStatus': 'source_verified'})
            assert len(configs) == {'703': 21, '767': 4, '434': 8, '442': 12}[sid], sid
            card['technicalConfigurations'] = configs
            # Only exactly common complete fields may be copied to the series.
            card['specs'] = [spec for spec in configs[0]['specs'] if all(spec in cfg['specs'] for cfg in configs[1:])]
            card['extractionWarnings'] = []
        elif sid in aliases:
            configs = card.get('technicalConfigurations', [])
            assert len(configs) == 1 and configs[0]['sourceModelCode'] == aliases[sid], sid
            card['specs'] = copy.deepcopy(configs[0]['specs'])
            card['extractionWarnings'] = []
        elif sid in text_values:
            expected_specs = [{'key': key, 'value': value, 'unit': unit} for key, value, unit in text_values[sid]]
            assert not card.get('specs') or card['specs'] == expected_specs, sid
            text = card.get('technicalText', '')
            if sid in {'987', '993', '1120', '1143', '1017'}:
                for _, value, _ in text_values[sid]:
                    assert value in text, (sid, value)
            if sid == '1377':
                assert '2.5 ton' in text and '1150 mm' in text
            if sid == '875':
                assert '180 AMPER' in text and 'HAVA SOĞUTMALI' in text and '1 faz,220V/50-60Hz' in text
            card['specs'] = [{'key': key, 'value': value, 'unit': unit} for key, value, unit in text_values[sid]]
        if card != before:
            changes.append({'sourceId': sid, 'group': card['group'], 'model': card['model'], 'beforeSpecs': len(before.get('specs', [])), 'afterSpecs': len(card.get('specs', [])), 'beforeConfigurations': len(before.get('technicalConfigurations', [])), 'afterConfigurations': len(card.get('technicalConfigurations', []))})
    assert [c for c in source['products'] if c.get('group') == 'CNC'] == [c for c in result['products'] if c.get('group') == 'CNC']
    return result, changes


def cached_main():
    folder = ROOT / 'reports/technical-backfill-20261014'
    source = json.loads((folder / 'source-enriched.json').read_text())
    corrected, changes = correct_cached_sources(source, folder / 'source-html')
    out = ROOT / 'reports/technical-audit-20261015'
    out.mkdir(exist_ok=True)
    (out / 'source-corrected.json').write_text(json.dumps(corrected, ensure_ascii=False, indent=2) + '\n')
    report = {'source': str(folder / 'source-enriched.json'), 'cncUnchanged': True, 'changedSources': len(changes), 'changes': changes, 'correctedConfigurationCount': sum(x['afterConfigurations'] for x in changes if x['sourceId'] in {'703', '767', '434', '442'}), 'addedBaseSpecCount': sum(x['afterSpecs'] - x['beforeSpecs'] for x in changes), 'correctedConfigurationFieldCount': sum(len(cfg['specs']) for card in corrected['products'] if str(card['sourceId']) in {'703', '767', '434', '442'} for cfg in card['technicalConfigurations'])}
    (out / 'source-correction-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


def refresh_main():
    source = json.loads(extract.OUTPUT.read_text())
    output = ROOT / 'reports/technical-backfill-20261014'
    output.mkdir(parents=True, exist_ok=True)
    cache = output / 'source-html'
    cache.mkdir(exist_ok=True)
    old = {str(p['sourceId']): p for p in source['products']}
    errors, results = [], {}

    def refresh(card):
        card = dict(card)
        path = cache / (str(card['sourceId']) + '.html')
        if path.exists():
            page = extract.BeautifulSoup(path.read_text(), 'html.parser')
        else:
            time.sleep(.2)
            page = extract.soup(extract.absolute(card['sourceUrl']))
            path.write_text(str(page))
        return extract.extract_detail(card, page)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(refresh, card): card for card in source['products']}
        for i, future in enumerate(as_completed(futures), 1):
            card = futures[future]
            try:
                results[str(card['sourceId'])] = future.result()
            except Exception as exc:
                errors.append({'sourceId': card['sourceId'], 'sourceUrl': card['sourceUrl'], 'error': str(exc)})
                results[str(card['sourceId'])] = {**card, 'extractionWarnings': ['Source refresh failed; retained previous snapshot']}
            if i % 50 == 0:
                print(f'Reviewed {i}/{len(futures)} pages; errors {len(errors)}', flush=True)
    source['products'] = [results[str(card['sourceId'])] for card in source['products']]
    source['technicalRefreshedOn'] = datetime.now(ZoneInfo('Europe/Istanbul')).date().isoformat()
    source['technicalRefreshErrors'] = errors
    (output / 'source-enriched.json').write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
    stats = {'products': len(results), 'errors': errors,
             'beforeSpecCount': sum(len(p.get('specs', [])) for p in old.values()),
             'afterSpecCount': sum(len(p.get('specs', [])) for p in results.values()),
             'configurations': sum(len(p.get('technicalConfigurations', [])) for p in results.values()),
             'standardEquipmentCount': sum(len(p.get('standardEquipment', [])) for p in results.values()),
             'withoutSpecs': [{'sourceId': p['sourceId'], 'model': p['model'], 'group':p['group'], 'sourceUrl':p['sourceUrl']} for p in results.values() if not p.get('specs')],
             'specCountReduced': [{'sourceId': p['sourceId'], 'before':len(old[str(p['sourceId'])].get('specs',[])), 'after':len(p.get('specs',[]))} for p in results.values() if len(p.get('specs',[])) < len(old[str(p['sourceId'])].get('specs',[]))]}
    (output / 'source-extraction-report.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in stats.items() if k not in ['withoutSpecs','specCountReduced']},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    if '--correct-cached' in sys.argv:
        cached_main()
    else:
        refresh_main()

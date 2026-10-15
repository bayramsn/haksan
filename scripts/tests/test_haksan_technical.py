import importlib.util
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('extract',ROOT/'scripts/extract-haksanmakina-catalog.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class TechnicalTests(unittest.TestCase):
    def parse(self,html,model='TEST'):
        return m.extract_detail({'model':model,'sourceId':'x','sourceUrl':m.BASE},m.BeautifulSoup(html,'html.parser'))
    def test_spanned_unit_and_group(self):
        html=(ROOT/'scripts/tests/fixtures/haksan-633.html').read_text()
        p=self.parse(html,'PP-U3')
        self.assertIn({'key':'Taş — Çapı','value':'100','unit':'mm'},p['specs'])
        self.assertIn({'key':'Taş — Delik Çapı','value':'20','unit':'mm'},p['specs'])
        self.assertEqual(len(p['standardEquipment']),11)
    def test_groups_prevent_colliding_labels(self):
        p=self.parse((ROOT/'scripts/tests/fixtures/haksan-617.html').read_text(),'LS-350 ZNC')
        weights=[x for x in p['specs'] if x['key'].endswith('Net Ağırlık')]
        self.assertEqual({x['value'] for x in weights},{'1200','100','180'})
    def test_multimodel_values_not_assigned_to_base(self):
        p=self.parse('''<div id="tab-content-1"><table><tr><th>Model</th><th>Birim</th><th>A100</th><th>A200</th></tr><tr><td>Tabla</td><td>mm</td><td>100</td><td>200</td></tr><tr><td>Motor</td><td>kW</td><td>2</td><td>2</td></tr></table></div>''')
        self.assertEqual(p['specs'],[{'key':'Motor','value':'2','unit':'kW'}])
        self.assertEqual(len(p['technicalConfigurations']),2)
        self.assertEqual(p['technicalConfigurations'][1]['specs'][0]['value'],'200')
    def test_blank_leading_header_is_not_a_missing_table(self):
        p=self.parse('<div id="tab-content-1"><table><tr><td></td><td>TEKNİK ÖZELLİKLER</td><td>VM-2</td></tr><tr><td>TABLA</td><td>Tabla ölçüsü</td><td>900 x 500 mm</td></tr></table></div>','VM-2')
        self.assertEqual(p['specs'],[{'key':'TABLA — Tabla ölçüsü','value':'900 x 500 mm','unit':''}])
    def test_transposed_model_rows_remain_scoped(self):
        p=self.parse('<div id="tab-content-1"><table><tr><td>Model</td><td>Çalışma Boyu</td><td>Kapasite</td></tr><tr><td>A100</td><td>100</td><td>2</td></tr><tr><td>A200</td><td>200</td><td>2</td></tr></table></div>','Seri')
        self.assertEqual(p['specs'],[{'key':'Kapasite','value':'2','unit':''}])
        self.assertEqual(len(p['technicalConfigurations']),2)
    def test_value_unit_column_order(self):
        p=self.parse('<div id="tab-content-1"><table><tr><td>Motor gücü</td><td>3</td><td>Hp</td></tr></table></div>')
        self.assertEqual(p['specs'],[{'key':'Motor gücü','value':'3','unit':'Hp'}])
    def test_nested_rows_not_duplicated(self):
        t=m.BeautifulSoup('<table><tr><td>Outer<table><tr><td>Inner</td></tr></table></td><td>Value</td></tr></table>','html.parser').table
        self.assertEqual(len(m.table_grid(t)),1)

class CachedCorrectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import json
        spec = importlib.util.spec_from_file_location('refresh', ROOT / 'scripts/refresh-haksan-technical-details.py')
        cls.refresh = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.refresh)
        cls.source = json.loads((ROOT / 'reports/technical-backfill-20261014/source-enriched.json').read_text())
        cls.corrected, cls.changes = cls.refresh.correct_cached_sources(cls.source, ROOT / 'reports/technical-backfill-20261014/source-html')
        cls.cards = {str(p['sourceId']): p for p in cls.corrected['products']}

    def test_cnc_and_non_target_cards_are_unchanged(self):
        changed = {c['sourceId'] for c in self.changes}
        self.assertEqual(len(changed), 15)
        for old in self.source['products']:
            if old.get('group') == 'CNC' or str(old['sourceId']) not in changed:
                self.assertEqual(old, self.cards[str(old['sourceId'])])

    def test_row_models_are_not_unit_or_dimension_headers(self):
        expected = {'703': 21, '767': 4, '434': 8, '442': 12}
        for sid, count in expected.items():
            configs = self.cards[sid]['technicalConfigurations']
            self.assertEqual(len(configs), count)
            self.assertEqual(len({x['sourceModelCode'] for x in configs}), count)
            self.assertFalse(self.cards[sid]['extractionWarnings'])
        dmd = self.cards['703']['technicalConfigurations']
        self.assertEqual(dmd[0]['sourceModelCode'], 'DMD 30C')
        self.assertEqual(dmd[0]['specs'], [{'key': 'Ebatlar (en x boy x yükseklik)', 'value': '753 x 506 x 725', 'unit': 'mm'}, {'key': 'Ağırlık', 'value': '127', 'unit': 'kg'}])

    def test_compound_values_and_unspecified_units_survive(self):
        cfg = self.cards['442']['technicalConfigurations'][0]
        self.assertIn({'key': 'Motor gücü Motor power', 'value': '11+5,5', 'unit': 'kw'}, cfg['specs'])
        vk = self.cards['767']['technicalConfigurations'][0]
        self.assertIn({'key': 'H1', 'value': '30', 'unit': ''}, vk['specs'])
        self.assertIn({'key': 'E', 'value': '100', 'unit': 'mm'}, vk['specs'])

    def test_only_exact_common_series_values_and_explicit_aliases(self):
        self.assertEqual(len(self.cards['434']['specs']), 2)
        self.assertEqual(self.cards['442']['specs'], [])
        self.assertEqual(len(self.cards['1095']['specs']), 9)
        self.assertEqual(self.cards['1338']['specs'], [])
        self.assertTrue(self.cards['1338']['extractionWarnings'])

    def test_correction_is_idempotent(self):
        repeated, changes = self.refresh.correct_cached_sources(self.corrected, ROOT / 'reports/technical-backfill-20261014/source-html')
        self.assertEqual(repeated, self.corrected)
        self.assertEqual(changes, [])

    def test_conflicting_compatibility_ranges_are_not_promoted(self):
        for sid in ['1017', '1143']:
            self.assertEqual(len(self.cards[sid]['specs']), 1)
            self.assertEqual(self.cards[sid]['specs'][0]['key'], 'Ölçüler (G x D x Y)')
        self.assertIn({'key': 'Çatal uzunluğu', 'value': '1150', 'unit': 'mm'}, self.cards['1377']['specs'])

if __name__=='__main__': unittest.main()

#!/usr/bin/env python3
"""Extract the supplied Baykal V26.03 workbook, preserving sheet/cell provenance.

Uses cached formula results without executing formulas or following external links.
A product identity includes its worksheet because APHS variants reuse model codes.
"""
import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def clean(value):
    return re.sub(r'[ \t]+', ' ', value or '').strip()


def number(value):
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def money(value):
    amount = number(value)
    if amount is None:
        return None
    return format(amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP), 'f')


def column(ref):
    return re.match(r'[A-Z]+', ref).group()


def column_number(col):
    result = 0
    for char in col:
        result = result * 26 + ord(char) - 64
    return result


def column_name(index):
    value = ''
    while index:
        index, digit = divmod(index - 1, 26)
        value = chr(65 + digit) + value
    return value


class Worksheet:
    def __init__(self, name, root, strings):
        self.name = name
        self.cells = {}
        for cell in root.findall('s:sheetData/s:row/s:c', NS):
            value = cell.find('s:v', NS)
            text = value.text or '' if value is not None else ''
            if cell.get('t') == 's' and text:
                text = strings[int(text)]
            elif cell.get('t') == 'inlineStr':
                text = ''.join(cell.find('s:is', NS).itertext())
            formula = cell.find('s:f', NS)
            if text or formula is not None:
                item = {'cell': cell.get('r'), 'rawValue': text}
                if formula is not None:
                    item['formula'] = formula.text or ''
                    item['cachedFormulaResult'] = value is not None and bool(text)
                if cell.get('t') == 'e':
                    item['error'] = text
                self.cells[cell.get('r')] = item
        self.merged = {}
        for item in root.findall('s:mergeCells/s:mergeCell', NS):
            start, end = item.get('ref').split(':')
            for row in range(int(re.search(r'\d+', start).group()), int(re.search(r'\d+', end).group()) + 1):
                for col in range(column_number(column(start)), column_number(column(end)) + 1):
                    self.merged[f'{column_name(col)}{row}'] = start
        self.last_row = max((int(re.search(r'\d+', ref).group()) for ref in self.cells), default=0)

    def get(self, ref):
        anchor = self.merged.get(ref, ref)
        item = dict(self.cells.get(anchor, {'cell': anchor, 'rawValue': ''}))
        if anchor != ref:
            item['requestedCell'] = ref
        return item

    def value(self, ref):
        return clean(self.get(ref)['rawValue'])


def price(cell, kind='base_machine'):
    result = {'amount': money(cell['rawValue']), 'currency': 'EUR', 'kind': kind, 'source': cell}
    if cell.get('error') or ('formula' in cell and not cell.get('cachedFormulaResult')):
        result['amount'] = None
    result['status'] = 'priced' if result['amount'] is not None else 'on_request' if 'PLEASE ASK' in cell['rawValue'].upper() else 'missing'
    return result


def product_id(sheet, col, suffix=''):
    return re.sub(r'[^a-z0-9]+', '-', sheet.lower()).strip('-') + '-' + col.lower() + suffix


def extract_sheet(sheet):
    headers = [(column(ref), clean(cell['rawValue'])) for ref, cell in sheet.cells.items()
               if re.fullmatch(r'[A-Z]+2', ref) and re.search(r'\d', cell['rawValue'])]
    if not headers:
        raise ValueError(f'No model headers in {sheet.name}')
    headers.sort(key=lambda item: column_number(item[0]))
    first_col = column_number(headers[0][0])
    description_col = column_name(first_col - 1)
    price_rows = [row for row in range(3, 8)
                  if any('EX-WORKS' in sheet.value(f'{col}{row}').upper() for col in ('A', 'B', 'C'))]
    if len(price_rows) != 1:
        raise ValueError(f'Expected one base price row in {sheet.name}')
    price_row = price_rows[0]
    standard_rows = [row for row in range(3, 8) if 'STANDARD CONFIGURATION' in sheet.value(f'A{row}').upper()]
    std_ref = f'{description_col}{standard_rows[0]}' if standard_rows else 'B1'
    standard = sheet.get(std_ref)
    if not standard_rows and not sheet.value('B1').upper().startswith('STANDARD CONFIGURATION'):
        standard = None
    option_start = max([price_row] + standard_rows) + 1
    products = []
    warnings = []
    for col, model in headers:
        product = {'id': product_id(sheet.name, col), 'modelCode': model, 'series': sheet.value('A1'),
                   'sheet': sheet.name, 'modelSource': sheet.get(f'{col}2'),
                   'price': price(sheet.get(f'{col}{price_row}')), 'specs': []}
        for row in range(3, price_row):
            label = sheet.value(f'{description_col}{row}') or sheet.value(f'A{row}')
            value = sheet.get(f'{col}{row}')
            if value['rawValue'] and 'STANDARD CONFIGURATION' not in sheet.value(f'A{row}').upper():
                product['specs'].append({'key': label, 'value': clean(value['rawValue']), 'unit': '', 'source': value})
        if standard:
            product['standardEquipment'] = {'text': clean(standard['rawValue']), 'source': standard}
        products.append(product)
    if sheet.name == 'BLX':
        prototype = products[0]
        products = []
        for row, end, suffix in ((6, 9, '-6kw'), (10, 13, '-12kw')):
            product = dict(prototype)
            product['id'] += suffix
            product['modelCode'] = sheet.value(f'A{row}').replace(' NET PRICE', '')
            product['modelSource'] = sheet.get(f'A{row}')
            product['price'] = price(sheet.get(f'C{row}'), 'net_package')
            product['packageEquipment'] = [{'text': sheet.value(f'B{r}'), 'source': sheet.get(f'B{r}')} for r in range(row, end + 1)]
            products.append(product)
        option_start = 14
    options = []
    notes = []
    for row in range(option_start, sheet.last_row + 1):
        name = sheet.value(f'{description_col}{row}')
        group = sheet.value(f'A{row}')
        values = {product['id']: sheet.get(f'{column(product['modelSource']['cell'])}{row}') for product in products}
        # BLX model labels are column A; their package/option price matrix is column C.
        if sheet.name == 'BLX':
            values = {product['id']: sheet.get(f'C{row}') for product in products}
            if row == 14:
                values = {products[0]['id']: sheet.get('C14')}
            elif row == 15:
                values = {products[1]['id']: sheet.get('C15')}
        if not name:
            name = group
        if not name:
            continue
        if name.startswith('*Baykal') or not any(item['rawValue'] for item in values.values()):
            notes.append({'text': name, 'source': sheet.get(f'{description_col}{row}' if sheet.value(f'{description_col}{row}') else f'A{row}')})
            continue
        option = {'id': product_id(sheet.name, 'row' + str(row)), 'sheet': sheet.name, 'group': group,
                  'name': name, 'descriptionSource': sheet.get(f'{description_col}{row}'), 'pricesByProduct': {}, 'unavailableProductIds': [], 'unknownProductIds': []}
        for ident, value in values.items():
            if value['rawValue'].strip().upper() == 'X':
                option['unavailableProductIds'].append(ident)
            elif money(value['rawValue']) is not None and not value.get('error'):
                option['pricesByProduct'][ident] = price(value, 'option_addition')
            else:
                option['unknownProductIds'].append(ident)
        options.append(option)
    if sheet.name in ('BLS PRO', 'BLU'):
        warnings.append('Source model BLS/BLU 2560 has LENGTH 8000 mm in the workbook. Retained verbatim for review.')
    if sheet.name == 'BLX':
        warnings.append('NET package prices and starred additions use different commercial terms. See worksheet notes.')
    return products, options, {'name': sheet.name, 'notes': notes, 'warnings': warnings}


def extract(path):
    with zipfile.ZipFile(path) as archive:
        strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        relationships = {item.get('Id'): item.get('Target') for item in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        worksheets = []
        for item in ET.fromstring(archive.read('xl/workbook.xml')).findall('s:sheets/s:sheet', NS):
            target = relationships[item.get(REL)]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            worksheets.append(Worksheet(item.get('name'), ET.fromstring(archive.read(target)), strings))
    result = {'schemaVersion': 1, 'brand': 'BAYKAL', 'sourceFile': 'Price List V26.03 (12.05.2026).xlsx',
              'sourceSha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(), 'version': '26.03', 'releaseDate': '2026-05-12',
              'currency': 'EUR', 'priceBasis': 'EX-WORKS BURSA', 'products': [], 'options': [], 'software': [], 'sheets': [],
              'warnings': ['Model identity includes worksheet to distinguish frame and drive variants.',
                           'Formula prices use saved Excel cache. External links are not evaluated.',
                           'Dimensions and capacity labels are retained exactly as supplied, without inferred units.',
                           'List prices describe the May 2026 workbook, not current quotations.']}
    for sheet in worksheets:
        if sheet.name == 'INDEX':
            result['sheets'].append({'name': 'INDEX', 'kind': 'revision_history'})
        elif sheet.name == 'Software':
            for row in range(3, sheet.last_row + 1):
                code, description = sheet.value(f'A{row}'), sheet.value(f'B{row}')
                if not code or not description or code.startswith('*'):
                    continue
                result['software'].append({'id': f'software-{row}', 'code': code, 'description': description,
                                           'codeSource': sheet.get(f'A{row}'), 'price': price(sheet.get(f'C{row}'), 'software_option')})
            duplicates = [code for code, count in Counter(item['code'] for item in result['software']).items() if count > 1]
            result['sheets'].append({'name': sheet.name, 'kind': 'software_options', 'duplicateCodes': duplicates})
        else:
            products, options, metadata = extract_sheet(sheet)
            result['products'].extend(products)
            result['options'].extend(options)
            result['sheets'].append(metadata)
    ids = [product['id'] for product in result['products']]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate product identities')
    result['counts'] = {'sheets': len(worksheets), 'products': len(ids), 'optionDefinitions': len(result['options']),
                        'optionPrices': sum(len(option['pricesByProduct']) for option in result['options']), 'software': len(result['software'])}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, default=Path('apps/api/src/db/seed/data/baykal-2026-price-list.json'))
    args = parser.parse_args()
    data = extract(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(data['counts']))


if __name__ == '__main__':
    main()

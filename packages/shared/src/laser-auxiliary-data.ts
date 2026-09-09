import type { LaserSpec } from './laser';

export interface LaserAuxiliaryModel { code: string; kind: 'welding' | 'cleaning'; powerKw: number; specs: LaserSpec[]; sourceNotes?: string[] }
// Source workbook is read only; these models use their own rated power and never cutting profile power choices.
const workbookModels: LaserAuxiliaryModel[] = [
  {
    "code": "HD-1500W",
    "kind": "welding",
    "powerKw": 1.5,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "1500",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C4",
          "rawValue": "1500W（MAX/Raycus）"
        },
        "sourceValue": "1500"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C4",
          "rawValue": "1500W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C5",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C6",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / argon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C7",
          "rawValue": "氮气/氩气\nNitrogen/Argon"
        },
        "sourceValue": "Azot / argon"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C8",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP23T",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C9",
          "rawValue": "SUP23T"
        },
        "sourceValue": "SUP23T"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-8",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C10",
          "rawValue": "0-8mm"
        },
        "sourceValue": "0-8"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Tek faz 220V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C11",
          "rawValue": "单相220V±5％/\n50-60Hz"
        },
        "sourceValue": "Tek faz 220V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "7.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C12",
          "rawValue": "7.5KW/20KVA"
        },
        "sourceValue": "7.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "20",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C12",
          "rawValue": "7.5KW/20KVA"
        },
        "sourceValue": "20"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "HANLI çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C13",
          "rawValue": "工业双温双控水冷机（汉立）\nWater cooler (Hanli）"
        },
        "sourceValue": "HANLI çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C14",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C15",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C16",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Kaynak Aralığı Gereksinimi",
        "value": "≤0.5",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C17",
          "rawValue": "≤0.5mm"
        },
        "sourceValue": "≤0.5"
      },
      {
        "key": "Kaynak Hızı",
        "value": "0-120",
        "unit": "mm/s",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C18",
          "rawValue": "0-120mm/s"
        },
        "sourceValue": "0-120"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "910*400*775",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C19",
          "rawValue": "910*400*775mm"
        },
        "sourceValue": "910*400*775"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "950*455*925",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C20",
          "rawValue": "950*455*925mm"
        },
        "sourceValue": "950*455*925"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "180",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C21",
          "rawValue": "180kg"
        },
        "sourceValue": "180"
      }
    ]
  },
  {
    "code": "HD-2000W",
    "kind": "welding",
    "powerKw": 2.0,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "2000",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D4",
          "rawValue": "2000W（MAX/Raycus）"
        },
        "sourceValue": "2000"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D4",
          "rawValue": "2000W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C5",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C6",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / argon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C7",
          "rawValue": "氮气/氩气\nNitrogen/Argon"
        },
        "sourceValue": "Azot / argon"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C8",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP23T",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C9",
          "rawValue": "SUP23T"
        },
        "sourceValue": "SUP23T"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-8",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C10",
          "rawValue": "0-8mm"
        },
        "sourceValue": "0-8"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Tek faz 220V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C11",
          "rawValue": "单相220V±5％/\n50-60Hz"
        },
        "sourceValue": "Tek faz 220V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "9.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D12",
          "rawValue": "9.5KW/20KVA"
        },
        "sourceValue": "9.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "20",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D12",
          "rawValue": "9.5KW/20KVA"
        },
        "sourceValue": "20"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "HANLI çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C13",
          "rawValue": "工业双温双控水冷机（汉立）\nWater cooler (Hanli）"
        },
        "sourceValue": "HANLI çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C14",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C15",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C16",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Kaynak Aralığı Gereksinimi",
        "value": "≤0.5",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C17",
          "rawValue": "≤0.5mm"
        },
        "sourceValue": "≤0.5"
      },
      {
        "key": "Kaynak Hızı",
        "value": "0-120",
        "unit": "mm/s",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C18",
          "rawValue": "0-120mm/s"
        },
        "sourceValue": "0-120"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "910*400*775",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C19",
          "rawValue": "910*400*775mm"
        },
        "sourceValue": "910*400*775"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "950*455*925",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C20",
          "rawValue": "950*455*925mm"
        },
        "sourceValue": "950*455*925"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "190",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D21",
          "rawValue": "190kg"
        },
        "sourceValue": "190"
      }
    ]
  },
  {
    "code": "HW-1500W",
    "kind": "welding",
    "powerKw": 1.5,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "1500",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E4",
          "rawValue": "1500W（MAX/Raycus）"
        },
        "sourceValue": "1500"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E4",
          "rawValue": "1500W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E5",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E6",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / argon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E7",
          "rawValue": "氮气/氩气\nNitrogen/Argon"
        },
        "sourceValue": "Azot / argon"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E8",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP23T",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E9",
          "rawValue": "SUP23T"
        },
        "sourceValue": "SUP23T"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-8",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E10",
          "rawValue": "0-8mm"
        },
        "sourceValue": "0-8"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Tek faz 220V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E11",
          "rawValue": "单相220V±5％/\n50-60Hz"
        },
        "sourceValue": "Tek faz 220V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "7.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E12",
          "rawValue": "7.5KW/20KVA"
        },
        "sourceValue": "7.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "20",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E12",
          "rawValue": "7.5KW/20KVA"
        },
        "sourceValue": "20"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "S&A çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E13",
          "rawValue": "工业双温双控水冷机 特域\nWater cooler (S&A)"
        },
        "sourceValue": "S&A çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E14",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E15",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E16",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Kaynak Aralığı Gereksinimi",
        "value": "≤0.5",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E17",
          "rawValue": "≤0.5mm"
        },
        "sourceValue": "≤0.5"
      },
      {
        "key": "Kaynak Hızı",
        "value": "0-120",
        "unit": "mm/s",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E18",
          "rawValue": "0-120mm/s"
        },
        "sourceValue": "0-120"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "950*660*930",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E19",
          "rawValue": "950*660*930mm"
        },
        "sourceValue": "950*660*930"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "1200*760*1100",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E20",
          "rawValue": "1200*760*1100mm"
        },
        "sourceValue": "1200*760*1100"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "230",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E21",
          "rawValue": "230kg"
        },
        "sourceValue": "230"
      }
    ]
  },
  {
    "code": "HW-2000W",
    "kind": "welding",
    "powerKw": 2.0,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "2000",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F4",
          "rawValue": "2000W（MAX/Raycus）"
        },
        "sourceValue": "2000"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F4",
          "rawValue": "2000W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E5",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E6",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / argon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E7",
          "rawValue": "氮气/氩气\nNitrogen/Argon"
        },
        "sourceValue": "Azot / argon"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E8",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP23T",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E9",
          "rawValue": "SUP23T"
        },
        "sourceValue": "SUP23T"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-8",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E10",
          "rawValue": "0-8mm"
        },
        "sourceValue": "0-8"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Tek faz 220V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E11",
          "rawValue": "单相220V±5％/\n50-60Hz"
        },
        "sourceValue": "Tek faz 220V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "9.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F12",
          "rawValue": "9.5KW/20KVA"
        },
        "sourceValue": "9.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "20",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F12",
          "rawValue": "9.5KW/20KVA"
        },
        "sourceValue": "20"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "S&A çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E13",
          "rawValue": "工业双温双控水冷机 特域\nWater cooler (S&A)"
        },
        "sourceValue": "S&A çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E14",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E15",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E16",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Kaynak Aralığı Gereksinimi",
        "value": "≤0.5",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E17",
          "rawValue": "≤0.5mm"
        },
        "sourceValue": "≤0.5"
      },
      {
        "key": "Kaynak Hızı",
        "value": "0-120",
        "unit": "mm/s",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E18",
          "rawValue": "0-120mm/s"
        },
        "sourceValue": "0-120"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "950*660*930",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E19",
          "rawValue": "950*660*930mm"
        },
        "sourceValue": "950*660*930"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "1200*760*1100",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E20",
          "rawValue": "1200*760*1100mm"
        },
        "sourceValue": "1200*760*1100"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "250",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F21",
          "rawValue": "250kg"
        },
        "sourceValue": "250"
      }
    ]
  },
  {
    "code": "HW-3000W",
    "kind": "welding",
    "powerKw": 3.0,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "3000",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G4",
          "rawValue": "3000W（MAX/Raycus）"
        },
        "sourceValue": "3000"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G4",
          "rawValue": "3000W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E5",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E6",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / argon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E7",
          "rawValue": "氮气/氩气\nNitrogen/Argon"
        },
        "sourceValue": "Azot / argon"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E8",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP23T",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E9",
          "rawValue": "SUP23T"
        },
        "sourceValue": "SUP23T"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-8",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E10",
          "rawValue": "0-8mm"
        },
        "sourceValue": "0-8"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Üç faz 380V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G11",
          "rawValue": "三相380V±5％/\n50-60Hz"
        },
        "sourceValue": "Üç faz 380V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "13.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G12",
          "rawValue": "13.5KW/30KVA"
        },
        "sourceValue": "13.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "30",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G12",
          "rawValue": "13.5KW/30KVA"
        },
        "sourceValue": "30"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "S&A çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E13",
          "rawValue": "工业双温双控水冷机 特域\nWater cooler (S&A)"
        },
        "sourceValue": "S&A çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E14",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E15",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E16",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Kaynak Aralığı Gereksinimi",
        "value": "≤0.5",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E17",
          "rawValue": "≤0.5mm"
        },
        "sourceValue": "≤0.5"
      },
      {
        "key": "Kaynak Hızı",
        "value": "0-120",
        "unit": "mm/s",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E18",
          "rawValue": "0-120mm/s"
        },
        "sourceValue": "0-120"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "1100*660*970",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G19",
          "rawValue": "1100*660*970mm"
        },
        "sourceValue": "1100*660*970"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "1400*770*1200",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G20",
          "rawValue": "1400*770*1200mm"
        },
        "sourceValue": "1400*770*1200"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "330",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G21",
          "rawValue": "330kg"
        },
        "sourceValue": "330"
      }
    ]
  },
  {
    "code": "HC-1500W",
    "kind": "cleaning",
    "powerKw": 1.5,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "1500",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C26",
          "rawValue": "1500W（MAX/Raycus）"
        },
        "sourceValue": "1500"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C26",
          "rawValue": "1500W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C27",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C28",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / hava",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C29",
          "rawValue": "氮气/空气\nNitrogen/Air"
        },
        "sourceValue": "Azot / hava"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C30",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP22C",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C31",
          "rawValue": "SUP22C"
        },
        "sourceValue": "SUP22C"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-300",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C32",
          "rawValue": "0-300mm"
        },
        "sourceValue": "0-300"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Tek faz 220V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C33",
          "rawValue": "单相220V±5％/\n50-60Hz"
        },
        "sourceValue": "Tek faz 220V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "7.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C34",
          "rawValue": "7.5KW/20KVA"
        },
        "sourceValue": "7.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "20",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C34",
          "rawValue": "7.5KW/20KVA"
        },
        "sourceValue": "20"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "HANLI çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C35",
          "rawValue": "工业双温双控水冷机（汉立）\nWater cooler (Hanli）"
        },
        "sourceValue": "HANLI çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C36",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C37",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C38",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Temizlenebilir Yüzeyler",
        "value": "Yüzey pası, boya, korozyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C39",
          "rawValue": "浮锈、油漆、锈蚀\nFloating rust, paint, rust"
        },
        "sourceValue": "Yüzey pası, boya, korozyon"
      },
      {
        "key": "Temizleme Hızı",
        "value": "8-40",
        "unit": "m²/h",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C40",
          "rawValue": "8-40m²/h"
        },
        "sourceValue": "8-40"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "910*400*775",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C41",
          "rawValue": "910*400*775mm"
        },
        "sourceValue": "910*400*775"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "950*455*925",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C42",
          "rawValue": "950*455*925mm"
        },
        "sourceValue": "950*455*925"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "160",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C43",
          "rawValue": "160kg"
        },
        "sourceValue": "160"
      }
    ]
  },
  {
    "code": "HC-2000W",
    "kind": "cleaning",
    "powerKw": 2.0,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "2000",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D26",
          "rawValue": "2000W（MAX/Raycus）"
        },
        "sourceValue": "2000"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D26",
          "rawValue": "2000W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C27",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C28",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / hava",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C29",
          "rawValue": "氮气/空气\nNitrogen/Air"
        },
        "sourceValue": "Azot / hava"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C30",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP22C",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C31",
          "rawValue": "SUP22C"
        },
        "sourceValue": "SUP22C"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-300",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C32",
          "rawValue": "0-300mm"
        },
        "sourceValue": "0-300"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Tek faz 220V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C33",
          "rawValue": "单相220V±5％/\n50-60Hz"
        },
        "sourceValue": "Tek faz 220V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "9.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D34",
          "rawValue": "9.5KW/20KVA"
        },
        "sourceValue": "9.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "20",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D34",
          "rawValue": "9.5KW/20KVA"
        },
        "sourceValue": "20"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "HANLI çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C35",
          "rawValue": "工业双温双控水冷机（汉立）\nWater cooler (Hanli）"
        },
        "sourceValue": "HANLI çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C36",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C37",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C38",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Temizlenebilir Yüzeyler",
        "value": "Yüzey pası, boya, korozyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C39",
          "rawValue": "浮锈、油漆、锈蚀\nFloating rust, paint, rust"
        },
        "sourceValue": "Yüzey pası, boya, korozyon"
      },
      {
        "key": "Temizleme Hızı",
        "value": "10-60",
        "unit": "m²/h",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D40",
          "rawValue": "10-60m²/h"
        },
        "sourceValue": "10-60"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "910*400*775",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C41",
          "rawValue": "910*400*775mm"
        },
        "sourceValue": "910*400*775"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "950*455*925",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "C42",
          "rawValue": "950*455*925mm"
        },
        "sourceValue": "950*455*925"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "170",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "D43",
          "rawValue": "170kg"
        },
        "sourceValue": "170"
      }
    ]
  },
  {
    "code": "LC-1500W",
    "kind": "cleaning",
    "powerKw": 1.5,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "1500",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E26",
          "rawValue": "1500W（MAX/Raycus）"
        },
        "sourceValue": "1500"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E26",
          "rawValue": "1500W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E27",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E28",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / hava",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E29",
          "rawValue": "氮气/空气\nNitrogen/Air"
        },
        "sourceValue": "Azot / hava"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E30",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP22C",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E31",
          "rawValue": "SUP22C"
        },
        "sourceValue": "SUP22C"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-300",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E32",
          "rawValue": "0-300mm"
        },
        "sourceValue": "0-300"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Tek faz 220V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E33",
          "rawValue": "单相220V±5％/\n50-60Hz"
        },
        "sourceValue": "Tek faz 220V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "7.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E34",
          "rawValue": "7.5KW/20KVA"
        },
        "sourceValue": "7.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "20",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E34",
          "rawValue": "7.5KW/20KVA"
        },
        "sourceValue": "20"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "S&A çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E35",
          "rawValue": "工业双温双控水冷机 特域\nWater cooler (S&A)"
        },
        "sourceValue": "S&A çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E36",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E37",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E38",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Temizlenebilir Yüzeyler",
        "value": "Yüzey pası, boya, korozyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E39",
          "rawValue": "浮锈、油漆、锈蚀\nFloating rust, paint, rust"
        },
        "sourceValue": "Yüzey pası, boya, korozyon"
      },
      {
        "key": "Temizleme Hızı",
        "value": "8-40",
        "unit": "m²/h",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E40",
          "rawValue": "8-40m²/h"
        },
        "sourceValue": "8-40"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "950*660*930",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E41",
          "rawValue": "950*660*930mm"
        },
        "sourceValue": "950*660*930"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "1200*760*1100",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E42",
          "rawValue": "1200*760*1100mm"
        },
        "sourceValue": "1200*760*1100"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "210",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E43",
          "rawValue": "210kg"
        },
        "sourceValue": "210"
      }
    ]
  },
  {
    "code": "LC-2000W",
    "kind": "cleaning",
    "powerKw": 2.0,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "2000",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F26",
          "rawValue": "2000W（MAX/Raycus）"
        },
        "sourceValue": "2000"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F26",
          "rawValue": "2000W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E27",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E28",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / hava",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E29",
          "rawValue": "氮气/空气\nNitrogen/Air"
        },
        "sourceValue": "Azot / hava"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E30",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP22C",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E31",
          "rawValue": "SUP22C"
        },
        "sourceValue": "SUP22C"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-300",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E32",
          "rawValue": "0-300mm"
        },
        "sourceValue": "0-300"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Tek faz 220V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E33",
          "rawValue": "单相220V±5％/\n50-60Hz"
        },
        "sourceValue": "Tek faz 220V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "9.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F34",
          "rawValue": "9.5KW/20KVA"
        },
        "sourceValue": "9.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "20",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F34",
          "rawValue": "9.5KW/20KVA"
        },
        "sourceValue": "20"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "S&A çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E35",
          "rawValue": "工业双温双控水冷机 特域\nWater cooler (S&A)"
        },
        "sourceValue": "S&A çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E36",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E37",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E38",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Temizlenebilir Yüzeyler",
        "value": "Yüzey pası, boya, korozyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E39",
          "rawValue": "浮锈、油漆、锈蚀\nFloating rust, paint, rust"
        },
        "sourceValue": "Yüzey pası, boya, korozyon"
      },
      {
        "key": "Temizleme Hızı",
        "value": "10-60",
        "unit": "m²/h",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F40",
          "rawValue": "10-60m²/h"
        },
        "sourceValue": "10-60"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "950*660*930",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E41",
          "rawValue": "950*660*930mm"
        },
        "sourceValue": "950*660*930"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "1200*760*1100",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E42",
          "rawValue": "1200*760*1100mm"
        },
        "sourceValue": "1200*760*1100"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "230",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "F43",
          "rawValue": "230kg"
        },
        "sourceValue": "230"
      }
    ]
  },
  {
    "code": "LC-3000W",
    "kind": "cleaning",
    "powerKw": 3.0,
    "specs": [
      {
        "key": "Lazer Gücü",
        "value": "3000",
        "unit": "W",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G26",
          "rawValue": "3000W（MAX/Raycus）"
        },
        "sourceValue": "3000"
      },
      {
        "key": "Rezonatör Seçenekleri",
        "value": "MAX/Raycus",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G26",
          "rawValue": "3000W（MAX/Raycus）"
        },
        "sourceValue": "MAX/Raycus"
      },
      {
        "key": "Çalışma Modu",
        "value": "Sürekli / modülasyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E27",
          "rawValue": "连续/调制\nContinuous/Modulation"
        },
        "sourceValue": "Sürekli / modülasyon"
      },
      {
        "key": "Lazer Dalga Boyu",
        "value": "1080±10",
        "unit": "nm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E28",
          "rawValue": "1080±10 nm"
        },
        "sourceValue": "1080±10"
      },
      {
        "key": "Koruyucu Gaz",
        "value": "Azot / hava",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E29",
          "rawValue": "氮气/空气\nNitrogen/Air"
        },
        "sourceValue": "Azot / hava"
      },
      {
        "key": "Koruyucu Gaz Basıncı",
        "value": "≤10",
        "unit": "bar",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E30",
          "rawValue": "≤10bar"
        },
        "sourceValue": "≤10"
      },
      {
        "key": "Lazer Kafası",
        "value": "SUP22C",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E31",
          "rawValue": "SUP22C"
        },
        "sourceValue": "SUP22C"
      },
      {
        "key": "Salınım Genişliği",
        "value": "0-300",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E32",
          "rawValue": "0-300mm"
        },
        "sourceValue": "0-300"
      },
      {
        "key": "Giriş Güç Parametreleri",
        "value": "Üç faz 380V±5％/\n50-60Hz",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G33",
          "rawValue": "三相380V±5％/\n50-60Hz"
        },
        "sourceValue": "Üç faz 380V±5％/\n50-60Hz"
      },
      {
        "key": "Toplam Güç Gereksinimi",
        "value": "13.5",
        "unit": "kW",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G34",
          "rawValue": "13.5KW/30KVA"
        },
        "sourceValue": "13.5"
      },
      {
        "key": "Trafo Kapasitesi",
        "value": "30",
        "unit": "kVA",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G34",
          "rawValue": "13.5KW/30KVA"
        },
        "sourceValue": "30"
      },
      {
        "key": "Soğutma Sistemi",
        "value": "S&A çift sıcaklık kontrollü su soğutucu",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E35",
          "rawValue": "工业双温双控水冷机 特域\nWater cooler (S&A)"
        },
        "sourceValue": "S&A çift sıcaklık kontrollü su soğutucu"
      },
      {
        "key": "Fiber Kablo Uzunluğu",
        "value": "10 m veya özel üreti",
        "unit": "m",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E36",
          "rawValue": "10m或定制\n10m or customized"
        },
        "sourceValue": "10 m veya özel üreti"
      },
      {
        "key": "Çalışma Ortamı Sıcaklığı",
        "value": "5~40",
        "unit": "°C",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E37",
          "rawValue": "5~40"
        },
        "sourceValue": "5~40"
      },
      {
        "key": "Çalışma Ortamı Nemi",
        "value": "<70",
        "unit": "%",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E38",
          "rawValue": "<70"
        },
        "sourceValue": "<70"
      },
      {
        "key": "Temizlenebilir Yüzeyler",
        "value": "Yüzey pası, boya, korozyon",
        "unit": "",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "E39",
          "rawValue": "浮锈、油漆、锈蚀\nFloating rust, paint, rust"
        },
        "sourceValue": "Yüzey pası, boya, korozyon"
      },
      {
        "key": "Temizleme Hızı",
        "value": "20-80",
        "unit": "m²/h",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G40",
          "rawValue": "20-80m²/h"
        },
        "sourceValue": "20-80"
      },
      {
        "key": "Makine Ölçüleri",
        "value": "1100*660*970",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G41",
          "rawValue": "1100*660*970mm"
        },
        "sourceValue": "1100*660*970"
      },
      {
        "key": "Paket Ölçüleri",
        "value": "1400*770*1200",
        "unit": "mm",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G42",
          "rawValue": "1400*770*1200mm"
        },
        "sourceValue": "1400*770*1200"
      },
      {
        "key": "Paket Ağırlığı",
        "value": "310",
        "unit": "kg",
        "groupCode": "GENEL",
        "source": {
          "document": "AORE Technical Parameters.xlsx",
          "sheet": "Kaynak Makinesi",
          "cell": "G43",
          "rawValue": "310kg"
        },
        "sourceValue": "310"
      }
    ]
  }
];


export const LASER_AUXILIARY_MODELS: readonly LaserAuxiliaryModel[] = workbookModels.map((model) => {
  if (!model.code.startsWith('HW-')) return model;
  return { ...model, sourceNotes: ['Haksan 2025 kataloğu, sayfa 26: kaynak dikişi gerekliliği ≤0,05 mm; ana Excel: ≤0,5 mm. Excel değeri korundu.'],
    specs: [...model.specs, { key: 'Çift Tel Besleme Sistemi', value: 'Opsiyonel', sourceValue: 'Opsiyonel', groupCode: 'GENEL',
      source: { document: 'HAKSAN MAKİNA - FİBER LAZER TEKNOLOJİLERİ DİJİTAL ÜRÜN KATALOĞU - 2025', page: 26, rawValue: 'Çift Tel Besleme Sistemi opsiyoneldir.' } }] };
});

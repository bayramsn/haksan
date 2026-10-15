# Marka varlıkları

Buradaki PNG'ler `make-placeholders.mjs` ile üretilmiş **yer tutuculardır**
(düz mavi zemin üzerinde kaba bir "H"). Yayından önce değiştirilmeli.

| Dosya | Boyut | İçerik |
| --- | --- | --- |
| `icon.png` | 1024×1024 | iOS uygulama ikonu. Tam kare, köşeler yuvarlatılmamış, şeffaflık yok, üzerinde metin yok. Zemin markanın ana rengi. |
| `adaptive-icon.png` | 1024×1024 | Android adaptive icon ön planı. Şeffaf zemin; sembol ortadaki 66%'lık güvenli alana sığmalı (kenarlar maskelenir). Zemin rengi `app.config.ts` içinde. |
| `splash-icon.png` | 512×512 | Açılış ekranı sembolü. Şeffaf zemin; ekranda 200×200 pt olarak gösterilir. |
| `notification-icon.png` | 96×96 | Android bildirim ikonu. **Tek renk siluet**: Android alfa kanalı dışındaki her şeyi beyaza çevirir. |

Açılış ekranı zemin renkleri `app.config.ts` içinde tanımlı: aydınlık `#ffffff`,
karanlık `#0b0e14`. Sembol her iki zeminde de okunur olmalı.

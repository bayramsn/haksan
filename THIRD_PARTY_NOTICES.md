# Third-party UI source notices

Haksan'ın arayüz bileşenleri çalışma zamanında harici bir UI servisinden alınmaz. Aşağıdaki açık kaynak örüntüler proje içine alınmış, tema tokenlarına ve erişilebilirlik gereksinimlerine göre uyarlanmıştır.

| Kaynak | Sürüm / erişim tarihi | Lisans | Haksan uyarlaması |
|---|---|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 2026-08-10 | MIT | Radix tabanlı `button-group`, `field`, `input-group`, `item`, `kbd` ve `spinner` kaynak örüntüleri; mevcut Haksan renk, yoğunluk ve focus tokenlarına uyarlandı. |

Kaynak eklenirken mevcut çekirdek bileşenlerin topluca üzerine yazılması yasaktır. Her yeni bileşen ayrı diff, typecheck, erişilebilirlik ve lisans kontrolünden geçer.

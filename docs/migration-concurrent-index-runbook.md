# Canlı PostgreSQL'de concurrent index prosedürü

Bu prosedür yalnız büyük veya yoğun kullanılan mevcut tablolara index eklerken uygulanır. Yeni/boş tablo indexleri normal Drizzle migration'ında kalabilir.

## Değişmez kurallar

- Daha önce uygulanmış migration dosyalarını değiştirmeyin.
- `CREATE INDEX CONCURRENTLY` ve `DROP INDEX CONCURRENTLY` transaction içinde çalışmaz; bunları Drizzle'ın transaction'lı migration zincirine eklemeyin.
- Production adımından önce doğrulanmış yerel ve offsite yedek bulunmalı. VDS/ECR dağıtımındaki backup gate geçmeden SQL çalıştırılmamalıdır.
- SQL, hedef commit, operatör, başlangıç/bitiş zamanı ve sorgu çıktıları release kaydına eklenmelidir.

## 1. Ön kontrol

Tablo boyutunu ve canlı yükü ölçün. UNIQUE index için duplicate kontrolü sıfır satır dönmelidir:

```sql
SELECT candidate_key, COUNT(*)
FROM target_table
GROUP BY candidate_key
HAVING COUNT(*) > 1
LIMIT 20;
```

Birden çok kolonlu UNIQUE indexte aynı kolon ve koşulları kullanın. Duplicate varsa release'i durdurun; veriyi otomatik silmeyin veya birleştirmeyin.

## 2. Transaction dışı uygulama

Ayrı bir `psql` oturumunda, açık bir transaction başlatmadan çalıştırın:

```sql
SET lock_timeout = '5s';
SET statement_timeout = '0';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_target_candidate
ON target_table (candidate_key);
```

UNIQUE gerekiyorsa yalnız duplicate ön kontrolünden sonra `CREATE UNIQUE INDEX CONCURRENTLY` kullanın. Aynı release adımını iki operatör eşzamanlı başlatmamalıdır.

## 3. İlerleme ve doğrulama

```sql
SELECT pid, phase, lockers_total, lockers_done, blocks_total, blocks_done
FROM pg_stat_progress_create_index
WHERE relid = 'target_table'::regclass;

SELECT indexrelid::regclass AS index_name, indisready, indisvalid
FROM pg_index
WHERE indexrelid = 'idx_target_candidate'::regclass;
```

Adım ancak `indisready=true` ve `indisvalid=true` olduğunda başarılıdır. Ardından ilgili sorgu planını `EXPLAIN (ANALYZE, BUFFERS)` ile kontrollü bir örnek üzerinde doğrulayın.

## 4. Hata ve geri alma

Başarısız concurrent oluşturma geçersiz bir index bırakabilir. Önce `pg_index` durumunu kaydedin, sonra transaction dışında temizleyin:

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_target_candidate;
```

Kilidin zaman aşımına uğraması veya bağlantının kopması halinde körlemesine tekrar denemeyin. Geçersiz indexi doğrulayın, temizleyin, yükün uygun olduğu yeni bir bakım penceresi belirleyin. Geri alma da `DROP INDEX CONCURRENTLY` ile yapılır ve sonuç release kaydına eklenir.

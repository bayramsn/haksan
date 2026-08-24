import { z } from 'zod';

/**
 * @haksan/shared şemaları Zod'un varsayılan İngilizce mesajlarını taşır
 * ("String must contain at least 8 character(s)"). Web tarafı bunları hiç
 * göstermeyip kendi Türkçe metnini yazıyor; mobilde tek bir hata haritasıyla
 * aynı sonucu alıyoruz — her form otomatik Türkçeleşir.
 *
 * Şemada açıkça verilmiş mesaj (ör. "Kullanıcı adı veya e-posta zorunludur")
 * bu haritayı ezer, çünkü Zod önce özel mesaja bakar.
 */
const errorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? 'Bu alan zorunludur.' : 'Geçersiz değer.' };

    case z.ZodIssueCode.too_small: {
      const min = Number(issue.minimum);
      if (issue.type === 'string') {
        return { message: min <= 1 ? 'Bu alan zorunludur.' : `En az ${min} karakter olmalı.` };
      }
      if (issue.type === 'array') return { message: `En az ${min} kayıt seçin.` };
      return { message: `En az ${min} olmalı.` };
    }

    case z.ZodIssueCode.too_big: {
      const max = Number(issue.maximum);
      if (issue.type === 'string') return { message: `En fazla ${max} karakter olabilir.` };
      if (issue.type === 'array') return { message: `En fazla ${max} kayıt seçilebilir.` };
      return { message: `En fazla ${max} olabilir.` };
    }

    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Geçerli bir e-posta adresi girin.' };
      if (issue.validation === 'url') return { message: 'Geçerli bir adres girin (https://…).' };
      if (issue.validation === 'uuid') return { message: 'Geçersiz kayıt kimliği.' };
      return { message: 'Biçim geçersiz.' };

    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Listeden bir seçenek seçin.' };

    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(errorMap);

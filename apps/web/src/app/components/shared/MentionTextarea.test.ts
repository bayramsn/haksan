import { describe, expect, it } from "vitest";
import { findMentionQuery, matchMentionUsers } from "./MentionTextarea";

const users = [
  { id: "1", name: "Ahmet Yılmaz" },
  { id: "2", name: "Ayşe Demir" },
  { id: "3", name: "Bayram Şenbay" },
];

describe("@ etiketleme tetikleyicisi", () => {
  it("satır başındaki @ ile açılır", () => {
    expect(findMentionQuery("@ah", 3)).toEqual({ query: "ah", start: 0 });
  });

  it("boşluktan sonraki @ ile açılır ve doğru konumu verir", () => {
    const text = "Teklifi @bay";
    expect(findMentionQuery(text, text.length)).toEqual({ query: "bay", start: 8 });
  });

  it("e-posta adresini etiket sanmaz", () => {
    // Kelimeye bitişik @: boşluk şartı bunu eler.
    expect(findMentionQuery("ahmet@haksan.local", 18)).toBeNull();
  });

  it("imleç etiketin gerisindeyse kapanır", () => {
    // "@ah" yazılmış ama imleç metnin başında: açılır liste görünmemeli.
    expect(findMentionQuery("@ahmet sonra", 12)).toBeNull();
  });

  it("boş sorguda da açılır ki @ yazar yazmaz liste görünsün", () => {
    expect(findMentionQuery("Not: @", 6)).toEqual({ query: "", start: 5 });
  });
});

describe("kişi eşleme", () => {
  it("Türkçe karakterde büyük/küçük harf ayrımı yapmaz", () => {
    expect(matchMentionUsers(users, "ayş").map((u) => u.name)).toEqual(["Ayşe Demir"]);
    expect(matchMentionUsers(users, "ŞENBAY").map((u) => u.name)).toEqual(["Bayram Şenbay"]);
  });

  it("boş sorguda listeyi sınırlı döndürür", () => {
    expect(matchMentionUsers(users, "", 2)).toHaveLength(2);
  });

  it("eşleşme yoksa boş döner", () => {
    expect(matchMentionUsers(users, "zzz")).toEqual([]);
  });
});

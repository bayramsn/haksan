import { useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { Textarea } from "../ui/textarea";

export type MentionUser = { id: string; name: string };

/**
 * Sunucu tarafı `@` eşlemesi tam ad, ilk ad veya e-posta kullanıcı adına bakar
 * ve adın ardından harf/rakam gelmemesini şart koşar. Seçim sonrası bu yüzden
 * adın arkasına boşluk konur — yoksa yazmaya devam eden kullanıcı etiketi
 * farkında olmadan bozar.
 */
const TRIGGER = /(^|\s)@([\p{L}\p{N}._-]*)$/u;

export function findMentionQuery(value: string, caret: number): { query: string; start: number } | null {
  const match = TRIGGER.exec(value.slice(0, caret));
  if (!match) return null;
  return { query: match[2] ?? "", start: caret - (match[2]?.length ?? 0) - 1 };
}

export function matchMentionUsers(users: MentionUser[], query: string, limit = 6): MentionUser[] {
  const needle = query.toLocaleLowerCase("tr");
  return users.filter((user) => !needle || user.name.toLocaleLowerCase("tr").includes(needle)).slice(0, limit);
}

/**
 * `@` yazınca kullanıcı listesi açan not alanı. Adı elle ve doğru yazma
 * zorunluluğunu kaldırır: etiketlenen kişi bildirim aldığı için yanlış yazılan
 * ad sessizce kimseye ulaşmıyordu.
 */
export function MentionTextarea({
  value,
  onValueChange,
  users,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  users: MentionUser[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  const suggestions = useMemo(
    () => (mention ? matchMentionUsers(users, mention.query) : []),
    [mention, users]
  );

  const sync = (next: string, caret: number) => {
    onValueChange(next);
    const found = findMentionQuery(next, caret);
    setMention(found);
    setActive(0);
  };

  const insert = (user: MentionUser) => {
    if (!mention) return;
    const element = ref.current;
    const caret = element?.selectionStart ?? value.length;
    const next = `${value.slice(0, mention.start)}@${user.name} ${value.slice(caret)}`;
    onValueChange(next);
    setMention(null);
    // Etiketin hemen arkasına dönmezsek kullanıcı yazmaya metnin sonundan devam eder.
    queueMicrotask(() => {
      const position = mention.start + user.name.length + 2;
      element?.focus();
      element?.setSelectionRange(position, position);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insert(suggestions[active]!);
    } else if (event.key === "Escape") {
      setMention(null);
    }
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        onChange={(event) => sync(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 120)}
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
      />
      {mention && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Etiketlenecek kişiler"
          className="absolute z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          {suggestions.map((user, index) => (
            <li key={user.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insert(user)}
                className={`block w-full px-3 py-2 text-left text-sm ${index === active ? "bg-muted" : "hover:bg-muted/60"}`}
              >
                {user.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Akışta `@ad` parçalarını vurgular. Etiketin görünür olması, bahsedilen
 * kişinin kendi adını taramadan bulabilmesi demek.
 */
export function renderMentions(text: string, users: MentionUser[]) {
  if (!text.includes("@")) return text;
  const names = users
    .map((user) => user.name)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (names.length === 0) return text;
  const pattern = new RegExp(`@(?:${names.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const parts: Array<string | { mention: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push({ mention: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.map((part, index) =>
    typeof part === "string" ? (
      <span key={index}>{part}</span>
    ) : (
      <span key={index} className="rounded bg-info-soft px-1 font-medium text-info">
        {part.mention}
      </span>
    )
  );
}

"""Onboarding sahnelerini (index.html) üretir. Her slayt 3 sn'lik bir sahne;
render sonrası sahneler ayrı GIF'lere bölünür (uygulamadaki assets/onboarding/stepNN.gif):
  hyperframes render -o film.mp4 --fps 20 --quality delivery
  her i için: ffmpeg -ss 3i -t 2.95 -i film.mp4 -lavfi "fps=20,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 1 stepNN.gif
Değiştirmek için bu dosyayı düzenleyip `python3 build.py` çalıştırın."""

W, H, SCENE = 760, 732, 3.0
RED, NAVY, INK, MUTED = "#d7282f", "#0b1673", "#1f2430", "#8a909c"

ICONS = {  # 24x24 stroke ikonları
    "doc": '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    "cart": '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 8H7"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.8-3.5 3.5-5 6.5-5s5.7 1.5 6.5 5M16 14.5c2.6 0 4.6 1.3 5.5 4"/>',
    "box": '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    "chart": '<path d="M5 20V12M10 20V8M15 20v-6M20 20V5"/>',
    "pie": '<path d="M12 3v9h9a9 9 0 1 1-9-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    "truck": '<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    "wallet": '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
    "cal": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    "factory": '<path d="M3 21V10l6 4V10l6 4V5h6v16z"/>',
    "lock": '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "pin": '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
}


def icon(name, size=26, color=RED, sw=1.9):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>')


def card(cid, x, y, w, ic, title, sub="", lines=2, extra=""):
    bars = "".join(f'<i style="width:{78 - k * 22}%"></i>' for k in range(lines))
    sub_html = f'<b>{sub}</b>' if sub else ""
    return (f'<div id="{cid}" class="card" style="left:{x}px;top:{y}px;width:{w}px">'
            f'<div class="ic">{icon(ic)}</div><div class="tx"><h3>{title}</h3>{bars}{sub_html}</div>{extra}</div>')


def badge(cid, x, y, txt, bg=RED):
    return f'<div id="{cid}" class="badge" style="left:{x}px;top:{y}px;background:{bg}">{txt}</div>'


def check(cid, x, y, size=46):
    return (f'<div id="{cid}" class="ok" style="left:{x}px;top:{y}px;width:{size}px;height:{size}px">'
            f'{icon("check", size * 0.55, "#fff", 2.6)}</div>')


scenes, anim = [], []


def scene(i, body, js):
    t0 = i * SCENE
    scenes.append(f'<div id="s{i}" class="scene clip" data-start="{t0}" data-duration="{SCENE}" '
                  f'data-track-index="0">{body}</div>')
    anim.append(f"// sahne {i + 1}\n(function(T){{{js}}})({t0});")


POP = "{opacity:0,scale:0.82,y:18},{opacity:1,scale:1,y:0,duration:0.5,ease:'back.out(1.6)'}"
FADE_UP = "{opacity:0,y:22},{opacity:1,y:0,duration:0.45,ease:'power3.out'}"

# 1 · Hoş geldiniz: logo merkezde, modüller çevresinde belirir, bağlantılar akar.
mods = [("m1", 250, 24, "factory", "Üretim"), ("m2", 24, 168, "box", "Stok"), ("m3", 496, 168, "users", "Müşteriler"),
        ("m4", 24, 470, "chart", "Finans"), ("m5", 496, 470, "cart", "Satınalma"), ("m6", 250, 600, "pie", "Raporlama")]
lines = "".join(f'<line class="ln" x1="380" y1="366" x2="{x + 120}" y2="{y + 52}"/>' for _, x, y, *_ in mods)
dots = "".join(f'<div class="flow" id="f{k}"></div>' for k in range(6))
scene(0, f'<svg class="wire" width="{W}" height="{H}">{lines}</svg>{dots}'
      f'<div id="s0-logo" class="hub"><img src="assets/logo.png"/></div>'
      + "".join(card(c, x, y, 240, ic, t) for c, x, y, ic, t in mods),
      f"tl.fromTo('#s0-logo',{POP},T+0.05);"
      f"tl.fromTo('#s0 .ln',{{opacity:0}},{{opacity:1,duration:0.4,stagger:0.08}},T+0.35);"
      + "".join(f"tl.fromTo('#{c}',{POP},T+0.45+{k}*0.12);" for k, (c, *_) in enumerate(mods))
      + "".join(f"tl.fromTo('#f{k}',{{x:380,y:366,opacity:0}},{{x:{x + 120},y:{y + 52},opacity:1,duration:0.9,ease:'power1.inOut'}},T+1.3+{k}*0.07);"
                f"tl.to('#f{k}',{{opacity:0,duration:0.2}},T+2.2+{k}*0.07);" for k, (_, x, y, *_) in enumerate(mods)))

# 2 · Stok: makine kartı, depo doluluk çubukları, seri no rozeti.
depots = [("Merkez Depo", 72), ("Şube Depo", 45), ("Yedek Parça", 88)]
rows = "".join(f'<div class="row" id="s1r{k}"><span>{n}</span><div class="bar"><u id="s1b{k}" style="width:{p}%"></u></div>'
               f'<em>%{p}</em></div>' for k, (n, p) in enumerate(depots))
scene(1, card("s1-m", 130, 170, 500, "box", "LK VM-6 CNC Dik İşleme", "SN-HK-2026-0142", 1)
      + badge("s1-b", 560, 154, "Stokta 12") + f'<div class="panel" id="s1-p" style="left:130px;top:370px;width:500px">{rows}</div>',
      f"tl.fromTo('#s1-m',{POP},T+0.05);tl.fromTo('#s1-b',{POP},T+0.5);"
      f"tl.fromTo('#s1-p',{FADE_UP},T+0.6);"
      + "".join(f"tl.fromTo('#s1b{k}',{{scaleX:0}},{{scaleX:1,duration:0.8,ease:'power2.out'}},T+0.9+{k}*0.15);" for k in range(3)))

# 3 · Tekliften siparişe: üç belge sırayla, oklar, onay.
docs = [("s2a", 70, "doc", "Teklif", "₺ 25.500", "1"), ("s2b", 270, "doc", "Proforma", "₺ 25.500", "2"),
        ("s2c", 470, "cart", "Sipariş", "SIP-2026-0123", "3")]
scene(2, "".join(card(c, 150, y, 360, ic, t, s, 1) + badge(c + "n", 490, y - 14, n) for c, y, ic, t, s, n in docs)
      + '<div class="arrow" id="s2x1" style="left:326px;top:184px"></div><div class="arrow" id="s2x2" style="left:326px;top:384px"></div>'
      + check("s2ok", 580, 300, 64) + '<div class="lbl" id="s2l" style="left:556px;top:372px">Onaylandı</div>',
      "".join(f"tl.fromTo('#{c}',{POP},T+0.05+{k}*0.45);tl.fromTo('#{c}n',{POP},T+0.3+{k}*0.45);" for k, (c, *_) in enumerate(docs))
      + f"tl.fromTo('#s2x1',{{scaleY:0}},{{scaleY:1,duration:0.3}},T+0.4);tl.fromTo('#s2x2',{{scaleY:0}},{{scaleY:1,duration:0.3}},T+0.85);"
      f"tl.fromTo('#s2ok',{POP},T+1.55);tl.fromTo('#s2l',{FADE_UP},T+1.7);")

# 4 · Fırsat panosu: kart Lead'den A'ya ilerler.
cols = ["Lead", "C", "B", "A"]
colhtml = "".join(f'<div class="col" style="left:{40 + k * 175}px"><h4>{c}</h4><i></i><i></i></div>' for k, c in enumerate(cols))
scene(3, colhtml + card("s3c", 40, 300, 160, "user", "ETİ BAKIR", "$ 85.000", 0),
      "tl.fromTo('#s3 .col',{opacity:0,y:20},{opacity:1,y:0,duration:0.4,stagger:0.08},T+0.05);"
      f"tl.fromTo('#s3c',{POP},T+0.5);"
      + "".join(f"tl.to('#s3c',{{x:{k * 175},duration:0.45,ease:'power3.inOut'}},T+0.9+{k - 1}*0.5);" for k in range(1, 4))
      + "tl.to('#s3c',{boxShadow:'0 0 0 3px #d7282f, 0 14px 30px rgba(20,25,40,.12)',duration:0.3},T+2.3);")

# 5 · Servis ve kurulum: takvim kartı, teknisyen, kontrol listesi.
items = ["Montaj tamamlandı", "Deneme kesimi yapıldı", "Teslim tutanağı imzalandı"]
checklist = "".join(f'<div class="row" id="s4r{k}"><div class="tick" id="s4t{k}">{icon("check", 16, "#fff", 3)}</div><span>{t}</span></div>'
                    for k, t in enumerate(items))
scene(4, card("s4c", 130, 150, 500, "cal", "Kurulum · 24 Kasım 10:00", "Teknisyen: A. Yılmaz", 1)
      + f'<div class="panel" id="s4p" style="left:130px;top:300px;width:500px">{checklist}</div>',
      f"tl.fromTo('#s4c',{POP},T+0.05);tl.fromTo('#s4p',{FADE_UP},T+0.45);"
      + "".join(f"tl.fromTo('#s4t{k}',{{scale:0,backgroundColor:'#d9dce2'}},{{scale:1,backgroundColor:'#22a06b',duration:0.35,ease:'back.out(2)'}},T+0.9+{k}*0.4);" for k in range(3)))

# 6 · Sevkiyat: kamyon rota boyunca ilerler, durum adımları yanar.
steps = ["Yüklendi", "Yolda", "Teslim edildi"]
stephtml = "".join(f'<div class="step" id="s5s{k}" style="left:{90 + k * 200}px">{s}</div>' for k, s in enumerate(steps))
scene(5, '<div class="route" id="s5rt"></div>'
      + f'<div class="pinbox" id="s5a" style="left:25px;top:250px">{icon("pin", 34)}<span>Depo</span></div>'
      + f'<div class="pinbox" id="s5b" style="left:625px;top:250px">{icon("pin", 34)}<span>Müşteri</span></div>'
      + f'<div class="truck" id="s5t">{icon("truck", 40, "#fff", 1.8)}</div>' + stephtml,
      "tl.fromTo('#s5rt',{scaleX:0},{scaleX:1,duration:0.6,ease:'power2.out'},T+0.05);"
      f"tl.fromTo('#s5a',{POP},T+0.1);tl.fromTo('#s5b',{POP},T+0.3);"
      "tl.fromTo('#s5t',{x:110,opacity:0},{x:110,opacity:1,duration:0.25},T+0.5);"
      "tl.to('#s5t',{x:560,duration:1.4,ease:'power1.inOut'},T+0.8);"
      + "".join(f"tl.fromTo('#s5s{k}',{{opacity:0.25,y:8}},{{opacity:1,y:0,duration:0.3}},T+0.6+{k}*0.65);"
                f"tl.to('#s5s{k}',{{backgroundColor:'#d7282f',color:'#fff',duration:0.25}},T+0.7+{k}*0.65);" for k in range(3)))

# 7 · Cari ve finans: tahsilat sayacı, sütunlar, ödeme alındı.
bars7 = "".join(f'<u id="s6b{k}" style="left:{k * 70}px;height:{h}px"></u>' for k, h in enumerate([60, 95, 80, 130, 115, 170]))
scene(6, card("s6c", 130, 110, 500, "wallet", "Tahsilat", "", 0, '<div class="big" id="s6n">₺ 0</div>')
      + f'<div class="chart" id="s6ch" style="left:182px;top:290px">{bars7}</div>'
      + '<div class="chip" id="s6ok">✓ Ödeme alındı</div>',
      f"tl.fromTo('#s6c',{POP},T+0.05);"
      "var o={v:0};tl.to(o,{v:184250,duration:1.3,ease:'power2.out',onUpdate:function(){document.getElementById('s6n').textContent='₺ '+Math.round(o.v).toLocaleString('tr-TR');}},T+0.4);"
      "tl.fromTo('#s6ch u',{scaleY:0},{scaleY:1,duration:0.6,stagger:0.1,ease:'power2.out'},T+0.5);"
      f"tl.fromTo('#s6ok',{POP},T+1.8);")

# 8 · Raporlama: çizgi grafik çizilir, KPI'lar sayar.
kpis = [("s7k0", "Satış", 18, "+%"), ("s7k1", "Teklif", 42, ""), ("s7k2", "Kazanma", 36, "%")]
kpihtml = "".join(f'<div class="kpi" id="{c}" style="left:{60 + k * 220}px"><span>{n}</span><b id="{c}v">0</b></div>' for k, (c, n, *_) in enumerate(kpis))
scene(7, kpihtml + f'<svg class="graph" id="s7g" width="{W}" height="{H}"><path id="s7p" d="M70 620 L190 560 L310 585 L430 470 L550 430 L690 330"/></svg>',
      "tl.fromTo('#s7 .kpi',{opacity:0,y:20},{opacity:1,y:0,duration:0.4,stagger:0.1,ease:'power3.out'},T+0.05);"
      "var p=document.getElementById('s7p'),L=p.getTotalLength();p.style.strokeDasharray=L;"
      "tl.fromTo(p,{strokeDashoffset:L},{strokeDashoffset:0,duration:1.3,ease:'power2.inOut'},T+0.5);"
      + "".join(f"(function(){{var o={{v:0}};tl.to(o,{{v:{v},duration:1.1,ease:'power2.out',onUpdate:function(){{"
                f"document.getElementById('{c}v').textContent='{pre}'+Math.round(o.v);}}}},T+0.4);}})();"
                for c, _, v, pre in kpis))

# 9 · Rol ve onay: onay zinciri sırayla tamamlanır.
roles = [("s8a", "Satış", "Hazırladı"), ("s8b", "Satış Müdürü", "Onayladı"), ("s8c", "Finans", "Onayladı")]
rolehtml = "".join(card(c, 160, 70 + k * 200, 440, "user", r, s, 0) + check(c + "k", 610, 92 + k * 200)
                   for k, (c, r, s) in enumerate(roles))
scene(8, rolehtml + '<div class="arrow" id="s8x1" style="left:376px;top:172px"></div><div class="arrow" id="s8x2" style="left:376px;top:372px"></div>'
      + f'<div class="lockb" id="s8l">{icon("lock", 22)}<span>Yetki: SATIŞ</span></div>',
      "".join(f"tl.fromTo('#{c}',{POP},T+0.05+{k}*0.35);tl.fromTo('#{c}k',{POP},T+0.9+{k}*0.4);" for k, (c, *_) in enumerate(roles))
      + "tl.fromTo('#s8x1',{scaleY:0},{scaleY:1,duration:0.3},T+0.3);tl.fromTo('#s8x2',{scaleY:0},{scaleY:1,duration:0.3},T+0.65);"
      f"tl.fromTo('#s8l',{FADE_UP},T+2.1);")

# 10 · Hazırsınız: logo, halka çizilir, onay.
scene(9, f'<svg class="ring" width="{W}" height="{H}"><circle id="s9r" cx="380" cy="330" r="190"/></svg>'
      '<div id="s9-logo" class="hub" style="top:270px"><img src="assets/logo.png"/></div>' + check("s9ok", 345, 470, 70),
      f"tl.fromTo('#s9-logo',{POP},T+0.05);"
      "var c=document.getElementById('s9r'),C=2*Math.PI*190;c.style.strokeDasharray=C;"
      "tl.fromTo(c,{strokeDashoffset:C},{strokeDashoffset:0,duration:1.2,ease:'power2.inOut'},T+0.3);"
      f"tl.fromTo('#s9ok',{POP},T+1.4);")

TOTAL = SCENE * len(scenes)
html = f"""<!doctype html>
<!-- build.py tarafından üretildi; elle düzenlemeyin. -->
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: #faf9f7; font-family: Inter, sans-serif; color: {INK}; }}
      #root {{ position: relative; width: 100%; height: 100%; }}
      .scene {{ position: absolute; inset: 0; background: #faf9f7; overflow: hidden; }}
      .card {{ position: absolute; display: flex; gap: 14px; align-items: center; padding: 16px 18px; background: #fff; border-radius: 16px;
              box-shadow: 0 14px 30px rgba(20,25,40,.08), 0 1px 0 rgba(20,25,40,.04); }}
      .ic {{ width: 52px; height: 52px; flex: none; display: grid; place-items: center; border-radius: 13px; background: #fdecec; }}
      .tx {{ flex: 1; min-width: 0; }}
      .tx h3 {{ font-size: 19px; font-weight: 700; margin-bottom: 6px; white-space: nowrap; }}
      .tx i {{ display: block; height: 6px; border-radius: 3px; background: #eceef2; margin-top: 6px; }}
      .tx b {{ display: block; font-size: 16px; font-weight: 700; color: {MUTED}; margin-top: 6px; }}
      .badge {{ position: absolute; padding: 6px 12px; border-radius: 999px; color: #fff; font-weight: 700; font-size: 15px; }}
      .ok {{ position: absolute; display: grid; place-items: center; border-radius: 50%; background: #22a06b; box-shadow: 0 8px 20px rgba(34,160,107,.3); }}
      .lbl {{ position: absolute; font-weight: 700; font-size: 17px; }}
      .wire {{ position: absolute; inset: 0; }} .wire .ln {{ stroke: #e2a3a6; stroke-width: 2; stroke-dasharray: 5 7; }}
      .flow {{ position: absolute; left: -6px; top: -6px; width: 12px; height: 12px; border-radius: 50%; background: {RED}; }}
      .hub {{ position: absolute; left: 230px; top: 316px; width: 300px; padding: 18px 22px; background: #fff; border-radius: 22px;
             box-shadow: 0 18px 40px rgba(20,25,40,.12); }} .hub img {{ width: 100%; display: block; }}
      .panel {{ position: absolute; padding: 8px 22px; background: #fff; border-radius: 16px; box-shadow: 0 14px 30px rgba(20,25,40,.08); }}
      .row {{ display: flex; align-items: center; gap: 14px; padding: 16px 0; font-size: 18px; font-weight: 600; }}
      .row + .row {{ border-top: 1px solid #eef0f3; }} .row span {{ width: 150px; flex: none; }} .row em {{ font-style: normal; color: {MUTED}; width: 46px; text-align: right; }}
      .bar {{ flex: 1; height: 12px; border-radius: 6px; background: #eef0f3; overflow: hidden; }}
      .bar u {{ display: block; height: 100%; border-radius: 6px; background: {RED}; transform-origin: left; }}
      .arrow {{ position: absolute; width: 8px; height: 46px; transform-origin: top; }}
      .arrow::before {{ content: ''; position: absolute; left: 3px; top: 0; bottom: 8px; width: 2px; background: #6b7280; }}
      .arrow::after {{ content: ''; position: absolute; left: -2px; bottom: 0; border: 6px solid transparent; border-top: 9px solid #6b7280; border-bottom: 0; }}
      .col {{ position: absolute; top: 90px; width: 160px; height: 520px; padding: 14px; border-radius: 16px; background: #f1f2f5; }}
      .col h4 {{ font-size: 18px; color: {NAVY}; margin-bottom: 14px; }} .col i {{ display: block; height: 70px; border-radius: 12px; background: #fff; margin-bottom: 12px; opacity: .7; }}
      #s3c {{ padding: 12px; gap: 10px; }} #s3c .ic {{ width: 40px; height: 40px; }} #s3c h3 {{ font-size: 15px; }} #s3c b {{ font-size: 14px; }}
      .tick {{ width: 28px; height: 28px; flex: none; display: grid; place-items: center; border-radius: 50%; background: #22a06b; }}
      .row .tick + span {{ width: auto; }}
      .route {{ position: absolute; left: 80px; top: 330px; width: 600px; height: 4px; border-radius: 2px; transform-origin: left;
               background: repeating-linear-gradient(90deg, {RED} 0 14px, transparent 14px 24px); }}
      .pinbox {{ position: absolute; width: 110px; display: flex; flex-direction: column; align-items: center; gap: 6px; font-weight: 700; font-size: 17px; }}
      .truck {{ position: absolute; left: 0; top: 296px; width: 72px; height: 72px; display: grid; place-items: center; border-radius: 18px; background: {NAVY};
               box-shadow: 0 12px 26px rgba(11,22,115,.3); }}
      .step {{ position: absolute; top: 470px; width: 180px; padding: 12px 0; text-align: center; border-radius: 999px; background: #fff; font-weight: 700; font-size: 17px;
              box-shadow: 0 10px 24px rgba(20,25,40,.08); }}
      .big {{ position: absolute; right: 24px; top: 50%; transform: translateY(-50%); font-size: 34px; font-weight: 800; color: {NAVY}; }}
      .chart {{ position: absolute; width: 400px; height: 190px; }}
      .chart u {{ position: absolute; bottom: 0; width: 46px; border-radius: 10px 10px 4px 4px; background: {RED}; transform-origin: bottom; }}
      .chart u:nth-child(odd) {{ background: #f0a7aa; }}
      .chip {{ position: absolute; left: 268px; top: 530px; padding: 12px 22px; border-radius: 999px; background: #e7f6ef; color: #16794f; font-weight: 700; font-size: 18px; }}
      .kpi {{ position: absolute; top: 70px; width: 200px; padding: 18px; background: #fff; border-radius: 16px; box-shadow: 0 14px 30px rgba(20,25,40,.08); }}
      .kpi span {{ display: block; color: {MUTED}; font-weight: 600; font-size: 16px; }} .kpi b {{ display: block; font-size: 38px; font-weight: 800; color: {NAVY}; margin-top: 4px; }}
      .graph, .ring {{ position: absolute; inset: 0; }} #s7p {{ fill: none; stroke: {RED}; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }}
      #s9r {{ fill: none; stroke: {RED}; stroke-width: 6; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 380px 330px; }}
      .lockb {{ position: absolute; left: 270px; top: 640px; display: flex; gap: 10px; align-items: center; padding: 10px 18px; border-radius: 999px; background: #fff;
               font-weight: 700; box-shadow: 0 10px 24px rgba(20,25,40,.08); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
      {"".join(scenes)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      {chr(10).join(anim)}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
"""
open("index.html", "w").write(html)
print(f"index.html: {len(scenes)} sahne, {TOTAL} sn")

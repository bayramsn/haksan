import type { Product, ProductSpec } from "../mock";
import { BASE_CSS, esc, haksanHeader, trShortDate, type PrintDocument } from "./core";

export type ProductTechnicalPrintInput = {
  product: Product;
  standardEquipment?: string[];
  optionalEquipment?: Array<{ title: string; description?: string | null }>;
  documents?: Array<{ title?: string | null }>;
  generatedAt?: Date;
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  if (!items.length) return [];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
};

const pageNumber = (current: number, total: number) =>
  `<div class="pageno">Sayfa <b>${current}</b> / <b>${total}</b></div>`;

const specGroup = (spec: ProductSpec) => spec.groupName || spec.groupCode || "Teknik Özellikler";

const technicalHeader = (assetBase: string, title: string, subtitle?: string) => `
  ${haksanHeader(assetBase)}
  <div class="tech-title">
    <div>
      <div class="tech-kicker">ÜRÜN DOKÜMANI</div>
      <h1>${esc(title)}</h1>
    </div>
    ${subtitle ? `<div class="tech-subtitle">${esc(subtitle)}</div>` : ""}
  </div>
`;

const specsTable = (specs: ProductSpec[]) => {
  let activeGroup = "";
  return `
    <table class="spec-table">
      <thead><tr><th>Teknik Özellik</th><th>Değer</th></tr></thead>
      <tbody>
        ${specs.map((spec) => {
          const group = specGroup(spec);
          const groupRow = group !== activeGroup
            ? `<tr class="spec-group"><td colspan="2">${esc(group)}</td></tr>`
            : "";
          activeGroup = group;
          const unit = spec.unit || spec.specUnit;
          return `${groupRow}<tr><td>${esc(spec.key)}</td><td>${esc(spec.value)}${unit ? ` <span>${esc(unit)}</span>` : ""}</td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
};

export const productTechnicalDoc = (
  input: ProductTechnicalPrintInput,
  assetBase: string,
): PrintDocument => {
  const { product } = input;
  const specs = (product.specs ?? []).filter((spec) => spec.key?.trim() && spec.value?.trim());
  const specPages = chunk(specs, 25);
  const standardEquipment = (input.standardEquipment ?? product.standardEquipment ?? []).filter(Boolean);
  const optionalEquipment = (input.optionalEquipment ?? (product.optionalEquipment ?? []).map((title) => ({ title })))
    .filter((item) => item.title?.trim());
  const hasEquipmentPage = standardEquipment.length > 0 || optionalEquipment.length > 0;
  const totalPages = 1 + specPages.length + Number(hasEquipmentPage);
  const productName =
    product.shortDescription?.trim()
    || [product.brand, product.series, product.modelName || product.model].filter(Boolean).join(" ");
  const modelLabel = product.modelName || product.model;
  let page = 1;

  const profileRows = [
    ["Ürün Grubu", product.productGroup],
    ["Ürün Kategorisi", product.category],
    ["Ürün Alt Kategorisi", product.subcategory],
    ["Ürün Tipi", product.type],
    ["Ürün Markası", product.brand],
    ["Ürün Serisi", product.series],
    ["Ürün Adı / Model", modelLabel],
    ["Menşei", product.originCountry],
    ["GTİP", product.hsCode],
  ].filter(([, value]) => String(value ?? "").trim());

  const cover = `
    <section class="page">
      ${technicalHeader(assetBase, "ÜRÜN TEKNİK BİLGİ FORMU", trShortDate(input.generatedAt ?? new Date()))}
      <div class="product-name">${esc(productName)}</div>
      <div class="profile-grid">
        <div class="product-visual">
          ${product.imageUrl
            ? `<img src="${esc(product.imageUrl)}" alt="${esc(productName)}">`
            : `<div class="image-empty">Ürün görseli bulunmuyor</div>`}
        </div>
        <table class="profile-table">
          <tbody>
            ${profileRows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${product.description?.trim() ? `
        <div class="section-block">
          <h2>Ürün Açıklaması</h2>
          <p>${esc(product.description).replace(/\n/g, "<br>")}</p>
        </div>
      ` : ""}
      ${(input.documents ?? []).length ? `
        <div class="document-strip">
          <b>İlgili teknik dokümanlar:</b>
          ${(input.documents ?? []).map((document) => esc(document.title || "Ürün dokümanı")).join(" · ")}
        </div>
      ` : ""}
      ${pageNumber(page++, totalPages)}
    </section>
  `;

  const technicalPages = specPages.map((pageSpecs, index) => `
    <section class="page">
      ${technicalHeader(assetBase, "TEKNİK ÖZELLİKLER", `${productName}${specPages.length > 1 ? ` · ${index + 1}/${specPages.length}` : ""}`)}
      ${specsTable(pageSpecs)}
      ${pageNumber(page++, totalPages)}
    </section>
  `).join("");

  const equipmentPage = hasEquipmentPage ? `
    <section class="page">
      ${technicalHeader(assetBase, "DONANIM BİLGİLERİ", productName)}
      <div class="equipment-grid">
        <div class="equipment-panel">
          <h2>Standart Donanım</h2>
          ${standardEquipment.length
            ? `<ul>${standardEquipment.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
            : `<p class="empty">Standart donanım bilgisi girilmemiş.</p>`}
        </div>
        <div class="equipment-panel optional">
          <h2>Uyumlu Opsiyonel Donanım</h2>
          ${optionalEquipment.length
            ? `<ul>${optionalEquipment.map((item) => `
                <li>
                  <b>${esc(item.title)}</b>
                  ${item.description ? `<span>${esc(item.description)}</span>` : ""}
                </li>
              `).join("")}</ul>`
            : `<p class="empty">Opsiyonel donanım bilgisi girilmemiş.</p>`}
        </div>
      </div>
      ${pageNumber(page++, totalPages)}
    </section>
  ` : "";

  return {
    title: `${productName} - Teknik Bilgi Formu`,
    css: `${BASE_CSS}
      .page { padding: 9mm 12mm 10mm; color: #172033; }
      .letterhead { height: 25mm; object-fit: contain; object-position: left center; }
      .tech-title {
        margin-top: 5mm; padding: 4mm 5mm; border-left: 4px solid #d51d2f;
        background: #f3f6fb; display: flex; align-items: flex-end; justify-content: space-between; gap: 8mm;
      }
      .tech-kicker { color: #d51d2f; font-size: 7.5pt; font-weight: 800; letter-spacing: 1.4px; }
      .tech-title h1 { color: #081b49; font-size: 17pt; line-height: 1.1; margin-top: 1.2mm; }
      .tech-subtitle { max-width: 82mm; text-align: right; color: #5d677a; font-size: 8.5pt; line-height: 1.35; }
      .product-name { margin: 6mm 0 4mm; color: #081b49; font-size: 19pt; font-weight: 800; line-height: 1.15; }
      .profile-grid { display: grid; grid-template-columns: 1.08fr .92fr; gap: 5mm; align-items: start; }
      .product-visual {
        min-height: 82mm; border: 1px solid #d8dee9; background: #f8fafc;
        display: flex; align-items: center; justify-content: center; padding: 4mm;
      }
      .product-visual img { width: 100%; max-height: 79mm; object-fit: contain; }
      .image-empty { color: #8b95a7; font-size: 9pt; }
      .profile-table { width: 100%; border: 1px solid #d8dee9; font-size: 8.8pt; }
      .profile-table th, .profile-table td { border-bottom: 1px solid #e3e7ee; padding: 2.35mm 2.8mm; text-align: left; vertical-align: top; }
      .profile-table th { width: 43%; background: #f3f6fb; color: #526078; font-weight: 700; }
      .profile-table td { color: #081b49; font-weight: 700; }
      .section-block { margin-top: 6mm; border-top: 2px solid #081b49; padding-top: 3mm; }
      .section-block h2, .equipment-panel h2 { color: #081b49; font-size: 11pt; margin-bottom: 2.5mm; }
      .section-block p { color: #3f4a5e; font-size: 9.2pt; line-height: 1.48; }
      .document-strip { margin-top: 5mm; padding: 3mm 4mm; background: #f8fafc; border: 1px solid #e1e6ef; color: #526078; font-size: 8.5pt; }
      .spec-table { width: 100%; margin-top: 6mm; border: 1px solid #cfd6e2; font-size: 9pt; }
      .spec-table th { padding: 2.8mm 3mm; background: #081b49; color: #fff; text-align: left; font-size: 8pt; letter-spacing: .4px; }
      .spec-table th:last-child { width: 42%; }
      .spec-table td { border-bottom: 1px solid #e1e6ef; padding: 2.45mm 3mm; vertical-align: top; }
      .spec-table td:last-child { color: #081b49; font-weight: 700; }
      .spec-table td span { color: #69758a; font-weight: 500; }
      .spec-group td { padding: 2mm 3mm; background: #eef2f8; color: #d51d2f !important; font-size: 8pt; font-weight: 800 !important; letter-spacing: .55px; text-transform: uppercase; }
      .equipment-grid { margin-top: 7mm; display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
      .equipment-panel { border: 1px solid #d8dee9; border-top: 3px solid #081b49; padding: 4mm; }
      .equipment-panel.optional { border-top-color: #d51d2f; }
      .equipment-panel ul { list-style: none; }
      .equipment-panel li { position: relative; padding: 2.3mm 1mm 2.3mm 5mm; border-bottom: 1px solid #e7eaf0; color: #2e394d; font-size: 9pt; line-height: 1.35; }
      .equipment-panel li::before { content: "✓"; position: absolute; left: .5mm; color: #d51d2f; font-weight: 800; }
      .equipment-panel li span { display: block; margin-top: .7mm; color: #6c778b; font-size: 8pt; }
      .empty { color: #8b95a7; font-size: 9pt; }
      .pageno { color: #6c778b; font-size: 8pt; }
    `,
    body: `${cover}${technicalPages}${equipmentPage}`,
  };
};

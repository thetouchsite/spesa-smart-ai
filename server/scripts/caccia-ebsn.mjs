/**
 * Caccia alla piattaforma: chi altro monta EBSN?
 *
 * EBSN e' il programma che parecchie insegne italiane usano per la spesa
 * online. Si riconosce da una cosa sola: `/ebsn/api/products` risponde in JSON,
 * senza chiave e senza sessione. Chi ce l'ha regala il catalogo interrogabile
 * dal vivo — niente sitemap da scaricare, e a cercare e' il motore del negozio,
 * che lo fa meglio di qualunque euristica nostra.
 *
 * IL NEGOZIO NON STA SUL SITO DELL'INSEGNA, e questo script esiste per quello.
 * Conad vende su `spesaonline.conad.it`, Unes su `spesaonline.unes.it`, Pam su
 * `pamacasa.pampanorama.it`, Deco su `decoacasa.multicedi.it`. Sondando i siti
 * corporate si conclude che quelle catene non abbiano catalogo, ed e' falso.
 * Qui le varianti si generano tutte e si provano tutte: costa una richiesta per
 * indirizzo, e una richiesta non si nega a nessuno.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** I modi in cui le insegne italiane chiamano il proprio negozio online. */
function varianti(marchio) {
  const m = marchio.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    `www.${m}.it`,
    `${m}.it`,
    `spesaonline.${m}.it`,
    `spesa.${m}.it`,
    `shop.${m}.it`,
    `online.${m}.it`,
    `${m}online.it`,
    `${m}acasa.it`,
    `spesa${m}.it`,
    `www.${m}.com`,
    `online.${m}.com`,
    `shop.${m}.com`,
  ];
}

async function haEbsn(host) {
  try {
    const r = await fetch(`https://${host}/ebsn/api/products?q=latte&page_size=3`, {
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": UA, Accept: "application/json", "X-Ebsn-Client": "site" },
    });
    if (!r.ok) return null;
    const t = await r.text();
    if (!t.includes("products")) return null;
    const j = JSON.parse(t.replace(/^\s+/, ""));
    const ps = j?.data?.products ?? [];
    if (!ps.length) return { host, prodotti: 0, prezzo: null };
    const p = ps[0];
    // priceDisplay, non price: price e' il listino e nasconde le promozioni.
    return {
      host,
      prodotti: ps.length,
      prezzo: p.priceDisplay ?? p.price ?? null,
      listino: p.priceStandardDisplay ?? null,
      esempio: p.name,
      link: p.itemUrl,
    };
  } catch {
    return null;
  }
}

const MARCHI = process.argv.slice(2);
if (!MARCHI.length) {
  console.log("uso: node scripts/caccia-ebsn.mjs marchio1 marchio2 ...");
  process.exit(0);
}

for (const marchio of MARCHI) {
  const host = varianti(marchio);
  // Otto per volta: sono richieste piccole e la maggior parte non risponde.
  let trovato = null;
  for (let i = 0; i < host.length && !trovato; i += 8) {
    const esiti = await Promise.all(host.slice(i, i + 8).map(haEbsn));
    trovato = esiti.find((e) => e && e.prodotti > 0) ?? null;
  }
  if (trovato) {
    const promo =
      trovato.listino && trovato.prezzo && trovato.listino > trovato.prezzo
        ? `  (era ${trovato.listino})`
        : "";
    console.log(
      marchio.padEnd(20),
      "EBSN".padEnd(6),
      trovato.host.padEnd(34),
      trovato.prezzo != null ? `${trovato.prezzo} €${promo}` : "senza prezzo",
      String(trovato.esempio || "").slice(0, 30),
    );
  } else {
    console.log(marchio.padEnd(20), "—");
  }
}

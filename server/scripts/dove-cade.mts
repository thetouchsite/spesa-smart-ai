/**
 * Il prodotto giusto c'era fra i candidati, e poi dov'e' finito?
 *
 * `dove-si-perde.mjs` dice che in ventiquattro voci su duecento il prodotto
 * giusto non arriva fra le offerte. Ma non dice se non ci arriva perche' la
 * ricerca non l'ha mai proposto, o perche' e' stato proposto e poi perso per
 * strada — e sono due mali con due cure diverse.
 *
 * Questa prova guarda le due estremita': i candidati che la ricerca propone, e
 * le offerte che escono. In mezzo ci sono tre posti dove un candidato puo'
 * sparire:
 *
 *   · la sua pagina non si apre               → la riga viene buttata
 *   · un'altra riga della STESSA insegna vince — se ne tiene una sola, e
 *     preferisce quella che il prezzo ce l'ha
 *   · resta fuori dal taglio delle alternative
 *
 * Uso:  CHIAVE=sk_live_... npx tsx --env-file-if-exists=.env scripts/dove-cade.mts
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QUI = dirname(fileURLToPath(import.meta.url));
const PROVE = JSON.parse(readFileSync(join(QUI, "..", "prove", "ricerca.json"), "utf8"));
const API = process.env.API ?? "http://localhost:3100";
const CHIAVE = process.env.CHIAVE;
const CITTA: Record<string, string> = { IT: "Milano", GB: "London", DE: "München", ES: "Madrid", FR: "Paris" };
const VALUTA: Record<string, string> = { IT: "EUR", GB: "GBP", DE: "EUR", ES: "EUR", FR: "EUR" };

const piano = (s: string) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

interface Prova { voce: string; deve?: string[]; unaDi?: string[]; mai?: string[] }

function giusto(nome: string, p: Prova): boolean {
  const n = piano(nome);
  if ((p.deve ?? []).some((x) => !n.includes(piano(x)))) return false;
  if ((p.unaDi ?? []).length && !p.unaDi!.some((x) => n.includes(piano(x)))) return false;
  if ((p.mai ?? []).some((x) => n.includes(piano(x)))) return false;
  return true;
}

async function post(rotta: string, corpo: unknown) {
  const r = await fetch(`${API}${rotta}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CHIAVE}` },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${rotta} → ${r.status}`);
  return r.json() as Promise<any>;
}

const conto = { maiProposto: 0, propostoEPerso: 0, arrivato: 0 };
const esempi: string[] = [];

for (const [paese, prove] of Object.entries(PROVE)) {
  if (paese.startsWith("_") || !Array.isArray(prove)) continue;
  if (process.env.PAESE && paese !== process.env.PAESE) continue;

  for (let i = 0; i < prove.length; i += 20) {
    const pezzo = prove.slice(i, i + 20) as Prova[];
    const prezzi = await post("/v1/prezzi", {
      items: pezzo.map((p) => p.voce),
      city: CITTA[paese] ?? "",
      country: paese,
      currency: VALUTA[paese] ?? "EUR",
      priceSource: "catalogo",
    });
    const perVoce = new Map<string, any>((prezzi.voci ?? []).map((v: any) => [v.voce, v]));

    for (const p of pezzo) {
      const offerte = perVoce.get(p.voce)?.offerte ?? [];
      if (offerte.some((o: any) => giusto(o.nome, p))) { conto.arrivato++; continue; }

      // Non e' arrivato. La ricerca lo aveva proposto?
      const { prodotti = [] } = await post("/v1/prodotti", { paese, q: p.voce, quanti: 6 });
      const fra = prodotti.filter((c: any) => giusto(c.nome, p));
      if (fra.length === 0) {
        conto.maiProposto++;
      } else {
        conto.propostoEPerso++;
        if (esempi.length < 12) {
          const suaInsegna = fra[0].insegna;
          const rivale = offerte.find((o: any) => o.insegna === suaInsegna);
          esempi.push(
            `  ${paese} ${p.voce.slice(0, 20).padEnd(22)}proposto: ${String(fra[0].nome).slice(0, 26).padEnd(28)}` +
              (rivale
                ? `battuto da «${String(rivale.nome).slice(0, 24)}» della stessa insegna`
                : `la sua insegna (${suaInsegna}) non compare fra le offerte`),
          );
        }
      }
    }
  }
}

const n = conto.arrivato + conto.maiProposto + conto.propostoEPerso;
console.log(`\n  su ${n} voci:`);
console.log(`    il giusto arriva fra le offerte      ${String(conto.arrivato).padStart(4)}`);
console.log(`    la ricerca non l'ha MAI proposto     ${String(conto.maiProposto).padStart(4)}   ← si cura sulla ricerca`);
console.log(`    proposto e poi PERSO per strada      ${String(conto.propostoEPerso).padStart(4)}   ← si cura qui`);
if (esempi.length) {
  console.log(`\n  dove si perde:`);
  for (const e of esempi) console.log(e);
}
console.log("");

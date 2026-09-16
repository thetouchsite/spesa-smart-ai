/**
 * Le chiavi dell'API: crearle, elencarle, revocarle.
 *
 * La chiave in chiaro si vede UNA VOLTA SOLA, qui, adesso. Nel database
 * finisce solo la sua impronta, quindi se si perde non c'e' modo di
 * rileggerla: se ne fa un'altra e si revoca quella vecchia. E' scomodo
 * apposta — vuol dire che chi legge il database non ci trova dentro le chiavi
 * di nessuno.
 *
 * Gira con tsx, come gli altri script che entrano nel codice del server:
 * legge i moduli TypeScript direttamente, senza passare dal build.
 *
 *   npx tsx --env-file-if-exists=.env scripts/chiave.mjs crea "MealMint app" --segreta
 *   npx tsx --env-file-if-exists=.env scripts/chiave.mjs elenco
 *   npx tsx --env-file-if-exists=.env scripts/chiave.mjs revoca <prime cifre>
 */

const [, , comando, ...resto] = process.argv;

const { chiavi, isDbConfigured, closeDb } = await import("../src/base/db.js");
const { generaChiave, improntaDi } = await import("../src/api/chiavi.js");

if (!isDbConfigured()) {
  console.error(
    "\nMONGODB_URI non e' configurata: le chiavi vivono sul database.\n" +
      "Senza database l'API lascia passare tutti — va bene in sviluppo, non altrove.\n",
  );
  process.exit(1);
}

function argomento(nome, predefinito) {
  const i = resto.indexOf(`--${nome}`);
  return i >= 0 && resto[i + 1] ? resto[i + 1] : predefinito;
}

const col = await chiavi();

switch (comando) {
  case "crea": {
    const nome = resto.find((a) => !a.startsWith("--")) ?? "senza nome";
    const specie = resto.includes("--pubblicabile") ? "pubblicabile" : "segreta";
    const tetto = Number(argomento("tetto", specie === "segreta" ? 5000 : 500));

    const chiave = generaChiave(specie);
    await col.insertOne({
      _id: improntaDi(chiave),
      nome,
      specie,
      tettoGiornaliero: tetto,
      attiva: true,
      creata: new Date(),
    });

    console.log(`\n  ${nome} — chiave ${specie}, ${tetto} chiamate al giorno\n`);
    console.log(`  ${chiave}\n`);
    console.log("  Questa riga non si potra' rileggere: copiala adesso.");
    if (specie === "segreta") {
      console.log("  E tienila su un server. Una chiave segreta dentro un'app");
      console.log("  si estrae dal pacchetto installato con una riga di comando.\n");
    } else {
      console.log("  Puo' stare in un'app: non puo' chiedere i prezzi.\n");
    }
    break;
  }

  case "elenco": {
    const tutte = await col.find({}).sort({ creata: -1 }).toArray();
    if (!tutte.length) {
      console.log("\n  Nessuna chiave. Finche' non ce n'e' nessuna, /v1 risponde a chiunque.\n");
      break;
    }
    console.log(`\n  ${tutte.length} chiavi\n`);
    console.log("  impronta   specie         tetto   stato     nome");
    console.log("  " + "─".repeat(64));
    for (const c of tutte) {
      console.log(
        `  ${c._id.slice(0, 8)}   ${c.specie.padEnd(13)}` +
          `${String(c.tettoGiornaliero || "—").padStart(5)}   ` +
          `${(c.attiva ? "attiva" : "revocata").padEnd(9)} ${c.nome}`,
      );
    }
    console.log("");
    break;
  }

  case "revoca": {
    const pezzo = resto[0];
    if (!pezzo) {
      console.error("\n  Serve l'impronta, anche solo le prime cifre.\n");
      process.exit(1);
    }
    const trovate = (await col.find({}).toArray()).filter((c) => c._id.startsWith(pezzo));
    if (trovate.length === 0) {
      console.error(`\n  Nessuna chiave comincia per «${pezzo}».\n`);
      process.exit(1);
    }
    if (trovate.length > 1) {
      console.error(`\n  «${pezzo}» ne trova ${trovate.length}: servono piu' cifre.\n`);
      process.exit(1);
    }
    await col.updateOne({ _id: trovate[0]._id }, { $set: { attiva: false } });
    console.log(`\n  Revocata: ${trovate[0].nome}`);
    console.log("  Il servizio se ne accorge entro un minuto — tiene in mente le chiavi per quello.\n");
    break;
  }

  default:
    console.log(`
  npx tsx --env-file-if-exists=.env scripts/chiave.mjs crea "<nome>" [--segreta|--pubblicabile] [--tetto N]
  npx tsx --env-file-if-exists=.env scripts/chiave.mjs elenco
  npx tsx --env-file-if-exists=.env scripts/chiave.mjs revoca <prime cifre>
`);
}

await closeDb();

/* Tests de bout en bout du calcul, dans un vrai navigateur.
   Prerequis : npm install playwright
   Lancement : node outils/tester-calculs.mjs */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml"
};

const serveur = createServer(async (requete, reponse) => {
  const chemin = join(process.cwd(), normalize(decodeURI(requete.url.split("?")[0])).replace(/^(\.\.[/\\])+/, ""));
  try {
    const contenu = await readFile(chemin);
    reponse.writeHead(200, { "Content-Type": TYPES[extname(chemin)] || "application/octet-stream" });
    reponse.end(contenu);
  } catch {
    reponse.writeHead(404).end("introuvable");
  }
});

await new Promise((resoudre) => serveur.listen(0, resoudre));
const base = `http://localhost:${serveur.address().port}`;

/* En local, l'environnement fournit parfois Chromium a un emplacement fixe :
   CHROMIUM_PATH=/chemin/vers/chromium node outils/tester-calculs.mjs */
const navigateur = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await navigateur.newPage();

const erreursJS = [];
page.on("pageerror", (e) => erreursJS.push(e.message));

await page.goto(`${base}/index.html`);
await page.waitForFunction(
  () => document.getElementById("etat-chargement").dataset.niveau !== "attente",
  { timeout: 60000 }
);

let echecs = 0;

function verifier(intitule, obtenu, attendu) {
  if (obtenu === attendu) {
    console.log(`  ok     ${intitule}`);
  } else {
    console.error(`  ECHEC  ${intitule} : attendu "${attendu}", obtenu "${obtenu}"`);
    echecs++;
  }
}

async function saisir({ sexe, epreuve, perf, competition, place }) {
  if (sexe) await page.selectOption("#sexe", sexe);
  if (epreuve) await page.selectOption("#discipline", epreuve);
  if (perf !== undefined) await page.fill("#performance", perf);
  if (competition) await page.selectOption("#competition", competition);
  if (place) await page.selectOption("#classement", place);
  await page.waitForTimeout(80);
}

console.log("\nCalcul du score total");

await saisir({ sexe: "Men", epreuve: "100m", perf: "9.46", competition: "Olympic Games", place: "1" });
verifier("100m 9.46 = 1400 points de performance", await page.inputValue("#points-performance"), "1400");
verifier("Olympic Games, 1re place = 260 points de placement", await page.inputValue("#points-placement"), "260");
verifier("score total = 1660", await page.textContent("#total"), "1660pts");
verifier("categorie deduite de la competition", await page.inputValue("#niveau-competition"), "OW");

await saisir({ competition: "WA Continental Challenger", place: "7" });
verifier("categorie D, 7e place = 12 points", await page.inputValue("#points-placement"), "12");

await saisir({ competition: "Interclub", place: "3" });
verifier("categorie F, 3e place = 4 points", await page.inputValue("#points-placement"), "4");

console.log("\nArrondi au palier inferieur");

/* Le bareme ne cote qu'une performance de reference par palier. Une
   performance situee entre deux paliers vaut les points du palier inferieur. */

await saisir({ competition: "Olympic Games", place: "1", epreuve: "800m", perf: "1.37.94" });
verifier("800m 1.37.94 : palier exact", await page.inputValue("#points-performance"), "1399");

await saisir({ perf: "1.37.92" });
verifier("800m 1.37.92 : entre 1400 et 1399, arrondi a 1399", await page.inputValue("#points-performance"), "1399");
verifier(
  "l'arrondi est signale a l'utilisateur",
  (await page.textContent("#detail-calcul")).includes("arrondie au palier inférieur"),
  true
);

await saisir({ perf: "1.58.40" });
verifier("800m 1.58.40 : arrondi au plancher 800", await page.inputValue("#points-performance"), "800");

/* Les concours sont ordonnes du moins bon au meilleur : l'arrondi doit
   fonctionner dans les deux sens de tri. */
await saisir({ epreuve: "Shot-Put", perf: "14.61" });
verifier("poids 14.61 : entre 800 et 801, arrondi a 800", await page.inputValue("#points-performance"), "800");

await saisir({ perf: "14.64" });
verifier("poids 14.64 : entre 802 et 803, arrondi a 802", await page.inputValue("#points-performance"), "802");

console.log("\nPerformances hors bareme");

await saisir({ epreuve: "100m", perf: "pas-une-perf" });
verifier("performance absente : pas de points", await page.inputValue("#points-performance"), "");
verifier("performance absente : total vide", await page.textContent("#total"), "—");

/* Sous le plancher du bareme, il n'y a pas de palier inferieur : pas de points. */
await saisir({ epreuve: "Decathlon / Heptathlon", perf: "59.94" });
verifier("sous le plancher : pas de points", await page.inputValue("#points-performance"), "");

console.log("\nConversion points vers performance");

await saisir({ epreuve: "100m", perf: "" });
await page.fill("#points-recherches", "1400");
await page.waitForTimeout(80);
verifier("1400 points = 9.46", await page.inputValue("#perf-correspondante"), "9.46");

await page.fill("#points-recherches", "1350");
await page.waitForTimeout(80);
verifier("1350 points : palier inexistant", await page.inputValue("#perf-correspondante"), "aucune correspondance");

console.log("\nMoyenne partielle");

await page.selectOption("#perf-moyenne-1", "1200");
await page.selectOption("#perf-moyenne-2", "1100");
await page.selectOption("#perf-moyenne-3", "1000");
await page.waitForTimeout(80);
verifier("moyenne de 3 performances sur 5", await page.inputValue("#moyenne"), "1100");

console.log("\nLiens de classement");

await saisir({ epreuve: "High-Jump" });
verifier(
  "lien Road to actif pour la hauteur",
  await page.getAttribute("#lien-road-to", "aria-disabled"),
  null
);

await saisir({ epreuve: "100m" });
verifier(
  "lien Road to desactive hors table de correspondance",
  await page.getAttribute("#lien-road-to", "aria-disabled"),
  "true"
);

console.log("\nErreurs JavaScript");
verifier("aucune erreur au chargement ni pendant les calculs", erreursJS.join(" | "), "");

await navigateur.close();
serveur.close();

console.log("");
if (echecs > 0) {
  console.error(`${echecs} test(s) en echec.`);
  process.exit(1);
}
console.log("Tous les tests passent.");

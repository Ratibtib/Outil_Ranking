/* Controle de coherence des baremes.
   Lance par la CI et executable a la main : node outils/verifier-donnees.mjs
   A utiliser apres chaque mise a jour saisonniere des donnees. */

import { readFileSync } from "node:fs";

const NB_PLACES = 16;
const COLONNES = ["Sexe", "Epreuve", "Points", "Perf"];

let erreurs = 0;

function echec(message) {
  console.error("  ECHEC  " + message);
  erreurs++;
}

function succes(message) {
  console.log("  ok     " + message);
}

/* ---------- Bareme de performance ---------- */

console.log("\ndata/bareme-performance.csv");

const csv = readFileSync("data/bareme-performance.csv", "utf8");
const lignes = csv.split(/\r\n|\n|\r/).filter((l) => l !== "");

const entete = lignes[0].split(";");
if (entete.join(";") !== COLONNES.join(";")) {
  echec(`en-tete attendu "${COLONNES.join(";")}", trouve "${entete.join(";")}"`);
} else {
  succes(`en-tete conforme (${COLONNES.length} colonnes)`);
}

const clesPerf = new Set();
let doublonsPerf = 0;
let mauvaisNbColonnes = 0;
let pointsInvalides = 0;

for (let i = 1; i < lignes.length; i++) {
  const colonnes = lignes[i].split(";");

  if (colonnes.length !== COLONNES.length) {
    mauvaisNbColonnes++;
    if (mauvaisNbColonnes <= 3) echec(`ligne ${i + 1} : ${colonnes.length} colonnes au lieu de ${COLONNES.length}`);
    continue;
  }

  const [sexe, epreuve, points, perf] = colonnes.map((c) => c.trim());

  if (points !== "" && !/^\d+$/.test(points)) {
    pointsInvalides++;
    if (pointsInvalides <= 3) echec(`ligne ${i + 1} : points "${points}" non numeriques`);
  }

  const cle = `${sexe}-${epreuve}-${perf}`;
  if (clesPerf.has(cle)) {
    doublonsPerf++;
    if (doublonsPerf <= 3) echec(`ligne ${i + 1} : performance en double "${cle}"`);
  }
  clesPerf.add(cle);
}

if (mauvaisNbColonnes === 0) succes(`${lignes.length - 1} lignes, toutes a ${COLONNES.length} colonnes`);
if (doublonsPerf === 0) succes("aucune performance en double");
if (pointsInvalides === 0) succes("colonne Points numerique ou vide partout");

/* ---------- Bareme de placement ---------- */

console.log("\ndata/bareme-placement.json");

const placement = JSON.parse(readFileSync("data/bareme-placement.json", "utf8"));

for (const [nom, categorie] of Object.entries(placement.categories)) {
  const points = categorie.points;

  if (points.length !== NB_PLACES) {
    echec(`categorie ${nom} : ${points.length} places au lieu de ${NB_PLACES}`);
    continue;
  }

  if (!points.every((p) => Number.isInteger(p) && p >= 0)) {
    echec(`categorie ${nom} : valeurs non entieres ou negatives`);
    continue;
  }

  /* Une place mieux classee ne peut pas rapporter moins de points : c'est
     ainsi qu'avait ete reperee la coquille D-7 = 22 du fichier d'origine. */
  const rupture = points.findIndex((p, i) => i > 0 && p > points[i - 1]);
  if (rupture !== -1) {
    echec(`categorie ${nom} : la place ${rupture + 1} (${points[rupture]} pts) ` +
          `rapporte plus que la place ${rupture} (${points[rupture - 1]} pts)`);
    continue;
  }

  succes(`categorie ${nom} : ${NB_PLACES} places, decroissante`);
}

const categoriesConnues = new Set(Object.keys(placement.categories));
const orphelines = placement.competitions.filter((c) => !categoriesConnues.has(c.categorie));

if (orphelines.length > 0) {
  orphelines.forEach((c) => echec(`competition "${c.nom}" : categorie inconnue "${c.categorie}"`));
} else {
  succes(`${placement.competitions.length} competitions, toutes rattachees a une categorie`);
}

/* ---------- Config ---------- */

console.log("\ndata/config.json");

const config = JSON.parse(readFileSync("data/config.json", "utf8"));

if (!/^\d+$/.test(config.campagneRoadTo.identifiant)) {
  echec("campagneRoadTo.identifiant doit etre numerique");
} else {
  succes(`campagne Road to : ${config.campagneRoadTo.identifiant} (${config.campagneRoadTo.libelle})`);
}

/* Les epreuves de la table Road to doivent exister dans le bareme. */
const epreuvesBareme = new Set();
for (let i = 1; i < lignes.length; i++) {
  const colonnes = lignes[i].split(";");
  if (colonnes.length === COLONNES.length) epreuvesBareme.add(colonnes[1].trim());
}

const inconnues = Object.keys(config.epreuvesRoadTo).filter((e) => !epreuvesBareme.has(e));
if (inconnues.length > 0) {
  inconnues.forEach((e) => echec(`epreuvesRoadTo : "${e}" absente du bareme de performance`));
} else {
  succes(`${Object.keys(config.epreuvesRoadTo).length} epreuves Road to, toutes presentes au bareme`);
}

/* ---------- Verdict ---------- */

console.log("");
if (erreurs > 0) {
  console.error(`${erreurs} erreur(s) detectee(s).`);
  process.exit(1);
}
console.log("Toutes les verifications passent.");

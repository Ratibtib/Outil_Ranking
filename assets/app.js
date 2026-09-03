/* Outil Ranking - calcul des points World Athletics.
   Le score d'une performance est la somme des points de performance (issus du
   bareme data/bareme-performance.csv) et des points de placement (issus de
   data/bareme-placement.json). */

(function () {
  "use strict";

  var CHEMIN_PERFORMANCE = "data/bareme-performance.csv";
  var CHEMIN_PLACEMENT = "data/bareme-placement.json";
  var CHEMIN_CONFIG = "data/config.json";

  /* Epreuves telles qu'elles sont ecrites dans le bareme. La cle est la valeur
     stockee dans le CSV, le libelle est ce que voit l'utilisateur. Deux
     epreuves regroupent les versions masculine et feminine. */
  var EPREUVES = [
    ["100m", "100m"],
    ["110mH / 100mH", "110mH / 100mH (haies)"],
    ["200m", "200m"],
    ["300m", "300m"],
    ["400m", "400m"],
    ["400mH", "400mH"],
    ["500m", "500m"],
    ["600m", "600m"],
    ["800m", "800m"],
    ["1000m", "1000m"],
    ["1500m", "1500m"],
    ["Mile", "Mile"],
    ["2000m", "2000m"],
    ["4x100m", "4x100m"],
    ["4x200m", "4x200m"],
    ["4x400m", "4x400m"],
    ["High-Jump", "Hauteur"],
    ["Long-Jump", "Longueur"],
    ["Triple-Jump", "Triple saut"],
    ["Pole-Vault", "Perche"],
    ["Shot-Put", "Poids"],
    ["Discus-Throw", "Disque"],
    ["Hammer-Throw", "Marteau"],
    ["Javelin-Throw", "Javelot"],
    ["Decathlon / Heptathlon", "Decathlon / Heptathlon"]
  ];

  var NB_PLACES = 16;
  var NB_PERFS_MOYENNE = 5;

  /* Index construits une fois au chargement : la recherche est ensuite en
     temps constant, au lieu d'un parcours des 118 986 lignes du bareme. */
  var pointsParPerf = new Map();
  var perfParPoints = new Map();
  var placement = null;
  var config = null;

  var el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cle() {
    return Array.prototype.join.call(arguments, "-");
  }

  /* ---------- Chargement des donnees ---------- */

  function analyserCSV(texte) {
    var lignes = texte.split(/\r\n|\n|\r/);

    for (var i = 1; i < lignes.length; i++) {
      var ligne = lignes[i];
      if (!ligne) continue;

      var colonnes = ligne.split(";");
      if (colonnes.length < 4) continue;

      var sexe = colonnes[0].trim();
      var epreuve = colonnes[1].trim();
      var points = colonnes[2].trim();
      var perf = colonnes[3].trim();

      /* Le bareme associe parfois deux performances au meme nombre de points.
         On conserve la premiere rencontree, comme le faisait la recherche
         lineaire d'origine. */
      var clePerf = cle(sexe, epreuve, perf);
      if (!pointsParPerf.has(clePerf)) pointsParPerf.set(clePerf, points);

      /* Les lignes sans points ne peuvent pas servir de cle de conversion. */
      if (points !== "") {
        var clePoints = cle(sexe, epreuve, points);
        if (!perfParPoints.has(clePoints)) perfParPoints.set(clePoints, perf);
      }
    }
  }

  function afficherEtat(niveau, message) {
    el.etat.hidden = false;
    el.etat.dataset.niveau = niveau;
    el.etat.textContent = message;
  }

  function chargerDonnees() {
    afficherEtat("attente", "Chargement du barème World Athletics…");

    return Promise.all([
      fetch(CHEMIN_PERFORMANCE).then(verifier).then(function (r) { return r.text(); }),
      fetch(CHEMIN_PLACEMENT).then(verifier).then(function (r) { return r.json(); }),
      fetch(CHEMIN_CONFIG).then(verifier).then(function (r) { return r.json(); })
    ]).then(function (resultats) {
      analyserCSV(resultats[0]);
      placement = resultats[1];
      config = resultats[2];

      remplirCompetitions();
      construireTableauBaremes();
      activerFormulaire();

      afficherEtat("pret", "Barème " + placement.saison + " chargé : " +
        pointsParPerf.size.toLocaleString("fr-FR") + " performances de référence.");
    }).catch(function (erreur) {
      afficherEtat("erreur",
        "Le barème n'a pas pu être chargé (" + erreur.message + "). " +
        "Rechargez la page ; si le problème persiste, vérifiez que le dossier data/ est bien publié.");
    });
  }

  function verifier(reponse) {
    if (!reponse.ok) throw new Error("HTTP " + reponse.status);
    return reponse;
  }

  /* ---------- Construction des menus ---------- */

  function ajouterOption(select, valeur, libelle) {
    var option = document.createElement("option");
    option.value = valeur;
    option.textContent = libelle;
    select.appendChild(option);
  }

  function remplirEpreuves() {
    EPREUVES.forEach(function (epreuve) {
      ajouterOption(el.discipline, epreuve[0], epreuve[1]);
    });
  }

  function remplirClassements() {
    for (var place = 1; place <= NB_PLACES; place++) {
      ajouterOption(el.classement, String(place), ordinal(place) + " place");
    }
  }

  function remplirMoyennes() {
    /* Les cinq listes de la moyenne sont identiques : une seule boucle les
       remplit toutes, la ou le fichier d'origine repetait 2 005 lignes. */
    el.perfsMoyenne.forEach(function (select) {
      for (var points = 1300; points >= 900; points--) {
        ajouterOption(select, String(points), String(points));
      }
    });
  }

  function remplirCompetitions() {
    var categoriePrecedente = null;
    var groupe = null;

    placement.competitions.forEach(function (competition) {
      if (competition.categorie !== categoriePrecedente) {
        groupe = document.createElement("optgroup");
        groupe.label = competition.categorie + " - " +
          placement.categories[competition.categorie].libelle;
        el.competition.appendChild(groupe);
        categoriePrecedente = competition.categorie;
      }
      var option = document.createElement("option");
      option.value = competition.nom;
      option.textContent = competition.nom;
      groupe.appendChild(option);
    });
  }

  /* ---------- Calculs ---------- */

  function categorieDeLaCompetition() {
    var nom = el.competition.value;
    if (!nom) return "";

    for (var i = 0; i < placement.competitions.length; i++) {
      if (placement.competitions[i].nom === nom) return placement.competitions[i].categorie;
    }
    return "";
  }

  function pointsDePlacement(categorie, classement) {
    if (!categorie || !classement) return null;

    var bareme = placement.categories[categorie];
    if (!bareme) return null;

    var rang = parseInt(classement, 10);
    if (!(rang >= 1 && rang <= bareme.points.length)) return null;

    return bareme.points[rang - 1];
  }

  /* Le bareme ne cote qu'une performance de reference par palier de points
     (de 800 a 1400). Les performances intermediaires y figurent sans points :
     on les distingue des performances absentes pour pouvoir l'expliquer. */
  function pointsDePerformance() {
    var sexe = el.sexe.value;
    var discipline = el.discipline.value;
    var perf = el.performance.value.trim();

    if (!sexe || !discipline || !perf) return { points: null, statut: "incomplet" };

    var valeur = pointsParPerf.get(cle(sexe, discipline, perf));
    if (valeur === undefined) return { points: null, statut: "absente" };
    if (valeur === "") return { points: null, statut: "non-cotee" };

    return { points: parseInt(valeur, 10), statut: "ok" };
  }

  function ordinal(rang) {
    return rang + (String(rang) === "1" ? "re" : "e");
  }

  function afficherNombre(champ, valeur) {
    champ.value = valeur === null ? "" : String(valeur);
  }

  function actualiserNiveau() {
    var categorie = categorieDeLaCompetition();

    el.niveau.value = categorie;
    el.aideNiveau.textContent = categorie
      ? placement.categories[categorie].libelle
      : "Déterminée automatiquement par la compétition choisie.";
  }

  function actualiserTotal() {
    var categorie = categorieDeLaCompetition();
    var placementPoints = pointsDePlacement(categorie, el.classement.value);
    var performance = pointsDePerformance();

    afficherNombre(el.pointsPlacement, placementPoints);
    afficherNombre(el.pointsPerformance, performance.points);

    /* Le total n'a de sens que si les deux composantes sont connues. */
    if (placementPoints === null || performance.points === null) {
      el.total.textContent = "—";
      el.total.dataset.vide = "oui";
      el.detailCalcul.textContent = messageIncomplet(placementPoints, performance);
      return;
    }

    var total = placementPoints + performance.points;
    el.total.dataset.vide = "non";
    el.total.innerHTML = "";
    el.total.appendChild(document.createTextNode(String(total)));

    var unite = document.createElement("span");
    unite.className = "unite";
    unite.textContent = "pts";
    el.total.appendChild(unite);

    el.detailCalcul.textContent =
      performance.points + " (performance) + " + placementPoints + " (placement " +
      categorie + ", " + ordinal(el.classement.value) + ") = " + total;
  }

  function messageIncomplet(placementPoints, performance) {
    var manques = [];

    if (performance.statut === "incomplet") {
      manques.push(!el.sexe.value || !el.discipline.value
        ? "choisissez un sexe et une épreuve"
        : "saisissez une performance");
    } else if (performance.statut === "absente") {
      manques.push("performance absente du barème (formats attendus : 9.46, 1.58.43, 2.35)");
    } else if (performance.statut === "non-cotee") {
      manques.push("cette performance figure au barème sans être cotée : essayez la performance de référence immédiatement inférieure");
    }

    if (placementPoints === null) {
      if (!el.competition.value) {
        manques.push("choisissez une compétition");
      } else if (!el.classement.value) {
        manques.push("choisissez un classement");
      }
    }

    return manques.join(" ; ");
  }

  function actualiserConversion() {
    var sexe = el.sexe.value;
    var discipline = el.discipline.value;
    var points = el.pointsRecherches.value.trim();

    if (!sexe || !discipline || !points) {
      el.perfCorrespondante.value = "";
      return;
    }

    var perf = perfParPoints.get(cle(sexe, discipline, points));
    el.perfCorrespondante.value = perf === undefined ? "aucune correspondance" : perf;
    el.perfCorrespondante.dataset.vide = perf === undefined ? "oui" : "non";
  }

  function actualiserMoyenne() {
    /* La moyenne porte sur les performances effectivement saisies : un athlete
       qui n'en a que trois obtient la moyenne de ces trois-la. */
    var valeurs = el.perfsMoyenne
      .map(function (select) { return parseInt(select.value, 10); })
      .filter(function (valeur) { return !isNaN(valeur); });

    if (valeurs.length === 0) {
      el.moyenne.value = "";
      el.detailMoyenne.textContent = "Sélectionnez au moins une performance.";
      return;
    }

    var somme = valeurs.reduce(function (a, b) { return a + b; }, 0);
    el.moyenne.value = Math.round(somme / valeurs.length);
    el.detailMoyenne.textContent =
      "Moyenne de " + valeurs.length + " performance" + (valeurs.length > 1 ? "s" : "") +
      " sur " + NB_PERFS_MOYENNE + ".";
  }

  /* ---------- Liens vers les classements ---------- */

  function actualiserLiens() {
    var discipline = el.discipline.value;
    var sexe = el.sexe.value;

    majLienMondial(discipline, sexe);
    majLienRoadTo(discipline, sexe);
  }

  function majLienMondial(discipline, sexe) {
    if (!discipline || !sexe) {
      desactiverLien(el.lienMondial, "Choisissez un sexe et une épreuve");
      return;
    }

    var choix = el.perimetre.options[el.perimetre.selectedIndex];
    var parametres = new URLSearchParams();

    parametres.set("regionType", el.perimetre.value.toLowerCase());
    /* Europe et France demandent un parametre de region supplementaire. */
    if (choix && choix.dataset.region) parametres.set("region", choix.dataset.region);
    parametres.set("page", "1");
    parametres.set("limitByCountry", el.nbPays.value.toLowerCase());

    var url = "https://worldathletics.org/world-rankings/" +
      encodeURIComponent(discipline.toLowerCase()) + "/" +
      encodeURIComponent(sexe.toLowerCase()) + "?" + parametres.toString();

    activerLien(el.lienMondial, url, "Classement " + (choix ? choix.textContent : "") + " — " + discipline);
  }

  function majLienRoadTo(discipline, sexe) {
    var epreuves = config.epreuvesRoadTo;

    /* La table ne couvre que quelques epreuves : sans correspondance, le lien
       est desactive plutot que de produire une URL invalide. */
    if (!discipline || !sexe || !epreuves[discipline] || !epreuves[discipline][sexe]) {
      desactiverLien(el.lienRoadTo, "Non disponible pour cette épreuve");
      return;
    }

    var url = "https://worldathletics.org/stats-zone/road-to/" +
      encodeURIComponent(config.campagneRoadTo.identifiant) +
      "?eventId=" + encodeURIComponent(epreuves[discipline][sexe]);

    activerLien(el.lienRoadTo, url, config.campagneRoadTo.libelle);
  }

  function activerLien(lien, url, sousTitre) {
    lien.href = url;
    lien.removeAttribute("aria-disabled");
    lien.querySelector(".sous").textContent = sousTitre;
  }

  function desactiverLien(lien, raison) {
    lien.removeAttribute("href");
    lien.setAttribute("aria-disabled", "true");
    lien.querySelector(".sous").textContent = raison;
  }

  /* ---------- Tableau recapitulatif des baremes ---------- */

  function construireTableauBaremes() {
    var categories = Object.keys(placement.categories);
    var thead = el.tableauBaremes.querySelector("thead tr");
    var tbody = el.tableauBaremes.querySelector("tbody");

    categories.forEach(function (categorie) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = categorie;
      th.title = placement.categories[categorie].libelle;
      thead.appendChild(th);
    });

    for (var place = 1; place <= NB_PLACES; place++) {
      var tr = document.createElement("tr");

      var entete = document.createElement("th");
      entete.scope = "row";
      entete.textContent = ordinal(place);
      tr.appendChild(entete);

      categories.forEach(function (categorie) {
        var points = placement.categories[categorie].points[place - 1];
        var td = document.createElement("td");
        td.textContent = points;
        if (points === 0) td.dataset.zero = "oui";
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    }

    el.legendeBaremes.textContent =
      "Points de placement, saison " + placement.saison + ". Source : World Athletics.";
  }

  /* ---------- Branchement des evenements ---------- */

  function activerFormulaire() {
    el.competition.disabled = false;
    el.classement.disabled = false;
  }

  function ecouter(element, evenement, fonctions) {
    element.addEventListener(evenement, function () {
      fonctions.forEach(function (fonction) { fonction(); });
    });
  }

  function initialiser() {
    el.sexe = $("sexe");
    el.discipline = $("discipline");
    el.competition = $("competition");
    el.niveau = $("niveau-competition");
    el.aideNiveau = $("aide-niveau");
    el.classement = $("classement");
    el.performance = $("performance");
    el.pointsPlacement = $("points-placement");
    el.pointsPerformance = $("points-performance");
    el.total = $("total");
    el.detailCalcul = $("detail-calcul");
    el.pointsRecherches = $("points-recherches");
    el.perfCorrespondante = $("perf-correspondante");
    el.moyenne = $("moyenne");
    el.detailMoyenne = $("detail-moyenne");
    el.perimetre = $("perimetre");
    el.nbPays = $("nb-pays");
    el.lienMondial = $("lien-mondial");
    el.lienRoadTo = $("lien-road-to");
    el.etat = $("etat-chargement");
    el.tableauBaremes = $("tableau-baremes");
    el.legendeBaremes = $("legende-baremes");

    el.perfsMoyenne = [];
    for (var i = 1; i <= NB_PERFS_MOYENNE; i++) {
      el.perfsMoyenne.push($("perf-moyenne-" + i));
    }

    remplirEpreuves();
    remplirClassements();
    remplirMoyennes();

    /* Le sexe et l'epreuve interviennent dans les trois calculs. */
    ecouter(el.sexe, "change", [actualiserTotal, actualiserConversion, actualiserLiens]);
    ecouter(el.discipline, "change", [actualiserTotal, actualiserConversion, actualiserLiens]);
    ecouter(el.performance, "input", [actualiserTotal]);
    ecouter(el.competition, "change", [actualiserNiveau, actualiserTotal]);
    ecouter(el.classement, "change", [actualiserTotal]);
    ecouter(el.pointsRecherches, "input", [actualiserConversion]);
    ecouter(el.perimetre, "change", [actualiserLiens]);
    ecouter(el.nbPays, "change", [actualiserLiens]);

    el.perfsMoyenne.forEach(function (select) {
      ecouter(select, "change", [actualiserMoyenne]);
    });

    actualiserMoyenne();

    chargerDonnees().then(function () {
      if (placement) {
        actualiserTotal();
        actualiserLiens();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiser);
  } else {
    initialiser();
  }
})();

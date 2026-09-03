# Audit technique — Outil Ranking

Audit réalisé le 3 septembre 2026 sur la branche `main` (dernier commit `d53af82`).

Le dépôt contient deux fichiers : `index.html` (3 435 lignes) et `bdd.csv`
(8,95 Mo, 118 986 lignes). L'outil calcule un score World Athletics en
additionnant les points de performance (issus du barème `bdd.csv`) et les
points de placement (barème par niveau de compétition : OW, DF, GW, GL, A à F).

**Verdict : la fonction centrale de l'outil — le champ `Total` — ne se calcule
jamais.** Quatre erreurs JavaScript se déclenchent à chaque ouverture de la
page. Le reste des constats porte sur la performance, l'accessibilité mobile et
l'hygiène du dépôt.

---

## 1. Bugs bloquants

### 1.1 Le champ `Total` n'est jamais calculé

`effectuerCalcul()` est défini **deux fois** dans la portée globale :

| Ligne | Rôle | Sort |
|---|---|---|
| 841 | `Point classement` + `Points performance` → `Total` | écrasé |
| 3071 | moyenne de `P1..P5` → `Moy` | l'emporte |

Les deux déclarations partagent la même portée globale : la seconde écrase la
première. Les deux `setInterval` (lignes 839 et 3069) exécutent donc tous deux
la version « moyenne ». Le champ `Total` (ligne 829) reste vide en permanence,
quelle que soit la saisie.

C'est le bug le plus grave : l'addition performance + placement est la raison
d'être de l'outil.

### 1.2 `addition()` n'existe pas

`oninput="addition()"` est déclaré sur `#Total` (ligne 829) et sur `#Moy`
(ligne 3054). Aucune fonction `addition` n'est définie dans le fichier. Chaque
déclenchement lève une `ReferenceError`.

### 1.3 Bloc script mort qui plante au chargement (lignes 86 à 294)

Ce bloc lit `document.getElementById("Compétition")` alors que le `<select>`
correspondant n'est déclaré qu'à la **ligne 304**, plus bas dans le document.
`firstDropdown` vaut donc `null`, et `firstDropdown.addEventListener` lève une
`TypeError` qui interrompt l'exécution du bloc.

Ces 209 lignes sont par ailleurs un doublon quasi identique du bloc des lignes
360 à 567, qui, lui, est correctement placé après le `<select>` et fonctionne.
Le bloc 86–294 est donc à supprimer intégralement.

### 1.4 `updateLinks()` plante sur la majorité des disciplines

`correspondanceTable` (ligne 3157) ne contient que trois disciplines :
`High-Jump`, `Long-Jump`, `Triple-Jump`. La ligne 3184 fait :

```js
var eventId = correspondanceTable[discipline][sexe];
```

Pour toute autre discipline — 100m, 800m, Décathlon… soit 24 des 27 entrées du
menu — `correspondanceTable[discipline]` vaut `undefined` et l'accès à `[sexe]`
lève une `TypeError`.

Pire : `updateLinks()` est appelé sans condition au chargement (ligne 3197),
alors que `Discipline` est encore vide. **L'erreur se produit donc à chaque
ouverture de la page**, et les quatre liens de ranking ne sont jamais
initialisés.

### 1.5 Aucune déclaration d'encodage

Le fichier est encodé en UTF-8 et contient des accents dans le contenu comme
dans les identifiants (`Compétition`, `Périmètre`, `Sexe`). Il ne contient
aucune balise `<meta charset="utf-8">`, ni attribut `lang` sur `<html>`.
Le rendu dépend alors entièrement des en-têtes du serveur : hors GitHub Pages,
ou en ouverture locale (`file://`), le texte s'affiche en mojibake
(« Compétition »).

### 1.6 Lecture hors limites dans `performPointsSearch()` (ligne 945)

La garde vérifie `columns.length >= 3` mais le code lit `columns[5].trim()`.
Toutes les lignes de `bdd.csv` comptant aujourd'hui 8 colonnes, le bug est
latent — mais toute ligne plus courte ajoutée au barème fera planter la
recherche.

---

## 2. Performance

### 2.1 Recherche linéaire sur 118 986 lignes, exécutée trois fois par frappe

`performSearch` (ligne 899) et `performSearch2` (ligne 923) sont **strictement
identiques** — même corps, même résultat écrit dans le même champ — et toutes
deux abonnées aux mêmes trois événements (lignes 915-917 et 939-941).
`performPointsSearch` est abonnée aux mêmes événements.

Chaque caractère saisi dans `Performance` déclenche donc trois parcours
complets du tableau, soit environ **357 000 comparaisons de chaînes par
frappe**. Un index `Map` construit une fois au chargement ramènerait chaque
recherche à un accès en temps constant.

### 2.2 Le fichier de barème pèse 8,95 Mo

`bdd.csv` est téléchargé intégralement avant toute interaction. Or ses colonnes
5 à 8 sont toutes dérivables des colonnes 1 à 4 :

```
Sexe;Epreuve;Points;Perf;Sexe Epreuve Perf;Sexe Epreuve Points;Perf sans point;Sexe Epreuve
Men;100m;1400;9.46;Men-100m-9.46;Men-100m-1400;946;Men-100m
```

Les clés composites peuvent être reconstruites côté client lors de la
construction de l'index.

| Version | Poids | Gain |
|---|---|---|
| Actuel (8 colonnes) | 8,95 Mo | — |
| Colonnes 1 à 4 | 2,61 Mo | −71 % |
| Colonnes 1 à 4, compressé gzip | ~0,3 Mo | −97 % |

### 2.3 Deux `setInterval` à 100 ms tournent en permanence

Lignes 839 et 3069 : l'outil recalcule 20 fois par seconde même au repos, au
lieu de réagir aux événements `change` / `input` déjà disponibles. Le
commentaire associé (« toutes les 1 seconde ») ne correspond pas au code.

### 2.4 Dépendances incompatibles et chargées en double

Bootstrap 4.5 requiert **Popper 1.x**. La page charge **Popper 2.x**, dans
trois versions différentes (2.9.2, 2.5.3, 2.5.4). Les composants JavaScript de
Bootstrap qui en dépendent sont donc inopérants.

jQuery est chargé en version **slim**, qui exclut les modules `ajax` et
`effects` dont Bootstrap a besoin.

Décompte des balises `<script src>` redondantes :

| Ressource | Occurrences |
|---|---|
| `bootstrap.min.js` (stackpath 4.5.0) | 3 |
| `jquery-3.5.1.slim.min.js` | 3 |
| `bootstrap.min.js` (maxcdn 4.5.2) | 2 |

En pratique, aucun composant JavaScript Bootstrap n'est utilisé par la page :
ces sept balises peuvent être supprimées, seule la feuille CSS est nécessaire.

---

## 3. Interface et accessibilité

### 3.1 Aucun rendu mobile

Il n'y a pas de `<meta name="viewport">`. La seule règle CSS du fichier
(ligne 8) est une marge fixe non responsive :

```css
.page-container { margin-left: 120px; }
```

Les grilles Bootstrap `col-md-*` basculent donc en pleine largeur sur mobile
sans que la page soit pour autant lisible. Les tailles de police sont figées en
pixels dans 33 attributs `style` inline.

### 3.2 2 005 lignes d'options dupliquées

Le fichier contient 2 097 balises `<option>`. Les listes `P1` à `P5` en
comptent 401 chacune (de 1300 à 900, pas de 1), **strictement identiques** :
2 005 lignes, soit environ 58 % du fichier, pour cinq listes générables en une
boucle de trois lignes.

### 3.3 La moyenne exige les cinq performances

`effectuerCalcul()` (ligne 3071) additionne `P1` à `P5` puis divise par 5. Si
un seul champ est vide, `parseFloat` renvoie `NaN`, la somme devient `NaN` et
le champ `Moy` reste vide. Un athlète disposant de trois performances ne peut
donc rien calculer — alors que la moyenne des seules perfs saisies serait la
donnée utile.

### 3.4 Identifiants et libellés non conformes

Les `id` contiennent des accents et des espaces : `Point classement`,
`Points performance`, `Compétition`, `Périmètre`. Un espace dans un `id`
interdit l'usage direct en sélecteur CSS et complique `querySelector`.

Les `<label for="...">` ne pointent vers aucun `id` existant — par exemple
`for="Points performance :"` (ligne 819, avec l'espace et le deux-points) ou
`for="Total"` pointant vers un champ `readonly`. Aucune association
label/champ n'est donc effective pour un lecteur d'écran.

Enfin, `scope="col-0,5"` (ligne 3211) n'est pas une valeur valide de
l'attribut `scope` (`col`, `row`, `colgroup`, `rowgroup`).

### 3.5 Données de référence codées en dur et périmées

Le lien « Ranking Road to » pointe sur `road-to/7138987`, identifiant de la
campagne **Paris 2024**. Il est obsolète depuis deux saisons.

De la même manière, la clé `'OW_1': '260'` (ligne 681) utilise un **underscore**
là où toutes les autres clés utilisent un tiret. Elle n'est donc jamais
atteinte, la table étant interrogée avec `NiveauCompétition + '-' + Classement`.
La valeur effectivement servie pour une victoire en Olympic/World est
`'OW-1': '375'` (ligne 628). **Ce point demande une validation métier :
375 ou 260 ?**

La table contient par ailleurs seize clés `'-1'` à `'-16'` (niveau vide)
renvoyant toutes `'0'`, sans usage réel.

### 3.6 Ressources externes non maîtrisées

Quatre images sont chargées depuis des domaines tiers : le logo du club
(`staderennaisathle.fr`), le logo Puma (`companieslogo.com`, avec un paramètre
de cache daté de 2022), et deux logos hébergés sur Wikipedia. Toute
modification côté tiers casse l'affichage. Un `<div class="table-responsive">`
vide subsiste ligne 3207.

---

## 4. Hygiène du dépôt

| Élément | État |
|---|---|
| README | absent |
| LICENCE | absente |
| `.gitignore` | absent |
| Intégration continue | absente |
| Tests | absents |
| Linter / formateur | absent |
| Structure de dossiers | aucune (2 fichiers à la racine) |
| Versionnement du barème | aucun |

L'historique compte quinze commits intitulés « Update index.html » ou « Add
files via upload », signature d'une édition exclusivement via l'interface web
de GitHub. Aucun message ne décrit le changement apporté, ce qui rend
impossible de retrouver quand une valeur de barème a été modifiée — un point
sensible puisque les barèmes World Athletics évoluent chaque saison.

---

## 5. Plan de professionnalisation

Les trois phases sont ordonnées par dépendance : la phase 1 rend l'outil juste,
la phase 2 le rend tenable, la phase 3 le rend maintenable dans la durée.

### Phase 1 — Rendre l'outil juste

L'objectif est qu'un calcul saisi donne le bon résultat. Aucun changement
visuel.

1. Renommer les deux `effectuerCalcul` en `calculerTotal()` et
   `calculerMoyenne()`, et remplacer les deux `setInterval` par des écouteurs
   `change` / `input`.
2. Supprimer les appels à `addition()` inexistante.
3. Supprimer le bloc script mort des lignes 86 à 294.
4. Protéger `updateLinks()` par une vérification de présence de la discipline
   dans `correspondanceTable`, et masquer le lien quand elle est absente.
5. Ajouter `<meta charset="utf-8">`, `<meta name="viewport">` et `lang="fr"`.
6. Corriger la garde de `performPointsSearch` (`columns.length >= 6`).
7. Fusionner `performSearch` et `performSearch2`.
8. Trancher la valeur `OW-1` (375 ou 260) et supprimer la clé morte `OW_1`.

### Phase 2 — Rendre l'outil tenable

9. Indexer `bdd.csv` dans deux `Map` à la construction, en remplacement des
   parcours linéaires.
10. Réduire `bdd.csv` aux quatre colonnes utiles et reconstruire les clés
    composites côté client.
11. Générer les listes `P1` à `P5` en JavaScript, supprimant environ 2 000
    lignes de HTML.
12. Calculer la moyenne sur les seules performances saisies.
13. Supprimer les sept balises `<script>` redondantes et incompatibles ; ne
    conserver que la feuille CSS Bootstrap.
14. Héberger les quatre images dans le dépôt.
15. Extraire le CSS et le JavaScript dans `assets/styles.css` et
    `assets/app.js` ; remplacer les 33 `style` inline par des classes.
16. Corriger les `id` (sans accents ni espaces) et les associations
    `<label for>`.

### Phase 3 — Rendre l'outil maintenable

17. Rédiger un `README.md` : objet de l'outil, source des barèmes, procédure de
    mise à jour saisonnière, adresse de la page publiée.
18. Ajouter une `LICENCE` et un `.gitignore`.
19. Ajouter un fichier `data/bareme-placement.json` versionné et daté par
    saison, en remplacement de la table codée en dur.
20. Mettre en place une CI GitHub Actions : validation HTML, lint JavaScript,
    contrôle de cohérence du CSV (nombre de colonnes, doublons).
21. Externaliser l'identifiant de campagne « Road to » en configuration, pour
    qu'il se change sans toucher au code.
22. Adopter des messages de commit descriptifs.

### Effet attendu

| Indicateur | Avant | Après |
|---|---|---|
| Erreurs JS au chargement | 4 | 0 |
| Champ `Total` fonctionnel | non | oui |
| Données transférées | 8,95 Mo | ~0,3 Mo |
| Comparaisons par frappe | ~357 000 | 3 |
| Lignes de `index.html` | 3 435 | ~600 |
| Utilisable sur mobile | non | oui |

---

## Ordre de traitement recommandé

Les points 1 à 4 de la phase 1 se corrigent en une session et débloquent
l'usage réel de l'outil. Ils sont indépendants les uns des autres et peuvent
être livrés séparément.

Le point 8 (valeur `OW-1`) est le seul qui requiert un arbitrage métier avant
d'être codé.

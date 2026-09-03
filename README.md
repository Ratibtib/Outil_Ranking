# Outil Ranking

Calculateur de points World Athletics du **Stade Rennais Athlétisme**.

L'outil additionne les deux composantes du score World Athletics :

    score = points de performance + points de placement

Les **points de performance** viennent du barème officiel (une performance
chronométrée ou mesurée vaut un nombre de points). Les **points de placement**
dépendent du rang obtenu et de la catégorie de la compétition (OW, DF, GW, GL,
puis A à F).

Il propose également la conversion inverse (points → performance), la moyenne
de plusieurs performances, et des liens directs vers les classements World
Athletics.

## Utilisation

La page est entièrement statique : aucune installation, aucun serveur
applicatif. Elle est publiée via GitHub Pages.

Pour la faire tourner en local — le chargement des barèmes passe par `fetch`,
qui ne fonctionne pas en `file://` :

```bash
npm run servir      # puis ouvrir http://localhost:8000
```

## Organisation du dépôt

| Chemin | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `assets/styles.css` | Feuille de style (thèmes clair et sombre) |
| `assets/app.js` | Chargement des barèmes, calculs, liens |
| `data/bareme-performance.csv` | Barème de performance — 118 985 lignes |
| `data/bareme-placement.json` | Points de placement par catégorie et par place |
| `data/config.json` | Identifiants des liens « Road to » |
| `outils/verifier-donnees.mjs` | Contrôle de cohérence des barèmes |
| `outils/tester-calculs.mjs` | Tests des calculs dans un navigateur |
| `AUDIT.md` | Audit technique de la version précédente |

### Format de `data/bareme-performance.csv`

Séparateur point-virgule, quatre colonnes :

```
Sexe;Epreuve;Points;Perf
Men;100m;1400;9.46
```

`Sexe` vaut `Men` ou `Women`. `Epreuve` doit correspondre exactement aux
valeurs employées par le menu de la page — dont deux regroupent les versions
masculine et féminine : `110mH / 100mH` et `Decathlon / Heptathlon`.

La colonne `Points` peut être vide : le barème ne cote qu'une performance de
référence par palier (de 800 à 1400 points), et les performances
intermédiaires figurent dans le fichier sans valeur — 79 % des lignes.

La page applique alors la règle World Athletics : **une performance située
entre deux paliers vaut les points du palier inférieur**. L'arrondi est
calculé au chargement, signalé à l'écran, et ne s'applique qu'entre deux
paliers cotés — une performance sous le plancher du barème reste sans points.
La couverture passe ainsi de 24 635 à 118 154 performances sur 118 985.

L'arrondi ne suppose rien du format des performances : le fichier étant trié
du meilleur au moins bon pour les courses et l'inverse pour les concours, la
page retient simplement le plus faible des deux paliers encadrants.

## Mise à jour saisonnière

Les barèmes World Athletics changent chaque saison. La source de référence est
la page [World Ranking Rules](https://worldathletics.org/world-ranking-rules/track-field-events-2026).

1. **Points de placement** — modifier `data/bareme-placement.json`. Chaque
   catégorie contient un tableau de 16 valeurs, de la 1re à la 16e place. Mettre
   à jour `saison`, `source` et `miseAJour` dans le même fichier.
2. **Points de performance** — remplacer `data/bareme-performance.csv` en
   respectant les quatre colonnes ci-dessus.
3. **Campagne « Road to »** — à chaque nouveau cycle, mettre à jour
   `campagneRoadTo` dans `data/config.json` ; les identifiants d'épreuves se
   trouvent dans les URL de la *stats zone* World Athletics. Ne pas modifier le
   code pour cela.
4. Lancer les contrôles avant de pousser :

```bash
npm run verifier
```

Le script refuse notamment un barème dont les points ne décroissent pas avec le
rang — c'est ce contrôle qui a mis au jour la coquille `D-7 = 22` de l'ancienne
version.

## Contrôles automatiques

```bash
npm install                  # une fois
npm run verifier             # cohérence des barèmes
npx playwright install chromium
npm test                     # calculs vérifiés dans un navigateur
```

Ces deux commandes sont exécutées par l'intégration continue à chaque poussée
(`.github/workflows/ci.yml`).

## Choix techniques

La page n'a **aucune dépendance externe** : ni framework, ni bibliothèque, ni
police téléchargée. Bootstrap, jQuery et Popper ont été retirés (Popper 2.x y
était chargé alors que Bootstrap 4.5 exige Popper 1.x), et les polices sont
celles du système.

Ce n'est pas qu'une question de poids : une feuille de style externe bloque le
rendu. Lors des mesures, une simple inclusion de Google Fonts retardait
l'affichage de 12,6 secondes sur un réseau filtré, contre 130 ms pour le
barème complet. Pour un outil consulté en bord de piste sur réseau mobile,
la page doit s'afficher sans dépendre d'un tiers.

Le barème est préchargé (`<link rel="preload">`) pour que son téléchargement
démarre avec la page plutôt qu'après l'exécution du script. Page prête en
environ 450 ms, indexation des 118 985 lignes comprise.

## Licence

MIT — voir [LICENSE](LICENSE).

Les logos affichés dans l'en-tête appartiennent à leurs détenteurs respectifs
et sont chargés depuis leurs sites d'origine ; ils ne sont pas couverts par
cette licence.

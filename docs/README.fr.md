# MiNiMail

[简体中文](../README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Français | [Español](README.es.md) | [Português](README.pt.md)

MiNiMail est un client de messagerie de bureau natif AI, conçu pour rendre les e-mails du quotidien plus faciles à lire, à comprendre et à traiter.

Il combine un cache de messagerie local-first avec des fonctions AI respectueuses de la confidentialité pour résumer les longs messages, extraire les informations clés, rédiger des brouillons de réponse, traduire le contenu et router différents types d'e-mails.

> État actuel : MiNiMail est en phase release candidate. Il convient aux tests, aux démonstrations et aux premiers retours, mais il n'est pas encore recommandé pour les flux de messagerie critiques en production.

## Points Forts

- Cache local-first pour les listes d'e-mails, les corps de message et les métadonnées des pièces jointes.
- Résumés AI, suggestions de réponse, traduction, routage et extraction structurée des informations clés.
- Catégories AI génériques et routage dédié pour les notifications GitHub.
- Utilise la AI API Key de l'utilisateur et ne revend pas de AI tokens.
- Bloque par défaut les images distantes et les pixels de suivi.
- Nettoie les e-mails HTML avant le rendu.
- Prend en charge la rédaction, les brouillons, les pièces jointes, la récupération des e-mails envoyés et l'annulation d'envoi pendant 5 secondes.
- Prend en charge une interface et une documentation README multilingues.

## Modèle de Confidentialité

MiNiMail est conçu autour du contrôle utilisateur.

- Les utilisateurs fournissent leur propre AI API Key.
- MiNiMail ne revend pas de AI tokens.
- Le traitement des e-mails est pensé avec la confidentialité par défaut.
- Les images distantes et les pixels de suivi sont bloqués par défaut.
- Les e-mails HTML sont nettoyés avant le rendu.

## Plateforme Actuelle

MiNiMail se concentre actuellement sur l'application de bureau Windows.

La stack comprend :

- Electron
- TypeScript
- Cache de messagerie local-first
- Flux de comptes IMAP / SMTP / OAuth

## Feuille de Route

MiNiMail se concentre actuellement sur l'amélioration de l'expérience Windows Desktop. Une fois l'architecture plus stable, le projet prévoit d'explorer :

- La prise en charge de macOS Desktop.
- Des expériences mobiles, notamment iOS, Android et d'autres plateformes possibles.
- Des modes de confidentialité locale plus complets et des fonctions de connaissance e-mail AI.
- Un système de design plus complet, une documentation d'interaction et des documents multilingues.

Ces orientations avanceront selon la stabilité, le coût de maintenance et les retours réels des utilisateurs. Aucune date de sortie n'est promise.

## Avant Publication

Avant de créer une version ou un build de test interne, exécutez :

```bash
npm run test:release
```

Si la vérification échoue, ne sautez pas les éléments en échec. Déterminez d'abord s'il s'agit d'une vraie régression ou d'une assertion obsolète, puis appliquez le plus petit correctif sûr.

## Design

L'étude de cas UI/UX complète sera ajoutée dans un dépôt de design séparé.

Les informations sur les contributeurs design seront ajoutées avant la publication publique.

Ce dépôt d'ingénierie conserve le code source, la documentation de publication et un bref aperçu du design. Voir [design.md](design.md) pour plus de contexte.

## Licence

Ce projet est publié sous [Apache License 2.0](../LICENSE).

## Contribution

Consultez [CONTRIBUTING.md](../CONTRIBUTING.md) pour les consignes de contribution en ingénierie et design.

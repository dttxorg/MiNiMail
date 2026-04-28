<p align="center">
  <img src="assets/brand/logo.png" width="96" alt="MiNiMail logo" />
</p>

# MiNiMail

[简体中文](../README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Français | [Español](README.es.md) | [Português](README.pt.md)

MiNiMail est un client de messagerie de bureau natif AI, conçu pour rendre les e-mails du quotidien plus faciles à lire, à comprendre et à traiter.

Il combine un cache de messagerie local-first avec des fonctions AI respectueuses de la confidentialité pour résumer les longs messages, extraire les informations clés, rédiger des brouillons de réponse, traduire le contenu et router différents types d'e-mails.

> État actuel : MiNiMail est en phase release candidate. Il convient aux tests, aux démonstrations et aux premiers retours, mais il n'est pas encore recommandé pour les flux de messagerie critiques en production.

## Demo / Support

- YouTube : [MiNiMail English demo](https://youtu.be/d7CQ61Bk8Sc)
- Bilibili : [MiNiMail demo video](https://www.bilibili.com/video/BV1Q89kBuEL9/)
- Les stars, issues, retours et tests sont bienvenus.

## Points Forts

- Cache local-first pour les listes d'e-mails, les corps de message et les métadonnées des pièces jointes.
- Résumés AI, suggestions de réponse, traduction, routage et extraction structurée des informations clés.
- Catégories AI génériques et routage dédié pour les notifications GitHub.
- Prend en charge les API compatibles OpenAI et les grands modèles de langage locaux, afin que les utilisateurs puissent choisir entre modèles cloud et locaux selon leurs besoins de confidentialité, leurs coûts et leurs habitudes d'utilisation.
- Bloque par défaut les images distantes et les pixels de suivi.
- Nettoie les e-mails HTML avant le rendu.
- Prend en charge la rédaction, les brouillons, les pièces jointes, la récupération des e-mails envoyés et l'annulation d'envoi pendant 5 secondes.
- Prend en charge une interface et une documentation README multilingues.

## Modèle de Confidentialité

MiNiMail est conçu autour du contrôle utilisateur.

- Prend en charge les API compatibles OpenAI et les grands modèles de langage locaux, afin que les utilisateurs puissent choisir entre modèles cloud et locaux selon leurs besoins de confidentialité, leurs coûts et leurs habitudes d'utilisation.
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

Ces orientations avanceront selon la stabilité, le coût de maintenance et les retours réels des utilisateurs. Aucune date de sortie n'est promise.

## Avant Publication

Avant de créer une version ou un build de test interne, exécutez :

```bash
npm run test:release
```

Si la vérification échoue, ne sautez pas les éléments en échec. Déterminez d'abord s'il s'agit d'une vraie régression ou d'une assertion obsolète, puis appliquez le plus petit correctif sûr.

## Design

完整 UI/UX case study 将由设计贡献者后续通过独立 PR 补充。

## Licence

Ce projet est publié sous [Apache License 2.0](../LICENSE).

## Contribution

Consultez [CONTRIBUTING.md](../CONTRIBUTING.md) pour les consignes de contribution en ingénierie et design.

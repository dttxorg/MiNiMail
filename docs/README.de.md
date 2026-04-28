# MiNiMail

[简体中文](../README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Deutsch | [Français](README.fr.md) | [Español](README.es.md) | [Português](README.pt.md)

MiNiMail ist ein AI-nativer Desktop-E-Mail-Client, der alltägliche E-Mails leichter lesbar, verständlicher und besser handhabbar machen soll.

Die App kombiniert einen lokalen Mail-Cache mit datenschutzbewussten AI-Funktionen für Zusammenfassungen, Schlüsselinformationen, Antwortentwürfe, Übersetzungen und intelligentes Routing.

> Aktueller Status: MiNiMail befindet sich in der Release-Candidate-Phase. Es eignet sich für Tests, Demos und frühes Feedback, wird aber noch nicht für kritische produktive E-Mail-Abläufe empfohlen.

## Kernfunktionen

- Lokales Caching von E-Mail-Listen, Nachrichteninhalten und Anhangsmetadaten.
- AI-Zusammenfassungen, Antwortvorschläge, Übersetzung, Routing und strukturierte Extraktion wichtiger Informationen.
- Allgemeine AI-Kategorien sowie spezielles Routing für GitHub-Benachrichtigungen.
- Nutzt den eigenen AI API Key des Nutzers und verkauft keine AI tokens weiter.
- Blockiert Remote-Bilder und Tracking-Pixel standardmäßig.
- Bereinigt HTML-E-Mails vor dem Rendern.
- Unterstützt Schreiben, Entwürfe, Anhänge, Wiederherstellung gesendeter E-Mails und 5-Sekunden-Undo-Send.
- Unterstützt mehrsprachige UI und mehrsprachige README-Dokumentation.

## Datenschutzmodell

MiNiMail ist auf Nutzerkontrolle ausgelegt.

- Nutzer verwenden ihren eigenen AI API Key.
- MiNiMail verkauft keine AI tokens weiter.
- Die Verarbeitung von E-Mail-Inhalten ist datenschutzbewusst gestaltet.
- Remote-Bilder und Tracking-Pixel werden standardmäßig blockiert.
- HTML-E-Mails werden vor dem Rendern bereinigt.

## Aktuelle Plattform

MiNiMail richtet sich derzeit vor allem an Windows-Desktop-Nutzer.

Der Stack umfasst:

- Electron
- TypeScript
- Lokale E-Mail-Cache-Architektur
- IMAP / SMTP / OAuth Account-Flows

## Roadmap

MiNiMail konzentriert sich derzeit auf die Windows-Desktop-Erfahrung. Nach weiterer Stabilisierung der Architektur sollen folgende Richtungen geprüft werden:

- Unterstützung für macOS Desktop.
- Mobile Erfahrungen, einschließlich iOS, Android und weiterer möglicher Plattformen.
- Ausgereiftere lokale Datenschutzmodi und AI-Mail-Wissensfunktionen.
- Vollständigeres Designsystem, Interaktionsdokumentation und mehrsprachige Dokumentation.

Diese Richtungen werden abhängig von Stabilität, Wartungsaufwand und echtem Nutzerfeedback schrittweise verfolgt. Konkrete Veröffentlichungstermine werden nicht zugesagt.

## Vor dem Release

Vor dem Erstellen eines Release- oder internen Test-Builds ausführen:

```bash
npm run test:release
```

Fehlgeschlagene Prüfungen sollten nicht übersprungen werden. Zuerst prüfen, ob es sich um eine echte Regression oder eine veraltete Testannahme handelt, danach die kleinste sichere Korrektur vornehmen.

## Design

Die vollständige UI/UX case study wird in einem separaten Design-Repository ergänzt.

Informationen zu Design-Beitragenden werden vor der öffentlichen Veröffentlichung ergänzt.

Dieses Engineering-Repository enthält Quellcode, Release-Dokumentation und eine kurze Designübersicht. Weitere Informationen stehen in [design.md](design.md).

## Lizenz

Dieses Projekt ist unter der Apache License 2.0 lizenziert.

## Mitwirken

Hinweise zu Engineering- und Design-Beiträgen stehen in [CONTRIBUTING.md](../CONTRIBUTING.md).

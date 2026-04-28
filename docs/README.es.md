# MiNiMail

[简体中文](../README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | Español | [Português](README.pt.md)

MiNiMail es un cliente de correo de escritorio nativo de AI, diseñado para que el correo diario sea más fácil de leer, entender y gestionar.

Combina una caché de correo local-first con funciones AI conscientes de la privacidad para resumir mensajes largos, extraer información clave, redactar borradores de respuesta, traducir contenido y enrutar distintos tipos de correo.

> Estado actual: MiNiMail está en fase release candidate. Es adecuado para pruebas, demostraciones y comentarios tempranos, pero todavía no se recomienda para flujos de correo críticos en producción.

## Puntos Destacados

- Caché local-first para listas de correo, cuerpos de mensaje y metadatos de adjuntos.
- Resúmenes AI, sugerencias de respuesta, traducción, enrutamiento y extracción estructurada de información clave.
- Categorías AI genéricas y enrutamiento dedicado para notificaciones de GitHub.
- Usa la AI API Key del usuario y no revende AI tokens.
- Bloquea por defecto imágenes remotas y píxeles de seguimiento.
- Sanitiza el correo HTML antes de renderizarlo.
- Soporta redacción, borradores, adjuntos, recuperación de correo enviado y deshacer envío durante 5 segundos.
- Soporta interfaz y documentación README multilingües.

## Modelo de Privacidad

MiNiMail está diseñado alrededor del control del usuario.

- Los usuarios proporcionan su propia AI API Key.
- MiNiMail no revende AI tokens.
- El procesamiento del correo se diseña con privacidad por defecto.
- Las imágenes remotas y los píxeles de seguimiento se bloquean por defecto.
- El correo HTML se sanitiza antes de renderizarse.

## Plataforma Actual

MiNiMail se centra actualmente en la aplicación de escritorio para Windows.

El stack incluye:

- Electron
- TypeScript
- Caché de correo local-first
- Flujos de cuenta IMAP / SMTP / OAuth

## Hoja de Ruta

MiNiMail se centra actualmente en mejorar la experiencia de escritorio en Windows. Cuando la arquitectura sea más estable, el proyecto planea explorar:

- Soporte para macOS Desktop.
- Experiencias móviles, incluidas iOS, Android y otras plataformas posibles.
- Modos de privacidad local más completos y funciones de conocimiento de correo AI.
- Un sistema de diseño más completo, documentación de interacción y documentos multilingües.

Estas direcciones avanzarán según la estabilidad, el coste de mantenimiento y los comentarios reales de los usuarios. No se prometen fechas de lanzamiento.

## Antes del Lanzamiento

Antes de crear una versión o build de prueba interna, ejecuta:

```bash
npm run test:release
```

Si la verificación falla, no omitas los elementos fallidos. Primero determina si es una regresión real o una aserción obsoleta, y luego aplica la corrección segura más pequeña.

## Diseño

El caso de estudio completo de UI/UX se añadirá en un repositorio de diseño separado.

La información sobre contribuyentes de diseño se añadirá antes del lanzamiento público.

Este repositorio de ingeniería conserva el código fuente, la documentación de lanzamiento y una breve descripción de diseño. Consulta [design.md](design.md) para más contexto.

## Licencia

Este proyecto se publica bajo Apache License 2.0.

## Contribuir

Consulta [CONTRIBUTING.md](../CONTRIBUTING.md) para las guías de contribución de ingeniería y diseño.

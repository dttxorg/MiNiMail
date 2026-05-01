<p align="center">
  <img src="assets/brand/logo.png" width="96" alt="MiNiMail logo" />
</p>

# MiNiMail

[简体中文](../README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | Español | [Português](README.pt.md)

MiNiMail es un cliente de correo de escritorio nativo de AI, diseñado para que el correo diario sea más fácil de leer, entender y gestionar.

Combina una caché de correo local-first con funciones AI conscientes de la privacidad para resumir mensajes largos, extraer información clave, redactar borradores de respuesta, traducir contenido y enrutar distintos tipos de correo.

> Estado actual: MiNiMail está en fase release candidate. Es adecuado para pruebas, demostraciones y comentarios tempranos, pero todavía no se recomienda para flujos de correo críticos en producción.

## Demo / Support

- YouTube: [MiNiMail English demo](https://youtu.be/d7CQ61Bk8Sc)
- Bilibili: [MiNiMail demo video](https://www.bilibili.com/video/BV1Q89kBuEL9/)
- Se agradecen stars, issues, comentarios y participación en pruebas.

## Puntos Destacados

- Caché local-first para listas de correo, cuerpos de mensaje y metadatos de adjuntos.
- Resúmenes AI, sugerencias de respuesta, traducción, enrutamiento y extracción estructurada de información clave.
- Categorías AI genéricas y enrutamiento dedicado para notificaciones de GitHub.
- Soporta API compatibles con OpenAI y modelos de lenguaje grandes locales, lo que permite elegir entre modelos en la nube y locales según las necesidades de privacidad, el costo y los hábitos de uso.
- Bloquea por defecto imágenes remotas y píxeles de seguimiento.
- Sanitiza el correo HTML antes de renderizarlo.
- Soporta redacción, borradores, adjuntos, recuperación de correo enviado y deshacer envío durante 5 segundos.
- Soporta interfaz y documentación README multilingües.

## Modelo de Privacidad

MiNiMail está diseñado alrededor del control del usuario.

- Soporta API compatibles con OpenAI y modelos de lenguaje grandes locales, lo que permite elegir entre modelos en la nube y locales según las necesidades de privacidad, el costo y los hábitos de uso.
- El procesamiento del correo se diseña con privacidad por defecto.
- Las imágenes remotas y los píxeles de seguimiento se bloquean por defecto.
- El correo HTML se sanitiza antes de renderizarse.

## Plataforma Actual

MiNiMail actualmente admite la aplicación de escritorio para macOS y sigue manteniendo la experiencia de escritorio en Windows.

El stack incluye:

- Electron
- TypeScript
- Caché de correo local-first
- Flujos de cuenta IMAP / SMTP / OAuth

## Hoja de Ruta

MiNiMail se centra actualmente en mejorar las experiencias de escritorio en macOS y Windows. Cuando la arquitectura sea más estable, el proyecto planea explorar:

- Experiencias móviles, incluidas iOS, Android y otras plataformas posibles.
- Modos de privacidad local más completos y funciones de conocimiento de correo AI.

Estas direcciones avanzarán según la estabilidad, el coste de mantenimiento y los comentarios reales de los usuarios. No se prometen fechas de lanzamiento.

## Antes del Lanzamiento

Antes de crear una versión o build de prueba interna, ejecuta:

```bash
npm run test:release
```

Si la verificación falla, no omitas los elementos fallidos. Primero determina si es una regresión real o una aserción obsoleta, y luego aplica la corrección segura más pequeña.

## Diseño

完整 UI/UX case study 将由设计贡献者后续通过独立 PR 补充。

## Licencia

Este proyecto se publica bajo [Apache License 2.0](../LICENSE).

## Contribuir

Consulta [CONTRIBUTING.md](../CONTRIBUTING.md) para las guías de contribución de ingeniería y diseño.

<<<<<<< HEAD
# ☕ MangÜareo Suite v4.2

> **"Nuestra GPU camella en local."** > Un entorno de desarrollo frontend autónomo, interactivo y con inspección visual estéril corriendo 100% en local.

---

## 👁️ ¿Qué es MangÜareo Suite?

**MangÜareo Suite** es un ecosistema local diseñado para prototipar, iterar y refinar componentes web de forma autónoma. Utilizando el poder de modelos de lenguaje locales a través de **Ollama**, la suite genera código de alta calidad, lo autoevalúa mediante tests de consola y renderiza los resultados al instante en una interfaz de tres columnas sumamente pulida.

### 🚀 Características Clave
* **🤖 Copiloto Frontend Autónomo:** Generación e iteración de código en caliente usando `qwen2.5-coder:7b`.
* **📺 Live Preview en Tiempo Real:** Visualización instantánea del render de tus archivos mediante comunicación bidireccional con **Socket.io** e inyección dinámica en un iframe libre de caché.
* **📁 Aislamiento de Producción (`/dist`):** Adiós al desorden en el directorio raíz. Todo el código generado y las capturas se guardan y sirven de forma estéril en la carpeta `/dist`.
* **👁️ Ojo Mecánico (Visión Local ready):** Motor de visión artificial integrado con **Puppeteer** para congelar renders reales (`screenshot.png`) y analizarlos visualmente con modelos multimodales como `llama3.2-vision`.

---

## 🛠️ Stack Tecnológico

* **Runtime:** Node.js (Express)
* **Comunicación:** Socket.io (Websockets)
* **Automatización Visual:** Puppeteer (Headless Chromium)
* **Orquestación de IA:** Ollama API (Local)
* **Modelos Recomendados:** * Lógica y Código: `qwen2.5-coder:7b` (4.7 GB)
    * Visión e Inspección: `llama3.2-vision` / `qwen3.6:latest` (23 GB)

---

## 📦 Instalación y Uso

1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   git clone <url-de-tu-repositorio>
   cd loop-ollama
   npm install

    Asegurar que Ollama esté corriendo en segundo plano:
    Asegúrate de que tu puerto local http://localhost:11434 responda con "Ollama is running".

Arrancar la Suite:

Bash
node manguareo.mjs
¡A mangüarear!
Abre tu navegador en http://localhost:3000, escribe tus requerimientos estéticos en el panel y observa cómo el agente autónomo maqueta tu aplicación iteración tras iteración.
=======
# Manguareo_Suite
> **"Nuestra GPU camella en local."** > Un entorno de desarrollo frontend autónomo, interactivo y con inspección visual estéril corriendo 100% en local.
>>>>>>> c65aca02d6ffd7c61ffc76c1088053db124c422f

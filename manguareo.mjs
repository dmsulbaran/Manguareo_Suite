import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import ollama from 'ollama';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import puppeteer from 'puppeteer';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const MODELO_CODIGO = 'qwen2.5-coder:7b';
const MODELO_VISION = 'qwen3.6:latest';
const MAX_ITERACIONES = 5;

// CREAR CARPETA DIST SI NO EXISTE PARA COMPARTIMENTAR
const CARPETA_SALIDA = path.join(process.cwd(), 'dist');
if (!fs.existsSync(CARPETA_SALIDA)) {
    fs.mkdirSync(CARPETA_SALIDA, { recursive: true });
}

const procesosActivos = new Map();

const PROMPT_SISTEMA = `
Eres un ingeniero frontend autónomo y experto en diseño UI/UX limpio.
Tu objetivo es escribir código HTML/CSS/JS impecable, moderno y perfectamente balanceado.
Devuelve ÚNICAMENTE el código puro listo para ser guardado. 
No uses bloques de código Markdown (\`\`\`html, etc.). No des introducciones ni explicaciones de ningún tipo.
`;

app.use(express.json());

// Servir la interfaz del panel de control
app.get('/', (req, res) => {
    res.send(obtenerInterfazHTML());
});

// NUEVO: Servir de forma estática la carpeta 'dist' para el iframe y Puppeteer
app.use('/output', express.static(CARPETA_SALIDA));

function probarCodigo(rutaArchivo) {
    return new Promise((resolve) => {
        const ext = path.extname(rutaArchivo);
        if (ext === '.js' || ext === '.mjs') {
            exec(`node "${rutaArchivo}"`, (error, stdout, stderr) => {
                if (error) {
                    resolve({ exito: false, output: stderr || error.message });
                } else {
                    resolve({ exito: true, output: stdout || "El script corrió perfectamente." });
                }
            });
        } else if (ext === '.html') {
            try {
                if (fs.existsSync(rutaArchivo)) {
                    const contenido = fs.readFileSync(rutaArchivo, 'utf-8');
                    if (contenido.includes('</html>') && contenido.includes('</body>')) {
                        resolve({ exito: true, output: "¡Estructura HTML5 válida detectada!" });
                    } else {
                        resolve({ exito: false, output: "Error: Faltan etiquetas de cierre estructurales." });
                    }
                } else {
                    resolve({ exito: false, output: "Error: Archivo no encontrado." });
                }
            } catch (err) {
                resolve({ exito: false, output: err.message });
            }
        } else {
            resolve({ exito: true, output: "Archivo guardado con éxito." });
        }
    });
}

// FUNCIÓN MÁGICA CON RETRASO DE SEGURIDAD
async function tomarCapturaPantalla(nombreArchivo) {
    const rutaImagen = path.join(CARPETA_SALIDA, 'screenshot.png');
    try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        // Apuntar a la nueva ruta estática compartimentada
        await page.goto(`http://localhost:${PORT}/output/${nombreArchivo}`, { waitUntil: 'networkidle0' });

        await page.setViewport({ width: 1280, height: 800 });

        // PEQUEÑO TRUCO: Esperar 800ms para asegurar el render de los estilos
        await new Promise(r => setTimeout(r, 800));

        await page.screenshot({ path: rutaImagen });
        await browser.close();
        return { exito: true, ruta: rutaImagen };
    } catch (error) {
        return { exito: false, error: error.message };
    }
}

io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado a la interfaz de MangÜareo');

    socket.on('iniciar_generacion', async (data) => {
        const { instruccion, tipoArchivo, usarOjoMecanico } = data;
        const nombreArchivo = tipoArchivo === 'html' ? 'index.html' : 'codigo_generado.js';
        const rutaArchivo = path.join(CARPETA_SALIDA, nombreArchivo); // GUARDAR EN DIST/

        procesosActivos.set(socket.id, true);
        let iteracion = 1;
        let codigoActual = fs.existsSync(rutaArchivo) ? fs.readFileSync(rutaArchivo, 'utf-8') : ``;
        let ultimoFeedback = "Inicializando ciclo sobre el archivo base.";
        let errorOcurrido = false;

        socket.emit('log', { tipo: 'info', mensaje: `🚀 Iniciando proceso autónomo en dist/${nombreArchivo}...` });

        while (iteracion <= MAX_ITERACIONES && procesosActivos.get(socket.id) === true) {

            let modoVisionActivo = (usarOjoMecanico && tipoArchivo === 'html');
            const modeloEjecucion = modoVisionActivo ? MODELO_VISION : MODELO_CODIGO;

            socket.emit('log', { tipo: 'pensando', iteracion, max: MAX_ITERACIONES, modelo: modeloEjecucion });

            let mensajesOllama = [];
            let contenidoPrompt = `
            Objetivo final del usuario: ${instruccion}
            Código actual en el archivo:
            ${codigoActual}
            Resultado del test de ejecución:
            ${ultimoFeedback}
            `;

            if (modoVisionActivo && modeloEjecucion === 'qwen3.6:latest') {
                socket.emit('log', { tipo: 'ojo_disparando' });
                const captura = await tomarCapturaPantalla(nombreArchivo);

                if (captura.exito && fs.existsSync(captura.ruta)) {
                    const imagenBase64 = fs.readFileSync(captura.ruta, { encoding: 'base64' });
                    contenidoPrompt += `\nINSPECCIÓN VISUAL: Te he adjuntado la captura real de cómo se ve el código. Si ves errores estéticos o desalineaciones, corrígelas en el CSS. Devuelve el código completo corregido.`;

                    mensajesOllama = [
                        { role: 'system', content: PROMPT_SISTEMA },
                        { role: 'user', content: contenidoPrompt, images: [imagenBase64] }
                    ];
                } else {
                    socket.emit('log', { tipo: 'info', mensaje: `⚠️ Alerta: El Ojo Mecánico falló al tomar la foto. Usando texto...` });
                    modoVisionActivo = false;
                }
            }

            if (!modoVisionActivo) {
                if (usarOjoMecanico && modeloEjecucion !== 'qwen3.6:latest') {
                    socket.emit('log', { tipo: 'info', mensaje: `ℹ️ Modo visual omitido: ${modeloEjecucion} no procesa imágenes.` });
                }
                contenidoPrompt += `\nSi hubo errores de código, arréglalos. Devuelve solo el código final sin Markdown.`;
                mensajesOllama = [
                    { role: 'system', content: PROMPT_SISTEMA },
                    { role: 'user', content: contenidoPrompt }
                ];
            }

            try {
                const response = await ollama.chat({
                    model: modeloEjecucion,
                    messages: mensajesOllama
                });

                if (procesosActivos.get(socket.id) !== true) break;

                let nuevoCodigo = response.message.content.trim();
                nuevoCodigo = nuevoCodigo.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');

                fs.writeFileSync(rutaArchivo, nuevoCodigo, 'utf-8');
                codigoActual = nuevoCodigo;

                socket.emit('log', { tipo: 'guardado', archivo: nombreArchivo });

                const test = await probarCodigo(rutaArchivo);

                if (test.exito) {
                    socket.emit('log', { tipo: 'exito', output: test.output });
                    ultimoFeedback = `El código es funcional. Output: ${test.output}`;
                } else {
                    socket.emit('log', { tipo: 'fallo', output: test.output });
                    ultimoFeedback = `ERROR DETECTADO EN EL CÓDIGO:\n${test.output}`;
                }

                iteracion++;

            } catch (error) {
                errorOcurrido = true;
                socket.emit('log', { tipo: 'error_critico', mensaje: `❌ ERROR CRÍTICO: Conexión perdida con el modelo ${modeloEjecucion}.` });
                break;
            }
        }

        if (!errorOcurrido) {
            if (procesosActivos.get(socket.id) === true) {
                socket.emit('log', { tipo: 'completado', archivo: nombreArchivo });
            } else {
                socket.emit('log', { tipo: 'info', mensaje: `🛑 Proceso detenido por el usuario.` });
            }
        }

        procesosActivos.delete(socket.id);
    });

    socket.on('cancelar_generacion', () => {
        procesosActivos.set(socket.id, false);
    });

    socket.on('disconnect', () => {
        procesosActivos.delete(socket.id);
    });
});

server.listen(PORT, () => {
    console.clear();
    console.log("====================================================");
    console.log("  ☕  MANGÜAREO SUITE CON CARPETA DIST ASIGNADA  ☕  ");
    console.log(`  Entra en tu navegador a: http://localhost:${PORT}`);
    console.log("====================================================");
});

function obtenerInterfazHTML() {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MANGÜAREO - Suite IA Local ☕</title>
        <script src="/socket.io/socket.io.js"></script>
        <style>
            :root {
                --bg: #ffffff;
                --text: #111111;
                --border: #e5e5e5;
                --accent-gray: #707070;
                --light-gray: #fafafa;
                --success: #10b981;
                --error: #ef4444;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { background-color: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; display: flex; height: 100vh; overflow: hidden; }
            aside { width: 260px; border-right: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between; background-color: var(--light-gray); padding: 30px 20px; flex-shrink: 0; }
            .brand { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
            .logo-u { font-size: 3rem; font-weight: 900; line-height: 0.8; color: var(--text); border-bottom: 4px solid var(--text); padding-bottom: 2px; }
            .brand h2 { font-size: 1rem; font-weight: 800; letter-spacing: 0.05em; margin-top: 8px; }
            .brand p { font-size: 0.7rem; color: var(--accent-gray); }
            .nav-menu { list-style: none; flex-grow: 1; margin-top: 30px; }
            .nav-item { padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; font-weight: 500; color: var(--accent-gray); margin-bottom: 6px; }
            .nav-item.active { background-color: #ffffff; color: var(--text); border: 1px solid var(--border); font-weight: 600; }
            .sidebar-footer { border-top: 1px solid var(--border); padding-top: 15px; font-size: 0.7rem; color: var(--accent-gray); }
            main { flex-grow: 1; display: flex; height: 100vh; overflow: hidden; }
            .workspace-panel { width: 45%; border-right: 1px solid var(--border); padding: 30px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
            .preview-panel { width: 55%; background-color: #f5f5f5; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
            h1 { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.04em; }
            .section-tagline { font-size: 0.9rem; color: var(--accent-gray); padding-bottom: 5px; }
            .config-card, .panel-card { border: 1px solid var(--border); border-radius: 8px; padding: 20px; background-color: #ffffff; }
            .card-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-gray); margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
            .form-group { margin-bottom: 15px; }
            label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.8rem; }
            select, textarea { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text); background-color: var(--light-gray); }
            textarea { height: 80px; resize: none; }
            .toggle-container { display: flex; align-items: center; justify-content: space-between; background: var(--light-gray); padding: 10px 14px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 15px; }
            .toggle-label { font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
            .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 24px; }
            .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 4px; bottom: 4px; background-color: white; transition: .3s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--text); }
            input:checked + .slider:before { transform: translateX(20px); }
            .btn-group { display: flex; gap: 8px; }
            button { padding: 12px 24px; font-size: 0.85rem; font-weight: 600; border-radius: 6px; cursor: pointer; transition: opacity 0.2s; }
            #btnManguarear { background-color: var(--text); color: var(--bg); border: none; flex-grow: 2; }
            #btnParar { background-color: #ffffff; color: var(--error); border: 1px solid var(--error); flex-grow: 1; display: none; }
            .output-box { height: 220px; overflow-y: auto; background-color: var(--light-gray); border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-family: monospace; font-size: 0.8rem; }
            .log-line { margin-bottom: 6px; border-left: 2px solid var(--accent-gray); padding-left: 8px; }
            .log-line.exito { border-left-color: var(--success); color: #065f46; }
            .log-line.fallo { border-left-color: var(--error); color: #991b1b; }
            .log-line.info { border-left-color: #3b82f6; color: #1e3a8a; }
            .log-line.ojo { border-left-color: #a855f7; color: #6b21a8; font-weight: 600; }
            .browser-mockup { flex-grow: 1; border: 1px solid var(--border); border-radius: 8px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; flex-direction: column; overflow: hidden; }
            .browser-bar { background-color: var(--light-gray); border-bottom: 1px solid var(--border); padding: 8px 15px; display: flex; align-items: center; gap: 10px; }
            .browser-dots { display: flex; gap: 6px; }
            .dot { width: 10px; height: 10px; border-radius: 50%; background-color: #ddd; }
            .browser-address { flex-grow: 1; background-color: #ffffff; border: 1px solid var(--border); border-radius: 4px; padding: 2px 10px; font-size: 0.75rem; color: var(--accent-gray); font-family: monospace; }
            iframe { width: 100%; flex-grow: 1; border: none; background-color: #ffffff; }
        </style>
    </head>
    <body>
        <aside>
            <div class="brand">
                <div class="logo-u">Ü</div>
                <h2>MANGÜAREO SUITE</h2>
                <p>Nuestra GPU camella en local.</p>
            </div>
            <ul class="nav-menu">
                <li class="nav-item active">💻 Copiloto Frontend</li>
                <li class="nav-item">👁️ Ojo Mecánico (Activo)</li>
                <li class="nav-item" style="opacity: 0.4;">📁 Archivador Privado</li>
                <li class="nav-item" style="opacity: 0.4;">📦 Cortadora JSON</li>
            </ul>
            <div class="sidebar-footer">
                <p>Servidor: Activo</p>
                <p>MangÜareo Suite v4.2</p>
            </div>
        </aside>

        <main>
            <div class="workspace-panel">
                <div>
                    <h1>💻 El Mangüareador Web</h1>
                    <p class="section-tagline">Entorno aislado y limpio en /dist.</p>
                </div>
                
                <div class="config-card">
                    <div class="card-title">Ajustes del Sistema</div>
                    <div class="form-group">
                        <label>Tipo de Archivo</label>
                        <select id="tipoArchivo">
                            <option value="html">index.html (Página Interactiva)</option>
                            <option value="js">codigo_generado.js (Lógica Backend)</option>
                        </select>
                    </div>
                    
                    <div class="toggle-container" id="ojoToggleWrapper">
                        <div class="toggle-label">👁️ Activar Ojo Mecánico (Visión)</div>
                        <label class="switch">
                            <input type="checkbox" id="usarOjoMecanico">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="form-group">
                        <label>Instrucciones de Programación</label>
                        <textarea id="instruccion" placeholder="Escribe tu orden de diseño..."></textarea>
                    </div>
                    <div class="btn-group">
                        <button id="btnManguarear">¡A mangüarear!</button>
                        <button id="btnParar">¡Deja de mangüarear!</button>
                    </div>
                </div>

                <div class="panel-card">
                    <div class="card-title">Progreso del Agente</div>
                    <div class="output-box" id="consola">
                        <div class="log-line">> Carpeta dist/ enlazada con éxito. Listo para camellar.</div>
                    </div>
                </div>
            </div>

            <div class="preview-panel">
                <div class="card-title" style="margin-bottom: 0;">Vista Previa en Vivo (Render Real)</div>
                <div class="browser-mockup">
                    <div class="browser-bar">
                        <div class="browser-dots">
                            <div class="dot" style="background-color: #ef4444;"></div>
                            <div class="dot" style="background-color: #f59e0b;"></div>
                            <div class="dot" style="background-color: #10b981;"></div>
                        </div>
                        <div class="browser-address" id="liveURL">http://localhost:3000/output/index.html</div>
                    </div>
                    <iframe id="previewFrame" src="/output/index.html"></iframe>
                </div>
            </div>
        </main>

        <script>
            const socket = io();
            const btnManguarear = document.getElementById('btnManguarear');
            const btnParar = document.getElementById('btnParar');
            const consola = document.getElementById('consola');
            const previewFrame = document.getElementById('previewFrame');
            const liveURL = document.getElementById('liveURL');
            const usarOjoMecanico = document.getElementById('usarOjoMecanico');
            const tipoArchivo = document.getElementById('tipoArchivo');
            const ojoToggleWrapper = document.getElementById('ojoToggleWrapper');

            tipoArchivo.addEventListener('change', () => {
                if(tipoArchivo.value === 'js') {
                    ojoToggleWrapper.style.opacity = '0.3';
                    usarOjoMecanico.disabled = true;
                    usarOjoMecanico.checked = false;
                } else {
                    ojoToggleWrapper.style.opacity = '1';
                    usarOjoMecanico.disabled = false;
                }
            });

            btnManguarear.addEventListener('click', () => {
                const instruccion = document.getElementById('instruccion').value.trim();
                const archivoTipo = tipoArchivo.value;
                const visionActiva = usarOjoMecanico.checked;

                if (!instruccion) {
                    alert('Por favor, escribe instrucciones.');
                    return;
                }

                btnManguarear.disabled = true;
                btnManguarear.innerText = 'Mangüareando... ☕';
                btnParar.style.display = 'inline-block';
                consola.innerHTML = '';

                socket.emit('iniciar_generacion', { 
                    instruccion, 
                    tipoArchivo: archivoTipo, 
                    usarOjoMecanico: visionActiva 
                });
            });

            btnParar.addEventListener('click', () => {
                socket.emit('cancelar_generacion');
                restablecerBotones();
            });

            function restablecerBotones() {
                btnManguarear.disabled = false;
                btnManguarear.innerText = '¡A mangüarear!';
                btnParar.style.display = 'none';
            }

            socket.on('log', (data) => {
                let p = document.createElement('div');
                p.classList.add('log-line');

                if (data.tipo === 'info') {
                    p.classList.add('info');
                    p.innerText = data.mensaje;
                    if(data.mensaje.includes('detenido')) restablecerBotones();
                } else if (data.tipo === 'pensando') {
                    p.innerHTML = \`🧠 [Iteración \${data.iteracion}/\${data.max}] Pensando con <strong>\${data.modelo}</strong>...\`;
                } else if (data.tipo === 'ojo_disparando') {
                    p.classList.add('ojo');
                    p.innerText = \`📸 [Ojo Mecánico] Tomando captura al render real con Delay de seguridad...\`;
                } else if (data.tipo === 'guardado') {
                    p.innerText = \`💾 Cambios guardados en dist/\${data.archivo}.\`;
                    
                    if (data.archivo === 'index.html') {
                        liveURL.innerText = 'http://localhost:3000/output/' + data.archivo;
                        previewFrame.src = '/output/' + data.archivo + '?t=' + new Date().getTime();
                    }
                } else if (data.tipo === 'exito') {
                    p.classList.add('exito');
                    p.innerText = \`✅ TEST COMPLETADO EXITOSAMENTE:\\n\${data.output}\`;
                } else if (data.tipo === 'fallo') {
                    p.classList.add('fallo');
                    p.innerText = \`❌ TEST FALLIDO EN TU PC:\\n\${data.output}\`;
                } else if (data.tipo === 'error_critico') {
                    p.classList.add('critico');
                    p.innerText = data.mensaje;
                    restablecerBotones();
                } else if (data.tipo === 'completado') {
                    p.classList.add('exito');
                    p.innerText = \`🎯 ¡MangÜareo completado! Archivo listo en /dist.\`;
                    restablecerBotones();
                }

                consola.appendChild(p);
                consola.scrollTop = consola.scrollHeight;
            });
        </script>
    </body>
    </html>
    `;
}
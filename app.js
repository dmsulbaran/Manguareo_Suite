import ollama from 'ollama';
import fs from 'fs';
import path from 'path';

// Configuración inicial
const MODELO = 'qwen2.5-coder:7b';
const ARCHIVO_TRABAJO = path.join(process.cwd(), 'codigo_generado.js');
const MAX_ITERACIONES = 5; // Límite de vueltas del bucle para no ciclarse infinitamente

// Prompt que define el rol del "Programador Autónomo"
const PROMPT_SISTEMA = `
Eres un agente de software autónomo que escribe y refactoriza código en JavaScript.
Tu objetivo es analizar el archivo de código actual y mejorarlo en base a las instrucciones del usuario.
Debes devolver ÚNICAMENTE el código JavaScript resultante. No agregues explicaciones, no uses bloques de código Markdown (\`\`\`javascript ... \`\`\`), ni introducciones. Solo el código puro ejecutable.
`;

async function ejecutarLoopAutonomo(instruccionUsuario) {
    let iteracion = 1;
    let codigoActual = "";

    // Si ya existe un archivo previo, lo leemos para que la IA trabaje sobre él
    if (fs.existsSync(ARCHIVO_TRABAJO)) {
        codigoActual = fs.readFileSync(ARCHIVO_TRABAJO, 'utf-8');
        console.log("📂 Código base cargado con éxito.");
    } else {
        console.log("📝 No hay código previo. Creando un archivo desde cero...");
    }

    while (iteracion <= MAX_ITERACIONES) {
        console.log(`\n🤖 [Iteración ${iteracion}/${MAX_ITERACIONES}] Pensando mejoras...`);

        try {
            const promptPrompt = `
            Instrucción del usuario: ${instruccionUsuario}
            
            Código actual del archivo:
            ${codigoActual || "// Archivo vacío inicialmente"}
            
            Mejora el código anterior aplicando buenas prácticas, manejo de errores y optimización. Devuelve solo el código resultante.
            `;

            const response = await ollama.chat({
                model: MODELO,
                messages: [
                    { role: 'system', content: PROMPT_SISTEMA },
                    { role: 'user', content: promptPrompt }
                ]
            });

            let nuevoCodigo = response.message.content.trim();

            // Limpiamos posibles formatos molestos de Markdown que a veces las IA añaden
            nuevoCodigo = nuevoCodigo.replace(/^```javascript\n/, '').replace(/\n```$/, '');

            console.log(`💾 Guardando cambios en: ${ARCHIVO_TRABAJO}`);
            fs.writeFileSync(ARCHIVO_TRABAJO, nuevoCodigo, 'utf-8');

            codigoActual = nuevoCodigo; // Actualizamos para la siguiente iteración
            iteracion++;

        } catch (error) {
            console.error("❌ Error en el loop de Ollama:", error);
            break;
        }
    }

    console.log("\n🎯 Loop completado. Tu código final optimizado está listo en 'codigo_generado.js'");
}

// Probemos el loop autónomo pidiéndole que haga una tarea sencilla
ejecutarLoopAutonomo("Crea una función para calcular la serie de Fibonacci de manera eficiente con memoización y añade comentarios explicando cómo funciona.");
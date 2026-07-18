const express = require('express');
const cors = require('cors');
// Importamos la librería de Google Gen AI oficial
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
// Aumentamos los límites para poder recibir capturas de pantalla pesadas en base64
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuración segura mediante variables de entorno en Render
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "MiClaveSuperSecreta123";
const IA_API_KEY = process.env.IA_API_KEY; // Tu API Key de Google Cloud guardada en Render

// Inicializamos la Inteligencia Artificial con tu llave
const ai = new GoogleGenAI({ apiKey: IA_API_KEY });

// Base de datos en memoria para cupones globales creados desde el administrador
let CODIGOS_PROMO_GLOBALES = {
    "RIZZ2026": { diasPremium: 7, creditosRegalo: 0 },
    "REGALOPRO": { diasPremium: 30, creditosRegalo: 0 }
};

// Base de datos temporal de usuarios conectados
const usuarios = {}; 

function generarIdNumerico() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generarCodigoReferido() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let resultado = '';
    for (let i = 0; i < 6; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
}

// ==========================================
// 🛡️ API DE ADMINISTRACIÓN (PANEL PRIVADO)
// ==========================================

app.post('/api/admin/list', (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "No autorizado." });
    res.json(CODIGOS_PROMO_GLOBALES);
});

app.post('/api/admin/create', (req, res) => {
    const { password, nombreCodigo, diasPremium, creditosRegalo } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "No autorizado." });
    
    if (!nombreCodigo) return res.status(400).json({ error: "Escribe un nombre válido." });
    
    const codigoLimpio = nombreCodigo.trim().toUpperCase();
    CODIGOS_PROMO_GLOBALES[codigoLimpio] = {
        diasPremium: parseInt(diasPremium) || 0,
        creditosRegalo: parseInt(creditosRegalo) || 0
    };
    res.json({ mensaje: `Código ${codigoLimpio} creado con éxito.` });
});

app.post('/api/admin/delete', (req, res) => {
    const { password, nombreCodigo } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "No autorizado." });

    const codigoLimpio = nombreCodigo.trim().toUpperCase();
    if (CODIGOS_PROMO_GLOBALES[codigoLimpio]) {
        delete CODIGOS_PROMO_GLOBALES[codigoLimpio];
        return res.json({ mensaje: `Código ${codigoLimpio} eliminado.` });
    }
    res.status(404).json({ error: "No existe ese código." });
});

// ==========================================
// 🟢 API DEL CLIENTE (APLICACIÓN USUARIO)
// ==========================================

app.post('/api/user-status', (req, res) => {
    const { idDispositivo } = req.body;
    if (!idDispositivo) return res.status(400).json({ error: "Falta idDispositivo." });

    if (!usuarios[idDispositivo]) {
        usuarios[idDispositivo] = {
            idUsuario: generarIdNumerico(),
            miCodigoReferido: generarCodigoReferido(),
            creditos: 5, 
            esPremium: false,
            finPremium: null,
            contadorReferidos: 0,
            codigosCanjeados: []
        };
    }

    const usuario = usuarios[idDispositivo];
    // Verificar si el premium caducó según el reloj real
    if (usuario.esPremium && usuario.finPremium && new Date() > new Date(usuario.finPremium)) {
        usuario.esPremium = false;
        usuario.finPremium = null;
    }
    res.json(usuario);
});

app.post('/api/referrals/claim', (req, res) => {
    const { idDispositivo, codigo } = req.body;
    if (!idDispositivo || !codigo) return res.status(400).json({ error: "Campos vacíos." });

    const usuarioQueCanjea = usuarios[idDispositivo];
    if (!usuarioQueCanjea) return res.status(404).json({ error: "Usuario no encontrado." });

    const codigoLimpio = codigo.trim().toUpperCase();

    // 1. Canje de códigos promocionales de la administración
    if (CODIGOS_PROMO_GLOBALES[codigoLimpio]) {
        if (usuarioQueCanjea.codigosCanjeados.includes(codigoLimpio)) {
            return res.status(400).json({ error: "Ya usaste este cupón promocional." });
        }
        const promo = CODIGOS_PROMO_GLOBALES[codigoLimpio];
        usuarioQueCanjea.codigosCanjeados.push(codigoLimpio);

        if (promo.diasPremium > 0) {
            usuarioQueCanjea.esPremium = true;
            let f = usuarioQueCanjea.finPremium ? new Date(usuarioQueCanjea.finPremium) : new Date();
            f.setDate(f.getDate() + promo.diasPremium);
            usuarioQueCanjea.finPremium = f.toISOString();
        }
        if (promo.creditosRegalo > 0) usuarioQueCanjea.creditos += promo.creditosRegalo;

        return res.json({ mensaje: "¡Cupón activado correctamente!" });
    }

    // 2. Canje de ID de Invitación de Amigos
    if (usuarioQueCanjea.miCodigoReferido === codigoLimpio) {
        return res.status(400).json({ error: "No puedes usar tu propio código." });
    }

    let amigoDueno = null;
    for (const key in usuarios) {
        if (usuarios[key].miCodigoReferido === codigoLimpio) {
            amigoDueno = usuarios[key];
            break;
        }
    }

    if (amigoDueno) {
        if (usuarioQueCanjea.codigoAmigoIngresado) {
            return res.status(400).json({ error: "Ya apoyaste a un amigo anteriormente." });
        }
        usuarioQueCanjea.codigoAmigoIngresado = codigoLimpio;
        amigoDueno.contadorReferidos += 1;

        // Si llega a la meta de 10 invitados, le da 7 días premium automáticos
        if (amigoDueno.contadorReferidos >= 10) {
            amigoDueno.esPremium = true;
            let f = amigoDueno.finPremium ? new Date(amigoDueno.finPremium) : new Date();
            f.setDate(f.getDate() + 7);
            amigoDueno.finPremium = f.toISOString();
        }
        usuarioQueCanjea.creditos += 5;
        return res.json({ mensaje: "¡ID de amigo aceptado! Conseguiste +5 créditos de regalo." });
    }

    return res.status(404).json({ error: "Código inválido o inexistente." });
});

// ==========================================
// 🤖 MOTOR REAL DE INTELIGENCIA ARTIFICIAL (GEMINI 2.5)
// ==========================================
app.post('/api/chat', async (req, res) => {
    const { idDispositivo, vibra, contexto, imagen } = req.body;
    
    const usuario = usuarios[idDispositivo];
    if (!usuario) return res.status(404).json({ error: "Perfil no configurado." });

    // Descontar créditos si no tiene pase premium activo
    if (!usuario.esPremium) {
        if (usuario.creditos <= 0) return res.status(403).json({ error: "Sin créditos disponibles. Mira un anuncio para recargar." });
        usuario.creditos -= 1;
    }

    try {
        // Creamos las instrucciones del sistema según la vibra seleccionada
        const instruccionesVibra = {
            romantica: "Sé tierno, romántico, encantador y utiliza un toque de coquetería dulce. Da respuestas atractivas que demuestren interés amoroso genuino.",
            divertida: "Responde de manera muy graciosa, con humor ingenioso, memes textuales y bromas carismáticas. El objetivo es hacer reír de inmediato.",
            misterio: "Mantén un aire misterioso, enigmático, intrigante y sutil. Juega con el suspense y deja a la otra persona con ganas de saber más.",
            picante: "Sé atrevido, pícaro, audaz, coqueto y con doble sentido ingenioso. Mantén un tono sumamente atractivo sin cruzar la línea de lo vulgar.",
            intelectual: "Ofrece respuestas inteligentes, elocuentes, con datos curiosos interesantes o pensamientos profundos. Demuestra una mente atractiva.",
            directa: "Ve directo al grano, con confianza radical, seguridad absoluta y sin rodeos. Di exactamente lo que piensas de forma atractiva."
        };

        const sistemaPrompt = `Eres RizzAI, un asistente experto en relaciones y carisma. Tu único objetivo es leer la captura del chat provista y escribir la respuesta perfecta para continuar la conversación. 
        REGLAS ESTRICTAS:
        1. Devuelve ÚNICAMENTE la frase lista para copiar y pegar en el chat. No agregues introducciones como "Aquí tienes tu opción:" ni comillas.
        2. Adáptate al tono solicitado por el usuario.
        3. Tono actual obligatorio: ${instruccionesVibra[vibra] || instruccionesVibra.romantica}.
        4. Contexto opcional dado por el usuario sobre el chat: ${contexto || "Ninguno"}.`;

        let contenidoPrompt = [];

        // Si el usuario subió una captura de pantalla, la adjuntamos para que Gemini la lea de verdad
        if (imagen) {
            contenidoPrompt.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: imagen
                }
            });
            contenidoPrompt.push("Lee el texto dentro de esta captura de pantalla de la conversación y genera la mejor respuesta siguiendo las instrucciones del sistema.");
        } else {
            contenidoPrompt.push(`El usuario no adjuntó imagen, pero solicita una línea abridora o respuesta basándose solo en este contexto: ${contexto || "Escribe un saludo coqueto inicial"}`);
        }

        // Llamamos al modelo bimodal ultra rápido Gemini 2.5 Flash
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contenidoPrompt,
            config: {
                systemInstruction: sistemaPrompt,
                temperature: 0.7
            }
        });

        const respuestaFinal = response.text ? response.text.trim() : "¡Vaya! No pude procesar la respuesta en este momento. Intenta de nuevo.";
        res.json({ respuesta: respuestaFinal });

    } catch (error) {
        console.error("Error en API de Gemini:", error);
        res.status(500).json({ error: "La Inteligencia Artificial se encuentra saturada. Intenta en unos segundos." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RizzAI en ejecución`));

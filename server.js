const express = require('express');
const cors = require('cors');
const { Mistral } = require('@mistralai/mistralai');
const Tesseract = require('tesseract.js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ════════════════════════════════════════════════
//  🔑 TU API KEY DE MISTRAL
// ════════════════════════════════════════════════
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "MiClaveSuperSecreta123";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "ERSu2DjZ6DaepQxFe2VDHGSZd78ZLa06";
// ════════════════════════════════════════════════

const client = new Mistral({ apiKey: MISTRAL_API_KEY });

// Base de datos en memoria
let CODIGOS_PROMO_GLOBALES = {
    "RIZZ2026": { diasPremium: 7, creditosRegalo: 0 },
    "REGALOPRO": { diasPremium: 30, creditosRegalo: 0 }
};

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
// 🛡️ API DE ADMINISTRACIÓN
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
// 🟢 API DEL CLIENTE
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
// 🔥 FUNCIÓN OCR: Extrae texto de la imagen
// ==========================================
async function extraerTextoDeImagen(imagenBase64) {
    try {
        // Tesseract.js reconoce el texto de la imagen
        const { data: { text } } = await Tesseract.recognize(
            `data:image/jpeg;base64,${imagenBase64}`,
            'spa+eng', // Español + Inglés para mejor precisión
            {
                logger: m => console.log(m) // Opcional: ver progreso
            }
        );
        return text.trim();
    } catch (error) {
        console.error('Error en OCR:', error);
        return null;
    }
}

// ==========================================
// 🤖 MOTOR REAL CON MISTRAL + OCR
// ==========================================
app.post('/api/chat', async (req, res) => {
    const { idDispositivo, vibra, contexto, imagen } = req.body;
    
    const usuario = usuarios[idDispositivo];
    if (!usuario) return res.status(404).json({ error: "Perfil no configurado." });

    if (!usuario.esPremium) {
        if (usuario.creditos <= 0) return res.status(403).json({ error: "Sin créditos disponibles. Mira un anuncio para recargar." });
        usuario.creditos -= 1;
    }

    try {
        // 🔥 PASO 1: Extraer texto de la imagen con OCR
        let textoExtraido = "";
        if (imagen) {
            textoExtraido = await extraerTextoDeImagen(imagen);
            if (!textoExtraido) {
                return res.status(400).json({ error: "No se pudo leer la imagen. Intenta con otra captura más clara." });
            }
        }

        // 🔥 PASO 2: Construir el prompt con el texto extraído
        const instruccionesVibra = {
            romantica: "Sé tierno, romántico, encantador y utiliza un toque de coquetería dulce. Da respuestas atractivas que demuestren interés amoroso genuino.",
            divertida: "Responde de manera muy graciosa, con humor ingenioso, memes textuales y bromas carismáticas. El objetivo es hacer reír de inmediato.",
            misterio: "Mantén un aire misterioso, enigmático, intrigante y sutil. Juega con el suspense y deja a la otra persona con ganas de saber más.",
            picante: "Sé atrevido, pícaro, audaz, coqueto y con doble sentido ingenioso. Mantén un tono sumamente atractivo sin cruzar la línea de lo vulgar.",
            intelectual: "Ofrece respuestas inteligentes, elocuentes, con datos curiosos interesantes o pensamientos profundos. Demuestra una mente atractiva.",
            directa: "Ve directo al grano, con confianza radical, seguridad absoluta y sin rodeos. Di exactamente lo que piensas de forma atractiva."
        };

        const sistemaPrompt = `Eres RizzAI, un asistente experto en relaciones y carisma. Tu único objetivo es leer la conversación y escribir la respuesta perfecta para continuar el chat.
        REGLAS ESTRICTAS:
        1. Devuelve ÚNICAMENTE la frase lista para copiar y pegar en el chat. No agregues introducciones como "Aquí tienes tu opción:" ni comillas.
        2. Adáptate al tono solicitado por el usuario.
        3. Tono actual obligatorio: ${instruccionesVibra[vibra] || instruccionesVibra.romantica}.
        4. Contexto opcional: ${contexto || "Ninguno"}.`;

        let mensajeUsuario = "";
        if (textoExtraido) {
            mensajeUsuario = `Esta es la conversación extraída de la captura de pantalla:\n\n${textoExtraido}\n\nGenera la mejor respuesta para continuar esta conversación.`;
        } else {
            mensajeUsuario = `El usuario no adjuntó imagen, pero solicita una línea abridora o respuesta basándose en este contexto: ${contexto || "Escribe un saludo coqueto inicial"}`;
        }

        // 🔥 PASO 3: Llamar a Mistral con el texto extraído
        const chatResponse = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [
                { role: "system", content: sistemaPrompt },
                { role: "user", content: mensajeUsuario }
            ],
            temperature: 0.7,
            maxTokens: 300,
        });

        const respuestaFinal = chatResponse.choices?.[0]?.message?.content?.trim() || "¡Vaya! No pude procesar la respuesta. Intenta de nuevo.";
        res.json({ respuesta: respuestaFinal });

    } catch (error) {
        console.error('Error en el chat:', error);
        res.status(500).json({ error: "La Inteligencia Artificial se encuentra saturada. Intenta en unos segundos." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor RizzAI con OCR + Mistral en puerto ${PORT}`));

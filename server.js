const express = require('express');
const cors = require('cors');
const { Mistral } = require('@mistralai/mistralai');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================================
// 1️⃣ CONFIGURACIÓN
// ============================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "MiClaveSuperSecreta123";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "ERSu2DjZ6DaepQxFe2VDHGSZd78ZLa06";

const client = new Mistral({ apiKey: MISTRAL_API_KEY });

// ============================================================
// 2️⃣ BASE DE DATOS EN MEMORIA (Usuarios por ID de dispositivo)
// ============================================================
let CODIGOS_PROMO_GLOBALES = {
    "RIZZ2026": { diasPremium: 7, creditosRegalo: 0 },
    "REGALOPRO": { diasPremium: 30, creditosRegalo: 0 }
};

const usuarios = {}; // Cada usuario se identifica por su ID de dispositivo (generado en el frontend)

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

// ============================================================
// 3️⃣ 🧠 MOTOR DE DETECCIÓN INTELIGENTE DE MENSAJES
// ============================================================
function extraerYClasificarMensajes(textoOCR) {
    if (!textoOCR) return null;

    // 1. Limpiar el texto de TODO lo que no sea una conversación
    let textoLimpio = textoOCR
        // Eliminar números de teléfono (formato internacional y local)
        .replace(/\+\d{1,3}\s?\d{4,}/g, '')
        .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '') // Números de 12 dígitos
        // Eliminar fechas (dd/mm/aaaa, dd-mm-aaaa, etc.)
        .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, '')
        // Eliminar horas (hh:mm, hh:mm:ss)
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
        // Eliminar nombres de días y meses
        .replace(/\b(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi, '')
        // Eliminar emojis y símbolos no relacionados con mensajes
        .replace(/[📱📞✉️📍🕒🗓️✅❌⚠️ℹ️🔗➡️⬅️]/g, '')
        // Eliminar texto entre corchetes y paréntesis (metadatos)
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        // Eliminar líneas que parezcan metadatos (ej: "WhatsApp", "Instagram", "Tinder")
        .replace(/^.*?(whatsapp|instagram|tinder|facebook|telegram).*$/gmi, '')
        // Reducir espacios y saltos de línea
        .replace(/\s+/g, ' ')
        .trim();

    // 2. Dividir en posibles mensajes (por saltos de línea o puntos seguidos)
    const posiblesMensajes = textoLimpio.split(/\n+|(?<=[.!?])\s+/).filter(m => m.trim().length > 0);

    // 3. Clasificar cada mensaje
    let mensajesClasificados = {
        yo: [],
        otraPersona: []
    };

    // Patrones para identificar al hablante
    const esYo = (mensaje) => {
        const patrones = [
            /^yo[:;]\s*/i, /^tú[:;]\s*/i, /^usuario[:;]\s*/i, /^mi[:;]\s*/i,
            /^[👍👋😂😊❤️🔥💯]/, // Emojis comunes de usuario
            /^[a-z]/i // Si empieza con minúscula, asumimos que es el usuario (en algunos formatos)
        ];
        return patrones.some(p => p.test(mensaje));
    };

    const esOtraPersona = (mensaje) => {
        const patrones = [
            /^ella[:;]\s*/i, /^él[:;]\s*/i, /^contacto[:;]\s*/i, /^otro[:;]\s*/i,
            /^[👩👨🧑]/, // Emojis de personas
            /^[A-ZÁÉÍÓÚÑ]/, // Si empieza con mayúscula (en algunos formatos)
            /^(hola|hey|buenos días|buenas|qué tal|disculpa|oye)/i // Saludos comunes
        ];
        return patrones.some(p => p.test(mensaje));
    };

    // Clasificar cada mensaje
    posiblesMensajes.forEach(mensaje => {
        // Limpiar el mensaje de prefijos como "Yo:", "Ella:", etc.
        let mensajeLimpio = mensaje
            .replace(/^[^:;]*[:;]\s*/, '')
            .trim();

        if (mensajeLimpio.length < 2) return; // Ignorar mensajes muy cortos

        if (esYo(mensaje) || !esOtraPersona(mensaje)) {
            mensajesClasificados.yo.push(mensajeLimpio);
        } else {
            mensajesClasificados.otraPersona.push(mensajeLimpio);
        }
    });

    // 4. Si no se pudo clasificar, intentar por heurística simple
    if (mensajesClasificados.yo.length === 0 && mensajesClasificados.otraPersona.length === 0) {
        // Dividir por si hay mensajes alternados
        const alternados = textoLimpio.split(/\n+/).filter(m => m.trim().length > 0);
        alternados.forEach((msg, index) => {
            if (index % 2 === 0) {
                mensajesClasificados.otraPersona.push(msg.trim());
            } else {
                mensajesClasificados.yo.push(msg.trim());
            }
        });
    }

    // 5. Construir el texto formateado para la IA
    let conversacionFormateada = "";
    if (mensajesClasificados.otraPersona.length > 0) {
        conversacionFormateada += "👤 **OTRA PERSONA** dijo:\n";
        conversacionFormateada += mensajesClasificados.otraPersona.join('\n') + '\n\n';
    }
    if (mensajesClasificados.yo.length > 0) {
        conversacionFormateada += "🧑 **TÚ** dijiste:\n";
        conversacionFormateada += mensajesClasificados.yo.join('\n') + '\n\n';
    }

    return conversacionFormateada.trim() || null;
}

// ============================================================
// 4️⃣ RUTAS DE ADMINISTRACIÓN
// ============================================================
app.post('/api/admin/list', (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "No autorizado." });
    }
    res.json(CODIGOS_PROMO_GLOBALES);
});

app.post('/api/admin/create', (req, res) => {
    const { password, nombreCodigo, diasPremium, creditosRegalo } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "No autorizado." });
    }
    if (!nombreCodigo) {
        return res.status(400).json({ error: "Escribe un nombre válido." });
    }
    const codigoLimpio = nombreCodigo.trim().toUpperCase();
    CODIGOS_PROMO_GLOBALES[codigoLimpio] = {
        diasPremium: parseInt(diasPremium) || 0,
        creditosRegalo: parseInt(creditosRegalo) || 0
    };
    res.json({ mensaje: `Código ${codigoLimpio} creado con éxito.` });
});

app.post('/api/admin/delete', (req, res) => {
    const { password, nombreCodigo } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "No autorizado." });
    }
    const codigoLimpio = nombreCodigo.trim().toUpperCase();
    if (CODIGOS_PROMO_GLOBALES[codigoLimpio]) {
        delete CODIGOS_PROMO_GLOBALES[codigoLimpio];
        return res.json({ mensaje: `Código ${codigoLimpio} eliminado.` });
    }
    res.status(404).json({ error: "No existe ese código." });
});

// ============================================================
// 5️⃣ RUTAS DE USUARIO (con ID de dispositivo estable)
// ============================================================
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

// ============================================================
// 6️⃣ RUTA PRINCIPAL DE CHAT (CON DETECCIÓN AVANZADA)
// ============================================================
app.post('/api/chat', async (req, res) => {
    const { idDispositivo, vibra, contexto, textoImagen } = req.body;

    const usuario = usuarios[idDispositivo];
    if (!usuario) {
        return res.status(404).json({ error: "Perfil no configurado." });
    }

    if (!usuario.esPremium) {
        if (usuario.creditos <= 0) {
            return res.status(403).json({ error: "Sin créditos disponibles. Mira un anuncio para recargar." });
        }
        usuario.creditos -= 1;
    }

    try {
        // 1. Extraer y clasificar mensajes (solo lo importante)
        let conversacionLimpia = null;
        if (textoImagen && textoImagen.trim().length > 0) {
            conversacionLimpia = extraerYClasificarMensajes(textoImagen);
        }

        // 2. Preparar el prompt para la IA
        const instruccionesVibra = {
            romantica: "Sé tierno, romántico, encantador y utiliza un toque de coquetería dulce.",
            divertida: "Responde de manera muy graciosa, con humor ingenioso y bromas carismáticas.",
            misterio: "Mantén un aire misterioso, enigmático, intrigante y sutil.",
            picante: "Sé atrevido, pícaro, audaz, coqueto y con doble sentido ingenioso.",
            intelectual: "Ofrece respuestas inteligentes, elocuentes, con datos curiosos interesantes.",
            directa: "Ve directo al grano, con confianza radical, seguridad absoluta y sin rodeos."
        };

        const sistemaPrompt = `Eres RizzAI, un asistente experto en relaciones y carisma. Tu única misión es leer la conversación y escribir la respuesta perfecta para continuar el chat.

        REGLAS ESTRICTAS:
        1. Devuelve ÚNICAMENTE la frase que debes copiar y pegar en el chat. Nada de introducciones ni comillas.
        2. Adáptate al tono solicitado: ${instruccionesVibra[vibra] || instruccionesVibra.romantica}.
        3. Contexto adicional: ${contexto || "Ninguno"}.
        4. Si la conversación está clasificada como "TÚ" y "OTRA PERSONA", responde a lo que dijo la otra persona.
        5. No incluyas números, fechas ni metadatos en tu respuesta.
        6. Sé natural, como si estuvieras chateando tú mismo.`;

        let mensajeUsuario = "";
        if (conversacionLimpia) {
            mensajeUsuario = `Esta es la conversación extraída y clasificada:\n\n${conversacionLimpia}\n\nGenera la mejor respuesta para continuar esta conversación.`;
        } else {
            mensajeUsuario = `El usuario no adjuntó imagen o no se pudo extraer texto. Contexto: ${contexto || "Escribe un saludo coqueto inicial"}`;
        }

        // 3. Llamar a Mistral
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
        console.error('❌ Error en el chat:', error);
        res.status(500).json({ error: "La Inteligencia Artificial se encuentra saturada. Intenta en unos segundos." });
    }
});

// ============================================================
// 7️⃣ RUTA DE PRUEBA
// ============================================================
app.get('/api/test', (req, res) => {
    res.json({ mensaje: '✅ Servidor RizzAI con detección avanzada funcionando' });
});

// ============================================================
// 8️⃣ INICIAR EL SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor RizzAI con detección avanzada en puerto ${PORT}`));

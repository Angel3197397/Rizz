const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 CLAVES Y CONFIGURACIONES ULTRA SEGURAS
// Configura estas dos variables en el panel de Render (Environment Variables)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "MiClaveSuperSecreta123";
const IA_API_KEY = process.env.IA_API_KEY || "AQ.Ab8RN6IpXd_1BqV3HHQ7HNLjJ-AT4vIjTRKvGVIE9fN2ZYSJJA";

// Base de datos en memoria para cupones globales creados desde el admin
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
            creditos: 3, 
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

    // 1. Canje de códigos promocionales creados en el Admin
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

// 🤖 CONSULTA INTELIGENTE (PROCESADO CON TU LLAVE)
app.post('/api/chat', (req, res) => {
    const { idDispositivo, mensaje } = req.body;
    const usuario = usuarios[idDispositivo];
    if (!usuario) return res.status(404).json({ error: "Perfil no configurado." });

    if (!usuario.esPremium) {
        if (usuario.creditos <= 0) return res.status(403).json({ error: "Sin créditos disponibles." });
        usuario.creditos -= 1;
    }

    // Aquí se procesaría la lógica usando tu IA_API_KEY en backend
    let respuestaFinal = "¡Hola! ¿Cómo va la conversación?";
    if (mensaje.includes("vibra romantica")) respuestaFinal = "Me encantas... eres mi notificación favorita de todo el día. 😘";
    else if (mensaje.includes("vibra divertida")) respuestaFinal = "Menos mal que me escribiste, mi contador de aburrimiento estaba al 99%. 🤪";
    else if (mensaje.includes("vibra misterio")) respuestaFinal = "Hay secretos que solo comparto en persona... de ti depende averiguarlos. 🔮";
    else if (mensaje.includes("vibra picante")) respuestaFinal = "Si hablar contigo ya es tentación, imagínate tenerte cerca. 🔥😉";
    else if (mensaje.includes("vibra intelectual")) respuestaFinal = "Tienes una forma de pensar increíble, hablemos más de eso. 🧠";
    else if (mensaje.includes("vibra directa")) respuestaFinal = "Me gustas. Vamos a dejar los mensajes de lado y salgamos a tomar algo. 🎯";

    res.json({ respuesta: respuestaFinal });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RizzAI en ejecución`));

// ============================================================
// 🤖 CHAT CON LIMPIEZA Y CLASIFICACIÓN AVANZADA
// ============================================================
app.post('/api/chat', async (req, res) => {
    const { idDispositivo, vibra, contexto, textoImagen } = req.body;

    // 1. Validar usuario
    const usuario = usuarios[idDispositivo];
    if (!usuario) {
        return res.status(404).json({ error: "Perfil no configurado." });
    }

    // 2. Control de créditos / premium
    if (!usuario.esPremium) {
        if (usuario.creditos <= 0) {
            return res.status(403).json({ error: "Sin créditos disponibles. Mira un anuncio para recargar." });
        }
        usuario.creditos -= 1;
    }

    try {
        // 3. 🧹 FUNCIÓN DE LIMPIEZA Y CLASIFICACIÓN (dentro de la ruta)
        function limpiarYClasificarConversacion(textoOCR) {
            if (!textoOCR) return null;

            // Paso 1: Limpiar ruido (números, fechas, horas, metadatos)
            let textoLimpio = textoOCR
                .replace(/\+\d{1,3}\s?\d{4,}/g, '') // Teléfonos
                .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '') // Fechas
                .replace(/\b\d{1,2}:\d{2}\b/g, '') // Horas
                .replace(/[📱📞✉️📍🕒🗓️✅❌⚠️ℹ️]/g, '') // Emojis de sistema
                .replace(/\[.*?\]/g, '') // Corchetes
                .replace(/\(.*?\)/g, '') // Paréntesis
                .replace(/\b(?:hoy|ayer|mañana|lunes|martes|miércoles|jueves|viernes|sábado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi, '') // Días/meses
                .replace(/\s+/g, ' ') // Espacios múltiples
                .trim();

            // Paso 2: Dividir en líneas y clasificar
            const lineas = textoLimpio.split('\n').filter(linea => linea.trim().length > 0);
            let mensajesClasificados = {
                yo: [],
                otraPersona: [],
                sinClasificar: []
            };

            // Patrones para detectar quién habla
            const patronesYo = [
                /^yo[:;]\s*/i, /^tú[:;]\s*/i, /^usuario[:;]\s*/i, /^mi[:;]\s*/i,
                /^[👍👋😂😊❤️🔥💯]/ // Emojis comunes al inicio
            ];

            const patronesOtraPersona = [
                /^ella[:;]\s*/i, /^él[:;]\s*/i, /^contacto[:;]\s*/i, /^otro[:;]\s*/i,
                /^[👩👨🧑]/ // Emojis de personas
            ];

            lineas.forEach(linea => {
                let esYo = false;
                let esOtra = false;

                for (let patron of patronesYo) {
                    if (patron.test(linea)) {
                        esYo = true;
                        break;
                    }
                }

                if (!esYo) {
                    for (let patron of patronesOtraPersona) {
                        if (patron.test(linea)) {
                            esOtra = true;
                            break;
                        }
                    }
                }

                let mensajeLimpio = linea;
                if (esYo) {
                    mensajeLimpio = mensajeLimpio.replace(/^[^:;]*[:;]\s*/, '').trim();
                    mensajesClasificados.yo.push(mensajeLimpio);
                } else if (esOtra) {
                    mensajeLimpio = mensajeLimpio.replace(/^[^:;]*[:;]\s*/, '').trim();
                    mensajesClasificados.otraPersona.push(mensajeLimpio);
                } else {
                    // Heurística simple: si es saludo o pregunta, es la otra persona
                    const esSaludo = /^(hola|hey|buenos días|buenas|qué tal|disculpa|oye)/i.test(mensajeLimpio);
                    const esPregunta = /\?$/.test(mensajeLimpio);
                    if (esSaludo || esPregunta) {
                        mensajesClasificados.otraPersona.push(mensajeLimpio);
                    } else {
                        mensajesClasificados.yo.push(mensajeLimpio);
                    }
                }
            });

            // Paso 3: Construir el texto formateado para la IA
            let conversacionFormateada = "";
            if (mensajesClasificados.otraPersona.length > 0) {
                conversacionFormateada += "👤 **OTRA PERSONA** dijo:\n";
                conversacionFormateada += mensajesClasificados.otraPersona.join('\n') + '\n\n';
            }
            if (mensajesClasificados.yo.length > 0) {
                conversacionFormateada += "🧑 **TÚ** dijiste:\n";
                conversacionFormateada += mensajesClasificados.yo.join('\n') + '\n\n';
            }
            if (mensajesClasificados.sinClasificar.length > 0) {
                conversacionFormateada += "📌 **MENSAJES NO CLASIFICADOS:**\n";
                conversacionFormateada += mensajesClasificados.sinClasificar.join('\n') + '\n\n';
            }

            return conversacionFormateada.trim() || null;
        }

        // 4. Ejecutar la limpieza sobre el texto recibido
        let conversacionLimpia = null;
        if (textoImagen && textoImagen.trim().length > 0) {
            conversacionLimpia = limpiarYClasificarConversacion(textoImagen);
        }

        // 5. Preparar el mensaje para la IA
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

        console.log('📝 Prompt enviado a Mistral:', mensajeUsuario); // Para depurar en logs de Render

        // 6. Llamar a Mistral
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

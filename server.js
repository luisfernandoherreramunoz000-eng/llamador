const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());

const io = new Server(server, { cors: { origin: "*" } });

let pedidosDB = {}; 
let contadorOrdenes = 1;

// --- PANTALLA DEL CLIENTE ---
app.get('/espera', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tu Pedido</title>
    </head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 30px; background: #f4f4f4;">
        
        <!-- Pantalla 1: Botón de Interacción Obligatorio -->
        <div id="pantalla-inicio" style="background: #fff; padding: 40px 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 90%; margin: auto;">
            <h1 style="color: #333; margin-bottom: 15px;">¡Casi listo!</h1>
            <p style="color: #666; font-size: 16px; margin-bottom: 25px;">Para recibir la alerta sonora y vibración cuando tu pedido esté crujiente, presiona el botón.</p>
            <button id="btn-activar" style="background-color: #ff3b30; color: white; border: none; padding: 15px 30px; font-size: 18px; font-weight: bold; border-radius: 8px; cursor: pointer; width: 100%;">
                ACTIVAR ALERTA
            </button>
        </div>

        <!-- Pantalla 2: Vista de Espera -->
        <div id="pantalla-espera" style="display: none; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 90%; margin: auto;">
            <h1 style="color: #333; margin-bottom: 5px;">Tu Pedido</h1>
            <p style="color: #666; font-size: 18px;">Orden: <strong id="num-orden" style="color: #000;">Cargando...</strong></p>
            
            <div id="estado" style="font-size: 26px; font-weight: bold; color: #ff9800; margin-top: 30px; padding: 20px; border: 2px dashed #ff9800; border-radius: 10px;">
                🍳 En preparación...
            </div>
            
            <p style="color: #888; font-size: 13px; margin-top: 25px;">
                ⚠️ <strong>Importante:</strong> Mantén esta pantalla abierta y no bloquees tu celular para asegurar que recibas tu llamado.
            </p>
        </div>

        <!-- Audio base (timbre) -->
        <audio id="alerta-audio" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto"></audio>
        
        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            const urlParams = new URLSearchParams(window.location.search);
            let pedidoId = urlParams.get('id');

            // Memoria para reconectar si recargan la página
            if (pedidoId) {
                localStorage.setItem('pedido_activo', pedidoId);
            } else {
                pedidoId = localStorage.getItem('pedido_activo');
            }

            let wakeLock = null;

            document.getElementById('btn-activar').addEventListener('click', async () => {
                
                // Mostrar pantalla de espera
                document.getElementById('pantalla-inicio').style.display = 'none';
                document.getElementById('pantalla-espera').style.display = 'block';

                // Desbloquear audio normal
                const audio = document.getElementById('alerta-audio');
                audio.volume = 0;
                await audio.play().catch(() => {});
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 1; 

                // Desbloquear voz del sistema
                const vozSilencio = new SpeechSynthesisUtterance('');
                window.speechSynthesis.speak(vozSilencio);

                // Bloqueo de pantalla (evitar que se apague)
                try {
                    if ('wakeLock' in navigator) {
                        wakeLock = await navigator.wakeLock.request('screen');
                    }
                } catch (err) {
                    console.log('Bloqueo de pantalla no soportado');
                }

                if (pedidoId) {
                    socket.emit('unirse_pedido', pedidoId);
                } else {
                    document.getElementById('estado').innerText = "⚠️ QR inválido";
                    document.getElementById('estado').style.borderColor = "red";
                    document.getElementById('estado').style.color = "red";
                }
            });

            socket.on('alerta_listo', (data) => {
                const estadoDiv = document.getElementById('estado');
                estadoDiv.innerHTML = "¡LISTO PARA RECOGER! 🎉<br><br><span style='font-size: 24px; color: #fff;'>(¡¡Tu crush está listo!!)</span>";
                estadoDiv.style.color = "#fff";
                estadoDiv.style.backgroundColor = "#4CAF50";
                estadoDiv.style.borderColor = "#4CAF50";
                document.getElementById('num-orden').innerText = data.numero_orden;
                
                // 1. Timbre
                document.getElementById('alerta-audio').play().catch(()=>console.log('Error de audio'));
                
                // 2. Voz del celular (El timeout asegura que suene justo después del timbre)
                setTimeout(() => {
                    const locucion = new SpeechSynthesisUtterance("¡Tu crush está listo!");
                    locucion.lang = 'es-CO'; 
                    locucion.rate = 1.0;     
                    locucion.pitch = 1.1;    
                    window.speechSynthesis.speak(locucion);
                }, 800);
                
                // 3. Vibración
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);
                
                // Liberar pantalla
                if (wakeLock !== null) {
                    wakeLock.release();
                    wakeLock = null;
                }
            });
        </script>
    </body>
    </html>
    `);
});

// --- RUTAS DEL SISTEMA ---
// --- NUEVA RUTA: OBTENER PEDIDOS PENDIENTES ---
app.get('/api/pedidos', (req, res) => {
    // Filtra la base de datos temporal para mostrar solo los que no están listos
    const pendientes = Object.values(pedidosDB).filter(p => p.estado === 'preparacion');
    res.json(pendientes);
});

app.post('/api/pedidos', (req, res) => {
    const id = Date.now().toString(); 
    const numero_orden = `T-${contadorOrdenes++}`;
    pedidosDB[id] = { id, numero_orden, estado: 'preparacion' };
    res.json({ id, numero_orden });
});

app.post('/api/pedidos/:id/listo', (req, res) => {
    const { id } = req.params;
    if (pedidosDB[id]) {
        pedidosDB[id].estado = 'listo';
        io.to(id).emit('alerta_listo', { numero_orden: pedidosDB[id].numero_orden });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Pedido no encontrado' });
    }
});

io.on('connection', (socket) => {
    socket.on('unirse_pedido', (pedidoId) => {
        socket.join(pedidoId);
        console.log(`Celular conectado a la orden: ${pedidoId}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Motor funcionando en el puerto ${PORT}`);
});

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

// --- ARCHIVOS PARA LA PWA (APP DESCARGABLE) ---

// 1. El Manifest (Configuración de la App)
app.get('/manifest.json', (req, res) => {
    res.json({
        "name": "Pollo Crush",
        "short_name": "Pollo Crush",
        "start_url": "/espera",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#ff3b30",
        "description": "Llamador de pedidos y promociones exclusivas",
        "icons": [
            {
                "src": "https://cdn-icons-png.flaticon.com/512/3081/3081840.png", 
                "sizes": "192x192",
                "type": "image/png"
            },
            {
                "src": "https://cdn-icons-png.flaticon.com/512/3081/3081840.png", 
                "sizes": "512x512",
                "type": "image/png"
            }
        ]
    });
});

// 2. El Service Worker (Permite la instalación)
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`
        self.addEventListener('install', (e) => {
            console.log('App lista para instalarse');
        });
        self.addEventListener('fetch', (e) => {
            // Requisito para que el celular permita instalar
        });
    `);
});

// --- PANTALLA DEL CLIENTE CON BANNER OPCIONAL PWA ---
app.get('/espera', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tu Pedido</title>
        <link rel="manifest" href="/manifest.json">
        <meta name="theme-color" content="#ff3b30">
    </head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f4f4f4; padding-bottom: 100px;">
        
        <!-- Pantalla 1: Botón de Interacción -->
        <div id="pantalla-inicio" style="background: #fff; padding: 40px 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 90%; margin: auto;">
            <h1 style="color: #333; margin-bottom: 15px;">¡Casi listo!</h1>
            <p style="color: #666; font-size: 16px; margin-bottom: 25px;">Para recibir la alerta sonora cuando tu pedido esté crujiente, presiona el botón.</p>
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

        <!-- BANNER OPCIONAL DE PROMOCIONES -->
        <div id="banner-instalar" style="display: none; position: fixed; bottom: 0; left: 0; right: 0; background: #333; color: white; padding: 15px; text-align: center; box-shadow: 0 -2px 10px rgba(0,0,0,0.2);">
            <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">🎁 ¡Instala nuestra App, no te pierdas promociones exclusivas!</p>
            <button id="btn-instalar" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; border-radius: 5px; cursor: pointer;">
                DESCARGAR APP
            </button>
            <button onclick="document.getElementById('banner-instalar').style.display='none'" style="background: none; color: #aaa; border: none; padding: 10px; font-size: 12px; cursor: pointer; text-decoration: underline;">
                Cerrar
            </button>
        </div>

        <audio id="alerta-audio" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto"></audio>
        
        <script src="/socket.io/socket.io.js"></script>
        <script>
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').then(() => {
                    console.log('Service Worker registrado');
                });
            }

            let eventoInstalacion;
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                eventoInstalacion = e;
                document.getElementById('banner-instalar').style.display = 'block';
            });

            document.getElementById('btn-instalar').addEventListener('click', async () => {
                if (eventoInstalacion) {
                    eventoInstalacion.prompt();
                    const { outcome } = await eventoInstalacion.userChoice;
                    if (outcome === 'accepted') {
                        console.log('App instalada');
                    }
                    document.getElementById('banner-instalar').style.display = 'none';
                    eventoInstalacion = null;
                }
            });

            const socket = io();
            const urlParams = new URLSearchParams(window.location.search);
            let pedidoId = urlParams.get('id');

            if (pedidoId) {
                localStorage.setItem('pedido_activo', pedidoId);
            } else {
                pedidoId = localStorage.getItem('pedido_activo');
            }

            let wakeLock = null;

            document.getElementById('btn-activar').addEventListener('click', async () => {
                document.getElementById('pantalla-inicio').style.display = 'none';
                document.getElementById('pantalla-espera').style.display = 'block';

                const audio = document.getElementById('alerta-audio');
                audio.volume = 0;
                await audio.play().catch(() => {});
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 1; 

                const vozSilencio = new SpeechSynthesisUtterance('');
                window.speechSynthesis.speak(vozSilencio);

                try {
                    if ('wakeLock' in navigator) {
                        wakeLock = await navigator.wakeLock.request('screen');
                    }
                } catch (err) {}

                if (pedidoId) {
                    socket.emit('unirse_pedido', pedidoId);
                } else {
                    document.getElementById('estado').innerText = "⚠️ QR inválido";
                }
            });

            socket.on('alerta_listo', (data) => {
                const estadoDiv = document.getElementById('estado');
                estadoDiv.innerHTML = "¡LISTO PARA RECOGER! 🎉<br><br><span style='font-size: 24px; color: #fff;'>(¡¡Tu crush está listo!!)</span>";
                estadoDiv.style.color = "#fff";
                estadoDiv.style.backgroundColor = "#4CAF50";
                estadoDiv.style.borderColor = "#4CAF50";
                document.getElementById('num-orden').innerText = data.numero_orden;
                
                document.getElementById('alerta-audio').play().catch(()=>{});
                
                setTimeout(() => {
                    const locucion = new SpeechSynthesisUtterance("¡Tu crush está listo!");
                    locucion.lang = 'es-CO'; 
                    locucion.rate = 1.0;     
                    locucion.pitch = 1.1;    
                    window.speechSynthesis.speak(locucion);
                }, 800);
                
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);
                
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

app.get('/api/pedidos', (req, res) => {
    res.json(Object.values(pedidosDB));
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

app.post('/api/pedidos/:id/entregado', (req, res) => {
    const { id } = req.params;
    if (pedidosDB[id]) {
        pedidosDB[id].estado = 'entregado';
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

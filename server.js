const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const webpush = require('web-push'); // EL NUEVO MÓDULO DE NOTIFICACIONES

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());

const io = new Server(server, { cors: { origin: "*" } });

// --- CONFIGURACIÓN DE NOTIFICACIONES PUSH EN SEGUNDO PLANO ---
// Generamos llaves de seguridad únicas para tu motor
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails(
    'mailto:contacto@pollocrush.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

let pedidosDB = {}; 
let contadorOrdenes = 1;

// 1. Ruta para entregar la llave pública al celular
app.get('/api/vapidPublicKey', (req, res) => {
    res.send(vapidKeys.publicKey);
});

// 2. Ruta para guardar el permiso de notificación del cliente
app.post('/api/suscribir', (req, res) => {
    const { subscription, pedidoId } = req.body;
    if (pedidosDB[pedidoId]) {
        pedidosDB[pedidoId].suscripcionPush = subscription; // Guardamos su permiso
        res.status(201).json({});
    } else {
        res.status(404).json({ error: 'Pedido no encontrado' });
    }
});

// --- ARCHIVOS PARA LA PWA (APP DESCARGABLE) ---
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
            { "src": "https://cdn-icons-png.flaticon.com/512/3081/3081840.png", "sizes": "192x192", "type": "image/png" },
            { "src": "https://cdn-icons-png.flaticon.com/512/3081/3081840.png", "sizes": "512x512", "type": "image/png" }
        ]
    });
});

app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`
        self.addEventListener('install', (e) => { self.skipWaiting(); });
        self.addEventListener('activate', (e) => { });

        // ESTO RECIBE LA ALERTA CUANDO LA APP ESTÁ CERRADA
        self.addEventListener('push', function(e) {
            const data = e.data ? e.data.json() : {};
            const options = {
                body: data.body || 'Por favor acércate a la caja.',
                icon: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png',
                vibrate: [500, 200, 500, 200, 1000],
                data: { url: data.url }
            };
            e.waitUntil(
                self.registration.showNotification(data.title || '¡Tu pedido está listo!', options)
            );
        });

        // SI TOCAN LA NOTIFICACIÓN, ABRE LA APP
        self.addEventListener('notificationclick', function(e) {
            e.notification.close();
            e.waitUntil(clients.openWindow(e.notification.data.url));
        });
    `);
});

// --- PANTALLA DEL CLIENTE ---
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
        
        <div id="pantalla-inicio" style="background: #fff; padding: 40px 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 90%; margin: auto;">
            <h1 style="color: #333; margin-bottom: 15px;">¡Casi listo!</h1>
            <p style="color: #666; font-size: 16px; margin-bottom: 25px;">Para recibir la alerta sonora y notificaciones, presiona el botón.</p>
            <button id="btn-activar" style="background-color: #ff3b30; color: white; border: none; padding: 15px 30px; font-size: 18px; font-weight: bold; border-radius: 8px; cursor: pointer; width: 100%;">
                ACTIVAR ALERTA
            </button>
        </div>

        <div id="pantalla-espera" style="display: none; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 90%; margin: auto;">
            <h1 style="color: #333; margin-bottom: 5px;">Tu Pedido</h1>
            <p style="color: #666; font-size: 18px;">Orden: <strong id="num-orden" style="color: #000;">Cargando...</strong></p>
            
            <div id="estado" style="font-size: 26px; font-weight: bold; color: #ff9800; margin-top: 30px; padding: 20px; border: 2px dashed #ff9800; border-radius: 10px;">
                🍳 En preparación...
            </div>
            
            <p style="color: #888; font-size: 13px; margin-top: 25px;">
                ⚠️ <strong>Aviso:</strong> Ya puedes minimizar esta pantalla. Te enviaremos una notificación cuando esté listo.
            </p>
        </div>

        <div id="banner-instalar" style="display: none; position: fixed; bottom: 0; left: 0; right: 0; background: #333; color: white; padding: 15px; text-align: center; box-shadow: 0 -2px 10px rgba(0,0,0,0.2);">
            <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">🎁 ¡Instala nuestra App para promociones exclusivas!</p>
            <button id="btn-instalar" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; border-radius: 5px; cursor: pointer;">DESCARGAR APP</button>
            <button onclick="document.getElementById('banner-instalar').style.display='none'" style="background: none; color: #aaa; border: none; padding: 10px; font-size: 12px; cursor: pointer; text-decoration: underline;">Cerrar</button>
        </div>

        <audio id="alerta-audio" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto"></audio>
        
        <script src="/socket.io/socket.io.js"></script>
        <script>
            // Función de seguridad para las notificaciones
            function urlBase64ToUint8Array(base64String) {
                const padding = '='.repeat((4 - base64String.length % 4) % 4);
                const base64 = (base64String + padding).replace(/\\-/g, '+').replace(/_/g, '/');
                const rawData = window.atob(base64);
                const outputArray = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
                return outputArray;
            }

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js');
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
                    eventoInstalacion = null;
                }
            });

            const socket = io();
            const urlParams = new URLSearchParams(window.location.search);
            let pedidoId = urlParams.get('id') || localStorage.getItem('pedido_activo');
            if (pedidoId) localStorage.setItem('pedido_activo', pedidoId);

            document.getElementById('btn-activar').addEventListener('click', async () => {
                document.getElementById('pantalla-inicio').style.display = 'none';
                document.getElementById('pantalla-espera').style.display = 'block';

                // Activar audio
                const audio = document.getElementById('alerta-audio');
                audio.volume = 0; await audio.play().catch(()=>{}); audio.pause(); audio.currentTime = 0; audio.volume = 1; 

                if (pedidoId) {
                    socket.emit('unirse_pedido', pedidoId);
                    
                    // --- NUEVO: PEDIR PERMISO DE NOTIFICACIÓN EN SEGUNDO PLANO ---
                    if ('serviceWorker' in navigator && 'PushManager' in window) {
                        try {
                            const reg = await navigator.serviceWorker.ready;
                            const res = await fetch('/api/vapidPublicKey');
                            const vapidPublicKey = await res.text();
                            
                            const subscription = await reg.pushManager.subscribe({
                                userVisibleOnly: true,
                                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
                            });

                            // Enviar permiso al servidor
                            await fetch('/api/suscribir', {
                                method: 'POST',
                                body: JSON.stringify({ subscription, pedidoId }),
                                headers: { 'Content-Type': 'application/json' }
                            });
                        } catch (err) {
                            console.log('El cliente no aceptó las notificaciones push');
                        }
                    }
                }
            });

            // Si tiene la app abierta, recibe esto
            socket.on('alerta_listo', (data) => {
                document.getElementById('estado').innerHTML = "¡LISTO PARA RECOGER! 🎉<br><br><span style='font-size: 24px; color: #fff;'>(¡¡Tu crush está listo!!)</span>";
                document.getElementById('estado').style.cssText = "font-size: 26px; font-weight: bold; color: #fff; margin-top: 30px; padding: 20px; border: 2px dashed #4CAF50; border-radius: 10px; background-color: #4CAF50;";
                document.getElementById('num-orden').innerText = data.numero_orden;
                document.getElementById('alerta-audio').play().catch(()=>{});
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);
            });
        </script>
    </body>
    </html>
    `);
});

// --- RUTAS DEL SISTEMA ---
app.get('/api/pedidos', (req, res) => res.json(Object.values(pedidosDB)));

app.post('/api/pedidos', (req, res) => {
    const id = Date.now().toString(); 
    const numero_orden = `T-${contadorOrdenes++}`;
    pedidosDB[id] = { id, numero_orden, estado: 'preparacion' };
    res.json({ id, numero_orden });
});

// 3. Modificamos el llamado para que envíe la Notificación Push
app.post('/api/pedidos/:id/listo', async (req, res) => {
    const { id } = req.params;
    if (pedidosDB[id]) {
        pedidosDB[id].estado = 'listo';
        
        // Señal instantánea (Por si tiene la pantalla abierta)
        io.to(id).emit('alerta_listo', { numero_orden: pedidosDB[id].numero_orden });
        
        // Notificación de Sistema (Por si tiene la pantalla minimizada o cerrada)
        if (pedidosDB[id].suscripcionPush) {
            const payload = JSON.stringify({
                title: '¡Tu crush está listo! 🍗',
                body: \`Orden \${pedidosDB[id].numero_orden} lista para recoger. ¡Ven a la caja!\`,
                url: \`/espera?id=\${id}\`
            });
            try {
                await webpush.sendNotification(pedidosDB[id].suscripcionPush, payload);
            } catch (err) {
                console.log('Error al enviar la notificación Push');
            }
        }

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
    socket.on('unirse_pedido', (pedidoId) => socket.join(pedidoId));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Motor funcionando en el puerto ${PORT}`));

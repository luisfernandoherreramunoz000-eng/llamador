const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());

const io = new Server(server, { cors: { origin: "*" } });

const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:contacto@pollocrush.com', vapidKeys.publicKey, vapidKeys.privateKey);

let pedidosDB = {}; 
let contadorOrdenes = 1;
let promocionesDB = []; // NUEVA BASE DE DATOS TEMPORAL DE PROMOCIONES

app.get('/api/vapidPublicKey', (req, res) => res.send(vapidKeys.publicKey));

app.post('/api/suscribir', (req, res) => {
    const { subscription, pedidoId } = req.body;
    if (pedidosDB[pedidoId]) {
        pedidosDB[pedidoId].suscripcionPush = subscription;
        res.status(201).json({});
    } else {
        res.status(404).json({ error: 'Pedido no encontrado' });
    }
});

app.get('/manifest.json', (req, res) => {
    res.json({
        "name": "Pollo Crush", "short_name": "Pollo Crush", "start_url": "/espera", "display": "standalone",
        "background_color": "#ffffff", "theme_color": "#ff3b30", "description": "Llamador de pedidos y promociones exclusivas",
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
        self.addEventListener('push', function(e) {
            const data = e.data ? e.data.json() : {};
            e.waitUntil( self.registration.showNotification(data.title || '¡Tu pedido está listo!', {
                body: data.body || 'Acércate a la caja.', icon: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png',
                vibrate: [500, 200, 500, 200, 1000], data: { url: data.url }
            }));
        });
        self.addEventListener('notificationclick', function(e) {
            e.notification.close(); e.waitUntil(clients.openWindow(e.notification.data.url));
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
            
            <!-- SECCIÓN DE PROMOCIONES PARA EL CLIENTE -->
            <div id="seccion-promos" style="display: none; margin-top: 40px; text-align: left;">
                <h3 style="color: #333; border-bottom: 2px solid #ff3b30; padding-bottom: 5px; margin-bottom: 15px;">🔥 Para ti</h3>
                <div id="lista-promos-cliente" style="display: flex; flex-direction: column; gap: 15px;"></div>
            </div>

            <p style="color: #888; font-size: 13px; margin-top: 25px;">
                ⚠️ <strong>Aviso:</strong> Ya puedes minimizar esta pantalla. Te enviaremos una notificación.
            </p>
        </div>

        <div id="banner-instalar" style="display: none; position: fixed; bottom: 0; left: 0; right: 0; background: #333; color: white; padding: 15px; text-align: center; box-shadow: 0 -2px 10px rgba(0,0,0,0.2);">
            <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">🎁 ¡Instala nuestra App para promos exclusivas!</p>
            <button id="btn-instalar" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; border-radius: 5px; cursor: pointer;">DESCARGAR APP</button>
            <button onclick="document.getElementById('banner-instalar').style.display='none'" style="background: none; color: #aaa; border: none; padding: 10px; font-size: 12px; cursor: pointer; text-decoration: underline;">Cerrar</button>
        </div>

        <audio id="alerta-audio" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto"></audio>
        
        <script src="/socket.io/socket.io.js"></script>
        <script>
            function urlBase64ToUint8Array(base64String) {
                const padding = '='.repeat((4 - base64String.length % 4) % 4);
                const base64 = (base64String + padding).replace(/\\-/g, '+').replace(/_/g, '/');
                const rawData = window.atob(base64);
                const outputArray = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
                return outputArray;
            }

            if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

            let eventoInstalacion;
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault(); eventoInstalacion = e; document.getElementById('banner-instalar').style.display = 'block';
            });
            document.getElementById('btn-instalar').addEventListener('click', async () => {
                if (eventoInstalacion) { eventoInstalacion.prompt(); eventoInstalacion = null; document.getElementById('banner-instalar').style.display = 'none'; }
            });

            // NUEVO: Cargar promociones al cliente
            async function cargarPromosCliente() {
                try {
                    const res = await fetch('/api/promociones');
                    const promos = await res.json();
                    if (promos.length > 0) {
                        document.getElementById('seccion-promos').style.display = 'block';
                        const contenedor = document.getElementById('lista-promos-cliente');
                        contenedor.innerHTML = '';
                        promos.forEach(p => {
                            let imgHTML = p.imagen ? \`<img src="\${p.imagen}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px 8px 0 0;">\` : '';
                            contenedor.innerHTML += \`
                                <div style="background: #fff; border: 1px solid #eee; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                    \${imgHTML}
                                    <div style="padding: 15px;">
                                        <h4 style="margin: 0 0 5px 0; color: #333;">\${p.titulo}</h4>
                                        <p style="margin: 0; color: #666; font-size: 14px;">\${p.descripcion}</p>
                                    </div>
                                </div>
                            \`;
                        });
                    }
                } catch(e) {}
            }

            const socket = io();
            const urlParams = new URLSearchParams(window.location.search);
            let pedidoId = urlParams.get('id') || localStorage.getItem('pedido_activo');
            if (pedidoId) localStorage.setItem('pedido_activo', pedidoId);

            document.getElementById('btn-activar').addEventListener('click', async () => {
                document.getElementById('pantalla-inicio').style.display = 'none';
                document.getElementById('pantalla-espera').style.display = 'block';
                cargarPromosCliente(); // Cargar promos al abrir

                const audio = document.getElementById('alerta-audio');
                audio.volume = 0; await audio.play().catch(()=>{}); audio.pause(); audio.currentTime = 0; audio.volume = 1; 

                if (pedidoId) {
                    socket.emit('unirse_pedido', pedidoId);
                    if ('serviceWorker' in navigator && 'PushManager' in window) {
                        try {
                            const reg = await navigator.serviceWorker.ready;
                            const res = await fetch('/api/vapidPublicKey');
                            const vapidPublicKey = await res.text();
                            const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
                            await fetch('/api/suscribir', { method: 'POST', body: JSON.stringify({ subscription, pedidoId }), headers: { 'Content-Type': 'application/json' } });
                        } catch (err) {}
                    }
                }
            });

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

// --- RUTAS DE PEDIDOS ---
app.get('/api/pedidos', (req, res) => res.json(Object.values(pedidosDB)));
app.post('/api/pedidos', (req, res) => {
    const id = Date.now().toString(); 
    const numero_orden = `T-${contadorOrdenes++}`;
    pedidosDB[id] = { id, numero_orden, estado: 'preparacion' };
    res.json({ id, numero_orden });
});
app.post('/api/pedidos/:id/listo', async (req, res) => {
    const { id } = req.params;
    if (pedidosDB[id]) {
        pedidosDB[id].estado = 'listo';
        io.to(id).emit('alerta_listo', { numero_orden: pedidosDB[id].numero_orden });
        if (pedidosDB[id].suscripcionPush) {
            try {
                await webpush.sendNotification(pedidosDB[id].suscripcionPush, JSON.stringify({
                    title: '¡Tu crush está listo! 🍗', body: `Orden ${pedidosDB[id].numero_orden} lista.`, url: `/espera?id=${id}`
                }));
            } catch (err) {}
        }
        res.json({ success: true });
    } else { res.status(404).json({ error: 'Pedido no encontrado' }); }
});
app.post('/api/pedidos/:id/entregado', (req, res) => {
    const { id } = req.params;
    if (pedidosDB[id]) { pedidosDB[id].estado = 'entregado'; res.json({ success: true }); } 
    else { res.status(404).json({ error: 'Pedido no encontrado' }); }
});

// --- NUEVAS RUTAS DE PROMOCIONES ---
app.get('/api/promociones', (req, res) => res.json(promocionesDB));
app.post('/api/promociones', (req, res) => {
    const promo = { id: Date.now().toString(), titulo: req.body.titulo, descripcion: req.body.descripcion, imagen: req.body.imagen };
    promocionesDB.push(promo);
    res.json({ success: true, promo });
});
app.delete('/api/promociones/:id', (req, res) => {
    promocionesDB = promocionesDB.filter(p => p.id !== req.params.id);
    res.json({ success: true });
});

io.on('connection', (socket) => { socket.on('unirse_pedido', (pedidoId) => socket.join(pedidoId)); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Motor funcionando en el puerto ${PORT}`));

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

// --- NUEVA PANTALLA DEL CLIENTE CONTROLADA POR RENDER ---
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
        <div style="background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 90%; margin: auto;">
            <h1 style="color: #333; margin-bottom: 5px;">Tu Pedido</h1>
            <p style="color: #666; font-size: 18px;">Orden: <strong id="num-orden" style="color: #000;">Cargando...</strong></p>
            <div id="estado" style="font-size: 26px; font-weight: bold; color: #ff9800; margin-top: 30px; padding: 20px; border: 2px dashed #ff9800; border-radius: 10px;">
                🍳 En preparación...
            </div>
        </div>
        <audio id="alerta-audio" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto"></audio>
        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            const urlParams = new URLSearchParams(window.location.search);
            const pedidoId = urlParams.get('id');

            if (pedidoId) {
                socket.emit('unirse_pedido', pedidoId);
            } else {
                document.getElementById('estado').innerText = "⚠️ QR inválido";
                document.getElementById('estado').style.borderColor = "red";
                document.getElementById('estado').style.color = "red";
            }

            socket.on('alerta_listo', (data) => {
                const estadoDiv = document.getElementById('estado');
                estadoDiv.innerHTML = "¡LISTO PARA RECOGER! 🎉";
                estadoDiv.style.color = "#fff";
                estadoDiv.style.backgroundColor = "#4CAF50";
                estadoDiv.style.borderColor = "#4CAF50";
                document.getElementById('num-orden').innerText = data.numero_orden;
                
                document.getElementById('alerta-audio').play().catch(()=>console.log('Falta interacción'));
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);
            });
        </script>
    </body>
    </html>
    `);
});

// --- RUTAS DEL SISTEMA ---
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

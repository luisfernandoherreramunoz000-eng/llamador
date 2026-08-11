const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Habilitamos CORS para que Google Sites pueda conectarse sin bloqueos de seguridad
app.use(cors({ origin: "*" }));
app.use(express.json());

const io = new Server(server, {
    cors: { origin: "*" }
});

let pedidosDB = {}; 
let contadorOrdenes = 1;

// Ruta 1: Crear nuevo ticket
app.post('/api/pedidos', (req, res) => {
    const id = Date.now().toString(); 
    const numero_orden = `T-${contadorOrdenes++}`;
    
    pedidosDB[id] = { id, numero_orden, estado: 'preparacion' };
    res.json({ id, numero_orden });
});

// Ruta 2: Marcar como listo y enviar alerta
app.post('/api/pedidos/:id/listo', (req, res) => {
    const { id } = req.params;
    if (pedidosDB[id]) {
        pedidosDB[id].estado = 'listo';
        // Dispara el evento al celular específico
        io.to(id).emit('alerta_listo', { numero_orden: pedidosDB[id].numero_orden });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Pedido no encontrado' });
    }
});

// WebSockets: Conectar el celular del cliente a su sala privada
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
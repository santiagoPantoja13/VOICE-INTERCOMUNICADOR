import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.get("/", (req, res) => {
  res.send("Servidor del Intercomunicador funcionando 🚀");
});

io.on("connection", (socket) => {

  console.log("Usuario conectado:", socket.id);

  io.emit("users", Array.from(io.sockets.sockets.keys()));

  socket.on("offer", (data) => {
    io.to(data.to).emit("offer", {
      from: socket.id,
      offer: data.offer
    });
  });

  socket.on("answer", (data) => {
    io.to(data.to).emit("answer", {
      from: socket.id,
      answer: data.answer
    });
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.to).emit("ice-candidate", {
      from: socket.id,
      candidate: data.candidate
    });
  });

  socket.on("disconnect", () => {
    io.emit("users", Array.from(io.sockets.sockets.keys()));
  });

});

server.listen(3000, () => {
  console.log("Servidor corriendo en puerto 3000");
});
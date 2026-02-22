const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const SECRET = process.env.SECRET || "SUPER_SECRET_KEY";
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const upload = multer({ dest: "uploads/" });

let onlineUsers = {};

function loadUsers() {
  if (!fs.existsSync("users.json")) fs.writeFileSync("users.json", "[]");
  return JSON.parse(fs.readFileSync("users.json"));
}

function saveUsers(users) {
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
}

// REGISTER
app.post("/register", async (req, res) => {
  let users = loadUsers();
  const { username, password } = req.body;

  if (users.find(u => u.username === username))
    return res.json({ success: false, message: "User exists" });

  const hash = await bcrypt.hash(password, 10);

  users.push({
    id: uuidv4(),
    username,
    password: hash,
    groups: []
  });

  saveUsers(users);
  res.json({ success: true });
});

// LOGIN
app.post("/login", async (req, res) => {
  let users = loadUsers();
  const { username, password } = req.body;

  let user = users.find(u => u.username === username);
  if (!user) return res.json({ success: false });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ success: false });

  const token = jwt.sign({ username }, SECRET);
  res.json({ success: true, token });
});

// SEARCH USER
app.get("/search/:username", (req, res) => {
  let users = loadUsers();
  let user = users.find(u => u.username === req.params.username);
  if (!user) return res.json({ success: false });
  res.json({ success: true, username: user.username });
});

// CREATE GROUP
app.post("/create-group", (req, res) => {
  let users = loadUsers();
  const { username, groupName } = req.body;

  let user = users.find(u => u.username === username);

  if (user.groups.length >= 2)
    return res.json({ success: false, message: "Limit 2 groups only" });

  const invite = uuidv4();

  user.groups.push({ name: groupName, invite });

  saveUsers(users);
  res.json({ success: true, invite });
});

// JOIN GROUP
app.post("/join-group", (req, res) => {
  let users = loadUsers();
  const { username, invite } = req.body;

  let owner = users.find(u =>
    u.groups.find(g => g.invite === invite)
  );

  if (!owner) return res.json({ success: false });

  let group = owner.groups.find(g => g.invite === invite);
  let user = users.find(u => u.username === username);

  user.groups.push(group);

  saveUsers(users);
  res.json({ success: true });
});

// PROFILE UPDATE
app.post("/profile-update", (req, res) => {
  let users = loadUsers();
  const { username, newName } = req.body;

  let user = users.find(u => u.username === username);
  user.username = newName;

  saveUsers(users);
  res.json({ success: true });
});

// VOICE UPLOAD
app.post("/upload-voice", upload.single("voice"), (req, res) => {
  res.json({ success: true });
});

// SOCKET
io.on("connection", (socket) => {
  socket.on("join", (username) => {
    onlineUsers[username] = socket.id;
    io.emit("online-count", Object.keys(onlineUsers).length);
  });

  socket.on("send-message", (data) => {
    fs.appendFileSync("messages.txt", JSON.stringify(data) + "\n");

    if (onlineUsers[data.to]) {
      io.to(onlineUsers[data.to]).emit("receive-message", data);
    }
  });

  socket.on("disconnect", () => {
    for (let user in onlineUsers) {
      if (onlineUsers[user] === socket.id)
        delete onlineUsers[user];
    }
    io.emit("online-count", Object.keys(onlineUsers).length);
  });
});

server.listen(PORT, () => console.log("Server Running"));

// Starter content shown in fresh projects / files. All of it is original.

export const CONSOLE_STARTERS = {
  python: `# Console mode: runs once, and you can type input lines below the output.
# Try a tiny guessing game. (Each input line re-runs the program with all the
# lines so far, so keep things deterministic - hence the fixed seed.)
import random
random.seed(1)
secret = random.randint(1, 10)
print("I picked a number from 1 to 10. Guess!")
while True:
    guess = int(input("> "))
    if guess < secret:
        print("Higher.")
    elif guess > secret:
        print("Lower.")
    else:
        print("You got it!")
        break
`,
  java: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int secret = 7;
    System.out.println("I picked a number from 1 to 10. Guess!");
    while (true) {
      System.out.print("> ");
      int guess = in.nextInt();
      if (guess < secret) System.out.println("Higher.");
      else if (guess > secret) System.out.println("Lower.");
      else { System.out.println("You got it!"); break; }
    }
  }
}
`,
  cpp: `#include <iostream>

int main() {
  int secret = 7;
  std::cout << "I picked a number from 1 to 10. Guess!" << std::endl;
  while (true) {
    std::cout << "> ";
    int guess;
    if (!(std::cin >> guess)) break;
    if (guess < secret) std::cout << "Higher." << std::endl;
    else if (guess > secret) std::cout << "Lower." << std::endl;
    else { std::cout << "You got it!" << std::endl; break; }
  }
  return 0;
}
`,
};

export const PYTHON_PLAY_STARTER = `import runline as rl
import random

# Play mode: define setup() and update(dt). Press ? in the toolbar for the API.
WIDTH, HEIGHT = 480, 320
GROUND_Y = 260
GRAVITY = 900.0
JUMP_V = -420.0

player_y = GROUND_Y
player_vy = 0.0
on_ground = True
obstacles = []
coins = []
score = 0
best = 0
game_over = False
spawn_timer = 0.0
coin_timer = 0.0

def setup():
    rl.set_size(WIDTH, HEIGHT)

def reset():
    global player_y, player_vy, on_ground, obstacles, coins, score, game_over, spawn_timer, coin_timer
    player_y, player_vy, on_ground = GROUND_Y, 0.0, True
    obstacles, coins, score, game_over = [], [], 0, False
    spawn_timer = coin_timer = 0.0

def jump():
    global player_vy, on_ground
    if game_over:
        reset()
    elif on_ground:
        player_vy, on_ground = JUMP_V, False

def update(dt):
    global player_y, player_vy, on_ground, spawn_timer, coin_timer, score, best, game_over

    if rl.key_pressed("Space") or rl.key_pressed("ArrowUp") or rl.mouse_pressed():
        jump()

    rl.clear("#87ceeb")
    rl.rect(0, GROUND_Y + 24, WIDTH, HEIGHT - GROUND_Y - 24, "#5b3a29")

    if not game_over:
        player_vy += GRAVITY * dt
        player_y += player_vy * dt
        if player_y >= GROUND_Y:
            player_y, player_vy, on_ground = GROUND_Y, 0.0, True

        spawn_timer += dt
        if spawn_timer > 1.5:
            spawn_timer = 0.0
            obstacles.append({"x": WIDTH, "w": 20, "h": 30})

        coin_timer += dt
        if coin_timer > 2.1:
            coin_timer = 0.0
            coins.append({"x": WIDTH, "y": GROUND_Y - 60 - random.random() * 60})

        for o in obstacles:
            o["x"] -= 220 * dt
        for c in coins:
            c["x"] -= 220 * dt
        obstacles[:] = [o for o in obstacles if o["x"] + o["w"] > 0]
        coins[:] = [c for c in coins if c["x"] > -20]

        px, py, pw, ph = 40, player_y, 24, 24
        for o in obstacles:
            oy = GROUND_Y - o["h"] + 30
            if px < o["x"] + o["w"] and px + pw > o["x"] and py + ph > oy and py < oy + o["h"]:
                game_over = True
                best = max(best, score)

        remaining = []
        for c in coins:
            dx = (px + pw / 2) - c["x"]
            dy = (py + ph / 2) - c["y"]
            if (dx * dx + dy * dy) ** 0.5 < 24:
                score += 1
            else:
                remaining.append(c)
        coins[:] = remaining

    for o in obstacles:
        rl.rect(o["x"], GROUND_Y - o["h"] + 30, o["w"], o["h"], "#e74c3c")
    for c in coins:
        rl.circle(c["x"], c["y"], 12, "gold")

    rl.rect(40, player_y, 24, 24, "#2ecc71")
    rl.text(10, 24, "Score: " + str(score) + "   Best: " + str(best), "#ffffff", 16)

    if game_over:
        rl.rect(0, 0, WIDTH, HEIGHT, "rgba(0,0,0,0.5)")
        rl.text(WIDTH / 2, HEIGHT / 2, "Game Over - Space or click to restart", "#ffffff", 20, "center")
`;

export const CPP_PLAY_STARTER = `#include "runline.h"
#include <cstdlib>
#include <string>
#include <vector>

// Play mode: the program is compiled in your browser. Draw, then call
// rl::next_frame() to wait for the next frame. Press ? in the toolbar for the API.
const int W = 480, H = 320, GROUND_Y = 260;
const double GRAVITY = 900, JUMP_V = -420;

struct Obstacle { double x; double w, h; };
struct Coin { double x, y; };

int main() {
  rl::set_size(W, H);
  double playerY = GROUND_Y, vy = 0;
  bool onGround = true, gameOver = false;
  std::vector<Obstacle> obstacles;
  std::vector<Coin> coins;
  int score = 0, best = 0;
  double spawnTimer = 0, coinTimer = 0, dt = 1.0 / 60;

  while (true) {
    if (rl::key_pressed("Space") || rl::key_pressed("ArrowUp") || rl::mouse_pressed()) {
      if (gameOver) {
        playerY = GROUND_Y; vy = 0; onGround = true; gameOver = false;
        obstacles.clear(); coins.clear(); score = 0; spawnTimer = coinTimer = 0;
      } else if (onGround) {
        vy = JUMP_V; onGround = false;
      }
    }

    rl::clear("#87ceeb");
    rl::rect(0, GROUND_Y + 24, W, H - GROUND_Y - 24, "#5b3a29");

    if (!gameOver) {
      vy += GRAVITY * dt;
      playerY += vy * dt;
      if (playerY >= GROUND_Y) { playerY = GROUND_Y; vy = 0; onGround = true; }

      if ((spawnTimer += dt) > 1.5) { spawnTimer = 0; obstacles.push_back({W, 20, 30}); }
      if ((coinTimer += dt) > 2.1) { coinTimer = 0; coins.push_back({(double)W, GROUND_Y - 60.0 - rand() % 60}); }

      for (auto& o : obstacles) o.x -= 220 * dt;
      for (auto& c : coins) c.x -= 220 * dt;
      std::erase_if(obstacles, [](const Obstacle& o) { return o.x + o.w < 0; });
      std::erase_if(coins, [](const Coin& c) { return c.x < -20; });

      const double px = 40, py = playerY, pw = 24, ph = 24;
      for (auto& o : obstacles) {
        double oy = GROUND_Y - o.h + 30;
        if (px < o.x + o.w && px + pw > o.x && py + ph > oy && py < oy + o.h) {
          gameOver = true;
          if (score > best) best = score;
        }
      }
      std::erase_if(coins, [&](const Coin& c) {
        double dx = px + pw / 2 - c.x, dy = py + ph / 2 - c.y;
        if (dx * dx + dy * dy < 24 * 24) { score++; return true; }
        return false;
      });
    }

    for (auto& o : obstacles) rl::rect(o.x, GROUND_Y - o.h + 30, o.w, o.h, "#e74c3c");
    for (auto& c : coins) rl::circle(c.x, c.y, 12, "gold");
    rl::rect(40, playerY, 24, 24, "#2ecc71");
    rl::text(10, 24, "Score: " + std::to_string(score) + "   Best: " + std::to_string(best), "#ffffff", 16);

    if (gameOver) {
      rl::rect(0, 0, W, H, "rgba(0,0,0,0.5)");
      rl::text(W / 2, H / 2, "Game Over - Space or click to restart", "#ffffff", 20, "center");
    }

    dt = rl::next_frame();
  }
}
`;

export const JAVA_PLAY_STARTER = `import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.util.ArrayList;
import java.util.Random;

// Play mode: javac runs in your browser and the program runs with Swing.
// Click the game window first so it gets the keyboard.
public class Main {
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            JFrame f = new JFrame("Square Runner");
            f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
            GamePanel p = new GamePanel();
            f.setContentPane(p);
            f.pack();
            f.setLocation(8, 8);
            f.setVisible(true);
            p.requestFocusInWindow();
        });
    }
}

class GamePanel extends JPanel implements ActionListener {
    static final int W = 480, H = 320, GROUND_Y = 260;
    static final double GRAVITY = 900, JUMP_V = -420, DT = 1.0 / 60;

    double playerY = GROUND_Y, vy = 0;
    boolean onGround = true, gameOver = false;
    ArrayList<double[]> obstacles = new ArrayList<>(); // {x, w, h}
    ArrayList<double[]> coins = new ArrayList<>();     // {x, y}
    int score = 0, best = 0;
    double spawnTimer = 0, coinTimer = 0;
    Random rng = new Random();

    GamePanel() {
        setPreferredSize(new Dimension(W, H));
        setBackground(new Color(0x87ceeb));
        setFocusable(true);
        addKeyListener(new KeyAdapter() {
            public void keyPressed(KeyEvent e) {
                if (e.getKeyCode() == KeyEvent.VK_SPACE || e.getKeyCode() == KeyEvent.VK_UP) jump();
            }
        });
        addMouseListener(new MouseAdapter() {
            public void mousePressed(MouseEvent e) { requestFocusInWindow(); jump(); }
        });
        new Timer(16, this).start();
    }

    void jump() {
        if (gameOver) reset();
        else if (onGround) { vy = JUMP_V; onGround = false; }
    }

    void reset() {
        playerY = GROUND_Y; vy = 0; onGround = true; gameOver = false;
        obstacles.clear(); coins.clear(); score = 0; spawnTimer = coinTimer = 0;
    }

    public void actionPerformed(ActionEvent e) {
        if (!gameOver) {
            vy += GRAVITY * DT;
            playerY += vy * DT;
            if (playerY >= GROUND_Y) { playerY = GROUND_Y; vy = 0; onGround = true; }

            if ((spawnTimer += DT) > 1.5) { spawnTimer = 0; obstacles.add(new double[] {W, 20, 30}); }
            if ((coinTimer += DT) > 2.1) { coinTimer = 0; coins.add(new double[] {W, GROUND_Y - 60 - rng.nextInt(60)}); }

            for (double[] o : obstacles) o[0] -= 220 * DT;
            for (double[] c : coins) c[0] -= 220 * DT;
            obstacles.removeIf(o -> o[0] + o[1] < 0);
            coins.removeIf(c -> c[0] < -20);

            double px = 40, py = playerY, pw = 24, ph = 24;
            for (double[] o : obstacles) {
                double oy = GROUND_Y - o[2] + 30;
                if (px < o[0] + o[1] && px + pw > o[0] && py + ph > oy && py < oy + o[2]) {
                    gameOver = true;
                    best = Math.max(best, score);
                }
            }
            coins.removeIf(c -> {
                double dx = px + pw / 2 - c[0], dy = py + ph / 2 - c[1];
                if (dx * dx + dy * dy < 24 * 24) { score++; return true; }
                return false;
            });
        }
        repaint();
    }

    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        g.setColor(new Color(0x5b3a29));
        g.fillRect(0, GROUND_Y + 24, W, H - GROUND_Y - 24);
        g.setColor(new Color(0xe74c3c));
        for (double[] o : obstacles) g.fillRect((int) o[0], (int) (GROUND_Y - o[2] + 30), (int) o[1], (int) o[2]);
        g.setColor(new Color(0xffd700));
        for (double[] c : coins) g.fillOval((int) c[0] - 12, (int) c[1] - 12, 24, 24);
        g.setColor(new Color(0x2ecc71));
        g.fillRect(40, (int) playerY, 24, 24);
        g.setColor(Color.WHITE);
        g.setFont(new Font("SansSerif", Font.PLAIN, 16));
        g.drawString("Score: " + score + "   Best: " + best, 10, 24);
        if (gameOver) {
            g.setColor(new Color(0, 0, 0, 128));
            g.fillRect(0, 0, W, H);
            g.setColor(Color.WHITE);
            g.setFont(new Font("SansSerif", Font.PLAIN, 20));
            String s = "Game Over - Space or click to restart";
            g.drawString(s, (W - g.getFontMetrics().stringWidth(s)) / 2, H / 2);
        }
    }
}
`;

export const COIN_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAiUlEQVR4nGNgGOqAkRhFO9q4/2MT96j6SlA/IzkGk2IRIzGGu3t/xapm51ZugpYw4jMcl8G4LMJmCROlhiOrxRakTJQaTsgSDB9QGzBRw/X4fEE/H9AKMNHM5OFngQc0FyJnf1IBthxN3yDyoMAXO3GURxg+IMeSnXgKu4EprulS4VCrymQY8gAA1ldPIgEVzBEAAAAASUVORK5CYII=";

export const STARTER_INDEX_HTML = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Square Runner</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="canvas" width="480" height="320"></canvas>
  <p class="hint">Space / click to jump. Collect coins, dodge the red blocks.</p>
  <script src="game.js"></script>
</body>
</html>
`;

export const STARTER_STYLE_CSS = `html, body {
  margin: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #222;
  color: #aaa;
  font-family: sans-serif;
}

canvas {
  background: #87ceeb;
  border: 4px solid #333;
}

.hint { font-size: 13px; }
`;

export const STARTER_GAME_JS = `const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Assets in the project can be loaded by their path, just like a normal site.
const coinImg = new Image();
coinImg.src = "assets/coin.png";

const player = { x: 40, y: 260, w: 24, h: 24, vy: 0, onGround: true };
const GRAVITY = 0.6;
const JUMP = -11;
const GROUND_Y = 260;

let obstacles = [];
let coins = [];
let frame = 0;
let score = 0;
let best = 0;
let gameOver = false;

function reset() {
  player.y = GROUND_Y;
  player.vy = 0;
  obstacles = [];
  coins = [];
  frame = 0;
  score = 0;
  gameOver = false;
}

function jump() {
  if (gameOver) { reset(); return; }
  if (player.onGround) {
    player.vy = JUMP;
    player.onGround = false;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    jump();
  }
});
canvas.addEventListener("pointerdown", jump);

function update() {
  if (gameOver) return;
  frame++;

  player.vy += GRAVITY;
  player.y += player.vy;
  if (player.y >= GROUND_Y) {
    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
  }

  if (frame % 90 === 0) obstacles.push({ x: canvas.width, y: GROUND_Y, w: 20, h: 30 });
  if (frame % 130 === 0) coins.push({ x: canvas.width, y: GROUND_Y - 60 - Math.random() * 60, r: 12 });

  obstacles.forEach((o) => (o.x -= 4));
  coins.forEach((c) => (c.x -= 4));
  obstacles = obstacles.filter((o) => o.x + o.w > 0);
  coins = coins.filter((c) => c.x + c.r > 0);

  for (const o of obstacles) {
    const oy = o.y - o.h + 30;
    if (player.x < o.x + o.w && player.x + player.w > o.x && player.y + player.h > oy && player.y < oy + o.h) {
      gameOver = true;
      best = Math.max(best, score);
    }
  }

  coins = coins.filter((c) => {
    const dx = player.x + player.w / 2 - c.x;
    const dy = player.y + player.h / 2 - c.y;
    if (Math.sqrt(dx * dx + dy * dy) < c.r + 12) {
      score += 1;
      return false;
    }
    return true;
  });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#5b3a29";
  ctx.fillRect(0, GROUND_Y + 24, canvas.width, canvas.height - GROUND_Y - 24);

  ctx.fillStyle = "#e74c3c";
  obstacles.forEach((o) => ctx.fillRect(o.x, o.y - o.h + 30, o.w, o.h));

  coins.forEach((c) => {
    if (coinImg.complete && coinImg.naturalWidth) {
      ctx.drawImage(coinImg, c.x - 12, c.y - 12, 24, 24);
    } else {
      ctx.fillStyle = "gold";
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.fillText("Score: " + score + "   Best: " + best, 10, 24);

  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over - click or Space to restart", canvas.width / 2, canvas.height / 2);
    ctx.textAlign = "left";
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
`;

export function starterHtmlFiles() {
  return {
    "index.html": { content: STARTER_INDEX_HTML, binary: false },
    "style.css": { content: STARTER_STYLE_CSS, binary: false },
    "game.js": { content: STARTER_GAME_JS, binary: false },
    "assets/coin.png": { content: base64ToBytes(COIN_PNG_BASE64), binary: true, mime: "image/png" },
  };
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
